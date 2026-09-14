-- Attachments: staged uploads adopted by comments/requirements, and real FK to journal.
ALTER TABLE attachment
    ADD COLUMN IF NOT EXISTS status    text NOT NULL DEFAULT 'attached',
    ADD COLUMN IF NOT EXISTS staged_by uuid,
    ADD COLUMN IF NOT EXISTS space_id  uuid REFERENCES space(id) ON DELETE CASCADE;

UPDATE attachment a SET space_id = d.space_id FROM document d WHERE d.id = a.document_id AND a.space_id IS NULL;

-- Staged uploads made before the owning requirement exists have no owner yet.
ALTER TABLE attachment DROP CONSTRAINT IF EXISTS attachment_owner;
ALTER TABLE attachment ADD CONSTRAINT attachment_owner
    CHECK (document_id IS NOT NULL OR journal_id IS NOT NULL OR status = 'staged');

ALTER TABLE attachment DROP CONSTRAINT IF EXISTS attachment_status_check;
ALTER TABLE attachment ADD CONSTRAINT attachment_status_check CHECK (status IN ('staged', 'attached'));

DELETE FROM attachment a
 WHERE a.journal_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM journal j WHERE j.id = a.journal_id);

ALTER TABLE attachment DROP CONSTRAINT IF EXISTS attachment_journal_id_fkey;
ALTER TABLE attachment
    ADD CONSTRAINT attachment_journal_id_fkey
    FOREIGN KEY (journal_id) REFERENCES journal(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_attachment_document ON attachment(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachment_journal  ON attachment(journal_id) WHERE journal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachment_staged   ON attachment(created_at) WHERE status = 'staged';
