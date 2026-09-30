CREATE TABLE IF NOT EXISTS private_life.world_director_state (
  user_id BIGINT PRIMARY KEY REFERENCES private_life.users(id) ON DELETE CASCADE,
  last_run_game_at TIMESTAMPTZ,
  next_run_game_at TIMESTAMPTZ,
  last_summary TEXT NOT NULL DEFAULT '',
  last_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS private_life_world_director_next_run_idx
  ON private_life.world_director_state(next_run_game_at);
