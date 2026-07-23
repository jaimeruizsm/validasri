/**
 * Crea la base SQLite local y siembra la primera organizacion y su usuario.
 *
 *   npm run db:setup
 *
 * Variables opcionales:
 *   SEED_EMAIL, SEED_PASSWORD, SEED_ORG_NAME, SEED_ORG_RUC, SEED_ORG_PLAN
 */
import { randomUUID } from 'node:crypto';
import { PLAN_DEFAULT_MONTHLY_LIMIT, isPlan, nowIso } from '@validasri/shared';
import { openDatabase, resolveDbPath } from '../local/connection';
import { LocalAuthProvider } from '../local/auth';

const email = process.env['SEED_EMAIL'] ?? 'demo@validasri.ec';
const password = process.env['SEED_PASSWORD'] ?? 'ValidaSRI2026';
const orgName = process.env['SEED_ORG_NAME'] ?? 'Empresa Demostracion';
const orgRuc = process.env['SEED_ORG_RUC'] ?? '0991234567001';
const planInput = process.env['SEED_ORG_PLAN'] ?? 'basico';

const plan = isPlan(planInput) ? planInput : 'profesional';
const dbPath = resolveDbPath();
const db = openDatabase(dbPath);
const auth = new LocalAuthProvider(db);

const user = auth.upsertUser(email, password);

const existingOrg = db
  .prepare(`SELECT id FROM organizations WHERE name = ?`)
  .get(orgName) as { id?: string } | undefined;

const timestamp = nowIso();
let organizationId: string;

if (existingOrg?.id) {
  organizationId = existingOrg.id;
  db.prepare(`UPDATE organizations SET plan = ?, monthly_limit = ?, ruc = ?, updated_at = ? WHERE id = ?`).run(
    plan,
    PLAN_DEFAULT_MONTHLY_LIMIT[plan],
    orgRuc,
    timestamp,
    organizationId,
  );
} else {
  organizationId = randomUUID();
  db.prepare(
    `INSERT INTO organizations (id, name, ruc, plan, monthly_limit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(organizationId, orgName, orgRuc, plan, PLAN_DEFAULT_MONTHLY_LIMIT[plan], timestamp, timestamp);
}

const existingMember = db
  .prepare(`SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?`)
  .get(organizationId, user.id) as { id?: string } | undefined;

if (!existingMember?.id) {
  db.prepare(
    `INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
     VALUES (?, ?, ?, 'owner', ?)`,
  ).run(randomUUID(), organizationId, user.id, timestamp);
}

db.close();

console.log('Base de datos local lista.');
console.log(`  archivo:      ${dbPath}`);
console.log(`  organizacion: ${orgName} (${plan}, limite ${PLAN_DEFAULT_MONTHLY_LIMIT[plan]}/mes)`);
console.log(`  usuario:      ${email}`);
console.log(`  contrasena:   ${password}`);
console.log('Cambia la contrasena antes de exponer la instalacion a terceros.');
