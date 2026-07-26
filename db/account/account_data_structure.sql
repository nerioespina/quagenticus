CREATE TABLE account (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key             text NOT NULL UNIQUE,
    name            text NOT NULL,
    settings        jsonb NOT NULL DEFAULT '{}',
    default_locale  text NOT NULL DEFAULT 'es',
    fts_config      regconfig NOT NULL DEFAULT 'spanish',
    status          user_status NOT NULL DEFAULT 'active',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT account_key_format CHECK (key ~ '^[a-z][a-z0-9-]{1,30}$')
);
