import ExcelJS from 'exceljs';
import { APP_NAME, LEGAL_DISCLAIMER, type ValidationBatch, type ValidationItem } from '@validasri/shared';
import { buildSummary, EXPORT_HEADERS, toExportRow } from './rows';

/**
 * Genera el Excel del lote con dos hojas: «Resultados» y «Resumen».
 *
 * La clave de acceso se escribe como texto explicito (celda con `numFmt '@'`)
 * para que Excel nunca la convierta a notacion cientifica.
 */
export const buildXlsx = async (
  batch: ValidationBatch,
  items: ValidationItem[],
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  // --- Hoja Resultados ---
  const sheet = workbook.addWorksheet('Resultados', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = EXPORT_HEADERS.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  headerRow.alignment = { vertical: 'middle' };

  const accessKeyColumn = sheet.getColumn('accessKey');
  accessKeyColumn.numFmt = '@';

  for (const item of items) {
    const row = sheet.addRow(toExportRow(item));
    // Refuerza el formato texto en la celda de la clave.
    row.getCell('accessKey').numFmt = '@';
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXPORT_HEADERS.length },
  };

  // --- Hoja Resumen ---
  const summary = workbook.addWorksheet('Resumen');
  summary.columns = [
    { header: 'Concepto', key: 'label', width: 26 },
    { header: 'Valor', key: 'value', width: 40 },
  ];
  const summaryHeader = summary.getRow(1);
  summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

  for (const entry of buildSummary(batch)) {
    summary.addRow({ label: entry.label, value: entry.value });
  }
  summary.addRow({});
  const disclaimerRow = summary.addRow({ label: 'Aviso', value: LEGAL_DISCLAIMER });
  disclaimerRow.getCell('value').alignment = { wrapText: true };
  disclaimerRow.getCell('label').font = { italic: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
};
