import { describe, expect, it } from 'vitest';
import { parseAccessKeysTxt } from '../src/txt-parser';

const VALID_A = '2207202601099123456700110010010000001231234567811';
const VALID_B = '2207202601099123456700110010010000001241234567812';

describe('parseAccessKeysTxt', () => {
  it('acepta una clave correcta de 49 digitos', () => {
    const result = parseAccessKeysTxt(VALID_A);
    expect(result.validKeys).toEqual([VALID_A]);
    expect(result.totalLines).toBe(1);
    expect(result.totalValid).toBe(1);
    expect(result.totalInvalid).toBe(0);
    expect(result.totalDuplicates).toBe(0);
  });

  it('rechaza una clave con letras', () => {
    const withLetters = `${VALID_A.slice(0, 48)}A`;
    const result = parseAccessKeysTxt(withLetters);
    expect(result.totalValid).toBe(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.reason).toBe('non_numeric');
  });

  it('rechaza una clave corta', () => {
    const result = parseAccessKeysTxt('12345');
    expect(result.invalid[0]?.reason).toBe('length');
    expect(result.totalValid).toBe(0);
  });

  it('rechaza una clave larga', () => {
    const result = parseAccessKeysTxt(`${VALID_A}99`);
    expect(result.invalid[0]?.reason).toBe('length');
  });

  it('marca como invalida la clave que falla longitud y formato a la vez', () => {
    const result = parseAccessKeysTxt('ABC-123');
    expect(result.invalid[0]?.reason).toBe('both');
  });

  it('ignora lineas vacias y espacios sobrantes', () => {
    const content = ['', '   ', `  ${VALID_A}  `, '\t', `\t${VALID_B}`, ''].join('\n');
    const result = parseAccessKeysTxt(content);
    expect(result.totalLines).toBe(2);
    expect(result.validKeys).toEqual([VALID_A, VALID_B]);
  });

  it('detecta y excluye duplicados conservando la primera aparicion', () => {
    const content = [VALID_A, VALID_B, VALID_A, VALID_A].join('\n');
    const result = parseAccessKeysTxt(content);
    expect(result.validKeys).toEqual([VALID_A, VALID_B]);
    expect(result.totalDuplicates).toBe(2);
    expect(result.duplicates[0]).toMatchObject({ line: 3, accessKey: VALID_A, firstSeenAtLine: 1 });
  });

  it('soporta saltos de linea CRLF y BOM inicial', () => {
    const bom = String.fromCharCode(0xfeff);
    const result = parseAccessKeysTxt(`${bom}${VALID_A}\r\n${VALID_B}\r\n`);
    expect(result.validKeys).toEqual([VALID_A, VALID_B]);
  });

  it('recorta el valor invalido mostrado para no arrastrar basura', () => {
    const result = parseAccessKeysTxt('x'.repeat(500));
    expect(result.invalid[0]?.value.length).toBe(60);
  });

  it('devuelve totales coherentes en un archivo mixto', () => {
    const content = [VALID_A, 'corta', VALID_B, VALID_A, '', `${VALID_B.slice(0, 48)}Z`].join('\n');
    const result = parseAccessKeysTxt(content);
    expect(result.totalLines).toBe(5);
    expect(result.totalValid).toBe(2);
    expect(result.totalInvalid).toBe(2);
    expect(result.totalDuplicates).toBe(1);
    expect(result.totalValid + result.totalInvalid + result.totalDuplicates).toBe(result.totalLines);
  });
});
