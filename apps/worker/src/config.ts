const readInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export interface WorkerConfig {
  concurrency: number;
  pollIntervalMs: number;
  claimSize: number;
  requestDelayMs: number;
  maxRetries: number;
  lockTimeoutMs: number;
}

export const getWorkerConfig = (): WorkerConfig => ({
  concurrency: readInt('WORKER_CONCURRENCY', 3),
  pollIntervalMs: readInt('WORKER_POLL_INTERVAL_MS', 3_000),
  claimSize: readInt('WORKER_CLAIM_SIZE', 25),
  requestDelayMs: readInt('SRI_REQUEST_DELAY_MS', 500),
  maxRetries: readInt('SRI_MAX_RETRIES', 3),
  lockTimeoutMs: readInt('WORKER_LOCK_TIMEOUT_MS', 120_000),
});
