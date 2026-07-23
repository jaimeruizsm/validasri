export interface BackoffOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  /** Fraccion de jitter aleatorio (0..1) aplicada sobre el retardo base. */
  jitterRatio: number;
}

const DEFAULTS: BackoffOptions = {
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  jitterRatio: 0.25,
};

/**
 * Retardo exponencial con jitter para el intento numero `attempt` (1 = primer
 * reintento). El jitter evita que muchos items reintenten a la vez y saturen al
 * SRI. `random` se inyecta para pruebas deterministas.
 */
export const computeBackoffMs = (
  attempt: number,
  options: Partial<BackoffOptions> = {},
  random: () => number = Math.random,
): number => {
  const { baseDelayMs, maxDelayMs, jitterRatio } = { ...DEFAULTS, ...options };
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const exponential = baseDelayMs * 2 ** (safeAttempt - 1);
  const capped = Math.min(exponential, maxDelayMs);
  const jitter = capped * jitterRatio * random();
  return Math.round(capped + jitter);
};

/** Instante ISO en el que el item podra volver a intentarse. */
export const nextAttemptTimestamp = (
  attempt: number,
  options: Partial<BackoffOptions> = {},
  random: () => number = Math.random,
  now: number = Date.now(),
): string => new Date(now + computeBackoffMs(attempt, options, random)).toISOString();

/**
 * Decide si un item con `attemptCount` intentos ya realizados debe reintentarse
 * de nuevo (temporal y dentro del limite) o marcarse como error definitivo.
 */
export const shouldRetry = (attemptCount: number, maxRetries: number, retryable: boolean): boolean =>
  retryable && attemptCount < maxRetries;
