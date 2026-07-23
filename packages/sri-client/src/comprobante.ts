/**
 * Extraccion de campos del XML del comprobante autorizado.
 *
 * El servicio `autorizacionComprobante` del SRI devuelve el comprobante firmado
 * como XML. Se leen unos pocos campos de cabecera (emisor y total) con expresiones
 * regulares tolerantes: el XML puede venir con o sin namespaces y con distinto
 * formato de espacios. No se hace un parseo estructural completo a proposito, para
 * no acoplarse al esquema exacto de cada tipo de comprobante.
 */

export interface ComprobanteFields {
  issuerName: string | null;
  tradeName: string | null;
  totalAmount: string | null;
}

const readTag = (xml: string, tag: string): string | null => {
  // Acepta <tag>valor</tag> con posibles prefijos de namespace y CDATA.
  const pattern = new RegExp(`<(?:\\w+:)?${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</(?:\\w+:)?${tag}>`, 'i');
  const match = xml.match(pattern);
  if (!match || match[1] === undefined) return null;
  const value = match[1].trim();
  return value.length > 0 ? value : null;
};

export const parseComprobanteXml = (xml: unknown): ComprobanteFields => {
  if (typeof xml !== 'string' || xml.length === 0) {
    return { issuerName: null, tradeName: null, totalAmount: null };
  }
  return {
    issuerName: readTag(xml, 'razonSocial'),
    tradeName: readTag(xml, 'nombreComercial'),
    // importeTotal es el nombre en facturas/retenciones; algunos usan valorTotal.
    totalAmount: readTag(xml, 'importeTotal') ?? readTag(xml, 'valorTotal'),
  };
};
