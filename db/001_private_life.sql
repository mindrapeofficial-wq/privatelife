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
