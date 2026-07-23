import { describe, expect, it } from 'vitest';
import {
  computeCheckDigit,
  describeDocumentType,
  extractDocumentType,
  extractEnvironmentCode,
  extractIssueDate,
  extractIssuerRuc,
  hasValidCheckDigit,
  maskAccessKey,
} from '../src/access-key';

const KEY = '2207202601099123456700110010010000001231234567811';

describe('extraccion de campos desde la clave de acceso', () => {
  it('extrae tipo de comprobante, RUC, ambiente y fecha', () => {
    expect(extractDocumentType(KEY)).toBe('01');
    expect(extractIssuerRuc(KEY)).toBe('0991234567001');
    expect(extractEnvironmentCode(KEY)).toBe('1');
    expect(extractIssueDate(KEY)).toBe('2026-07-22');
  });

  it('devuelve null cuando la clave no tiene 49 caracteres', () => {
    expect(extractDocumentType('123')).toBeNull();
    expect(extractIssuerRuc('123')).toBeNull();
    expect(extractIssueDate('123')).toBeNull();
  });

  it('describe el tipo de comprobante en espanol', () => {
    expect(describeDocumentType('01')).toBe('Factura');
    expect(describeDocumentType('07')).toBe('Comprobante de retencion');
    expect(describeDocumentType('99')).toBe('Tipo 99');
    expect(describeDocumentType(null)).toBe('Desconocido');
  });
});

describe('digito verificador modulo 11', () => {
  it('calcula un digito entre 0 y 9', () => {
    const digit = computeCheckDigit(KEY.slice(0, 48));
    expect(digit).not.toBeNull();
    expect(digit).toBeGreaterThanOrEqual(0);
    expect(digit).toBeLessThanOrEqual(9);
  });

  it('devuelve null si la entrada no tiene 48 digitos numericos', () => {
    expect(computeCheckDigit('123')).toBeNull();
    expect(computeCheckDigit('A'.repeat(48))).toBeNull();
  });

  it('valida coherentemente una clave construida con su propio verificador', () => {
    const base = KEY.slice(0, 48);
    const digit = computeCheckDigit(base);
    expect(hasValidCheckDigit(`${base}${digit}`)).toBe(true);
    expect(hasValidCheckDigit(`${base}${(Number(digit) + 1) % 10}`)).toBe(false);
  });
});

describe('maskAccessKey', () => {
  it('nunca expone la clave completa', () => {
    const masked = maskAccessKey(KEY);
    expect(masked).toBe('22072026...7811');
    expect(masked).not.toContain(KEY);
  });

  it('oculta por completo valores muy cortos', () => {
    expect(maskAccessKey('12345')).toBe('*****');
  });
});
