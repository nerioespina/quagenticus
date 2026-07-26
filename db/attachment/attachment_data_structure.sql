CREATE TABLE attachment (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    document_id   uuid REFERENCES document(id) ON DELETE CASCADE,
    journal_id    uuid, -- Will reference journal(id) in Fase 2
    filename      text NOT NULL,
    content_type  text NOT NULL,
    byte_size     bigint NOT NULL,
    sha256        bytea NOT NULL,
    storage_key   text NOT NULL,     -- ruta en FS o clave S3
    is_inline     boolean NOT NULL DEFAULT false,   -- imagen pegada en el markdown
    width         integer,
    height        integer,
    created_at    timestamptz NOT NULL DEFAULT now(),
    creator_id    uuid,
    CONSTRAINT attachment_owner CHECK (document_id IS NOT NULL OR journal_id IS NOT NULL)
);
CREATE INDEX idx_attachment_sha ON attachment(account_id, sha256);  -- deduplicación
