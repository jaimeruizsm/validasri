import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { LocalRepository } from '@validasri/database';
import { openDatabase } from '@validasri/database';
import { MockSriProvider, SriServiceError, type SriProvider } from '@validasri/sri-client';
import { seedOrganization, type TestOrg } from '../../../packages/database/tests/helpers';
import { processItem, runOnce } from '../src/processor';
import type { WorkerConfig } from '../src/config';

const config: WorkerConfig = {
  concurrency: 3,
  pollIntervalMs: 10,
  claimSize: 50,
  requestDelayMs: 0,
  maxRetries: 3,
  lockTimeoutMs: 120_000,
};

// fecha(8)+tipo(2)+ruc(13)+ambiente(1)+serie-sec(15)+codigo(8)+emision(1)+ultimo(1)
const keyWith = (sequence: number, lastDigit: number): string => {
  const key =
    '22072026' +
    '01' +
    '0991234567001' +
    '1' +
    String(sequence).padStart(15, '0') +
    '12345678' +
    '1' +
    String(lastDigit);
  if (key.length !== 49) throw new Error(`clave de prueba invalida: ${key.length}`);
  return key;
};

describe('worker processor con proveedor mock', () => {
  let db: DatabaseSync;
  let repo: LocalRepository;
  let org: TestOrg;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = new LocalRepository(db);
    org = seedOrganization(db, { name: 'Worker Org', email: 'worker@validasri.ec' });
  });

  afterEach(() => {
    db.close();
  });

  const createBatchWith = async (keys: string[]) =>
    repo.createBatch({
      organizationId: org.organizationId,
      createdBy: org.userId,
      originalFilename: 'lote.txt',
      totalLines: keys.length,
      totalInvalid: 0,
      totalDuplicates: 0,
      accessKeys: keys,
    });

  it('procesa un lote completo y lo cierra con el resultado de cada estado', async () => {
    const keys = [
      keyWith(1, 0), // autorizado
      keyWith(2, 5), // no autorizado
      keyWith(3, 6), // anulado
      keyWith(4, 8), // no encontrado
    ];
    const batch = await createBatchWith(keys);

    const deps = { repository: repo, provider: new MockSriProvider(), config };
    // Varios ciclos hasta drenar la cola.
    for (let i = 0; i < 5; i += 1) {
      if ((await runOnce(deps)) === 0) break;
    }

    const updated = await repo.getBatch(org.organizationId, batch.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.totalProcessed).toBe(4);
    expect(updated?.totalAuthorized).toBe(1);
    expect(updated?.totalNotAuthorized).toBe(1);
    expect(updated?.totalAnnulled).toBe(1);
    expect(updated?.totalNotFound).toBe(1);
  });

  it('reintenta un error temporal y termina en error tras agotar los intentos', async () => {
    const batch = await createBatchWith([keyWith(1, 9)]); // el mock lanza http_503

    const deps = {
      repository: repo,
      provider: new MockSriProvider(),
      config,
      random: () => 0,
    };

    // El item se reencola con next_attempt_at en el futuro; se fuerza el paso del
    // tiempo reprogramandolo al pasado entre ciclos para no esperar el backoff real.
    let guard = 0;
    while (guard < 10) {
      const processed = await runOnce(deps);
      if (processed === 0) break;
      db.prepare(
        `UPDATE validation_items SET next_attempt_at = '2000-01-01T00:00:00.000Z'
         WHERE status = 'pending'`,
      ).run();
      guard += 1;
    }

    const items = await repo.listItems(org.organizationId, batch.id, {
      page: 1,
      pageSize: 10,
      sortBy: 'created_at',
      sortDir: 'asc',
    });
    const item = items.rows[0];
    expect(item?.status).toBe('service_error');
    expect(item?.errorCode).toBe('http_503');
    // maxRetries = 3: los intentos 1 y 2 reprograman; el 3ero agota el limite y
    // marca error definitivo. attempt_count refleja los 3 intentos realizados.
    expect(item?.attemptCount).toBe(3);

    const updated = await repo.getBatch(org.organizationId, batch.id);
    expect(updated?.status).toBe('completed_with_errors');
  });

  it('no reintenta un error definitivo', async () => {
    const definitiveProvider: SriProvider = {
      name: 'definitive',
      consultarComprobante: async () => {
        throw new SriServiceError('http_400', 'Solicitud invalida.', false);
      },
    };
    const batch = await createBatchWith([keyWith(1, 0)]);

    await runOnce({ repository: repo, provider: definitiveProvider, config });

    const items = await repo.listItems(org.organizationId, batch.id, {
      page: 1,
      pageSize: 10,
      sortBy: 'created_at',
      sortDir: 'asc',
    });
    expect(items.rows[0]?.status).toBe('service_error');
    expect(items.rows[0]?.attemptCount).toBe(1);
  });

  it('processItem devuelve false y reprograma cuando el fallo es temporal', async () => {
    let calls = 0;
    const flakyProvider: SriProvider = {
      name: 'flaky',
      consultarComprobante: async () => {
        calls += 1;
        throw new SriServiceError('timeout', 'Sin respuesta.', true);
      },
    };
    await createBatchWith([keyWith(1, 0)]);
    const [claimed] = await repo.claimPendingItems(1);

    const done = await processItem(claimed!, {
      repository: repo,
      provider: flakyProvider,
      config,
      random: () => 0,
    });

    expect(done).toBe(false);
    expect(calls).toBe(1);
  });

  it('respeta la concurrencia maxima configurada', async () => {
    let inFlight = 0;
    let peak = 0;
    const trackingProvider: SriProvider = {
      name: 'tracking',
      consultarComprobante: async (accessKey) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return {
          accessKey,
          status: 'authorized',
          sriStatusRaw: 'AUTORIZADO',
          documentType: '01',
          issuerRuc: '0991234567001',
          authorizationDate: null,
          authorizationNumber: accessKey,
          environment: 'PRUEBAS',
          messages: [],
          errorCode: null,
          errorMessage: null,
          raw: null,
        };
      },
    };

    await createBatchWith(Array.from({ length: 9 }, (_, i) => keyWith(i + 1, 0)));
    await runOnce({
      repository: repo,
      provider: trackingProvider,
      config: { ...config, concurrency: 2 },
    });

    expect(peak).toBeLessThanOrEqual(2);
  });
});
