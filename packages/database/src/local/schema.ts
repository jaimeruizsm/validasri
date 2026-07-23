/**
 * Esquema SQLite del modo local. Replica columna por columna el esquema
 * PostgreSQL de `supabase/migrations/0001_schema.sql` para que cambiar
 * DATA_PROVIDER no exija tocar la logica de la aplicacion.
 *
 * Diferencias inevitables: UUID -> TEXT, JSONB -> TEXT, TIMESTAMPTZ -> TEXT ISO-8601.
 */
export const LOCAL_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  ruc           TEXT,
  plan          TEXT NOT NULL DEFAULT 'basico'
                CHECK (plan IN ('basico','profesional','empresarial','corporativo')),
  monthly_limit INTEGER NOT NULL DEFAULT 2000 CHECK (monthly_limit >= 0),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_members (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner','admin','operator')),
  created_at      TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_org  ON organization_members(organization_id);

CREATE TABLE IF NOT EXISTS validation_batches (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by           TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  original_filename    TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','queued','processing','completed',
                                         'completed_with_errors','failed','cancelled')),
  total_lines          INTEGER NOT NULL DEFAULT 0 CHECK (total_lines >= 0),
  total_valid          INTEGER NOT NULL DEFAULT 0 CHECK (total_valid >= 0),
  total_invalid        INTEGER NOT NULL DEFAULT 0 CHECK (total_invalid >= 0),
  total_duplicates     INTEGER NOT NULL DEFAULT 0 CHECK (total_duplicates >= 0),
  total_processed      INTEGER NOT NULL DEFAULT 0 CHECK (total_processed >= 0),
  total_authorized     INTEGER NOT NULL DEFAULT 0 CHECK (total_authorized >= 0),
  total_annulled       INTEGER NOT NULL DEFAULT 0 CHECK (total_annulled >= 0),
  total_not_authorized INTEGER NOT NULL DEFAULT 0 CHECK (total_not_authorized >= 0),
  total_not_found      INTEGER NOT NULL DEFAULT 0 CHECK (total_not_found >= 0),
  total_errors         INTEGER NOT NULL DEFAULT 0 CHECK (total_errors >= 0),
  started_at           TEXT,
  completed_at         TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_org     ON validation_batches(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_status  ON validation_batches(status);

CREATE TABLE IF NOT EXISTS validation_items (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id             TEXT NOT NULL REFERENCES validation_batches(id) ON DELETE CASCADE,
  access_key           TEXT NOT NULL CHECK (length(access_key) = 49),
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','processing','authorized','not_authorized',
                                         'annulled','pending_annulment','not_found','invalid',
                                         'service_error')),
  sri_status_raw       TEXT,
  document_type        TEXT,
  issuer_ruc           TEXT,
  issuer_name          TEXT,
  trade_name           TEXT,
  total_amount         TEXT,
  authorization_date   TEXT,
  authorization_number TEXT,
  environment          TEXT,
  error_code           TEXT,
  error_message        TEXT,
  attempt_count        INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at      TEXT,
  locked_at            TEXT,
  processed_at         TEXT,
  raw_response         TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE (batch_id, access_key)
);
CREATE INDEX IF NOT EXISTS idx_items_batch  ON validation_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_items_org    ON validation_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON validation_items(status);
CREATE INDEX IF NOT EXISTS idx_items_queue  ON validation_items(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_items_locked ON validation_items(locked_at);
CREATE INDEX IF NOT EXISTS idx_items_ruc    ON validation_items(issuer_ruc);

CREATE TABLE IF NOT EXISTS usage_records (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id        TEXT REFERENCES validation_batches(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL CHECK (quantity >= 0),
  billing_period  TEXT NOT NULL CHECK (length(billing_period) = 7),
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_org_period ON usage_records(organization_id, billing_period);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;
