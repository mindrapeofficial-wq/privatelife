-- PRIVATE LIFE · Life Engine v1 · Step 6
-- Causal graph and deferred consequences.

CREATE TABLE IF NOT EXISTS private_life.causal_nodes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'world',
  source_ref TEXT,
  summary TEXT NOT NULL,
  actor_key TEXT,
  target_key TEXT,
  importance INTEGER NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','observable','player_relevant')),
  occurred_game_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,node_key)
);

CREATE INDEX IF NOT EXISTS private_life_causal_nodes_user_game_idx
  ON private_life.causal_nodes(user_id,occurred_game_at DESC);

CREATE TABLE IF NOT EXISTS private_life.causal_edges (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  parent_node_id BIGINT NOT NULL REFERENCES private_life.causal_nodes(id) ON DELETE CASCADE,
  child_node_id BIGINT NOT NULL REFERENCES private_life.causal_nodes(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'consequence' CHECK (relation_type IN ('cause','consequence','enables','blocks','reveals','amplifies','resolves')),
  weight INTEGER NOT NULL DEFAULT 50 CHECK (weight BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id,parent_node_id,child_node_id,relation_type),
  CHECK (parent_node_id <> child_node_id)
);

CREATE INDEX IF NOT EXISTS private_life_causal_edges_parent_idx
  ON private_life.causal_edges(user_id,parent_node_id);

CREATE INDEX IF NOT EXISTS private_life_causal_edges_child_idx
  ON private_life.causal_edges(user_id,child_node_id);

CREATE TABLE IF NOT EXISTS private_life.consequence_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES private_life.users(id) ON DELETE CASCADE,
  source_node_id BIGINT NOT NULL REFERENCES private_life.causal_nodes(id) ON DELETE CASCADE,
  parent_consequence_id BIGINT REFERENCES private_life.consequence_queue(id) ON DELETE SET NULL,
  consequence_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  probability INTEGER NOT NULL DEFAULT 100 CHECK (probability BETWEEN 0 AND 100),
  effect_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  condition_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  not_before_game_at TIMESTAMPTZ,
  due_game_at TIMESTAMPTZ NOT NULL,
  expires_game_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','executed','cancelled','expired','blocked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_game_at TIMESTAMPTZ,
  executed_game_at TIMESTAMPTZ,
  executed_node_id BIGINT REFERENCES private_life.causal_nodes(id) ON DELETE SET NULL,
  resolution TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_game_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_consequence_due_idx
  ON private_life.consequence_queue(user_id,status,due_game_at,priority DESC);
