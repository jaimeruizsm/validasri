import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, type SessionUser } from '@validasri/shared';
import type { AuthProvider, AuthSession } from '../auth';
import { getAnonClient, getServiceClient } from './client';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const invalidCredentials = () =>
  new AppError('invalid_credentials', 'El correo o la contrasena son incorrectos.', 401);

/**
 * Autenticacion sobre Supabase Auth con sesiones opacas propias.
 *
 * Las credenciales se validan con Supabase (`signInWithPassword`), pero la sesion
 * de la aplicacion es un token opaco guardado en `app_sessions` (12 h), igual que
 * en el driver local. Asi se reutiliza tal cual el modelo de sesion del servidor
 * web, sin depender del refresco de los JWT de Supabase.
 */
export class SupabaseAuthProvider implements AuthProvider {
  private readonly service: SupabaseClient;
  private readonly anon: SupabaseClient;

  constructor(service: SupabaseClient = getServiceClient(), anon: SupabaseClient = getAnonClient()) {
    this.service = service;
    this.anon = anon;
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.anon.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.user.email) {
      throw invalidCredentials();
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { error: insertError } = await this.service.from('app_sessions').insert({
      token,
      user_id: data.user.id,
      email: data.user.email,
      expires_at: expiresAt,
    });
    if (insertError) {
      throw new AppError('session_error', 'No se pudo iniciar la sesion. Intenta nuevamente.', 500);
    }

    return {
      token,
      expiresAt,
      user: { id: data.user.id, email: data.user.email },
    };
  }

  async getUserByToken(token: string): Promise<SessionUser | null> {
    const { data, error } = await this.service
      .from('app_sessions')
      .select('user_id, email, expires_at')
      .eq('token', token)
      .limit(1);
    if (error) return null;

    const row = data[0] as { user_id: string; email: string; expires_at: string } | undefined;
    if (!row) return null;

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await this.signOut(token);
      return null;
    }
    return { id: row.user_id, email: row.email };
  }

  async signOut(token: string): Promise<void> {
    await this.service.from('app_sessions').delete().eq('token', token);
  }

  async requestPasswordRecovery(email: string): Promise<void> {
    // Supabase envia el correo real; la respuesta al usuario es siempre uniforme
    // (en la capa web) para no revelar si la cuenta existe.
    const redirectTo = process.env['NEXT_PUBLIC_APP_URL']
      ? `${process.env['NEXT_PUBLIC_APP_URL']}/login`
      : undefined;
    await this.anon.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );
  }
}
