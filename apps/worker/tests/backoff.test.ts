import { describe, expect, it } from 'vitest';
import { computeBackoffMs, nextAttemptTimestamp, shouldRetry } from '../src/backoff';

describe('computeBackoffMs', () => {
  it('crece de forma exponencial con el numero de intento', () => {
    const zero = () => 0;
    expect(computeBackoffMs(1, { baseDelayMs: 1_000 }, zero)).toBe(1_000);
    expect(computeBackoffMs(2, { baseDelayMs: 1_000 }, zero)).toBe(2_000);
    expect(computeBackoffMs(3, { baseDelayMs: 1_000 }, zero)).toBe(4_000);
    expect(computeBackoffMs(4, { baseDelayMs: 1_000 }, zero)).toBe(8_000);
  });

  it('respeta el techo maximo', () => {
    expect(computeBackoffMs(20, { baseDelayMs: 1_000, maxDelayMs: 30_000 }, () => 0)).toBe(30_000);
  });

  it('agrega jitter dentro del rango esperado', () => {
    const withMaxJitter = computeBackoffMs(1, { baseDelayMs: 1_000, jitterRatio: 0.5 }, () => 1);
    expect(withMaxJitter).toBe(1_500);
    const noJitter = computeBackoffMs(1, { baseDelayMs: 1_000, jitterRatio: 0.5 }, () => 0);
    expect(noJitter).toBe(1_000);
  });

  it('trata un intento menor que 1 como el primero', () => {
    expect(computeBackoffMs(0, { baseDelayMs: 1_000 }, () => 0)).toBe(1_000);
  });
});

describe('nextAttemptTimestamp', () => {
  it('calcula un instante futuro en formato ISO', () => {
    const now = Date.parse('2026-07-22T00:00:00.000Z');
    const ts = nextAttemptTimestamp(1, { baseDelayMs: 5_000 }, () => 0, now);
    expect(ts).toBe('2026-07-22T00:00:05.000Z');
  });
});

describe('shouldRetry', () => {
  it('reintenta solo errores temporales dentro del limite', () => {
    expect(shouldRetry(1, 3, true)).toBe(true);
    expect(shouldRetry(3, 3, true)).toBe(false);
    expect(shouldRetry(1, 3, false)).toBe(false);
  });
});
