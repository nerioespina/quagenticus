CREATE TYPE agent_status AS ENUM ('offline', 'idle', 'working', 'error');

CREATE TABLE agent (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    name              text NOT NULL,
    description       text,
    model_name        text,
    capabilities      jsonb NOT NULL DEFAULT '[]',
    status            agent_status NOT NULL DEFAULT 'offline',
    api_key_hash      text NOT NULL,
    api_key_prefix    text NOT NULL,  -- para UI: "qga_abc12..."
    last_seen_at      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_session (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    started_at    timestamptz NOT NULL DEFAULT now(),
    ended_at      timestamptz,
    total_tokens  integer NOT NULL DEFAULT 0,
    total_cost    numeric(10,4) NOT NULL DEFAULT 0,
    outcome       text
);

CREATE TABLE agent_claim (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id   uuid NOT NULL REFERENCES requirement(document_id) ON DELETE CASCADE,
    agent_id         uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    session_id       uuid REFERENCES agent_session(id) ON DELETE SET NULL,
    acquired_at      timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL,
    renewals_count   integer NOT NULL DEFAULT 0,
    completed_at     timestamptz,
    completion_state text,           -- 'resolved', 'failed', 'abandoned'
    UNIQUE (requirement_id, agent_id, acquired_at)
);
