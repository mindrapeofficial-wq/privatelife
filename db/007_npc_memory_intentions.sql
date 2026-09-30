-- PRIVATE LIFE · Life Engine v1 · Step 4
-- Living NPC memories and persistent intentions.

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
