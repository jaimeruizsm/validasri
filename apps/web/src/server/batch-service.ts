import 'server-only';
import {
  billingPeriodFor,
  forbidden,
  quotaExceeded,
  type SessionContext,
  type ValidationBatch,
} from '@validasri/shared';
import { getRepository } from '@validasri/database';
import {
  assertKeyCountWithinLimit,
  assertPlainTextContent,
  parseAccessKeysTxt,
  sanitizeFilename,
  type ParsedTxt,
} from '@validasri/validation';
import { getUploadLimits } from './config';

export interface CreateBatchResult {
  batch: ValidationBatch;
  analysis: Pick<ParsedTxt, 'totalLines' | 'totalValid' | 'totalInvalid' | 'totalDuplicates'>;
}

/**
 * Crea un lote a partir del contenido del TXT. Revalida TODO en el servidor
 * (nunca confia en el analisis del navegador), verifica el cupo mensual del plan
 * y registra el consumo. Devuelve el lote listo para que lo tome el worker.
 */
export const createBatchFromTxt = async (
  context: SessionContext,
  input: { filename: string; content: string },
): Promise<CreateBatchResult> => {
  const limits = getUploadLimits();
  const repository = getRepository();

  assertPlainTextContent(input.content);
  const parsed = parseAccessKeysTxt(input.content);
  assertKeyCountWithinLimit(parsed.totalValid, limits);

  // Verificacion del limite mensual del plan.
  const billingPeriod = billingPeriodFor();
  const used = await repository.getMonthlyUsage(context.organization.id, billingPeriod);
  const remaining = context.organization.monthlyLimit - used;
  if (parsed.totalValid > remaining) {
    throw quotaExceeded(
      `Tu plan permite ${context.organization.monthlyLimit.toLocaleString('es-EC')} validaciones al mes. ` +
        `Ya usaste ${used.toLocaleString('es-EC')} y este archivo requiere ${parsed.totalValid.toLocaleString('es-EC')}, ` +
        `pero solo quedan ${Math.max(0, remaining).toLocaleString('es-EC')} disponibles.`,
      { used, limit: context.organization.monthlyLimit, requested: parsed.totalValid },
    );
  }

  const batch = await repository.createBatch({
    organizationId: context.organization.id,
    createdBy: context.user.id,
    createdByEmail: context.user.email,
    originalFilename: sanitizeFilename(input.filename),
    totalLines: parsed.totalLines,
    totalInvalid: parsed.totalInvalid,
    totalDuplicates: parsed.totalDuplicates,
    accessKeys: parsed.validKeys,
  });

  await repository.recordUsage({
    organizationId: context.organization.id,
    batchId: batch.id,
    quantity: parsed.totalValid,
    billingPeriod,
  });

  return {
    batch,
    analysis: {
      totalLines: parsed.totalLines,
      totalValid: parsed.totalValid,
      totalInvalid: parsed.totalInvalid,
      totalDuplicates: parsed.totalDuplicates,
    },
  };
};

/** Reintenta las consultas fallidas de un lote de la organizacion actual. */
export const retryBatchFailures = async (
  context: SessionContext,
  batchId: string,
): Promise<number> => {
  const repository = getRepository();
  const batch = await repository.getBatch(context.organization.id, batchId);
  if (!batch) throw forbidden('El lote no existe o no pertenece a tu organizacion.');
  return repository.retryFailedItems(context.organization.id, batchId);
};

/** Re-consulta TODOS los comprobantes del lote (no solo los fallidos). */
export const revalidateBatch = async (
  context: SessionContext,
  batchId: string,
): Promise<number> => {
  const repository = getRepository();
  const batch = await repository.getBatch(context.organization.id, batchId);
  if (!batch) throw forbidden('El lote no existe o no pertenece a tu organizacion.');
  return repository.revalidateBatch(context.organization.id, batchId);
};
