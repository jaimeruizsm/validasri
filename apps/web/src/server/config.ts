import 'server-only';

const readInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getUploadLimits = () => ({
  maxSizeBytes: readInt('MAX_TXT_SIZE_MB', 5) * 1024 * 1024,
  maxKeys: readInt('MAX_KEYS_PER_BATCH', 10_000),
});
