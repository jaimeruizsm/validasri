import type { ValidationItem } from '@validasri/shared';
import { EXPORT_HEADERS, toExportRow } from './rows';

/**
 * Escapa un valor para CSV. La clave de acceso se prefija con un apostrofo para
 * que Excel la trate como texto y no la convierta a notacion cientifica.
 */
const escapeCell = (value: string | number, forceText: boolean): string => {
  const text = forceText ? `="${String(value)}"` : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const buildCsv = (items: ValidationItem[]): string => {
  const headerLine = EXPORT_HEADERS.map((column) => escapeCell(column.header, false)).join(',');
  const lines = items.map((item) => {
    const row = toExportRow(item);
    return EXPORT_HEADERS.map((column) =>
      escapeCell(row[column.key], column.key === 'accessKey'),
    ).join(',');
  });
  // BOM UTF-8 para que Excel respete los acentos.
  return `﻿${[headerLine, ...lines].join('\r\n')}\r\n`;
};
