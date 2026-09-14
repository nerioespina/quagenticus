-- Refresh tokens (httpOnly cookie sessions) and agent API keys.
CREATE TABLE IF NOT EXISTS refresh_token (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash  bytea NOT NULL UNIQUE,
    user_agent  text,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user ON refresh_token(user_id) WHERE revoked_at IS NULL;

ALTER TABLE agent
    ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS scopes     text[]  NOT NULL DEFAULT '{docs:read,docs:write,requirements:read,requirements:write,agent:claim}',
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES app_user(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_key_prefix ON agent(api_key_prefix);

ALTER TABLE agent_claim
    ADD COLUMN IF NOT EXISTS previous_status_id uuid REFERENCES workflow_status(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agent_claim_open ON agent_claim(requirement_id) WHERE completed_at IS NULL;
