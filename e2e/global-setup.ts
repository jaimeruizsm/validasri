import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { nowIso, PLAN_DEFAULT_MONTHLY_LIMIT } from '@validasri/shared';
import { openDatabase, LocalAuthProvider } from '@validasri/database';

/** Prepara una base SQLite limpia con el usuario y la organizacion demo. */
export default async function globalSetup(): Promise<void> {
  const dbPath = resolve(process.cwd(), '.data/e2e.db');
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }

  const db = openDatabase(dbPath);
  const auth = new LocalAuthProvider(db);
  const user = auth.upsertUser('demo@validasri.ec', 'ValidaSRI2026');

  const orgId = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO organizations (id, name, ruc, plan, monthly_limit, created_at, updated_at)
     VALUES (?, 'Empresa Demostracion', '0991234567001', 'profesional', ?, ?, ?)`,
  ).run(orgId, PLAN_DEFAULT_MONTHLY_LIMIT.profesional, ts, ts);
  db.prepare(
    `INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
     VALUES (?, ?, ?, 'owner', ?)`,
  ).run(randomUUID(), orgId, user.id, ts);
  db.close();
}
