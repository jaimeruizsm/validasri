/**
 * Logger minimo con salida JSON. Nunca debe recibir la clave de acceso completa:
 * quien lo invoca ya la enmascara con `maskAccessKey`.
 */
type Level = 'info' | 'warn' | 'error';

const log = (level: Level, message: string, context?: Record<string, unknown>): void => {
  const entry = { ts: new Date().toISOString(), level, message, ...context };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
};
