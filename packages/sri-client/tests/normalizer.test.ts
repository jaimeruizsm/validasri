import { describe, expect, it } from 'vitest';
import { mapSriStatus, normalizeSriResponse } from '../src/normalizer';

const KEY = '2207202601099123456700110010010000001231234567811';

const respuesta = (autorizacion: unknown, numeroComprobantes = '1') => ({
  RespuestaAutorizacionComprobante: {
    claveAccesoConsultada: KEY,
    numeroComprobantes,
    autorizaciones: { autorizacion },
  },
});

describe('mapSriStatus', () => {
  it('mapea los estados conocidos del SRI', () => {
    expect(mapSriStatus('AUTORIZADO')).toBe('authorized');
    expect(mapSriStatus('NO AUTORIZADO')).toBe('not_authorized');
    expect(mapSriStatus('ANULADO')).toBe('annulled');
    expect(mapSriStatus('EN PROCESO DE ANULACION')).toBe('pending_annulment');
    expect(mapSriStatus('RECHAZADA')).toBe('not_authorized');
  });

  it('tolera acentos, minusculas y espacios', () => {
    expect(mapSriStatus('  autorizado ')).toBe('authorized');
    expect(mapSriStatus('EN PROCESO DE ANULACIÓN')).toBe('pending_annulment');
    expect(mapSriStatus('No Autorizado')).toBe('not_authorized');
  });

  it('devuelve null ante un estado desconocido', () => {
    expect(mapSriStatus('SITUACION NUEVA')).toBeNull();
    expect(mapSriStatus(null)).toBeNull();
  });
});

describe('normalizeSriResponse', () => {
  it('normaliza un comprobante autorizado', () => {
    const result = normalizeSriResponse(
      KEY,
      respuesta([
        {
          estado: 'AUTORIZADO',
          numeroAutorizacion: KEY,
          fechaAutorizacion: '2026-07-22T15:00:00.000Z',
          ambiente: 'PRUEBAS',
          comprobante: '<factura/>',
          mensajes: null,
        },
      ]),
    );

    expect(result.status).toBe('authorized');
    expect(result.sriStatusRaw).toBe('AUTORIZADO');
    expect(result.authorizationNumber).toBe(KEY);
    expect(result.authorizationDate).toBe('2026-07-22T15:00:00.000Z');
    expect(result.environment).toBe('PRUEBAS');
    expect(result.errorMessage).toBeNull();
  });

  it('deriva tipo de comprobante y RUC desde la clave de acceso', () => {
    const result = normalizeSriResponse(KEY, respuesta([{ estado: 'AUTORIZADO' }]));
    expect(result.documentType).toBe('01');
    expect(result.issuerRuc).toBe('0991234567001');
  });

  it('acepta que autorizaciones venga como objeto y no como arreglo', () => {
    const result = normalizeSriResponse(KEY, respuesta({ estado: 'AUTORIZADO' }));
    expect(result.status).toBe('authorized');
  });

  it('marca not_found cuando no hay comprobantes', () => {
    const result = normalizeSriResponse(KEY, {
      RespuestaAutorizacionComprobante: {
        claveAccesoConsultada: KEY,
        numeroComprobantes: '0',
        autorizaciones: null,
      },
    });
    expect(result.status).toBe('not_found');
    expect(result.errorMessage).toMatch(/no tiene registrado/i);
  });

  it('resume los mensajes en un comprobante no autorizado', () => {
    const result = normalizeSriResponse(
      KEY,
      respuesta([
        {
          estado: 'NO AUTORIZADO',
          mensajes: {
            mensaje: [
              {
                identificador: '43',
                mensaje: 'CLAVE DE ACCESO REGISTRADA',
                informacionAdicional: 'Ya existe un comprobante autorizado',
                tipo: 'ERROR',
              },
            ],
          },
        },
      ]),
    );

    expect(result.status).toBe('not_authorized');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.identifier).toBe('43');
    expect(result.errorMessage).toBe('CLAVE DE ACCESO REGISTRADA (Ya existe un comprobante autorizado)');
  });

  it('prioriza el estado anulado cuando hay varias autorizaciones', () => {
    const result = normalizeSriResponse(
      KEY,
      respuesta([{ estado: 'AUTORIZADO' }, { estado: 'ANULADO' }], '2'),
    );
    expect(result.status).toBe('annulled');
  });

  it('no afirma un resultado cuando el estado es desconocido', () => {
    const result = normalizeSriResponse(KEY, respuesta([{ estado: 'ESTADO NUEVO' }]));
    expect(result.status).toBe('service_error');
    expect(result.errorCode).toBe('estado_no_reconocido');
    expect(result.sriStatusRaw).toBe('ESTADO NUEVO');
  });

  it('extrae el texto cuando el parser SOAP lo envuelve en { _: valor }', () => {
    const result = normalizeSriResponse(
      KEY,
      respuesta([{ estado: { _: 'AUTORIZADO', $: { xmlns: 'x' } }, numeroAutorizacion: { _: '123' } }]),
    );
    expect(result.status).toBe('authorized');
    expect(result.authorizationNumber).toBe('123');
  });

  it('ignora una fecha de autorizacion invalida sin romper la normalizacion', () => {
    const result = normalizeSriResponse(
      KEY,
      respuesta([{ estado: 'AUTORIZADO', fechaAutorizacion: 'no-es-fecha' }]),
    );
    expect(result.status).toBe('authorized');
    expect(result.authorizationDate).toBeNull();
  });
});
