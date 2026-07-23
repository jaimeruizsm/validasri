import { describe, expect, it } from 'vitest';
import { parseComprobanteXml } from '../src/comprobante';
import { normalizeSriResponse } from '../src/normalizer';

const KEY = '2207202601099123456700110010010000001231234567811';

const facturaXml = `
<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <razonSocial>EXPALSA EXPORTADORA DE ALIMENTOS S A</razonSocial>
    <nombreComercial>EXPALSA</nombreComercial>
    <ruc>0990637679001</ruc>
  </infoTributaria>
  <infoFactura>
    <dirMatriz>KM 6 5 VIA DURAN TAMBO</dirMatriz>
    <importeTotal>9802.72</importeTotal>
  </infoFactura>
</factura>`;

describe('parseComprobanteXml', () => {
  it('extrae razon social, nombre comercial e importe total', () => {
    const fields = parseComprobanteXml(facturaXml);
    expect(fields.issuerName).toBe('EXPALSA EXPORTADORA DE ALIMENTOS S A');
    expect(fields.tradeName).toBe('EXPALSA');
    expect(fields.totalAmount).toBe('9802.72');
  });

  it('tolera prefijos de namespace', () => {
    const xml = '<ns2:razonSocial>ACME S.A.</ns2:razonSocial>';
    expect(parseComprobanteXml(xml).issuerName).toBe('ACME S.A.');
  });

  it('usa valorTotal cuando no hay importeTotal (retenciones)', () => {
    const xml = '<razonSocial>ACME</razonSocial><valorTotal>50.00</valorTotal>';
    expect(parseComprobanteXml(xml).totalAmount).toBe('50.00');
  });

  it('devuelve nulls cuando no hay XML o esta vacio', () => {
    expect(parseComprobanteXml(null)).toEqual({
      issuerName: null,
      tradeName: null,
      totalAmount: null,
    });
    expect(parseComprobanteXml('<factura></factura>').issuerName).toBeNull();
  });
});

describe('normalizeSriResponse con XML del comprobante', () => {
  it('incluye la razon social y el importe en un comprobante autorizado', () => {
    const result = normalizeSriResponse(KEY, {
      RespuestaAutorizacionComprobante: {
        numeroComprobantes: '1',
        autorizaciones: {
          autorizacion: [{ estado: 'AUTORIZADO', comprobante: facturaXml }],
        },
      },
    });
    expect(result.status).toBe('authorized');
    expect(result.issuerName).toBe('EXPALSA EXPORTADORA DE ALIMENTOS S A');
    expect(result.tradeName).toBe('EXPALSA');
    expect(result.totalAmount).toBe('9802.72');
  });

  it('deja los campos en null cuando el comprobante no trae XML', () => {
    const result = normalizeSriResponse(KEY, {
      RespuestaAutorizacionComprobante: {
        numeroComprobantes: '1',
        autorizaciones: { autorizacion: [{ estado: 'AUTORIZADO' }] },
      },
    });
    expect(result.status).toBe('authorized');
    expect(result.issuerName).toBeNull();
    expect(result.totalAmount).toBeNull();
  });
});
