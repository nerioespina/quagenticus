-- Journal: typed entries (comment / change / agent_event / system), threads and soft delete.
DO $$ BEGIN
    CREATE TYPE journal_kind AS ENUM ('comment', 'change', 'agent_event', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE journal
    ADD COLUMN IF NOT EXISTS kind        journal_kind NOT NULL DEFAULT 'change',
    ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES journal(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS edited_at   timestamptz,
    ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

-- Entries with notes and no structured details were plain comments.
UPDATE journal
   SET kind = 'comment'
 WHERE coalesce(btrim(notes_md), '') <> ''
   AND details = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_journal_document_kind ON journal(document_id, kind, created_at);
CREATE INDEX IF NOT EXISTS idx_journal_reply ON journal(reply_to_id) WHERE reply_to_id IS NOT NULL;
