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
