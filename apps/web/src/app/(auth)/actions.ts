'use server';

import { headers } from 'next/headers';
import { getAuthProvider } from '@validasri/database';
import { toPublicError } from '@validasri/shared';
import { loginSchema, passwordRecoverySchema } from '@validasri/validation';
import { clearSessionCookie, getSessionToken, setSessionCookie } from '@/server/session';
import { enforceRateLimit } from '@/server/rate-limit';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const clientKey = async (prefix: string): Promise<string> => {
  const store = await headers();
  const ip =
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ?? store.get('x-real-ip') ?? 'local';
  return `${prefix}:${ip}`;
};

export const loginAction = async (_prev: ActionResult, formData: FormData): Promise<ActionResult> => {
  try {
    enforceRateLimit(await clientKey('login'), { limit: 10, windowMs: 60_000 });

    const parsed = loginSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos invalidos.' };
    }

    const auth = getAuthProvider();
    const session = await auth.signIn(parsed.data.email, parsed.data.password);
    await setSessionCookie(session.token);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toPublicError(error).message };
  }
};

export const recoveryAction = async (
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> => {
  try {
    enforceRateLimit(await clientKey('recovery'), { limit: 5, windowMs: 60_000 });
    const parsed = passwordRecoverySchema.safeParse({ email: formData.get('email') });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? 'Correo invalido.' };
    }
    const auth = getAuthProvider();
    await auth.requestPasswordRecovery(parsed.data.email);
    // Respuesta uniforme: no se revela si el correo existe.
    return {
      ok: true,
      message: 'Si el correo esta registrado, recibiras instrucciones para restablecer tu contrasena.',
    };
  } catch (error) {
    return { ok: false, message: toPublicError(error).message };
  }
};

export const logoutAction = async (): Promise<void> => {
  const token = await getSessionToken();
  if (token) {
    const auth = getAuthProvider();
    await auth.signOut(token);
  }
  await clearSessionCookie();
};
