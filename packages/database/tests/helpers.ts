import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '@validasri/shared';
import { openDatabase } from '../src/local/connection';
import { LocalAuthProvider } from '../src/local/auth';
import { LocalRepository } from '../src/local/repository';

export interface TestOrg {
  organizationId: string;
  userId: string;
  email: string;
}

export const createTestDb = (): DatabaseSync => openDatabase(':memory:');

export const seedOrganization = (
  db: DatabaseSync,
  options: { name: string; email: string; monthlyLimit?: number },
): TestOrg => {
  const auth = new LocalAuthProvider(db);
  const user = auth.upsertUser(options.email, 'ValidaSRI2026');
  const organizationId = randomUUID();
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO organizations (id, name, ruc, plan, monthly_limit, created_at, updated_at)
     VALUES (?, ?, NULL, 'profesional', ?, ?, ?)`,
  ).run(organizationId, options.name, options.monthlyLimit ?? 10_000, timestamp, timestamp);

  db.prepare(
    `INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
     VALUES (?, ?, ?, 'owner', ?)`,
  ).run(randomUUID(), organizationId, user.id, timestamp);

  return { organizationId, userId: user.id, email: options.email };
};

export const makeRepository = (db: DatabaseSync): LocalRepository => new LocalRepository(db);

/** Genera claves ficticias validas de 49 digitos, unicas y deterministas. */
export const fakeAccessKey = (sequence: number): string => {
  // fecha(8) + tipo(2) + ruc(13) + ambiente(1) + serie-secuencial(15) + codigo(8) + emision(1) + verificador(1)
  const key =
    `22072026` +
    `01` +
    `0991234567001` +
    `1` +
    String(sequence).padStart(15, '0') +
    `12345678` +
    `1` +
    String(sequence % 10);
  if (key.length !== 49) throw new Error(`clave de prueba invalida: ${key.length} caracteres`);
  return key;
};
