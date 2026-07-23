import { maskAccessKey } from '@validasri/shared';
import { classifyTransportError, SriServiceError } from './errors';
import { normalizeSriResponse } from './normalizer';
import type { SriProvider, SriQueryResult } from './types';

/**
 * Adaptador del Web Service SOAP oficial del SRI.
 *
 * Contrato verificado sobre el WSDL de pruebas
 * (https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl):
 *
 *   targetNamespace : http://ec.gob.sri.ws.consultas
 *   operacion       : consultarEstadoAutorizacionComprobante
 *   entrada         : { claveAcceso: string }
 *   salida          : RespuestaAutorizacionComprobante
 *                     { claveAccesoConsultada, numeroComprobantes, autorizaciones }
 *
 * Toda la interpretacion de la respuesta vive en `normalizer.ts`, de modo que un
 * cambio del servicio se absorba en este paquete.
 */

// Servicio de autorizacion offline: devuelve el estado y el XML firmado del
// comprobante. Operacion `autorizacionComprobante`, parametro `claveAccesoComprobante`.
const OPERATION = 'autorizacionComprobanteAsync';

/** Forma minima del cliente generado por la libreria `soap`. */
interface SoapClientLike {
  [operation: string]: unknown;
}

type SoapCall = (args: { claveAccesoComprobante: string }, options?: unknown) => Promise<unknown[]>;

export interface SoapProviderOptions {
  wsdlUrl: string;
  timeoutMs: number;
  /** Inyectable en pruebas para no depender de la red. */
  createClient?: (wsdlUrl: string, timeoutMs: number) => Promise<SoapClientLike>;
}

const defaultCreateClient = async (wsdlUrl: string, timeoutMs: number): Promise<SoapClientLike> => {
  const { createClientAsync } = await import('soap');
  return (await createClientAsync(wsdlUrl, {
    wsdl_options: { timeout: timeoutMs },
    disableCache: false,
  })) as unknown as SoapClientLike;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new SriServiceError('timeout', 'El servicio del SRI no respondio dentro del tiempo permitido.', true)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export class SoapSriProvider implements SriProvider {
  readonly name = 'soap';

  private readonly options: SoapProviderOptions;
  private clientPromise: Promise<SoapClientLike> | null = null;

  constructor(options: SoapProviderOptions) {
    this.options = options;
  }

  private async getClient(): Promise<SoapClientLike> {
    if (!this.clientPromise) {
      const factory = this.options.createClient ?? defaultCreateClient;
      this.clientPromise = factory(this.options.wsdlUrl, this.options.timeoutMs).catch((error) => {
        // Un WSDL caido no debe dejar el cliente en un estado roto permanente.
        this.clientPromise = null;
        throw classifyTransportError(error);
      });
    }
    return this.clientPromise;
  }

  async consultarComprobante(accessKey: string): Promise<SriQueryResult> {
    const client = await this.getClient();
    const call = client[OPERATION];

    if (typeof call !== 'function') {
      throw new SriServiceError(
        'operacion_no_disponible',
        'El servicio del SRI no expone la operacion de consulta esperada.',
        false,
      );
    }

    try {
      const result = await withTimeout(
        (call as SoapCall).call(
          client,
          { claveAccesoComprobante: accessKey },
          { timeout: this.options.timeoutMs },
        ),
        this.options.timeoutMs,
      );
      const payload = Array.isArray(result) ? result[0] : result;
      // Se conserva la respuesta completa (incluido el XML del comprobante).
      return normalizeSriResponse(accessKey, payload);
    } catch (error) {
      // El contexto adjunto lleva la clave enmascarada: nunca la clave completa.
      const classified = classifyTransportError(error);
      throw new SriServiceError(
        classified.code,
        classified.publicMessage,
        classified.retryable,
        `clave ${maskAccessKey(accessKey)}`,
      );
    }
  }
}
