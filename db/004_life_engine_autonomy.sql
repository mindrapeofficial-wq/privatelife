-- PRIVATE LIFE · Life Engine v1 · Step 3
-- Persistent autonomous NPC scheduler and event journal.

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

CREATE TABLE IF NOT EXISTS private_life.life_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  character_key TEXT,
  character_name TEXT,
  event_type TEXT NOT NULL,
  channel TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  game_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_life_events_user_game_idx
  ON private_life.life_events(user_id,game_at DESC);
