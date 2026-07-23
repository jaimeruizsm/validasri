import 'server-only';
import { rateLimited } from '@validasri/shared';

/**
 * Rate limiter en memoria por (clave, ventana). Suficiente para el MVP y para un
 * unico proceso de Next.js. En un despliegue multi-instancia se sustituye por un
 * store compartido (Redis/Upstash) sin cambiar los llamadores.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const enforceRateLimit = (key: string, options: RateLimitOptions): void => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (bucket.count >= options.limit) {
    throw rateLimited();
  }
  bucket.count += 1;
};

/** Limpieza oportunista para no acumular buckets vencidos. */
export const pruneRateLimitBuckets = (): void => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};
