CREATE OR REPLACE FUNCTION md_slugify(p_text text) RETURNS text AS $$
    SELECT btrim(
        regexp_replace(lower(qg_unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', '-', 'g'),
        '-'
    );
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION md_heading_index(p_body text)
RETURNS TABLE (ord int, level int, heading text, line_start int, body_start int)
AS $$
DECLARE
    v_lines    text[];
    v_line     text;
    v_offset   int := 1;         -- offset 1-based del inicio de la línea actual
    v_in_fence boolean := false;
    v_fence    text;
    v_m        text[];
    v_ord      int := 0;
BEGIN
    IF p_body IS NULL OR p_body = '' THEN
        RETURN;
    END IF;

    v_lines := string_to_array(replace(p_body, E'\r\n', E'\n'), E'\n');

    FOREACH v_line IN ARRAY v_lines LOOP
        -- Apertura/cierre de bloque de código cercado
        v_m := regexp_match(v_line, '^\s{0,3}(```+|~~~+)');
        IF v_m IS NOT NULL THEN
            IF NOT v_in_fence THEN
                v_in_fence := true;
                v_fence    := left(v_m[1], 3);
            ELSIF left(v_m[1], 3) = v_fence THEN
                v_in_fence := false;
            END IF;
        END IF;

        IF NOT v_in_fence THEN
            v_m := regexp_match(v_line, '^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$');
            IF v_m IS NOT NULL THEN
                v_ord      := v_ord + 1;
                ord        := v_ord;
                level      := length(v_m[1]);
                heading    := btrim(v_m[2]);
                line_start := v_offset;
                body_start := v_offset + length(v_line) + 1;
                RETURN NEXT;
            END IF;
        END IF;

        v_offset := v_offset + length(v_line) + 1;   -- +1 por el salto de línea
    END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION md_split_sections(p_body text, p_level int DEFAULT 2)
RETURNS TABLE (ord int, level int, heading text, slug text,
               body_md text, start_offset int, end_offset int)
AS $$
DECLARE
    v_total int := length(coalesce(p_body, ''));
BEGIN
    RETURN QUERY
    WITH h AS (
        SELECT * FROM md_heading_index(p_body)
    ),
    sec AS (
        SELECT
            h.ord, h.level, h.heading, h.line_start, h.body_start,
            -- fin = inicio del siguiente encabezado de nivel <= p_level
            COALESCE(
                (SELECT MIN(n.line_start) FROM h n
                  WHERE n.ord > h.ord AND n.level <= p_level),
                v_total + 1
            ) AS next_start
        FROM h
        WHERE h.level = p_level
    )
    SELECT
        row_number() OVER (ORDER BY s.line_start)::int,
        s.level,
        s.heading,
        md_slugify(s.heading),
        btrim(substr(p_body, s.body_start, greatest(s.next_start - s.body_start, 0)), E' \n\t'),
        s.line_start,
        (s.next_start - 1)::int
    FROM sec s
    ORDER BY s.line_start;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION md_extract_title(p_body text) RETURNS text AS $$
    SELECT heading FROM md_heading_index(p_body) WHERE level = 1 ORDER BY ord LIMIT 1;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION md_extract_wikilinks(p_body text) RETURNS text[] AS $$
    SELECT COALESCE(array_agg(DISTINCT btrim(m[1])), '{}')
    FROM regexp_matches(
             regexp_replace(coalesce(p_body, ''), '```.*?```', '', 'gs'),
             '\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]', 'g'
         ) AS m;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION md_extract_refs(p_body text) RETURNS text[] AS $$
    SELECT COALESCE(array_agg(DISTINCT m[1]), '{}')
    FROM regexp_matches(coalesce(p_body, ''), '\y([A-Z][A-Z0-9]{1,9}-[0-9]+)\y', 'g') AS m;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- ---------------------------------------------------------------------------
-- Reference grammar (keep in sync with web/src/lib/refs.ts):
--   #123  @123  #KEY-123  KEY-123   → requirement
--   [[Title]]  [[slug|alias]]        → document (wikilink)
--   @handle                          → user mention (handles never start with a digit)
-- Code blocks and inline code are ignored.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION md_strip_code(p_body text) RETURNS text AS $$
    SELECT regexp_replace(
               regexp_replace(coalesce(p_body, ''), '(```|~~~).*?(\1|$)', ' ', 'gs'),
               '`[^`\n]*`', ' ', 'g');
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- Requirement references: space_key is NULL for relative references (#123, @123).
CREATE OR REPLACE FUNCTION md_extract_req_refs(p_body text)
RETURNS TABLE (raw text, space_key text, num bigint) AS $$
    WITH src AS (SELECT md_strip_code(p_body) AS b)
    SELECT DISTINCT m[1] || coalesce(m[2] || '-', '') || m[3], m[2], m[3]::bigint
      FROM src, regexp_matches(src.b, '(?:^|[^[:alnum:]_/&#@])([#@])(?:([A-Z][A-Z0-9]{1,9})-)?([0-9]{1,9})(?![[:alnum:]_-])', 'g') AS m
    UNION
    SELECT DISTINCT m[1] || '-' || m[2], m[1], m[2]::bigint
      FROM src, regexp_matches(src.b, '(?:^|[^[:alnum:]_/#@.-])([A-Z][A-Z0-9]{1,9})-([0-9]{1,9})(?![[:alnum:]_-])', 'g') AS m;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION md_extract_mentions(p_body text) RETURNS text[] AS $$
    SELECT COALESCE(array_agg(DISTINCT lower(rtrim(m[1], '._-'))), '{}')
      FROM regexp_matches(md_strip_code(p_body), '(?:^|[^[:alnum:]_/@.])@([A-Za-z][A-Za-z0-9._-]{0,39})', 'g') AS m;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION md_extract_wikilinks(p_body text) RETURNS text[] AS $$
    SELECT COALESCE(array_agg(DISTINCT btrim(m[1])), '{}')
    FROM regexp_matches(
             md_strip_code(p_body),
             '\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]', 'g'
         ) AS m;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- Resolves every reference of a markdown body against the account/space.
-- kind: 'requirement' | 'wikilink' | 'user'. target_id is NULL when unresolved.
CREATE OR REPLACE FUNCTION md_resolve_refs(p_account_id uuid, p_space_id uuid, p_body text)
RETURNS TABLE (kind text, raw text, target_id uuid) AS $$
DECLARE
    v_space_key text;
BEGIN
    SELECT key INTO v_space_key FROM space WHERE id = p_space_id;

    RETURN QUERY
    SELECT 'requirement'::text, r.raw, d.id
      FROM md_extract_req_refs(p_body) r
      LEFT JOIN document d
        ON d.account_id = p_account_id
       AND d.doc_type = 'requirement'
       AND d.ref_key = coalesce(r.space_key, v_space_key) || '-' || r.num
    -- bare KEY-123 tokens only count when they resolve (avoid "UTF-8" noise)
     WHERE d.id IS NOT NULL OR r.raw ~ '^[#@]';

    RETURN QUERY
    SELECT 'wikilink'::text, w.t,
           coalesce(
               (SELECT d.id FROM document d
                 WHERE d.account_id = p_account_id AND d.ref_key = upper(ltrim(w.t, '#'))
                   AND d.doc_type = 'requirement' LIMIT 1),
               (SELECT d.id FROM document d
                 WHERE d.account_id = p_account_id AND d.doc_type = 'requirement'
                   AND w.t ~ '^#[0-9]+$' AND d.ref_key = v_space_key || '-' || substr(w.t, 2) LIMIT 1),
               (SELECT d.id FROM document d
                 WHERE d.space_id = p_space_id AND NOT d.is_archived
                   AND (lower(d.title) = lower(w.t) OR d.slug = md_slugify(w.t))
                 ORDER BY (lower(d.title) = lower(w.t)) DESC, d.updated_at DESC
                 LIMIT 1)
           )
      FROM unnest(md_extract_wikilinks(p_body)) AS w(t);

    RETURN QUERY
    SELECT 'user'::text, h.h, u.id
      FROM unnest(md_extract_mentions(p_body)) AS h(h)
      LEFT JOIN app_user u ON u.account_id = p_account_id AND u.handle = h.h AND u.status = 'active';
END;
$$ LANGUAGE plpgsql STABLE;
