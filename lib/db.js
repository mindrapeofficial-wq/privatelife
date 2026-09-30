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

CREATE TABLE IF NOT EXISTS private_life.player_context (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  location_key TEXT NOT NULL DEFAULT 'home',
  location_label TEXT NOT NULL DEFAULT 'Casa',
  activity_key TEXT NOT NULL DEFAULT 'free',
  activity_label TEXT NOT NULL DEFAULT 'Disponible',
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('offline','busy','limited','available')),
  social_exposure INTEGER NOT NULL DEFAULT 10 CHECK (social_exposure BETWEEN 0 AND 100),
  privacy INTEGER NOT NULL DEFAULT 92 CHECK (privacy BETWEEN 0 AND 100),
  started_game_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_until_game_at TIMESTAMPTZ,
  revision BIGINT NOT NULL DEFAULT 1,
  last_evaluated_game_at TIMESTAMPTZ,
  next_evaluation_game_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_life.life_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  context_revision BIGINT NOT NULL,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  app TEXT NOT NULL DEFAULT 'PRIVATE LIFE',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_game_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS private_life_life_events_due_idx
  ON private_life.life_events(user_id, scheduled_game_at)
  WHERE status='pending';

CREATE INDEX IF NOT EXISTS private_life_life_events_cooldown_idx
  ON private_life.life_events(user_id,event_key,scheduled_game_at DESC);

CREATE TABLE IF NOT EXISTS private_life.life_runtime (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  last_tick_game_at TIMESTAMPTZ,
  last_tick_real_at TIMESTAMPTZ,
  tick_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_life.npc_autonomy_state (
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  next_action_game_at TIMESTAMPTZ NOT NULL,
  last_action_game_at TIMESTAMPTZ,
  daily_key TEXT,
  daily_count INTEGER NOT NULL DEFAULT 0,
  state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,character_key)
);

CREATE INDEX IF NOT EXISTS private_life_npc_autonomy_due_idx
  ON private_life.npc_autonomy_state(user_id,next_action_game_at);

CREATE TABLE IF NOT EXISTS private_life.npc_autonomy_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  character_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  game_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_npc_autonomy_events_user_game_idx
  ON private_life.npc_autonomy_events(user_id,game_at DESC);

CREATE TABLE IF NOT EXISTS private_life.player_location (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','device')),
  display_label TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m INTEGER,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_life.push_devices (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_push_devices_user_enabled_idx
  ON private_life.push_devices(user_id, enabled, updated_at DESC);

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

CREATE TABLE IF NOT EXISTS private_life.npc_memories (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('fact','promise','preference','conflict','emotion','event','relationship','date','other')),
  summary TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  emotional_valence INTEGER NOT NULL DEFAULT 0 CHECK (emotional_valence BETWEEN -100 AND 100),
  source TEXT NOT NULL DEFAULT 'conversation',
  source_ref TEXT,
  occurred_game_at TIMESTAMPTZ NOT NULL,
  last_recalled_game_at TIMESTAMPTZ,
  recall_count INTEGER NOT NULL DEFAULT 0,
  expires_game_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','forgotten')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_npc_memories_lookup_idx
  ON private_life.npc_memories(user_id,character_key,status,importance DESC,occurred_game_at DESC);

CREATE TABLE IF NOT EXISTS private_life.npc_intentions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  intention_type TEXT NOT NULL DEFAULT 'follow_up',
  summary TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','fulfilled','abandoned')),
  not_before_game_at TIMESTAMPTZ,
  due_game_at TIMESTAMPTZ,
  trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_memory_id BIGINT REFERENCES private_life.npc_memories(id) ON DELETE SET NULL,
  created_game_at TIMESTAMPTZ NOT NULL,
  activated_game_at TIMESTAMPTZ,
  resolved_game_at TIMESTAMPTZ,
  resolution_note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_npc_intentions_due_idx
  ON private_life.npc_intentions(user_id,character_key,status,priority DESC,COALESCE(due_game_at,not_before_game_at,created_game_at));

CREATE TABLE IF NOT EXISTS private_life.npc_social_edges (
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  character_a_key TEXT NOT NULL,
  character_b_key TEXT NOT NULL,
  relation_label TEXT NOT NULL DEFAULT 'conocidos',
  familiarity INTEGER NOT NULL DEFAULT 10 CHECK (familiarity BETWEEN 0 AND 100),
  affinity INTEGER NOT NULL DEFAULT 50 CHECK (affinity BETWEEN 0 AND 100),
  trust INTEGER NOT NULL DEFAULT 30 CHECK (trust BETWEEN 0 AND 100),
  tension INTEGER NOT NULL DEFAULT 10 CHECK (tension BETWEEN 0 AND 100),
  attraction INTEGER NOT NULL DEFAULT 10 CHECK (attraction BETWEEN 0 AND 100),
  loyalty INTEGER NOT NULL DEFAULT 20 CHECK (loyalty BETWEEN 0 AND 100),
  influence INTEGER NOT NULL DEFAULT 20 CHECK (influence BETWEEN 0 AND 100),
  interaction_count INTEGER NOT NULL DEFAULT 0,
  last_interaction_game_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,character_a_key,character_b_key),
  CHECK (character_a_key < character_b_key)
);

CREATE INDEX IF NOT EXISTS private_life_npc_social_edges_user_updated_idx
  ON private_life.npc_social_edges(user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS private_life.npc_social_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','observable','player_relevant')),
  deltas JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  game_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_npc_social_events_user_game_idx
  ON private_life.npc_social_events(user_id,game_at DESC);

CREATE TABLE IF NOT EXISTS private_life.npc_information (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  info_key TEXT NOT NULL,
  subject_key TEXT,
  content TEXT NOT NULL,
  truth_status TEXT NOT NULL DEFAULT 'unknown' CHECK (truth_status IN ('unknown','true','false','mixed')),
  sensitivity INTEGER NOT NULL DEFAULT 30 CHECK (sensitivity BETWEEN 0 AND 100),
  importance INTEGER NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  origin_character_key TEXT,
  source_type TEXT NOT NULL DEFAULT 'world',
  created_game_at TIMESTAMPTZ NOT NULL,
  expires_game_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,info_key)
);

CREATE TABLE IF NOT EXISTS private_life.npc_information_holders (
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  information_id BIGINT NOT NULL REFERENCES private_life.npc_information(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 60 CHECK (confidence BETWEEN 0 AND 100),
  stance TEXT NOT NULL DEFAULT 'believes' CHECK (stance IN ('believes','doubts','rejects')),
  source_character_key TEXT,
  heard_game_at TIMESTAMPTZ NOT NULL,
  share_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,information_id,character_key)
);

CREATE INDEX IF NOT EXISTS private_life_npc_information_holders_character_idx
  ON private_life.npc_information_holders(user_id,character_key,updated_at DESC);

CREATE TABLE IF NOT EXISTS private_life.npc_social_runtime (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  last_tick_game_at TIMESTAMPTZ,
  next_tick_game_at TIMESTAMPTZ,
  tick_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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


CREATE TABLE IF NOT EXISTS private_life.world_director_state (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  last_run_game_at TIMESTAMPTZ,
  next_run_game_at TIMESTAMPTZ,
  last_summary TEXT NOT NULL DEFAULT '',
  last_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS private_life.world_director_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  game_at TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  director_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  queued_events INTEGER NOT NULL DEFAULT 0,
  queued_messages INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_world_director_runs_user_created_idx
  ON private_life.world_director_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS private_life_world_director_next_run_idx
  ON private_life.world_director_state(next_run_game_at);

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
