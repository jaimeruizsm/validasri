/**
 * Error del servicio del SRI. `retryable` distingue un fallo temporal (que el
 * worker reintentara con backoff) de uno definitivo.
 */
export class SriServiceError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  /** Mensaje seguro para el usuario final: nunca contiene XML ni trazas. */
  readonly publicMessage: string;

  constructor(code: string, publicMessage: string, retryable: boolean, cause?: unknown) {
    super(`${code}: ${publicMessage}`);
    this.name = 'SriServiceError';
    this.code = code;
    this.retryable = retryable;
    this.publicMessage = publicMessage;
    if (cause !== undefined) this.cause = cause;
  }
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const RETRYABLE_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

export const isRetryableHttpStatus = (status: number): boolean =>
  RETRYABLE_HTTP_STATUSES.has(status);

export const isRetryableNetworkCode = (code: string): boolean =>
  RETRYABLE_NETWORK_CODES.has(code.toUpperCase());

const readProperty = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/**
 * Traduce cualquier fallo de red o de SOAP a un `SriServiceError` clasificado.
 * Nunca propaga el contenido crudo de la respuesta al mensaje publico.
 */
export const classifyTransportError = (error: unknown): SriServiceError => {
  if (error instanceof SriServiceError) return error;

  const nodeCode = readProperty(error, 'code');
  if (typeof nodeCode === 'string' && isRetryableNetworkCode(nodeCode)) {
    return new SriServiceError(
      nodeCode.toLowerCase(),
      'No se pudo establecer conexion con el servicio del SRI.',
      true,
      error,
    );
  }

  const statusCandidate =
    readProperty(error, 'statusCode') ??
    readProperty(readProperty(error, 'response'), 'status') ??
    readProperty(error, 'status');
  if (typeof statusCandidate === 'number') {
    const retryable = isRetryableHttpStatus(statusCandidate);
    return new SriServiceError(
      `http_${statusCandidate}`,
      retryable
        ? 'El servicio del SRI no esta disponible en este momento.'
        : 'El servicio del SRI rechazo la consulta.',
      retryable,
      error,
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|aborted/i.test(message)) {
    return new SriServiceError(
      'timeout',
      'El servicio del SRI no respondio dentro del tiempo permitido.',
      true,
      error,
    );
  }
  if (/socket hang up|network|getaddrinfo|EAI_AGAIN/i.test(message)) {
    return new SriServiceError(
      'network_error',
      'No se pudo establecer conexion con el servicio del SRI.',
      true,
      error,
    );
  }
  // Respuesta SOAP temporalmente ilegible: se considera temporal.
  if (/invalid xml|unexpected end|parse|malformed/i.test(message)) {
    return new SriServiceError(
      'invalid_soap_response',
      'El servicio del SRI devolvio una respuesta ilegible.',
      true,
      error,
    );
  }

  return new SriServiceError(
    'sri_unavailable',
    'No fue posible consultar el servicio del SRI.',
    false,
    error,
  );
};
