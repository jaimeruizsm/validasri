import { describe, expect, it } from 'vitest';
import { isAppError } from '@validasri/shared';
import {
  assertKeyCountWithinLimit,
  assertPlainTextContent,
  assertValidTxtFile,
  sanitizeFilename,
} from '../src/file-validation';

const constraints = { maxSizeBytes: 5 * 1024 * 1024, maxKeys: 10_000 };

describe('sanitizeFilename', () => {
  it('elimina rutas y deja solo el nombre base', () => {
    expect(sanitizeFilename('C:\\Users\\demo\\claves.txt')).toBe('claves.txt');
    expect(sanitizeFilename('../../etc/passwd.txt')).toBe('passwd.txt');
  });

  it('elimina caracteres de control y caracteres no seguros', () => {
    const nul = String.fromCharCode(0);
    expect(sanitizeFilename(`cla${nul}ves<>:"|?*.txt`)).toBe('claves.txt');
  });

  it('devuelve un nombre por defecto cuando queda vacio', () => {
    expect(sanitizeFilename('///')).toBe('archivo.txt');
  });

  it('limita la longitud del nombre', () => {
    expect(sanitizeFilename(`${'a'.repeat(300)}.txt`).length).toBe(120);
  });
});

describe('assertValidTxtFile', () => {
  it('acepta un .txt dentro del limite', () => {
    expect(() => assertValidTxtFile({ name: 'claves.txt', size: 1024 }, constraints)).not.toThrow();
  });

  it('rechaza extensiones distintas de .txt', () => {
    expect(() => assertValidTxtFile({ name: 'claves.csv', size: 10 }, constraints)).toThrow(
      /extension .txt/i,
    );
  });

  it('rechaza archivos vacios', () => {
    expect(() => assertValidTxtFile({ name: 'claves.txt', size: 0 }, constraints)).toThrow(/vacio/i);
  });

  it('rechaza archivos que superan el tamano maximo', () => {
    try {
      assertValidTxtFile({ name: 'claves.txt', size: constraints.maxSizeBytes + 1 }, constraints);
      throw new Error('deberia haber lanzado');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect((error as Error).message).toMatch(/tamano maximo/i);
    }
  });
});

describe('assertKeyCountWithinLimit', () => {
  it('rechaza archivos sin claves validas', () => {
    expect(() => assertKeyCountWithinLimit(0, constraints)).toThrow(/ninguna clave/i);
  });

  it('rechaza cuando se supera el maximo por lote', () => {
    expect(() => assertKeyCountWithinLimit(constraints.maxKeys + 1, constraints)).toThrow(
      /maximo por lote/i,
    );
  });

  it('acepta justo en el limite', () => {
    expect(() => assertKeyCountWithinLimit(constraints.maxKeys, constraints)).not.toThrow();
  });
});

describe('assertPlainTextContent', () => {
  it('rechaza contenido binario con bytes nulos', () => {
    expect(() => assertPlainTextContent(`abc${String.fromCharCode(0)}def`)).toThrow(/texto plano/i);
  });

  it('acepta texto plano normal', () => {
    expect(() => assertPlainTextContent('linea 1\nlinea 2')).not.toThrow();
  });
});
