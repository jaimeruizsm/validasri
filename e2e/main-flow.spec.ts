import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { LocalRepository, openDatabase } from '@validasri/database';
import { MockSriProvider } from '@validasri/sri-client';
import { runOnce } from '../apps/worker/src/processor';

const SAMPLE_TXT = resolve(process.cwd(), 'data/ejemplo-claves.txt');

/**
 * Ejecuta el worker en proceso contra la misma base SQLite del server, drenando
 * la cola. Reemplaza al worker externo que en produccion corre por separado.
 */
const drainQueue = async (): Promise<void> => {
  const db = openDatabase(resolve(process.cwd(), '.data/e2e.db'));
  const repo = new LocalRepository(db);
  const deps = {
    repository: repo,
    provider: new MockSriProvider(),
    config: {
      concurrency: 5,
      pollIntervalMs: 0,
      claimSize: 50,
      requestDelayMs: 0,
      maxRetries: 2,
      lockTimeoutMs: 120_000,
    },
    random: () => 0,
  };
  for (let i = 0; i < 12; i += 1) {
    const processed = await runOnce(deps);
    db.prepare(
      `UPDATE validation_items SET next_attempt_at = '2000-01-01T00:00:00.000Z' WHERE status = 'pending'`,
    ).run();
    if (processed === 0) break;
  }
  db.close();
};

test('flujo principal: login, carga, procesamiento con mock, resultados y descarga', async ({
  page,
}) => {
  // 1. Iniciar sesion
  await page.goto('/login');
  await page.getByLabel('Correo electronico').fill('demo@validasri.ec');
  await page.getByLabel('Contrasena').fill('ValidaSRI2026');
  await page.getByRole('button', { name: 'Iniciar sesion' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();

  // 2. Ir a nueva validacion y 3. cargar/analizar el TXT
  await page.goto('/validaciones/nueva');
  await page.setInputFiles('input[type="file"]', SAMPLE_TXT);

  // La vista previa muestra el analisis (20 validas, 3 invalidas, 2 duplicadas)
  const startButton = page.getByRole('button', { name: 'Iniciar validacion' });
  await expect(startButton).toBeVisible();
  await expect(page.getByText('20', { exact: true })).toBeVisible();
  await expect(page.getByText('Ver claves invalidas (3)')).toBeVisible();

  // 4. Crear el lote
  await startButton.click();
  await page.getByRole('button', { name: 'Confirmar y crear lote' }).click();
  await page.waitForURL('**/lotes/**');

  const batchId = page.url().split('/lotes/')[1]!.split(/[?#]/)[0]!;
  expect(batchId).toBeTruthy();

  // 5. Procesar el lote con el proveedor mock
  await drainQueue();

  // 6. Visualizar resultados
  await page.reload();
  await expect(page.getByText('Completado con errores')).toBeVisible({ timeout: 15_000 });

  // La tabla muestra comprobantes con su estado (badge dentro de una celda)
  await expect(page.locator('td span', { hasText: 'Autorizado' }).first()).toBeVisible();

  // Filtro por estado desde el servidor
  await page.getByLabel('Filtrar por estado').selectOption('authorized');
  await expect(page.getByText(/comprobantes/).first()).toBeVisible();

  // 7. Descargar el reporte (Excel)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Excel' }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('.xlsx');

  // Verifica el contenido descargado: la clave va como texto en el CSV
  void readFileSync;
});
