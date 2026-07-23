import type { BatchCounters } from './types';
import type { BatchStatus } from './statuses';

export interface BatchProgress {
  processed: number;
  total: number;
  percent: number;
  isComplete: boolean;
}

/**
 * Progreso del lote sobre las claves validas (las invalidas y duplicadas nunca
 * se consultan al SRI, por lo que no cuentan para el avance).
 */
export const computeBatchProgress = (counters: BatchCounters): BatchProgress => {
  const total = Math.max(0, counters.totalValid);
  const processed = Math.min(Math.max(0, counters.totalProcessed), total);
  const percent = total === 0 ? 100 : Math.round((processed / total) * 100);
  return { processed, total, percent, isComplete: processed >= total };
};

/** Estado final del lote una vez no quedan claves pendientes. */
export const resolveFinalBatchStatus = (counters: BatchCounters): BatchStatus => {
  if (counters.totalValid === 0) return 'completed';
  if (counters.totalErrors > 0) return 'completed_with_errors';
  return 'completed';
};
