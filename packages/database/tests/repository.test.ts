import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { billingPeriodFor } from '@validasri/shared';
import type { ItemResult } from '../src/repository';
import { LocalRepository } from '../src/local/repository';
import { createTestDb, fakeAccessKey, seedOrganization, type TestOrg } from './helpers';

const authorizedResult = (): ItemResult => ({
  status: 'authorized',
  sriStatusRaw: 'AUTORIZADO',
  documentType: '01',
  issuerRuc: '0991234567001',
  authorizationDate: '2026-07-22T15:00:00.000Z',
  authorizationNumber: '1234567890',
  environment: 'PRUEBAS',
  errorCode: null,
  errorMessage: null,
  rawResponse: { estado: 'AUTORIZADO' },
});

const errorResult = (): ItemResult => ({
  ...authorizedResult(),
  status: 'service_error',
  sriStatusRaw: null,
  authorizationDate: null,
  authorizationNumber: null,
  errorCode: 'timeout',
  errorMessage: 'El servicio del SRI no respondio a tiempo.',
  rawResponse: null,
});

const listQuery = {
  page: 1,
  pageSize: 50,
  sortBy: 'created_at' as const,
  sortDir: 'asc' as const,
};

describe('LocalRepository', () => {
  let db: DatabaseSync;
  let repo: LocalRepository;
  let orgA: TestOrg;
  let orgB: TestOrg;

  beforeEach(() => {
    db = createTestDb();
    repo = new LocalRepository(db);
    orgA = seedOrganization(db, { name: 'Empresa A', email: 'a@validasri.ec', monthlyLimit: 100 });
    orgB = seedOrganization(db, { name: 'Empresa B', email: 'b@validasri.ec' });
  });

  afterEach(() => {
    db.close();
  });

  const createBatch = async (org: TestOrg, keyCount: number, filename = 'claves.txt') =>
    repo.createBatch({
      organizationId: org.organizationId,
      createdBy: org.userId,
      originalFilename: filename,
      totalLines: keyCount + 2,
      totalInvalid: 1,
      totalDuplicates: 1,
      accessKeys: Array.from({ length: keyCount }, (_, index) => fakeAccessKey(index + 1)),
    });

  it('crea el lote con sus items pendientes y deriva tipo y RUC de la clave', async () => {
    const batch = await createBatch(orgA, 3);
    expect(batch.status).toBe('queued');
    expect(batch.totalValid).toBe(3);
    expect(batch.totalInvalid).toBe(1);
    expect(batch.totalDuplicates).toBe(1);
    expect(batch.createdByEmail).toBe('a@validasri.ec');

    const items = await repo.listItems(orgA.organizationId, batch.id, listQuery);
    expect(items.total).toBe(3);
    expect(items.rows[0]?.status).toBe('pending');
    expect(items.rows[0]?.documentType).toBe('01');
    expect(items.rows[0]?.issuerRuc).toBe('0991234567001');
  });

  it('rechaza claves duplicadas dentro del mismo lote', async () => {
    const duplicated = fakeAccessKey(1);
    await expect(
      repo.createBatch({
        organizationId: orgA.organizationId,
        createdBy: orgA.userId,
        originalFilename: 'dup.txt',
        totalLines: 2,
        totalInvalid: 0,
        totalDuplicates: 0,
        accessKeys: [duplicated, duplicated],
      }),
    ).rejects.toThrow();
  });

  describe('aislamiento entre organizaciones', () => {
    it('no permite leer un lote de otra organizacion', async () => {
      const batch = await createBatch(orgA, 2);
      expect(await repo.getBatch(orgB.organizationId, batch.id)).toBeNull();
    });

    it('no devuelve items de otra organizacion', async () => {
      const batch = await createBatch(orgA, 2);
      const items = await repo.listItems(orgB.organizationId, batch.id, listQuery);
      expect(items.total).toBe(0);
      expect(items.rows).toHaveLength(0);
    });

    it('no incluye lotes ajenos en el historial', async () => {
      await createBatch(orgA, 1, 'de-a.txt');
      await createBatch(orgB, 1, 'de-b.txt');
      const listado = await repo.listBatches(orgB.organizationId, { page: 1, pageSize: 10 });
      expect(listado.total).toBe(1);
      expect(listado.rows[0]?.originalFilename).toBe('de-b.txt');
    });

    it('no exporta items ajenos', async () => {
      const batch = await createBatch(orgA, 3);
      const rows = await repo.listItemsForExport(orgB.organizationId, batch.id, {
        sortBy: 'created_at',
        sortDir: 'asc',
      });
      expect(rows).toHaveLength(0);
    });

    it('no reencola items ajenos', async () => {
      const batch = await createBatch(orgA, 1);
      const [claimed] = await repo.claimPendingItems(1);
      await repo.recordItemResult(claimed!.id, errorResult());
      expect(await repo.retryFailedItems(orgB.organizationId, batch.id)).toBe(0);
      expect(await repo.retryFailedItems(orgA.organizationId, batch.id)).toBe(1);
    });
  });

  describe('cola del worker', () => {
    it('reclama items y evita que otro worker tome los mismos', async () => {
      await createBatch(orgA, 5);
      const first = await repo.claimPendingItems(3);
      const second = await repo.claimPendingItems(3);

      expect(first).toHaveLength(3);
      expect(second).toHaveLength(2);
      const ids = new Set([...first, ...second].map((item) => item.id));
      expect(ids.size).toBe(5);
      expect(await repo.claimPendingItems(3)).toHaveLength(0);
    });

    it('no reclama items reprogramados para el futuro', async () => {
      await createBatch(orgA, 1);
      const [claimed] = await repo.claimPendingItems(1);
      const future = new Date(Date.now() + 60_000).toISOString();
      await repo.rescheduleItem(claimed!.id, future, { code: 'timeout', message: 'Sin respuesta.' });

      expect(await repo.claimPendingItems(5)).toHaveLength(0);

      await repo.rescheduleItem(claimed!.id, new Date(Date.now() - 1_000).toISOString(), {
        code: 'timeout',
        message: 'Sin respuesta.',
      });
      expect(await repo.claimPendingItems(5)).toHaveLength(1);
    });

    it('recupera items bloqueados por un worker caido', async () => {
      await createBatch(orgA, 2);
      await repo.claimPendingItems(2);
      expect(await repo.releaseStaleLocks(60_000)).toBe(0);
      expect(await repo.releaseStaleLocks(0)).toBe(2);
      expect(await repo.claimPendingItems(2)).toHaveLength(2);
    });

    it('incrementa el contador de intentos en cada reprogramacion', async () => {
      const batch = await createBatch(orgA, 1);
      const [claimed] = await repo.claimPendingItems(1);
      const later = new Date(Date.now() - 1_000).toISOString();
      await repo.rescheduleItem(claimed!.id, later, { code: 'http_503', message: 'No disponible.' });
      await repo.claimPendingItems(1);
      await repo.rescheduleItem(claimed!.id, later, { code: 'http_503', message: 'No disponible.' });

      const items = await repo.listItems(orgA.organizationId, batch.id, listQuery);
      expect(items.rows[0]?.attemptCount).toBe(2);
      expect(items.rows[0]?.errorCode).toBe('http_503');
    });
  });

  describe('contadores y cierre del lote', () => {
    it('actualiza el progreso y pasa el lote a processing', async () => {
      const batch = await createBatch(orgA, 4);
      const claimed = await repo.claimPendingItems(2);
      for (const item of claimed) {
        await repo.recordItemResult(item.id, authorizedResult());
      }
      await repo.refreshBatchCounters(batch.id);

      const updated = await repo.getBatch(orgA.organizationId, batch.id);
      expect(updated?.status).toBe('processing');
      expect(updated?.totalProcessed).toBe(2);
      expect(updated?.totalAuthorized).toBe(2);
      expect(updated?.startedAt).not.toBeNull();
    });

    it('cierra el lote como completed cuando no hubo errores', async () => {
      const batch = await createBatch(orgA, 2);
      for (const item of await repo.claimPendingItems(2)) {
        await repo.recordItemResult(item.id, authorizedResult());
      }
      expect(await repo.finalizePendingBatches()).toContain(batch.id);

      const updated = await repo.getBatch(orgA.organizationId, batch.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).not.toBeNull();
    });

    it('cierra el lote como completed_with_errors cuando quedan errores', async () => {
      const batch = await createBatch(orgA, 2);
      const claimed = await repo.claimPendingItems(2);
      await repo.recordItemResult(claimed[0]!.id, authorizedResult());
      await repo.recordItemResult(claimed[1]!.id, errorResult());
      await repo.finalizePendingBatches();

      const updated = await repo.getBatch(orgA.organizationId, batch.id);
      expect(updated?.status).toBe('completed_with_errors');
      expect(updated?.totalErrors).toBe(1);
    });

    it('no cierra un lote que aun tiene items pendientes', async () => {
      const batch = await createBatch(orgA, 3);
      const claimed = await repo.claimPendingItems(1);
      await repo.recordItemResult(claimed[0]!.id, authorizedResult());
      expect(await repo.finalizePendingBatches()).not.toContain(batch.id);
    });

    it('re-valida todo el lote: reencola todos los items y reinicia contadores', async () => {
      const batch = await createBatch(orgA, 3);
      for (const item of await repo.claimPendingItems(3)) {
        await repo.recordItemResult(item.id, authorizedResult());
      }
      await repo.finalizePendingBatches();

      const before = await repo.getBatch(orgA.organizationId, batch.id);
      expect(before?.status).toBe('completed');
      expect(before?.totalAuthorized).toBe(3);

      const requeued = await repo.revalidateBatch(orgA.organizationId, batch.id);
      expect(requeued).toBe(3);

      const after = await repo.getBatch(orgA.organizationId, batch.id);
      expect(after?.status).toBe('queued');
      expect(after?.totalProcessed).toBe(0);
      expect(after?.totalAuthorized).toBe(0);
      expect(after?.completedAt).toBeNull();
      // Todos vuelven a estar disponibles para el worker.
      expect(await repo.claimPendingItems(10)).toHaveLength(3);
    });

    it('no re-valida un lote de otra organizacion', async () => {
      const batch = await createBatch(orgA, 2);
      expect(await repo.revalidateBatch(orgB.organizationId, batch.id)).toBe(0);
    });

    it('reencola los fallidos y devuelve el lote a la cola', async () => {
      const batch = await createBatch(orgA, 2);
      const claimed = await repo.claimPendingItems(2);
      await repo.recordItemResult(claimed[0]!.id, authorizedResult());
      await repo.recordItemResult(claimed[1]!.id, errorResult());
      await repo.finalizePendingBatches();

      expect(await repo.retryFailedItems(orgA.organizationId, batch.id)).toBe(1);
      const updated = await repo.getBatch(orgA.organizationId, batch.id);
      expect(updated?.status).toBe('queued');
      expect(updated?.totalErrors).toBe(0);
      expect(await repo.claimPendingItems(5)).toHaveLength(1);
    });
  });

  describe('filtros y paginacion de items', () => {
    it('filtra por estado y busca por clave o RUC', async () => {
      const batch = await createBatch(orgA, 3);
      const claimed = await repo.claimPendingItems(3);
      await repo.recordItemResult(claimed[0]!.id, authorizedResult());
      await repo.recordItemResult(claimed[1]!.id, errorResult());

      const soloAutorizados = await repo.listItems(orgA.organizationId, batch.id, {
        ...listQuery,
        status: 'authorized',
      });
      expect(soloAutorizados.total).toBe(1);

      const porRuc = await repo.listItems(orgA.organizationId, batch.id, {
        ...listQuery,
        search: '0991234567',
      });
      expect(porRuc.total).toBe(3);

      const porClave = await repo.listItems(orgA.organizationId, batch.id, {
        ...listQuery,
        search: fakeAccessKey(2),
      });
      expect(porClave.total).toBe(1);
    });

    it('pagina desde el servidor', async () => {
      const batch = await createBatch(orgA, 7);
      const page2 = await repo.listItems(orgA.organizationId, batch.id, {
        ...listQuery,
        page: 2,
        pageSize: 3,
      });
      expect(page2.rows).toHaveLength(3);
      expect(page2.total).toBe(7);
      expect(page2.pageCount).toBe(3);
    });
  });

  describe('consumo mensual', () => {
    it('acumula el consumo del periodo y lo aisla por organizacion', async () => {
      const period = billingPeriodFor();
      const batch = await createBatch(orgA, 5);
      await repo.recordUsage({
        organizationId: orgA.organizationId,
        batchId: batch.id,
        quantity: 5,
        billingPeriod: period,
      });
      await repo.recordUsage({
        organizationId: orgA.organizationId,
        batchId: batch.id,
        quantity: 3,
        billingPeriod: period,
      });

      expect(await repo.getMonthlyUsage(orgA.organizationId, period)).toBe(8);
      expect(await repo.getMonthlyUsage(orgB.organizationId, period)).toBe(0);
      expect(await repo.getMonthlyUsage(orgA.organizationId, '1999-01')).toBe(0);
    });

    it('expone el limite mensual de la organizacion en el dashboard', async () => {
      const stats = await repo.getDashboardStats(orgA.organizationId, billingPeriodFor());
      expect(stats.monthlyLimit).toBe(100);
      expect(stats.usedThisMonth).toBe(0);
    });
  });
});
