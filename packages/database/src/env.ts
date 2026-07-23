/**
 * Lectura de variables de entorno de la capa de datos. Modulo exclusivo de
 * servidor: nunca debe importarse desde un componente cliente.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type DataProvider = 'local' | 'supabase';

/**
 * Carga el archivo .env de la raiz del monorepo en process.env, si existe y si
 * el runtime lo soporta (Node >= 20.12 via process.loadEnvFile). Es idempotente
 * y silencioso: la web (Next.js) ya carga su propio .env, por lo que esto sirve
 * sobre todo al worker y a los scripts. Las variables ya presentes no se pisan.
 */
export const loadRootEnvFile = (startDir: string = process.cwd()): void => {
  const loader = (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile;
  if (typeof loader !== 'function') return;

  // Sube hasta encontrar un package.json con "workspaces" (raiz del monorepo).
  let current = resolve(startDir);
  for (let depth = 0; depth < 10; depth += 1) {
    const manifest = join(current, 'package.json');
    const envPath = join(current, '.env');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (parsed.workspaces !== undefined) {
          if (existsSync(envPath)) {
            try {
              loader(envPath);
            } catch {
              // .env ilegible: se ignora, las variables del entorno siguen valiendo.
            }
          }
          return;
        }
      } catch {
        // package.json ilegible: se sigue subiendo.
      }
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
};

const readString = (key: string, fallback?: string): string => {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Falta la variable de entorno requerida: ${key}`);
  }
  return value.trim();
};

const readInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`La variable de entorno ${key} debe ser un entero positivo.`);
  }
  return parsed;
};

export const getDataProvider = (): DataProvider => {
  const value = readString('DATA_PROVIDER', 'local');
  if (value !== 'local' && value !== 'supabase') {
    throw new Error(`DATA_PROVIDER debe ser "local" o "supabase" (recibido: "${value}").`);
  }
  return value;
};

export const getLocalDbPath = (): string => readString('LOCAL_DB_PATH', '.data/validasri.db');

export const getSupabaseConfig = () => ({
  url: readString('NEXT_PUBLIC_SUPABASE_URL'),
  anonKey: readString('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  serviceRoleKey: readString('SUPABASE_SERVICE_ROLE_KEY'),
});

export const getWorkerLockTimeoutMs = (): number => readInt('WORKER_LOCK_TIMEOUT_MS', 120_000);

export const getUploadLimits = () => ({
  maxSizeBytes: readInt('MAX_TXT_SIZE_MB', 5) * 1024 * 1024,
  maxKeys: readInt('MAX_KEYS_PER_BATCH', 10_000),
});
