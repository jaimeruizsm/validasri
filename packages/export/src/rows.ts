import {
  describeDocumentType,
  formatDateTimeEc,
  ITEM_STATUS_LABELS,
  type ValidationBatch,
  type ValidationItem,
} from '@validasri/shared';

export interface ExportRow {
  accessKey: string;
  status: string;
  issuerRuc: string;
  issuerName: string;
  tradeName: string;
  documentType: string;
  totalAmount: string;
  authorizationDate: string;
  authorizationNumber: string;
  attempts: number;
  observation: string;
  processedAt: string;
}

export const EXPORT_HEADERS: Array<{ key: keyof ExportRow; header: string; width: number }> = [
  { key: 'accessKey', header: 'Clave de acceso', width: 52 },
  { key: 'status', header: 'Estado', width: 22 },
  { key: 'issuerRuc', header: 'RUC del emisor', width: 16 },
  { key: 'issuerName', header: 'Razon social del emisor', width: 40 },
  { key: 'tradeName', header: 'Nombre comercial', width: 28 },
  { key: 'documentType', header: 'Tipo de comprobante', width: 22 },
  { key: 'totalAmount', header: 'Importe total', width: 14 },
  { key: 'authorizationDate', header: 'Fecha de autorizacion', width: 20 },
  { key: 'authorizationNumber', header: 'Numero de autorizacion', width: 40 },
  { key: 'attempts', header: 'Intentos', width: 10 },
  { key: 'observation', header: 'Observacion', width: 50 },
  { key: 'processedAt', header: 'Fecha de consulta', width: 20 },
];

export const toExportRow = (item: ValidationItem): ExportRow => ({
  accessKey: item.accessKey,
  status: ITEM_STATUS_LABELS[item.status],
  issuerRuc: item.issuerRuc ?? '',
  issuerName: item.issuerName ?? '',
  tradeName: item.tradeName ?? '',
  documentType: describeDocumentType(item.documentType),
  totalAmount: item.totalAmount ?? '',
  authorizationDate: formatDateTimeEc(item.authorizationDate, ''),
  authorizationNumber: item.authorizationNumber ?? '',
  attempts: item.attemptCount,
  observation: item.errorMessage ?? item.sriStatusRaw ?? '',
  processedAt: formatDateTimeEc(item.processedAt, ''),
});

export interface SummaryEntry {
  label: string;
  value: string | number;
}

export const buildSummary = (batch: ValidationBatch): SummaryEntry[] => [
  { label: 'Archivo', value: batch.originalFilename },
  { label: 'Fecha de creacion', value: formatDateTimeEc(batch.createdAt, '') },
  { label: 'Total de lineas', value: batch.totalLines },
  { label: 'Claves validas', value: batch.totalValid },
  { label: 'Claves invalidas', value: batch.totalInvalid },
  { label: 'Duplicadas', value: batch.totalDuplicates },
  { label: 'Autorizadas', value: batch.totalAuthorized },
  { label: 'Anuladas', value: batch.totalAnnulled },
  { label: 'No autorizadas', value: batch.totalNotAuthorized },
  { label: 'No encontradas', value: batch.totalNotFound },
  { label: 'Errores', value: batch.totalErrors },
];
