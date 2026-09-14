-- Links derived from comments remember the comment; manual and derived links get separate uniqueness.
ALTER TABLE document_link
    ADD COLUMN IF NOT EXISTS source_journal_id uuid REFERENCES journal(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_document_link_unique;
CREATE UNIQUE INDEX idx_document_link_unique
    ON document_link(source_id, target_id, link_type)
    WHERE target_id IS NOT NULL AND source_journal_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_link_journal_unique
    ON document_link(source_journal_id, target_id, link_type)
    WHERE target_id IS NOT NULL AND source_journal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_link_source ON document_link(source_id);
CREATE INDEX IF NOT EXISTS idx_document_link_broken ON document_link(source_id) WHERE target_id IS NULL;
