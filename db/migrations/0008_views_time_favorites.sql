-- Saved list views, time entries and document favorites.
CREATE TABLE IF NOT EXISTS saved_view (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    space_id    uuid NOT NULL REFERENCES space(id) ON DELETE CASCADE,
    user_id     uuid REFERENCES app_user(id) ON DELETE CASCADE,  -- NULL = shared with the space
    name        text NOT NULL,
    filters     jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT saved_view_name_not_empty CHECK (length(btrim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_saved_view_space ON saved_view(space_id, user_id);

CREATE TABLE IF NOT EXISTS time_entry (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  uuid NOT NULL REFERENCES requirement(document_id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    hours        numeric(8,2) NOT NULL CHECK (hours > 0),
    spent_on     date NOT NULL DEFAULT current_date,
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entry_document ON time_entry(document_id, spent_on DESC);

CREATE TABLE IF NOT EXISTS document_favorite (
    document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_document_favorite_user ON document_favorite(user_id, created_at DESC);
