import type { ItemStatus } from '@validasri/shared';

export interface SriMessage {
  identifier: string | null;
  message: string;
  additionalInfo: string | null;
  type: string | null;
}

/**
 * Resultado normalizado de una consulta. Es el unico formato que conoce el resto
 * del sistema: si el SRI cambia su contrato, solo cambia el adaptador.
 */
export interface SriQueryResult {
  accessKey: string;
  /** Estado interno del sistema. */
  status: ItemStatus;
  /** Texto exacto devuelto por el SRI, sin interpretar. */
  sriStatusRaw: string | null;
  documentType: string | null;
  issuerRuc: string | null;
  authorizationDate: string | null;
  authorizationNumber: string | null;
  environment: string | null;
  messages: SriMessage[];
  errorCode: string | null;
  /** Mensaje apto para mostrar al usuario final (nunca XML ni trazas). */
  errorMessage: string | null;
  /** Respuesta original recortada, util para auditoria. */
  raw: unknown;
}

export interface SriProvider {
  readonly name: string;
  /** Consulta una unica clave de acceso. Lanza `SriServiceError` si el servicio falla. */
  consultarComprobante(accessKey: string): Promise<SriQueryResult>;
}
