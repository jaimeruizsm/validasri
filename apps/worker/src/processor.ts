import { maskAccessKey } from '@validasri/shared';
import type { ClaimedItem, ItemResult, ValidaSriRepository } from '@validasri/database';
import { SriServiceError, type SriProvider } from '@validasri/sri-client';
import { nextAttemptTimestamp, shouldRetry } from './backoff';
import { logger } from './logger';
import type { WorkerConfig } from './config';

export interface ProcessDeps {
  repository: ValidaSriRepository;
  provider: SriProvider;
  config: WorkerConfig;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const toItemResult = (result: Awaited<ReturnType<SriProvider['consultarComprobante']>>): ItemResult => ({
  status: result.status,
  sriStatusRaw: result.sriStatusRaw,
  documentType: result.documentType,
  issuerRuc: result.issuerRuc,
  authorizationDate: result.authorizationDate,
  authorizationNumber: result.authorizationNumber,
  environment: result.environment,
  errorCode: result.errorCode,
  errorMessage: result.errorMessage,
  rawResponse: result.raw,
});

/**
 * Procesa un unico item reclamado: consulta el SRI y persiste el resultado, o
 * reprograma con backoff si el fallo es temporal y quedan reintentos.
 * Devuelve true si el item alcanzo un estado definitivo.
 */
export const processItem = async (item: ClaimedItem, deps: ProcessDeps): Promise<boolean> => {
  const { repository, provider, config, random } = deps;
  try {
    const result = await provider.consultarComprobante(item.accessKey);
    await repository.recordItemResult(item.id, toItemResult(result));
    return true;
  } catch (error) {
    const serviceError =
      error instanceof SriServiceError
        ? error
        : new SriServiceError('unexpected_error', 'Error inesperado al consultar el SRI.', false, error);

    // attemptCount es el numero de intentos YA realizados antes de este.
    const attemptsMade = item.attemptCount + 1;

    if (shouldRetry(attemptsMade, config.maxRetries, serviceError.retryable)) {
      const nextAttemptAt = nextAttemptTimestamp(attemptsMade, {}, random);
      await repository.rescheduleItem(item.id, nextAttemptAt, {
        code: serviceError.code,
        message: serviceError.publicMessage,
      });
      logger.warn('Item reprogramado tras fallo temporal', {
        item: maskAccessKey(item.accessKey),
        code: serviceError.code,
        attempt: attemptsMade,
        nextAttemptAt,
      });
      return false;
    }

    // Sin reintentos o error definitivo: se marca como error de servicio.
    await repository.recordItemResult(item.id, {
      status: 'service_error',
      sriStatusRaw: null,
      documentType: null,
      issuerRuc: null,
      authorizationDate: null,
      authorizationNumber: null,
      environment: null,
      errorCode: serviceError.code,
      errorMessage: serviceError.publicMessage,
      rawResponse: null,
    });
    logger.error('Item marcado como error definitivo', {
      item: maskAccessKey(item.accessKey),
      code: serviceError.code,
      attempts: attemptsMade,
    });
    return true;
  }
};

/** Ejecuta un item respetando la pausa entre solicitudes (control de velocidad). */
const runWithRateLimit = async (item: ClaimedItem, deps: ProcessDeps): Promise<void> => {
  const sleep = deps.sleep ?? defaultSleep;
  await sleep(deps.config.requestDelayMs);
  await processItem(item, deps);
};

/**
 * Procesa una tanda de items con concurrencia acotada. No se lanzan miles de
 * solicitudes a la vez: como maximo `concurrency` en vuelo.
 */
export const processBatchOfItems = async (
  items: ClaimedItem[],
  deps: ProcessDeps,
): Promise<void> => {
  const queue = [...items];
  const runNext = async (): Promise<void> => {
    const item = queue.shift();
    if (!item) return;
    await runWithRateLimit(item, deps);
    await runNext();
  };

  const workers = Array.from({ length: Math.max(1, deps.config.concurrency) }, () => runNext());
  await Promise.all(workers);
};

/**
 * Un ciclo completo: libera bloqueos huerfanos, reclama trabajo, lo procesa,
 * refresca contadores y cierra los lotes terminados.
 * Devuelve la cantidad de items procesados en este ciclo.
 */
export const runOnce = async (deps: ProcessDeps): Promise<number> => {
  const { repository, config } = deps;

  const released = await repository.releaseStaleLocks(config.lockTimeoutMs);
  if (released > 0) {
    logger.warn('Bloqueos liberados de workers inactivos', { count: released });
  }

  const items = await repository.claimPendingItems(config.claimSize);
  if (items.length === 0) {
    await repository.finalizePendingBatches();
    return 0;
  }

  await processBatchOfItems(items, deps);

  const batchIds = [...new Set(items.map((item) => item.batchId))];
  for (const batchId of batchIds) {
    await repository.refreshBatchCounters(batchId);
  }
  await repository.finalizePendingBatches();

  return items.length;
};
