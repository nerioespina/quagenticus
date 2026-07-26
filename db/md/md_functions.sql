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
        btrim(substr(p_body, s.body_start, s.next_start - s.body_start), E' \n\t'),
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
