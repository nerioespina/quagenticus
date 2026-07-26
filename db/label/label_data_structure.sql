CREATE TYPE label_color AS ENUM (
    'gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal',
    'cyan', 'blue', 'indigo', 'violet', 'purple', 'pink', 'brown'
);

CREATE TABLE label (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    -- NULL = etiqueta global de la cuenta; con valor = exclusiva de un espacio
    space_id    uuid REFERENCES space(id) ON DELETE CASCADE,
    name        text NOT NULL,
    slug        text NOT NULL,
    color       label_color NOT NULL DEFAULT 'gray',
    description text,
    ord         integer NOT NULL DEFAULT 0,
    usage_count integer NOT NULL DEFAULT 0,
    is_archived boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    creator_id  uuid,
    CONSTRAINT label_name_not_empty CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX idx_label_slug_account
    ON label(account_id, slug) WHERE space_id IS NULL;
CREATE UNIQUE INDEX idx_label_slug_space
    ON label(space_id, slug) WHERE space_id IS NOT NULL;

CREATE TABLE document_label (
    document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    label_id    uuid NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    creator_id  uuid,
    PRIMARY KEY (document_id, label_id)
);
CREATE INDEX idx_document_label_label ON document_label(label_id);
