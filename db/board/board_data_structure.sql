CREATE TABLE board (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id    uuid REFERENCES space(id) ON DELETE CASCADE,  -- NULL = tablero global de cuenta
    account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    name        text NOT NULL,
    description text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    creator_id  uuid,
    CONSTRAINT board_scope CHECK (space_id IS NOT NULL OR account_id IS NOT NULL)
);

CREATE TABLE board_column (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    uuid NOT NULL REFERENCES board(id) ON DELETE CASCADE,
    name        text NOT NULL,
    status_id   uuid REFERENCES workflow_status(id) ON DELETE CASCADE,
    ord         integer NOT NULL DEFAULT 0,
    wip_limit   integer,
    color       text,
    UNIQUE (board_id, status_id)
);
