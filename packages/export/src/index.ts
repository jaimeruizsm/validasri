export * from './csv';
export * from './rows';
export * from './xlsx';

/** Nombre de archivo seguro para la descarga, con la extension correcta. */
export const exportFilename = (originalFilename: string, format: 'xlsx' | 'csv'): string => {
  const base = originalFilename.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'validasri';
  return `${base}-resultados.${format}`;
};
