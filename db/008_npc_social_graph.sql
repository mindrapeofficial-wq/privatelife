-- PRIVATE LIFE · Life Engine v1 · Step 5
-- NPC↔NPC social graph, social events and information diffusion.

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
