import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../env';

/**
 * Clientes de Supabase. Modulo exclusivo de servidor: la service_role jamas debe
 * llegar al navegador.
 *
 * - `service`: usa la service_role. Omite RLS por diseno de PostgREST; el
 *   aislamiento entre organizaciones se garantiza filtrando por organization_id
 *   en cada consulta del repositorio (segunda barrera). Lo usan el servidor y el
 *   worker para toda operacion de datos.
 * - `anon`: usa la anon key. Solo para validar credenciales y disparar el correo
 *   de recuperacion de contrasena (operaciones de auth que no tocan tablas).
 */
const globalRef = globalThis as typeof globalThis & {
  __validasriSupabaseService?: SupabaseClient | undefined;
  __validasriSupabaseAnon?: SupabaseClient | undefined;
};

const noPersist = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const;

export const getServiceClient = (): SupabaseClient => {
  if (!globalRef.__validasriSupabaseService) {
    const { url, serviceRoleKey } = getSupabaseConfig();
    globalRef.__validasriSupabaseService = createClient(url, serviceRoleKey, noPersist);
  }
  return globalRef.__validasriSupabaseService;
};

export const getAnonClient = (): SupabaseClient => {
  if (!globalRef.__validasriSupabaseAnon) {
    const { url, anonKey } = getSupabaseConfig();
    globalRef.__validasriSupabaseAnon = createClient(url, anonKey, noPersist);
  }
  return globalRef.__validasriSupabaseAnon;
};
