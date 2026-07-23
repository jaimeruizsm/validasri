import 'server-only';
import { cookies } from 'next/headers';
import { getAuthProvider, getRepository } from '@validasri/database';
import { unauthorized, type SessionContext } from '@validasri/shared';
import { SESSION_COOKIE } from './session-constants';

export { SESSION_COOKIE };

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 12 * 60 * 60,
};

export const setSessionCookie = async (token: string): Promise<void> => {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions);
};

export const clearSessionCookie = async (): Promise<void> => {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
};

export const getSessionToken = async (): Promise<string | null> => {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
};

/**
 * Resuelve el contexto de sesion (usuario + organizacion + rol) o null si no hay
 * sesion valida. Es el punto unico desde el que las paginas y rutas obtienen la
 * identidad; nunca se confia en datos del cliente.
 */
export const getSessionContext = async (): Promise<SessionContext | null> => {
  const token = await getSessionToken();
  if (!token) return null;

  const auth = getAuthProvider();
  const user = await auth.getUserByToken(token);
  if (!user) return null;

  const repository = getRepository();
  const membership = await repository.getMembership(user.id);
  if (!membership) return null;

  return { user, organization: membership.organization, role: membership.role };
};

/** Igual que `getSessionContext`, pero lanza si no hay sesion. Para rutas API. */
export const requireSessionContext = async (): Promise<SessionContext> => {
  const context = await getSessionContext();
  if (!context) throw unauthorized();
  return context;
};
