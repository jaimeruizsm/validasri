/**
 * Utilidades sobre la clave de acceso de 49 digitos del SRI.
 *
 * Estructura posicional (indices base 0):
 *   00-07  fecha de emision ddmmaaaa
 *   08-09  tipo de comprobante
 *   10-22  RUC del emisor (13 digitos)
 *   23     ambiente (1 pruebas / 2 produccion)
 *   24-38  serie + secuencial
 *   39-46  codigo numerico
 *   47     tipo de emision
 *   48     digito verificador (modulo 11)
 */

export const ACCESS_KEY_LENGTH = 49;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  '01': 'Factura',
  '03': 'Liquidacion de compra',
  '04': 'Nota de credito',
  '05': 'Nota de debito',
  '06': 'Guia de remision',
  '07': 'Comprobante de retencion',
};

export const describeDocumentType = (code: string | null | undefined): string => {
  if (!code) return 'Desconocido';
  return DOCUMENT_TYPE_LABELS[code] ?? `Tipo ${code}`;
};

export const extractDocumentType = (accessKey: string): string | null =>
  accessKey.length === ACCESS_KEY_LENGTH ? accessKey.slice(8, 10) : null;

export const extractIssuerRuc = (accessKey: string): string | null =>
  accessKey.length === ACCESS_KEY_LENGTH ? accessKey.slice(10, 23) : null;

export const extractEnvironmentCode = (accessKey: string): string | null =>
  accessKey.length === ACCESS_KEY_LENGTH ? accessKey.slice(23, 24) : null;

export const extractIssueDate = (accessKey: string): string | null => {
  if (accessKey.length !== ACCESS_KEY_LENGTH) return null;
  const day = accessKey.slice(0, 2);
  const month = accessKey.slice(2, 4);
  const year = accessKey.slice(4, 8);
  return `${year}-${month}-${day}`;
};

/**
 * Digito verificador modulo 11 con pesos ciclicos 2..7 de derecha a izquierda.
 * Se expone por separado porque el SRI acepta claves con verificador incorrecto
 * (responde NO AUTORIZADO), asi que no forma parte de la validacion de formato.
 */
export const computeCheckDigit = (first48Digits: string): number | null => {
  if (first48Digits.length !== ACCESS_KEY_LENGTH - 1 || !/^\d+$/.test(first48Digits)) {
    return null;
  }
  let sum = 0;
  let weight = 2;
  for (let index = first48Digits.length - 1; index >= 0; index -= 1) {
    sum += Number(first48Digits[index]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return 0;
  if (remainder === 10) return 1;
  return remainder;
};

export const hasValidCheckDigit = (accessKey: string): boolean => {
  if (accessKey.length !== ACCESS_KEY_LENGTH || !/^\d+$/.test(accessKey)) return false;
  return computeCheckDigit(accessKey.slice(0, 48)) === Number(accessKey[48]);
};

/**
 * Enmascara la clave para los logs: nunca se registra completa salvo que sea
 * imprescindible para auditoria.
 */
export const maskAccessKey = (accessKey: string): string => {
  if (accessKey.length <= 12) return '*'.repeat(accessKey.length);
  return `${accessKey.slice(0, 8)}...${accessKey.slice(-4)}`;
};
