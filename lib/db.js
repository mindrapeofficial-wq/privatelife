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

CREATE TABLE IF NOT EXISTS private_life.world_clock (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  anchor_real_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anchor_game_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  speed DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (speed > 0 AND speed <= 1440),
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
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


CREATE TABLE IF NOT EXISTS private_life.whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  contact_key TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('out','in')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','system')),
  body TEXT NOT NULL DEFAULT '',
  media_data TEXT,
  character_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS private_life_whatsapp_user_contact_created_idx
  ON private_life.whatsapp_messages(user_id, contact_key, created_at DESC);

CREATE INDEX IF NOT EXISTS private_life_whatsapp_user_created_idx
  ON private_life.whatsapp_messages(user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS private_life.npc_pending_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  contact_key TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  body TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  deliver_after TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_npc_pending_user_due_idx
  ON private_life.npc_pending_messages(user_id, deliver_after)
  WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS private_life.facebook_friend_requests (
  id BIGSERIAL PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CHECK (requester_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS private_life_fb_friend_requests_pair_idx
  ON private_life.facebook_friend_requests (LEAST(requester_id,recipient_id), GREATEST(requester_id,recipient_id))
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS private_life.facebook_friendships (
  user_low_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  user_high_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_low_id,user_high_id),
  CHECK (user_low_id < user_high_id)
);

CREATE TABLE IF NOT EXISTS private_life.facebook_posts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS private_life_fb_posts_user_created_idx
  ON private_life.facebook_posts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS private_life.facebook_post_likes (
  post_id BIGINT NOT NULL REFERENCES private_life.facebook_posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS private_life.facebook_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES private_life.facebook_posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(body) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS private_life_fb_comments_post_created_idx
  ON private_life.facebook_comments(post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS private_life.facebook_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CHECK (sender_id <> recipient_id),
  CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS private_life_fb_messages_pair_created_idx
  ON private_life.facebook_messages(sender_id, recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS private_life.ai_characters (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 18 AND age <= 120),
  public_handle TEXT,
  avatar TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','contacts','public')),
  allow_player_interactions BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_ai_characters_owner_updated_idx
  ON private_life.ai_characters(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS private_life_ai_characters_public_idx
  ON private_life.ai_characters(visibility, is_active)
  WHERE visibility <> 'private';

CREATE TABLE IF NOT EXISTS private_life.ai_character_player_state (
  character_id BIGINT NOT NULL REFERENCES private_life.ai_characters(id) ON DELETE CASCADE,
  player_user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  relationship_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_interaction_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(character_id, player_user_id)
);

CREATE INDEX IF NOT EXISTS private_life_ai_character_player_state_player_idx
  ON private_life.ai_character_player_state(player_user_id, updated_at DESC);

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
