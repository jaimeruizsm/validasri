import { extractDocumentType, extractIssuerRuc, type ItemStatus } from '@validasri/shared';
import type { SriMessage, SriQueryResult } from './types';

/**
 * Normalizacion de la respuesta de `consultarEstadoAutorizacionComprobante`.
 *
 * El adaptador es deliberadamente tolerante: acepta que `autorizaciones` llegue
 * como objeto o como arreglo, y que los nombres varien entre entornos. Cualquier
 * cambio del contrato del SRI se absorbe aqui y no afecta al resto del sistema.
 */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readPath = (source: unknown, keys: string[]): unknown => {
  for (const key of keys) {
    const record = asRecord(source);
    if (!record) return undefined;
    source = record[key];
  }
  return source;
};

const firstDefined = (source: unknown, keys: string[]): unknown => {
  const record = asRecord(source);
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const toText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  const record = asRecord(value);
  // El parser SOAP puede envolver el texto en { _: 'valor', $: {...} }.
  if (record && typeof record['_'] === 'string') return String(record['_']).trim() || null;
  return null;
};

const toIsoDate = (value: unknown): string | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toArray = (value: unknown): unknown[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

/**
 * Mapa entre el texto del SRI y el estado interno. Se compara sin acentos ni
 * mayusculas porque el servicio no es consistente entre entornos.
 */
const STATUS_MAP: Array<{ match: RegExp; status: ItemStatus }> = [
  { match: /^EN\s*PROCESO\s*DE\s*ANULACION$/, status: 'pending_annulment' },
  { match: /^ANULAD[OA]$/, status: 'annulled' },
  { match: /^AUTORIZAD[OA]$/, status: 'authorized' },
  { match: /^NO\s*AUTORIZAD[OA]$/, status: 'not_authorized' },
  { match: /^RECHAZAD[OA]$/, status: 'not_authorized' },
  { match: /^DEVUELT[OA]$/, status: 'not_authorized' },
];

const normalizeForMatch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();

export const mapSriStatus = (rawStatus: string | null): ItemStatus | null => {
  if (!rawStatus) return null;
  const normalized = normalizeForMatch(rawStatus);
  for (const entry of STATUS_MAP) {
    if (entry.match.test(normalized)) return entry.status;
  }
  return null;
};

const normalizeMessages = (value: unknown): SriMessage[] =>
  toArray(readPath(value, ['mensaje']) ?? value)
    .map((raw) => {
      const text = toText(firstDefined(raw, ['mensaje', 'message']));
      if (!text) return null;
      return {
        identifier: toText(firstDefined(raw, ['identificador', 'identifier'])),
        message: text,
        additionalInfo: toText(firstDefined(raw, ['informacionAdicional', 'additionalInformation'])),
        type: toText(firstDefined(raw, ['tipo', 'type'])),
      } satisfies SriMessage;
    })
    .filter((item): item is SriMessage => item !== null);

/** Mensaje breve y en espanol a partir de los mensajes devueltos por el SRI. */
const summarizeMessages = (messages: SriMessage[]): string | null => {
  if (messages.length === 0) return null;
  const first = messages[0];
  if (!first) return null;
  const extra = first.additionalInfo ? ` (${first.additionalInfo})` : '';
  return `${first.message}${extra}`.slice(0, 500);
};

export const normalizeSriResponse = (accessKey: string, response: unknown): SriQueryResult => {
  const envelope =
    readPath(response, ['RespuestaAutorizacionComprobante']) ??
    readPath(response, ['respuestaAutorizacionComprobante']) ??
    readPath(response, ['EstadoAutorizacionComprobante']) ??
    response;

  const autorizaciones = toArray(
    readPath(envelope, ['autorizaciones', 'autorizacion']) ??
      readPath(envelope, ['autorizaciones']) ??
      readPath(envelope, ['autorizacion']),
  ).filter((entry) => asRecord(entry) !== null);

  const base = {
    accessKey,
    documentType: extractDocumentType(accessKey),
    issuerRuc: extractIssuerRuc(accessKey),
    raw: response,
  };

  const declaredCount = Number(toText(firstDefined(envelope, ['numeroComprobantes'])) ?? '0');

  if (autorizaciones.length === 0 || declaredCount === 0) {
    return {
      ...base,
      status: 'not_found',
      sriStatusRaw: null,
      authorizationDate: null,
      authorizationNumber: null,
      environment: null,
      messages: [],
      errorCode: null,
      errorMessage: 'El SRI no tiene registrado ningun comprobante con esta clave de acceso.',
    };
  }

  // Cuando hay varias autorizaciones se prioriza la mas relevante para el usuario.
  const priority: ItemStatus[] = ['annulled', 'pending_annulment', 'authorized', 'not_authorized'];
  const candidates = autorizaciones.map((entry) => {
    const sriStatusRaw = toText(firstDefined(entry, ['estado', 'estadoAutorizacion']));
    return {
      entry,
      sriStatusRaw,
      status: mapSriStatus(sriStatusRaw),
    };
  });

  const chosen =
    priority
      .map((status) => candidates.find((candidate) => candidate.status === status))
      .find((candidate) => candidate !== undefined) ?? candidates[0]!;

  const messages = normalizeMessages(firstDefined(chosen.entry, ['mensajes', 'messages']));

  if (chosen.status === null) {
    // Estado desconocido: no se afirma un resultado que no se entiende.
    return {
      ...base,
      status: 'service_error',
      sriStatusRaw: chosen.sriStatusRaw,
      authorizationDate: toIsoDate(firstDefined(chosen.entry, ['fechaAutorizacion'])),
      authorizationNumber: toText(firstDefined(chosen.entry, ['numeroAutorizacion'])),
      environment: toText(firstDefined(chosen.entry, ['ambiente'])),
      messages,
      errorCode: 'estado_no_reconocido',
      errorMessage:
        `El SRI devolvio el estado "${chosen.sriStatusRaw ?? 'sin estado'}", que esta plataforma ` +
        'aun no interpreta. Revisa el comprobante directamente en el portal del SRI.',
    };
  }

  const errorMessage =
    chosen.status === 'not_authorized' || chosen.status === 'annulled'
      ? summarizeMessages(messages)
      : null;

  return {
    ...base,
    status: chosen.status,
    sriStatusRaw: chosen.sriStatusRaw,
    authorizationDate: toIsoDate(firstDefined(chosen.entry, ['fechaAutorizacion'])),
    authorizationNumber: toText(firstDefined(chosen.entry, ['numeroAutorizacion'])) ?? accessKey,
    environment: toText(firstDefined(chosen.entry, ['ambiente'])),
    messages,
    errorCode: null,
    errorMessage,
  };
};
