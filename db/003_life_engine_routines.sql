-- PRIVATE LIFE · Life Engine v1 · Step 2
-- Queue NPC replies until their routine makes delivery plausible.

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
