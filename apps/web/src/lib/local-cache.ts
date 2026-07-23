'use client';

import type { ValidationItem } from '@validasri/shared';

/**
 * Cache local de resultados en IndexedDB (por lote). Permite consultar y exportar
 * los comprobantes desde el propio navegador, sin volver a pedirlos al servidor,
 * y mantiene una copia local de los datos.
 */
const DB_NAME = 'validasri';
const DB_VERSION = 1;
const STORE = 'batch_items';

interface CachedBatch {
  batchId: string;
  items: ValidationItem[];
  updatedAt: string;
}

const isAvailable = (): boolean =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'batchId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
  });

export const saveBatchItems = async (batchId: string, items: ValidationItem[]): Promise<void> => {
  if (!isAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ batchId, items, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar en la cache.'));
    });
    db.close();
  } catch {
    // La cache es un extra: si IndexedDB falla, la app sigue funcionando.
  }
};

export const loadBatchItems = async (batchId: string): Promise<ValidationItem[] | null> => {
  if (!isAvailable()) return null;
  try {
    const db = await openDb();
    const result = await new Promise<CachedBatch | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(batchId);
      request.onsuccess = () => resolve(request.result as CachedBatch | undefined);
      request.onerror = () => reject(request.error ?? new Error('No se pudo leer la cache.'));
    });
    db.close();
    return result?.items ?? null;
  } catch {
    return null;
  }
};
