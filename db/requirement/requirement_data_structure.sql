CREATE TABLE tracker (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    key               text NOT NULL,            -- 'bug', 'feature', 'support', 'task'
    name              text NOT NULL,
    description       text,
    icon              text,
    color             text,
    default_status_id uuid, -- REFERENCES workflow_status(id) added later
    template_id       uuid REFERENCES document(id),   -- doc_type = 'template'
    is_agent_enabled  boolean NOT NULL DEFAULT true,
    ord               integer NOT NULL DEFAULT 0,
    is_active         boolean NOT NULL DEFAULT true,
    UNIQUE (account_id, key)
);

CREATE TABLE workflow_status (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    key                 text NOT NULL,          -- estable, expuesto vía MCP
    name                text NOT NULL,
    color               text,
    ord                 integer NOT NULL DEFAULT 0,
    is_default          boolean NOT NULL DEFAULT false,
    is_closed           boolean NOT NULL DEFAULT false,
    is_agent_claimable  boolean NOT NULL DEFAULT false,
    requires_resolution boolean NOT NULL DEFAULT false,
    UNIQUE (account_id, key)
);

-- Note: default_status_id on tracker must be updated after workflow_status is created
ALTER TABLE tracker ADD CONSTRAINT tracker_default_status_id_fkey FOREIGN KEY (default_status_id) REFERENCES workflow_status(id);

CREATE TABLE workflow_transition (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tracker_id        uuid NOT NULL REFERENCES tracker(id) ON DELETE CASCADE,
    from_status_id    uuid REFERENCES workflow_status(id) ON DELETE CASCADE,  -- NULL = cualquiera
    to_status_id      uuid NOT NULL REFERENCES workflow_status(id) ON DELETE CASCADE,
    allowed_roles     member_role[] NOT NULL DEFAULT '{contributor,maintainer,admin}',
    allowed_actors    actor_type[] NOT NULL DEFAULT '{user,agent}',
    requires_comment  boolean NOT NULL DEFAULT false,
    requires_assignee boolean NOT NULL DEFAULT false,
    requires_readiness boolean NOT NULL DEFAULT false,
    UNIQUE (tracker_id, from_status_id, to_status_id)
);

CREATE TABLE priority (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    key        text NOT NULL,        -- 'low','normal','high','urgent','immediate'
    name       text NOT NULL,
    weight     integer NOT NULL,     -- orden de la cola de agentes
    color      text,
    is_default boolean NOT NULL DEFAULT false,
    UNIQUE (account_id, key)
);

CREATE TABLE milestone (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id    uuid NOT NULL REFERENCES space(id) ON DELETE CASCADE,
    name        text NOT NULL,
    description text,
    due_date    date,
    status      text NOT NULL DEFAULT 'open',  -- open | locked | closed
    UNIQUE (space_id, name)
);

CREATE TABLE requirement (
    document_id        uuid PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
    account_id         uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    space_id           uuid NOT NULL REFERENCES space(id) ON DELETE RESTRICT,

    tracker_id         uuid NOT NULL REFERENCES tracker(id) ON DELETE RESTRICT,
    status_id          uuid NOT NULL REFERENCES workflow_status(id) ON DELETE RESTRICT,
    priority_id        uuid NOT NULL REFERENCES priority(id) ON DELETE RESTRICT,
    category_id        uuid REFERENCES category(id) ON DELETE SET NULL,
    milestone_id       uuid REFERENCES milestone(id) ON DELETE SET NULL,
    parent_id          uuid REFERENCES requirement(document_id) ON DELETE RESTRICT,

    reporter_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    lead_user_id       uuid REFERENCES app_user(id) ON DELETE SET NULL,
    lead_agent_id      uuid, -- REFERENCES agent(id) later
    member_count       integer NOT NULL DEFAULT 0,

    board_position     numeric NOT NULL DEFAULT 0,

    start_date         date,
    due_date           date,
    estimated_hours    numeric(8,2),
    spent_hours        numeric(8,2) NOT NULL DEFAULT 0,
    done_ratio         integer NOT NULL DEFAULT 0,

    readiness_score    integer,               -- 0..100
    readiness_report   jsonb,
    readiness_at       timestamptz,

    claim_id           uuid,
    claimed_by_agent_id uuid, -- REFERENCES agent(id) later
    claim_expires_at   timestamptz,

    resolution         text,
    closed_at          timestamptz,
    reopened_count     integer NOT NULL DEFAULT 0,

    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT requirement_done_ratio CHECK (done_ratio BETWEEN 0 AND 100),
    CONSTRAINT requirement_dates      CHECK (due_date IS NULL OR start_date IS NULL
                                             OR due_date >= start_date),
    CONSTRAINT requirement_no_self_parent CHECK (parent_id IS DISTINCT FROM document_id)
);

CREATE INDEX idx_requirement_queue
    ON requirement(space_id, status_id, priority_id, created_at)
    WHERE claimed_by_agent_id IS NULL;
CREATE INDEX idx_requirement_lead  ON requirement(lead_user_id) WHERE closed_at IS NULL;
CREATE INDEX idx_requirement_claim ON requirement(claim_expires_at)
    WHERE claim_expires_at IS NOT NULL;
CREATE INDEX idx_requirement_board
    ON requirement(space_id, status_id, board_position, document_id)
    WHERE closed_at IS NULL;
CREATE INDEX idx_requirement_board_global
    ON requirement(account_id, status_id, board_position, document_id)
    WHERE closed_at IS NULL;

CREATE TABLE requirement_member (
    document_id  uuid NOT NULL REFERENCES requirement(document_id) ON DELETE CASCADE,
    subject_type actor_type NOT NULL,            -- 'user' | 'agent'
    subject_id   uuid NOT NULL,
    is_lead      boolean NOT NULL DEFAULT false, -- responsable principal
    added_at     timestamptz NOT NULL DEFAULT now(),
    added_by     uuid,
    PRIMARY KEY (document_id, subject_type, subject_id),
    CONSTRAINT requirement_member_subject CHECK (subject_type IN ('user', 'agent'))
);

CREATE UNIQUE INDEX idx_requirement_member_lead
    ON requirement_member(document_id) WHERE is_lead;

CREATE INDEX idx_requirement_member_subject
    ON requirement_member(subject_type, subject_id);
