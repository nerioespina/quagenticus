-- Board columns are derived from workflow_status; board_column only customizes them.
ALTER TABLE board_column
    ADD COLUMN IF NOT EXISTS is_collapsed boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_hidden    boolean NOT NULL DEFAULT false;

-- closed_at was never set: backfill it for requirements already in closed statuses.
UPDATE requirement r
   SET closed_at = r.updated_at
  FROM workflow_status ws
 WHERE ws.id = r.status_id
   AND ws.is_closed
   AND r.closed_at IS NULL;

DROP INDEX IF EXISTS idx_requirement_board;
CREATE INDEX idx_requirement_board ON requirement(space_id, status_id, board_position, document_id);

-- Every space gets a board.
INSERT INTO board (space_id, account_id, name, creator_id)
SELECT s.id, s.account_id, 'Tablero Principal', s.creator_id
  FROM space s
 WHERE NOT EXISTS (SELECT 1 FROM board b WHERE b.space_id = s.id);
