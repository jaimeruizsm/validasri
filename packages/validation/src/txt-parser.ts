import { ACCESS_KEY_LENGTH } from '@validasri/shared';

export type InvalidReason = 'length' | 'non_numeric' | 'both';

export interface InvalidLine {
  line: number;
  /** Valor recortado a 60 caracteres para no arrastrar basura a la UI ni a los logs. */
  value: string;
  reason: InvalidReason;
  message: string;
}

export interface DuplicateLine {
  line: number;
  accessKey: string;
  /** Numero de linea donde aparecio por primera vez. */
  firstSeenAtLine: number;
}

export interface ParsedTxt {
  /** Lineas no vacias encontradas en el archivo. */
  totalLines: number;
  /** Claves validas y unicas, en el orden de aparicion. */
  validKeys: string[];
  invalid: InvalidLine[];
  duplicates: DuplicateLine[];
  totalValid: number;
  totalInvalid: number;
  totalDuplicates: number;
}

const MAX_PREVIEW_LENGTH = 60;

const describeReason = (reason: InvalidReason): string => {
  switch (reason) {
    case 'length':
      return `La clave debe tener exactamente ${ACCESS_KEY_LENGTH} caracteres.`;
    case 'non_numeric':
      return 'La clave debe contener unicamente numeros.';
    case 'both':
      return `La clave debe tener ${ACCESS_KEY_LENGTH} digitos numericos.`;
  }
};

/**
 * Analiza el contenido de un TXT con una clave de acceso por linea.
 *
 * - recorta espacios al inicio y al final (incluye tabuladores y BOM);
 * - ignora lineas vacias;
 * - clasifica en validas, invalidas y duplicadas;
 * - las duplicadas conservan la primera aparicion como valida.
 */
export const parseAccessKeysTxt = (content: string): ParsedTxt => {
  const normalized = content.replace(/^﻿/, '');
  const rawLines = normalized.split(/\r\n|\r|\n/);

  const validKeys: string[] = [];
  const invalid: InvalidLine[] = [];
  const duplicates: DuplicateLine[] = [];
  const seen = new Map<string, number>();

  let totalLines = 0;

  rawLines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const value = rawLine.trim();
    if (value.length === 0) return;

    totalLines += 1;

    const hasCorrectLength = value.length === ACCESS_KEY_LENGTH;
    const isNumeric = /^\d+$/.test(value);

    if (!hasCorrectLength || !isNumeric) {
      const reason: InvalidReason =
        !hasCorrectLength && !isNumeric ? 'both' : !hasCorrectLength ? 'length' : 'non_numeric';
      invalid.push({
        line: lineNumber,
        value: value.slice(0, MAX_PREVIEW_LENGTH),
        reason,
        message: describeReason(reason),
      });
      return;
    }

    const firstSeenAtLine = seen.get(value);
    if (firstSeenAtLine !== undefined) {
      duplicates.push({ line: lineNumber, accessKey: value, firstSeenAtLine });
      return;
    }

    seen.set(value, lineNumber);
    validKeys.push(value);
  });

  return {
    totalLines,
    validKeys,
    invalid,
    duplicates,
    totalValid: validKeys.length,
    totalInvalid: invalid.length,
    totalDuplicates: duplicates.length,
  };
};
