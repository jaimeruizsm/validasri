import { describe, expect, it } from 'vitest';
import { computeBatchProgress, resolveFinalBatchStatus } from '../src/progress';
import { billingPeriodFor, formatDateTimeEc } from '../src/datetime';
import type { BatchCounters } from '../src/types';

const counters = (overrides: Partial<BatchCounters> = {}): BatchCounters => ({
  totalLines: 0,
  totalValid: 0,
  totalInvalid: 0,
  totalDuplicates: 0,
  totalProcessed: 0,
  totalAuthorized: 0,
  totalAnnulled: 0,
  totalNotAuthorized: 0,
  totalNotFound: 0,
  totalErrors: 0,
  ...overrides,
});

describe('computeBatchProgress', () => {
  it('calcula el porcentaje sobre las claves validas', () => {
    expect(computeBatchProgress(counters({ totalValid: 200, totalProcessed: 50 })).percent).toBe(25);
  });

  it('ignora invalidas y duplicadas en el avance', () => {
    const progress = computeBatchProgress(
      counters({ totalLines: 130, totalValid: 100, totalInvalid: 20, totalDuplicates: 10, totalProcessed: 100 }),
    );
    expect(progress.percent).toBe(100);
    expect(progress.isComplete).toBe(true);
  });

  it('trata un lote sin claves validas como completo', () => {
    expect(computeBatchProgress(counters()).percent).toBe(100);
  });

  it('no supera el 100% aunque los contadores se desincronicen', () => {
    const progress = computeBatchProgress(counters({ totalValid: 10, totalProcessed: 25 }));
    expect(progress.percent).toBe(100);
    expect(progress.processed).toBe(10);
  });
});

describe('resolveFinalBatchStatus', () => {
  it('marca completed cuando no hubo errores', () => {
    expect(resolveFinalBatchStatus(counters({ totalValid: 5, totalProcessed: 5 }))).toBe('completed');
  });

  it('marca completed_with_errors cuando quedaron errores de servicio', () => {
    expect(
      resolveFinalBatchStatus(counters({ totalValid: 5, totalProcessed: 5, totalErrors: 2 })),
    ).toBe('completed_with_errors');
  });
});

describe('fechas de Ecuador', () => {
  it('formatea en zona America/Guayaquil (UTC-5)', () => {
    expect(formatDateTimeEc('2026-07-22T15:30:00.000Z')).toContain('10:30');
  });

  it('devuelve el fallback cuando la fecha es nula o invalida', () => {
    expect(formatDateTimeEc(null)).toBe('—');
    expect(formatDateTimeEc('no-es-fecha')).toBe('—');
  });

  it('calcula el periodo de facturacion en hora local', () => {
    expect(billingPeriodFor(new Date('2026-08-01T02:00:00.000Z'))).toBe('2026-07');
    expect(billingPeriodFor(new Date('2026-08-01T06:00:00.000Z'))).toBe('2026-08');
  });
});
