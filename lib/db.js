import pg from 'pg';

const { Pool } = pg;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!globalThis.__privateLifePool) {
    globalThis.__privateLifePool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return globalThis.__privateLifePool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

const schemaSql = `
CREATE SCHEMA IF NOT EXISTS private_life;

CREATE TABLE IF NOT EXISTS private_life.users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS private_life.sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS private_life_sessions_user_id_idx
  ON private_life.sessions(user_id);

CREATE INDEX IF NOT EXISTS private_life_sessions_expires_at_idx
  ON private_life.sessions(expires_at);

CREATE TABLE IF NOT EXISTS private_life.game_saves (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  save_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_life.phone_state (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_life.phone_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_label TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_phone_activity_user_created_idx
  ON private_life.phone_activity(user_id, created_at DESC);
`;

export async function ensureSchema() {
  if (!globalThis.__privateLifeSchemaPromise) {
    globalThis.__privateLifeSchemaPromise = query(schemaSql).catch((error) => {
      globalThis.__privateLifeSchemaPromise = null;
      throw error;
    });
  }
  return globalThis.__privateLifeSchemaPromise;
}
