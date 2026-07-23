/** Formato de fechas para Ecuador. Toda la UI usa esta zona horaria. */
export const ECUADOR_TIME_ZONE = 'America/Guayaquil';
export const ECUADOR_LOCALE = 'es-EC';

const dateTimeFormatter = new Intl.DateTimeFormat(ECUADOR_LOCALE, {
  timeZone: ECUADOR_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat(ECUADOR_LOCALE, {
  timeZone: ECUADOR_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTimeEc = (value: Date | string | null | undefined, fallback = '—'): string => {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
};

export const formatDateEc = (value: Date | string | null | undefined, fallback = '—'): string => {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : fallback;
};

/**
 * Periodo de facturacion `YYYY-MM` calculado en hora de Ecuador, para que el
 * consumo mensual no salte de mes por el desfase UTC-5.
 */
export const billingPeriodFor = (value: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ECUADOR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  return `${year}-${month}`;
};

export const nowIso = (): string => new Date().toISOString();
