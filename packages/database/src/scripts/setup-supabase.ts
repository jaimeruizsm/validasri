/**
 * Crea el primer usuario, organizacion y membresia en Supabase.
 *
 *   npm run db:setup:supabase
 *
 * Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * y SUPABASE_SERVICE_ROLE_KEY. Las migraciones deben estar aplicadas.
 *
 * Variables opcionales: SEED_EMAIL, SEED_PASSWORD, SEED_ORG_NAME, SEED_ORG_RUC,
 * SEED_ORG_PLAN.
 */
import { PLAN_DEFAULT_MONTHLY_LIMIT, isPlan } from '@validasri/shared';
import { loadRootEnvFile } from '../env';
import { getServiceClient } from '../supabase/client';

// Carga el .env de la raiz para tener las credenciales de Supabase.
loadRootEnvFile();

const email = process.env['SEED_EMAIL'] ?? 'demo@validasri.ec';
const password = process.env['SEED_PASSWORD'] ?? 'ValidaSRI2026';
const orgName = process.env['SEED_ORG_NAME'] ?? 'Empresa Demostracion';
const orgRuc = process.env['SEED_ORG_RUC'] ?? '0991234567001';
const planInput = process.env['SEED_ORG_PLAN'] ?? 'basico';
const plan = isPlan(planInput) ? planInput : 'profesional';

const fail = (message: string): never => {
  console.error(`Error: ${message}`);
  process.exit(1);
};

const main = async (): Promise<void> => {
  const db = getServiceClient();

  // 1. Usuario en Supabase Auth (idempotente: reutiliza si ya existe).
  let userId: string | undefined;
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error) {
    // Si ya existe, lo buscamos en la lista de usuarios.
    const list = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) fail(list.error.message);
    const existing = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) fail(`No se pudo crear ni encontrar el usuario ${email}: ${created.error.message}`);
    userId = existing!.id;
    // Actualiza la contrasena por si cambio.
    await db.auth.admin.updateUserById(userId, { password });
  } else {
    userId = created.data.user.id;
  }

  // 2. Organizacion (idempotente por nombre).
  const existingOrg = await db.from('organizations').select('id').eq('name', orgName).limit(1);
  if (existingOrg.error) fail(existingOrg.error.message);

  let organizationId: string;
  const monthlyLimit = PLAN_DEFAULT_MONTHLY_LIMIT[plan];
  const existingOrgRow = (existingOrg.data ?? [])[0] as { id: string } | undefined;
  if (existingOrgRow) {
    organizationId = String(existingOrgRow.id);
    await db
      .from('organizations')
      .update({ plan, monthly_limit: monthlyLimit, ruc: orgRuc })
      .eq('id', organizationId);
  } else {
    const inserted = await db
      .from('organizations')
      .insert({ name: orgName, ruc: orgRuc, plan, monthly_limit: monthlyLimit })
      .select('id');
    if (inserted.error) fail(inserted.error.message);
    const insertedRow = (inserted.data ?? [])[0] as { id: string } | undefined;
    if (!insertedRow) fail('No se pudo crear la organizacion.');
    organizationId = String(insertedRow!.id);
  }

  // 3. Membresia owner (idempotente).
  const upserted = await db
    .from('organization_members')
    .upsert(
      { organization_id: organizationId, user_id: userId, role: 'owner' },
      { onConflict: 'organization_id,user_id' },
    );
  if (upserted.error) fail(upserted.error.message);

  console.log('Supabase listo.');
  console.log(`  organizacion: ${orgName} (${plan}, limite ${monthlyLimit}/mes)`);
  console.log(`  usuario:      ${email}`);
  console.log(`  contrasena:   ${password}`);
  console.log('Cambia la contrasena antes de exponer la instalacion a terceros.');
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
