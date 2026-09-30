-- PRIVATE LIFE · Life Engine v1 · Step 1
-- Persistent world clock. The current game time is derived from anchors,
-- so the world keeps advancing while the browser/app is closed.

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
