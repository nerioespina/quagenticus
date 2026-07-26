CREATE TYPE document_type       AS ENUM ('folder', 'note', 'wiki', 'requirement', 'template');
CREATE TYPE document_visibility AS ENUM ('space', 'private', 'public');
CREATE TYPE link_type AS ENUM (
    'relates', 'duplicates', 'duplicated_by', 'blocks', 'blocked_by',
    'precedes', 'follows', 'parent_of', 'child_of',
    'specifies', 'implements', 'wikilink', 'mentions'
);

CREATE TABLE document (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    space_id          uuid NOT NULL REFERENCES space(id) ON DELETE RESTRICT,
    parent_id         uuid REFERENCES document(id) ON DELETE RESTRICT,

    doc_type          document_type NOT NULL DEFAULT 'note',
    ref_key           text,                    -- 'QG-123'; NULL salvo requirement
    slug              text NOT NULL,
    title             text NOT NULL,

    body_md           text NOT NULL DEFAULT '',
    front_matter      jsonb NOT NULL DEFAULT '{}',
    body_sha256       bytea,                   -- ETag y detección de cambios
    word_count        integer NOT NULL DEFAULT 0,

    visibility        document_visibility NOT NULL DEFAULT 'space',
    position          numeric NOT NULL DEFAULT 1000,  -- orden entre hermanos
    depth             integer NOT NULL DEFAULT 0,
    path              text NOT NULL DEFAULT '',       -- '/uuid/uuid/' materializado

    version           integer NOT NULL DEFAULT 1,
    is_archived       boolean NOT NULL DEFAULT false,
    archived_at       timestamptz,
    is_favorite_count integer NOT NULL DEFAULT 0,

    locked_by         uuid,                    -- edición exclusiva blanda
    lock_expires_at   timestamptz,

    search_tsv        tsvector GENERATED ALWAYS AS (
                          setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
                          setweight(to_tsvector('spanish', coalesce(body_md, '')), 'B')
                      ) STORED,

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    creator_id        uuid REFERENCES app_user(id) ON DELETE RESTRICT,
    updater_id        uuid,
    creator_agent_id  uuid,                    -- si lo creó un agente

    CONSTRAINT document_title_not_empty CHECK (length(btrim(title)) > 0),
    CONSTRAINT document_no_self_parent  CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT document_ref_only_req    CHECK (ref_key IS NULL OR doc_type = 'requirement')
);

CREATE UNIQUE INDEX idx_document_ref_key ON document(ref_key) WHERE ref_key IS NOT NULL;
CREATE UNIQUE INDEX idx_document_slug    ON document(space_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
    WHERE is_archived = false;
CREATE INDEX idx_document_space_type ON document(space_id, doc_type) WHERE is_archived = false;
CREATE INDEX idx_document_parent     ON document(parent_id, position);
CREATE INDEX idx_document_search     ON document USING gin(search_tsv);
CREATE INDEX idx_document_title_trgm ON document USING gin(qg_unaccent(title) gin_trgm_ops);
CREATE INDEX idx_document_updated    ON document(account_id, updated_at DESC);

CREATE TABLE document_section (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    ord           integer NOT NULL,
    level         integer NOT NULL,
    section_key   text,                -- clave canónica; NULL si no reconocida
    heading       text NOT NULL,
    slug          text NOT NULL,
    body_md       text NOT NULL DEFAULT '',
    start_offset  integer NOT NULL,    -- offsets de caracteres sobre document.body_md
    end_offset    integer NOT NULL,
    UNIQUE (document_id, ord)
);
CREATE INDEX idx_document_section_key ON document_section(document_id, section_key);

CREATE TABLE document_version (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id    uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    version        integer NOT NULL,
    title          text NOT NULL,
    body_md        text NOT NULL,
    front_matter   jsonb NOT NULL DEFAULT '{}',
    change_summary text,
    actor_type     actor_type NOT NULL,
    actor_id       uuid,
    agent_session_id uuid,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_id, version)
);

CREATE TABLE document_link (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id    uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    target_id    uuid REFERENCES document(id) ON DELETE CASCADE,
    target_text  text,                -- wikilink no resuelto todavía
    link_type    link_type NOT NULL DEFAULT 'relates',
    is_derived   boolean NOT NULL DEFAULT false,  -- true = extraído de body_md
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    creator_id   uuid,
    CONSTRAINT document_link_target CHECK (target_id IS NOT NULL OR target_text IS NOT NULL)
);
CREATE UNIQUE INDEX idx_document_link_unique
    ON document_link(source_id, target_id, link_type) WHERE target_id IS NOT NULL;
CREATE INDEX idx_document_link_target ON document_link(target_id);   -- backlinks
