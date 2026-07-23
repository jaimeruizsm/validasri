import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { ValidationBatch, ValidationItem } from '@validasri/shared';
import { buildCsv } from '../src/csv';
import { buildXlsx } from '../src/xlsx';
import { exportFilename } from '../src/index';

const KEY = '2207202601099123456700110010010000001231234567811';

const item = (overrides: Partial<ValidationItem> = {}): ValidationItem => ({
  id: 'item-1',
  organizationId: 'org-1',
  batchId: 'batch-1',
  accessKey: KEY,
  status: 'authorized',
  sriStatusRaw: 'AUTORIZADO',
  documentType: '01',
  issuerRuc: '0991234567001',
  issuerName: 'EMPRESA DEMOSTRACION S.A.',
  tradeName: 'DEMO',
  totalAmount: '100.00',
  authorizationDate: '2026-07-22T15:00:00.000Z',
  authorizationNumber: '1234567890',
  environment: 'PRUEBAS',
  errorCode: null,
  errorMessage: null,
  attemptCount: 1,
  nextAttemptAt: null,
  lockedAt: null,
  processedAt: '2026-07-22T15:05:00.000Z',
  createdAt: '2026-07-22T15:00:00.000Z',
  updatedAt: '2026-07-22T15:05:00.000Z',
  ...overrides,
});

const batch: ValidationBatch = {
  id: 'batch-1',
  organizationId: 'org-1',
  createdBy: 'user-1',
  createdByEmail: 'demo@validasri.ec',
  originalFilename: 'claves.txt',
  status: 'completed',
  totalLines: 10,
  totalValid: 8,
  totalInvalid: 1,
  totalDuplicates: 1,
  totalProcessed: 8,
  totalAuthorized: 6,
  totalAnnulled: 1,
  totalNotAuthorized: 1,
  totalNotFound: 0,
  totalErrors: 0,
  startedAt: '2026-07-22T15:00:00.000Z',
  completedAt: '2026-07-22T15:10:00.000Z',
  createdAt: '2026-07-22T15:00:00.000Z',
  updatedAt: '2026-07-22T15:10:00.000Z',
};

describe('buildCsv', () => {
  it('incluye encabezados en espanol', () => {
    const csv = buildCsv([item()]);
    expect(csv).toContain('Clave de acceso');
    expect(csv).toContain('RUC del emisor');
    expect(csv).toContain('Fecha de consulta');
  });

  it('exporta la clave de acceso como texto para evitar notacion cientifica', () => {
    const csv = buildCsv([item()]);
    // El truco de Excel: la clave va como ="...", que al ir dentro de una celda
    // CSV se escapa duplicando las comillas: "=""KEY""".
    expect(csv).toContain(`"=""${KEY}"""`);
    expect(csv).toContain(KEY);
    expect(csv).not.toContain('2.20720');
    expect(csv).not.toContain('E+');
  });

  it('escapa correctamente comas y comillas en las observaciones', () => {
    const csv = buildCsv([
      item({ status: 'not_authorized', errorMessage: 'Error: "clave", registrada' }),
    ]);
    expect(csv).toContain('"Error: ""clave"", registrada"');
  });

  it('empieza con BOM UTF-8', () => {
    expect(buildCsv([item()]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe('buildXlsx', () => {
  it('genera un libro con las hojas Resultados y Resumen', async () => {
    const buffer = await buildXlsx(batch, [item()]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    expect(workbook.getWorksheet('Resultados')).toBeDefined();
    expect(workbook.getWorksheet('Resumen')).toBeDefined();
  });

  it('escribe la clave de acceso como texto y sin perder digitos', async () => {
    const buffer = await buildXlsx(batch, [item()]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Resultados')!;

    const dataRow = sheet.getRow(2);
    const cell = dataRow.getCell(1);
    expect(String(cell.value)).toBe(KEY);
    expect(cell.numFmt).toBe('@');
  });

  it('congela la fila superior y aplica autofiltro', async () => {
    const buffer = await buildXlsx(batch, [item()]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Resultados')!;

    expect(sheet.views[0]?.state).toBe('frozen');
    expect(sheet.autoFilter).toBeDefined();
  });

  it('la hoja Resumen contiene los totales del lote', async () => {
    const buffer = await buildXlsx(batch, [item()]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const summary = workbook.getWorksheet('Resumen')!;

    const labels: string[] = [];
    summary.eachRow((row) => labels.push(String(row.getCell(1).value ?? '')));
    expect(labels).toContain('Total de lineas');
    expect(labels).toContain('Autorizadas');
    expect(labels).toContain('Errores');
  });
});

describe('exportFilename', () => {
  it('genera un nombre seguro con la extension correcta', () => {
    expect(exportFilename('claves de julio.txt', 'xlsx')).toBe('claves_de_julio-resultados.xlsx');
    expect(exportFilename('reporte.txt', 'csv')).toBe('reporte-resultados.csv');
  });
});
