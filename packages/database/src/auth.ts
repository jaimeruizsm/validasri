import type { SessionUser } from '@validasri/shared';

export interface AuthSession {
  token: string;
  user: SessionUser;
  expiresAt: string;
}

/**
 * Contrato de autenticacion. En modo `local` se resuelve con usuarios en SQLite
 * y una cookie de sesion firmada; en modo `supabase` lo implementa Supabase Auth.
 */
export interface AuthProvider {
  signIn(email: string, password: string): Promise<AuthSession>;
  getUserByToken(token: string): Promise<SessionUser | null>;
  signOut(token: string): Promise<void>;
  /** Devuelve siempre exito para no revelar si el correo existe. */
  requestPasswordRecovery(email: string): Promise<void>;
}
