-- Notifications inbox and document watchers.
CREATE TABLE IF NOT EXISTS notification (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    document_id  uuid REFERENCES document(id) ON DELETE CASCADE,
    journal_id   uuid REFERENCES journal(id) ON DELETE CASCADE,
    event_type   text NOT NULL,
    actor_type   actor_type NOT NULL DEFAULT 'system',
    actor_id     uuid,
    payload      jsonb NOT NULL DEFAULT '{}',
    read_at      timestamptz,
    emailed_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_inbox  ON notification(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_unread ON notification(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notification_email  ON notification(created_at) WHERE emailed_at IS NULL;

CREATE TABLE IF NOT EXISTS watcher (
    document_id  uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    subject_type actor_type NOT NULL,
    subject_id   uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_watcher_subject ON watcher(subject_type, subject_id);

-- Existing reporters and members follow their requirements.
INSERT INTO watcher (document_id, subject_type, subject_id)
SELECT document_id, 'user', reporter_id FROM requirement
ON CONFLICT DO NOTHING;

INSERT INTO watcher (document_id, subject_type, subject_id)
SELECT document_id, subject_type, subject_id FROM requirement_member
ON CONFLICT DO NOTHING;
