import { getRepository, loadRootEnvFile } from '@validasri/database';

// Carga el .env de la raiz antes de leer cualquier configuracion.
loadRootEnvFile();

import { createSriProvider, getSriConfig } from '@validasri/sri-client';
import { getWorkerConfig } from './config';
import { logger } from './logger';
import { runOnce } from './processor';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const main = async (): Promise<void> => {
  const config = getWorkerConfig();
  const sriConfig = getSriConfig();
  const repository = getRepository();
  const provider = createSriProvider();
  const runContinuously = !process.argv.includes('--once');

  logger.info('Worker de ValidaSRI iniciado', {
    provider: provider.name,
    environment: sriConfig.environment,
    concurrency: config.concurrency,
    claimSize: config.claimSize,
    pollIntervalMs: config.pollIntervalMs,
    mode: runContinuously ? 'continuo' : 'una vez',
  });

  let running = true;
  const stop = (signal: string) => {
    logger.info('Senal recibida, deteniendo worker', { signal });
    running = false;
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  const deps = { repository, provider, config };

  do {
    try {
      const processed = await runOnce(deps);
      if (processed === 0 && runContinuously) {
        await sleep(config.pollIntervalMs);
      } else if (processed > 0) {
        logger.info('Ciclo completado', { processed });
      }
    } catch (error) {
      logger.error('Error en el ciclo del worker', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (runContinuously) await sleep(config.pollIntervalMs);
    }
  } while (running && runContinuously);

  await repository.close();
  logger.info('Worker detenido');
};

main().catch((error) => {
  logger.error('Fallo fatal del worker', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
