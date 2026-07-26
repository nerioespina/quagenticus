CREATE TABLE journal (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id        uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    account_id         uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    
    actor_type         actor_type NOT NULL,
    actor_user_id      uuid REFERENCES app_user(id) ON DELETE RESTRICT,
    actor_agent_id     uuid, -- REFERENCES agent(id) later
    agent_session_id   uuid,
    
    notes_md           text,
    
    -- Los cambios estruturados van aquí
    details            jsonb NOT NULL DEFAULT '[]',
    
    created_at         timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT journal_actor CHECK (
        (actor_type = 'user' AND actor_user_id IS NOT NULL) OR
        (actor_type = 'agent' AND actor_agent_id IS NOT NULL) OR
        (actor_type = 'system')
    )
);

CREATE INDEX idx_journal_document ON journal(document_id, created_at ASC);
