import { extractDocumentType, extractIssuerRuc } from '@validasri/shared';
import { SriServiceError } from './errors';
import { normalizeSriResponse } from './normalizer';
import type { SriProvider, SriQueryResult } from './types';

/**
 * Proveedor simulado para demostracion y pruebas. El resultado es determinista
 * y depende del ultimo digito de la clave de acceso:
 *
 *   0-4  AUTORIZADO
 *   5    NO AUTORIZADO
 *   6    ANULADO
 *   7    EN PROCESO DE ANULACION
 *   8    no encontrado (sin comprobantes)
 *   9    error temporal del servicio (se reintenta y termina en error)
 *
 * Construye una respuesta con la MISMA forma que el WSDL real y la pasa por el
 * normalizador, de modo que la ruta de codigo ejercitada sea la misma.
 */
export class MockSriProvider implements SriProvider {
  readonly name = 'mock';

  private readonly delayMs: number;

  constructor(options: { delayMs?: number } = {}) {
    this.delayMs = options.delayMs ?? 0;
  }

  async consultarComprobante(accessKey: string): Promise<SriQueryResult> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const lastDigit = Number(accessKey.slice(-1));

    if (lastDigit === 9) {
      throw new SriServiceError(
        'http_503',
        'El servicio del SRI no esta disponible en este momento.',
        true,
      );
    }

    if (lastDigit === 8) {
      return normalizeSriResponse(accessKey, {
        RespuestaAutorizacionComprobante: {
          claveAccesoConsultada: accessKey,
          numeroComprobantes: '0',
          autorizaciones: null,
        },
      });
    }

    const estado =
      lastDigit === 5
        ? 'NO AUTORIZADO'
        : lastDigit === 6
          ? 'ANULADO'
          : lastDigit === 7
            ? 'EN PROCESO DE ANULACION'
            : 'AUTORIZADO';

    const mensajes =
      estado === 'NO AUTORIZADO'
        ? {
            mensaje: [
              {
                identificador: '43',
                mensaje: 'CLAVE DE ACCESO REGISTRADA',
                informacionAdicional: 'Comprobante de prueba generado por el proveedor simulado',
                tipo: 'ERROR',
              },
            ],
          }
        : null;

    return normalizeSriResponse(accessKey, {
      RespuestaAutorizacionComprobante: {
        claveAccesoConsultada: accessKey,
        numeroComprobantes: '1',
        autorizaciones: {
          autorizacion: [
            {
              estado,
              numeroAutorizacion: accessKey,
              fechaAutorizacion: new Date('2026-07-22T15:00:00.000Z'),
              ambiente: 'PRUEBAS',
              comprobante: `<!-- comprobante simulado tipo ${extractDocumentType(accessKey)} del RUC ${extractIssuerRuc(accessKey)} -->`,
              mensajes,
            },
          ],
        },
      },
    });
  }
}
