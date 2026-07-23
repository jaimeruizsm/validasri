import { describe, expect, it } from 'vitest';
import { MockSriProvider } from '../src/mock-provider';
import { SoapSriProvider } from '../src/soap-provider';
import { classifyTransportError, SriServiceError } from '../src/errors';

const keyEndingIn = (lastDigit: number): string =>
  `220720260109912345670011001001000000123123456781${lastDigit}`;

describe('MockSriProvider', () => {
  const provider = new MockSriProvider();

  it('devuelve autorizado para los digitos 0 a 4', async () => {
    for (const digit of [0, 1, 2, 3, 4]) {
      const result = await provider.consultarComprobante(keyEndingIn(digit));
      expect(result.status).toBe('authorized');
      expect(result.sriStatusRaw).toBe('AUTORIZADO');
    }
  });

  it('devuelve cada caso determinista segun el ultimo digito', async () => {
    expect((await provider.consultarComprobante(keyEndingIn(5))).status).toBe('not_authorized');
    expect((await provider.consultarComprobante(keyEndingIn(6))).status).toBe('annulled');
    expect((await provider.consultarComprobante(keyEndingIn(7))).status).toBe('pending_annulment');
    expect((await provider.consultarComprobante(keyEndingIn(8))).status).toBe('not_found');
  });

  it('lanza un error temporal reintentable para el digito 9', async () => {
    await expect(provider.consultarComprobante(keyEndingIn(9))).rejects.toMatchObject({
      name: 'SriServiceError',
      retryable: true,
      code: 'http_503',
    });
  });

  it('es determinista: la misma clave devuelve siempre lo mismo', async () => {
    const key = keyEndingIn(6);
    const first = await provider.consultarComprobante(key);
    const second = await provider.consultarComprobante(key);
    expect(first.status).toBe(second.status);
    expect(first.authorizationNumber).toBe(second.authorizationNumber);
  });
});

describe('classifyTransportError', () => {
  it('clasifica como temporales los errores de red', () => {
    for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN']) {
      expect(classifyTransportError(Object.assign(new Error('fallo'), { code })).retryable).toBe(true);
    }
  });

  it('clasifica como temporales los HTTP 429, 500, 502, 503 y 504', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      const classified = classifyTransportError(Object.assign(new Error('fallo'), { statusCode: status }));
      expect(classified.retryable).toBe(true);
      expect(classified.code).toBe(`http_${status}`);
    }
  });

  it('clasifica como definitivos los HTTP 400 y 404', () => {
    for (const status of [400, 404]) {
      expect(classifyTransportError(Object.assign(new Error('fallo'), { statusCode: status })).retryable).toBe(
        false,
      );
    }
  });

  it('trata el timeout y el XML ilegible como temporales', () => {
    expect(classifyTransportError(new Error('socket timed out')).retryable).toBe(true);
    expect(classifyTransportError(new Error('Invalid XML in response')).retryable).toBe(true);
  });

  it('no expone detalles tecnicos en el mensaje publico', () => {
    const classified = classifyTransportError(new Error('<soap:Fault><detail>stack</detail>'));
    expect(classified.publicMessage).not.toContain('soap');
    expect(classified.publicMessage).not.toContain('stack');
  });

  it('conserva un SriServiceError ya clasificado', () => {
    const original = new SriServiceError('http_503', 'No disponible.', true);
    expect(classifyTransportError(original)).toBe(original);
  });
});

describe('SoapSriProvider', () => {
  const KEY = keyEndingIn(1);

  it('llama a la operacion del WSDL con el parametro claveAcceso', async () => {
    let receivedArgs: unknown = null;
    const provider = new SoapSriProvider({
      wsdlUrl: 'https://ejemplo.invalid/ws?wsdl',
      timeoutMs: 1_000,
      createClient: async () => ({
        consultarEstadoAutorizacionComprobanteAsync: async (args: unknown) => {
          receivedArgs = args;
          return [
            {
              RespuestaAutorizacionComprobante: {
                claveAccesoConsultada: KEY,
                numeroComprobantes: '1',
                autorizaciones: { autorizacion: [{ estado: 'AUTORIZADO', comprobante: '<factura/>' }] },
              },
            },
          ];
        },
      }),
    });

    const result = await provider.consultarComprobante(KEY);
    expect(receivedArgs).toEqual({ claveAcceso: KEY });
    expect(result.status).toBe('authorized');
  });

  it('omite el XML del comprobante en la respuesta guardada', async () => {
    const provider = new SoapSriProvider({
      wsdlUrl: 'https://ejemplo.invalid/ws?wsdl',
      timeoutMs: 1_000,
      createClient: async () => ({
        consultarEstadoAutorizacionComprobanteAsync: async () => [
          {
            RespuestaAutorizacionComprobante: {
              numeroComprobantes: '1',
              autorizaciones: {
                autorizacion: [{ estado: 'AUTORIZADO', comprobante: '<factura>datos sensibles</factura>' }],
              },
            },
          },
        ],
      }),
    });

    const result = await provider.consultarComprobante(KEY);
    expect(JSON.stringify(result.raw)).not.toContain('datos sensibles');
    expect(JSON.stringify(result.raw)).toContain('[omitido]');
  });

  it('convierte un fallo de red en un error temporal enmascarando la clave', async () => {
    const provider = new SoapSriProvider({
      wsdlUrl: 'https://ejemplo.invalid/ws?wsdl',
      timeoutMs: 1_000,
      createClient: async () => ({
        consultarEstadoAutorizacionComprobanteAsync: async () => {
          throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        },
      }),
    });

    await expect(provider.consultarComprobante(KEY)).rejects.toMatchObject({
      retryable: true,
      code: 'econnrefused',
    });
  });

  it('falla de forma definitiva si el servicio no expone la operacion esperada', async () => {
    const provider = new SoapSriProvider({
      wsdlUrl: 'https://ejemplo.invalid/ws?wsdl',
      timeoutMs: 1_000,
      createClient: async () => ({ otraOperacionAsync: async () => [] }),
    });

    await expect(provider.consultarComprobante(KEY)).rejects.toMatchObject({
      retryable: false,
      code: 'operacion_no_disponible',
    });
  });

  it('aplica el timeout configurado', async () => {
    const provider = new SoapSriProvider({
      wsdlUrl: 'https://ejemplo.invalid/ws?wsdl',
      timeoutMs: 30,
      createClient: async () => ({
        consultarEstadoAutorizacionComprobanteAsync: () =>
          new Promise((resolve) => setTimeout(resolve, 5_000)),
      }),
    });

    await expect(provider.consultarComprobante(KEY)).rejects.toMatchObject({
      code: 'timeout',
      retryable: true,
    });
  });
});
