import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { AppError, nowIso, type SessionUser } from '@validasri/shared';
import type { AuthProvider, AuthSession } from '../auth';
import { getDatabase } from './connection';
import { asText, type SqlRow } from './mappers';

const SCRYPT_KEY_LENGTH = 64;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Formato del hash almacenado: `scrypt$<saltHex>$<hashHex>`. */
export const hashPassword = (password: string): string => {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const invalidCredentials = () =>
  new AppError('invalid_credentials', 'El correo o la contrasena son incorrectos.', 401);

export class LocalAuthProvider implements AuthProvider {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync = getDatabase()) {
    this.db = db;
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const row = this.db
      .prepare(`SELECT id, email, password_hash FROM app_users WHERE lower(email) = lower(?)`)
      .get(email) as unknown as SqlRow | undefined;

    // Se ejecuta el hash incluso sin usuario para no filtrar existencia por tiempo.
    const storedHash = row ? asText(row['password_hash']) : hashPassword('usuario-inexistente');
    if (!verifyPassword(password, storedHash) || !row) {
      throw invalidCredentials();
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    this.db
      .prepare(
        `INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(token, asText(row['id']), expiresAt, nowIso());

    return {
      token,
      expiresAt,
      user: { id: asText(row['id']), email: asText(row['email']) },
    };
  }

  async getUserByToken(token: string): Promise<SessionUser | null> {
    const row = this.db
      .prepare(
        `SELECT u.id, u.email, s.expires_at
         FROM sessions s JOIN app_users u ON u.id = s.user_id
         WHERE s.token = ?`,
      )
      .get(token) as unknown as SqlRow | undefined;
    if (!row) return null;

    if (new Date(asText(row['expires_at'])).getTime() <= Date.now()) {
      await this.signOut(token);
      return null;
    }
    return { id: asText(row['id']), email: asText(row['email']) };
  }

  async signOut(token: string): Promise<void> {
    this.db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  }

  async requestPasswordRecovery(_email: string): Promise<void> {
    // En modo local no hay servicio de correo. La respuesta es siempre exitosa
    // para no revelar si la cuenta existe; con Supabase se envia el correo real.
    void _email;
  }

  /** Utilidad del script de instalacion: crea o actualiza un usuario local. */
  upsertUser(email: string, password: string): SessionUser {
    const existing = this.db
      .prepare(`SELECT id FROM app_users WHERE lower(email) = lower(?)`)
      .get(email) as unknown as SqlRow | undefined;
    const timestamp = nowIso();

    if (existing) {
      const id = asText(existing['id']);
      this.db
        .prepare(`UPDATE app_users SET password_hash = ?, updated_at = ? WHERE id = ?`)
        .run(hashPassword(password), timestamp, id);
      return { id, email };
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO app_users (id, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, email, hashPassword(password), timestamp, timestamp);
    return { id, email };
  }
}
