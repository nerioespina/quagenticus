-- User handles for @mentions. They never start with a digit, so "@123" stays a requirement reference.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS handle citext;

WITH base AS (
    SELECT id, account_id,
           CASE WHEN x ~ '^[a-z]' THEN x ELSE 'u' || x END AS h
      FROM (
            SELECT id, account_id,
                   left(regexp_replace(lower(split_part(email::text, '@', 1)), '[^a-z0-9._-]', '', 'g'), 30) AS x
              FROM app_user
             WHERE handle IS NULL
           ) s
), numbered AS (
    SELECT id, h, row_number() OVER (PARTITION BY account_id, h ORDER BY id) AS rn
      FROM base
)
UPDATE app_user u
   SET handle = CASE WHEN n.rn = 1 THEN n.h ELSE n.h || n.rn END
  FROM numbered n
 WHERE n.id = u.id;

ALTER TABLE app_user ALTER COLUMN handle SET NOT NULL;
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_handle_format;
ALTER TABLE app_user ADD CONSTRAINT app_user_handle_format CHECK (handle ~ '^[a-z][a-z0-9._-]{0,39}$');
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_handle ON app_user(account_id, handle);
