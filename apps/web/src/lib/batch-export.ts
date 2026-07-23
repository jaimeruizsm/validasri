'use client';

import type { ItemStatus, Paginated, ValidationItem } from '@validasri/shared';
import { buildCsv } from '@validasri/export/csv';
import { loadBatchItems, saveBatchItems } from './local-cache';

const FETCH_PAGE_SIZE = 200;

interface ItemsResponse {
  items: Paginated<ValidationItem>;
}

/**
 * Descarga TODOS los comprobantes de un lote (recorriendo las paginas del API) y
 * los guarda en la cache local (IndexedDB). Si la red falla, cae a la cache.
 */
export const fetchAllBatchItems = async (batchId: string): Promise<ValidationItem[]> => {
  try {
    const all: ValidationItem[] = [];
    let page = 1;
    let pageCount = 1;
    do {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(FETCH_PAGE_SIZE),
      });
      const response = await fetch(`/api/lotes/${batchId}/items?${params.toString()}`);
      if (!response.ok) throw new Error('fetch failed');
      const data = (await response.json()) as ItemsResponse;
      all.push(...data.items.rows);
      pageCount = data.items.pageCount;
      page += 1;
    } while (page <= pageCount);

    await saveBatchItems(batchId, all);
    return all;
  } catch {
    return (await loadBatchItems(batchId)) ?? [];
  }
};

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const applyFilters = (
  items: ValidationItem[],
  filters: { search?: string; status?: ItemStatus | '' },
): ValidationItem[] => {
  const search = filters.search?.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (search) {
      const haystack = `${item.accessKey} ${item.issuerRuc ?? ''} ${item.issuerName ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
};

/**
 * Genera y descarga el CSV en el navegador desde la cache local, con todos los
 * detalles (incluida la razon social). Respeta los filtros actuales.
 */
export const exportCsvLocally = (
  originalFilename: string,
  items: ValidationItem[],
  filters: { search?: string; status?: ItemStatus | '' },
): void => {
  const filtered = applyFilters(items, filters);
  const base = originalFilename.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'validasri';
  triggerDownload(
    new Blob([buildCsv(filtered)], { type: 'text/csv;charset=utf-8' }),
    `${base}-resultados.csv`,
  );
};
