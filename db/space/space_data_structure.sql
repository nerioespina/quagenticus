CREATE TABLE space (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    key             text NOT NULL,             -- 'QG' → referencias QG-123
    name            text NOT NULL,
    description_md  text,
    icon            text,
    color           text,
    modules         jsonb NOT NULL DEFAULT
                      '{"docs": true, "requirements": true, "agents": false}',
    settings        jsonb NOT NULL DEFAULT '{}',
    ref_counter     bigint NOT NULL DEFAULT 0, -- secuencia de QG-<n>
    is_archived     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    creator_id      uuid REFERENCES app_user(id) ON DELETE RESTRICT,
    updater_id      uuid,
    CONSTRAINT space_key_format CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
    UNIQUE (account_id, key)
);

CREATE TABLE space_member (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        uuid NOT NULL REFERENCES space(id) ON DELETE CASCADE,
    subject_type    actor_type NOT NULL,
    subject_id      uuid NOT NULL,             -- app_user.id | agent.id | team.id
    role            member_role NOT NULL DEFAULT 'contributor',
    granted_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, subject_type, subject_id)
);
