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
