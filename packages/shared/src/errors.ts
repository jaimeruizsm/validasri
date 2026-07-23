/**
 * Errores de dominio. El mensaje siempre es apto para mostrarse al usuario final:
 * nunca contiene XML, trazas ni detalles internos del servicio.
 */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    httpStatus = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export const unauthorized = (message = 'Debes iniciar sesion para continuar.') =>
  new AppError('unauthorized', message, 401);

export const forbidden = (message = 'No tienes permisos para realizar esta accion.') =>
  new AppError('forbidden', message, 403);

export const notFound = (message = 'El recurso solicitado no existe.') =>
  new AppError('not_found', message, 404);

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError('bad_request', message, 400, details);

export const quotaExceeded = (message: string, details?: Record<string, unknown>) =>
  new AppError('quota_exceeded', message, 402, details);

export const rateLimited = (message = 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.') =>
  new AppError('rate_limited', message, 429);

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/** Convierte cualquier error en algo seguro para responder al navegador. */
export const toPublicError = (error: unknown): { code: string; message: string; status: number } => {
  if (isAppError(error)) {
    return { code: error.code, message: error.message, status: error.httpStatus };
  }
  return {
    code: 'internal_error',
    message: 'Ocurrio un error inesperado. Intenta nuevamente.',
    status: 500,
  };
};
