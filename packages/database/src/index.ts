import { getDataProvider } from './env';
import type { AuthProvider } from './auth';
import type { ValidaSriRepository } from './repository';
import { LocalRepository } from './local/repository';
import { LocalAuthProvider } from './local/auth';
import { SupabaseRepository } from './supabase/repository';
import { SupabaseAuthProvider } from './supabase/auth';

export * from './auth';
export * from './env';
export * from './repository';
export { LocalRepository } from './local/repository';
export { LocalAuthProvider, hashPassword, verifyPassword } from './local/auth';
export { closeDatabase, getDatabase, openDatabase } from './local/connection';
export { SupabaseRepository } from './supabase/repository';
export { SupabaseAuthProvider } from './supabase/auth';
export { getServiceClient, getAnonClient } from './supabase/client';

/**
 * Punto unico de acceso a datos. Toda la aplicacion (web y worker) obtiene el
 * repositorio desde aqui, de modo que cambiar de SQLite a Supabase sea una
 * variable de entorno y no una reescritura.
 */
export const getRepository = (): ValidaSriRepository => {
  const provider = getDataProvider();
  return provider === 'supabase' ? new SupabaseRepository() : new LocalRepository();
};

export const getAuthProvider = (): AuthProvider => {
  const provider = getDataProvider();
  return provider === 'supabase' ? new SupabaseAuthProvider() : new LocalAuthProvider();
};
