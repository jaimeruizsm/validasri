import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getLocalDbPath } from '../env';
import { LOCAL_SCHEMA_SQL } from './schema';

/**
 * `node:sqlite` se carga de forma perezosa (no como import de nivel superior)
 * para que importar este paquete en modo `DATA_PROVIDER=supabase` no toque el
 * modulo. Asi, un runtime sin `node:sqlite` (p.ej. Node < 22 en Vercel) no falla
 * mientras no se use realmente el driver local.
 */
type DatabaseSyncCtor = new (path: string) => DatabaseSync;

let cachedCtor: DatabaseSyncCtor | undefined;

const loadDatabaseSync = (): DatabaseSyncCtor => {
  if (!cachedCtor) {
    const require = createRequire(import.meta.url);
    cachedCtor = (require('node:sqlite') as { DatabaseSync: DatabaseSyncCtor }).DatabaseSync;
  }
  return cachedCtor;
};

/**
 * En desarrollo Next.js recarga los modulos en cada cambio; sin este singleton
 * se abririan decenas de conexiones al mismo archivo SQLite.
 */
const globalRef = globalThis as typeof globalThis & {
  __validasriDb?: DatabaseSync | undefined;
};

/**
 * Localiza la raiz del monorepo (el package.json que declara `workspaces`).
 * Las rutas relativas de LOCAL_DB_PATH se anclan alli para que la web, el worker
 * y los scripts usen siempre el mismo archivo, sin importar el cwd de cada uno.
 */
export const findRepoRoot = (startDir: string = process.cwd()): string => {
  let current = resolve(startDir);
  for (let depth = 0; depth < 10; depth += 1) {
    const manifest = join(current, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (parsed.workspaces !== undefined) return current;
      } catch {
        // package.json ilegible: se sigue subiendo.
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(startDir);
};

export const resolveDbPath = (): string => {
  const configured = getLocalDbPath();
  if (configured === ':memory:') return configured;
  return isAbsolute(configured) ? configured : resolve(findRepoRoot(), configured);
};

export const openDatabase = (dbPath?: string): DatabaseSync => {
  const target = dbPath ?? resolveDbPath();
  if (target !== ':memory:') {
    mkdirSync(dirname(target), { recursive: true });
  }
  const DatabaseSyncCtor = loadDatabaseSync();
  const db = new DatabaseSyncCtor(target);
  db.exec(LOCAL_SCHEMA_SQL);
  return db;
};

export const getDatabase = (): DatabaseSync => {
  if (!globalRef.__validasriDb) {
    globalRef.__validasriDb = openDatabase();
  }
  return globalRef.__validasriDb;
};

export const closeDatabase = (): void => {
  if (globalRef.__validasriDb) {
    globalRef.__validasriDb.close();
    globalRef.__validasriDb = undefined;
  }
};
