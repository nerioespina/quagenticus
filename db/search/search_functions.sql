-- Autocomplete for references, members and quick navigation (trigram + exact number).
CREATE OR REPLACE FUNCTION search_suggest(
    p_space_id uuid,
    p_query    text,
    p_types    text[] DEFAULT ARRAY['requirement', 'document', 'user'],
    p_limit    int    DEFAULT 10
) RETURNS TABLE (kind text, id uuid, ref_key text, title text, subtitle text, space_id uuid, score real) AS $$
DECLARE
    v_space space;
    v_q     text := btrim(coalesce(p_query, ''));
    v_num   text;
BEGIN
    SELECT * INTO v_space FROM space WHERE space.id = p_space_id;
    v_num := substring(v_q FROM '^[#@]?(?:[A-Za-z][A-Za-z0-9]{1,9}-)?([0-9]+)$');
    v_q := regexp_replace(v_q, '^[#@]', '');

    IF 'requirement' = ANY (p_types) THEN
        RETURN QUERY
        SELECT 'requirement'::text, d.id, d.ref_key, d.title, ws.name, d.space_id,
               (CASE WHEN v_num IS NOT NULL AND d.ref_key = v_space.key || '-' || v_num THEN 2.0
                     WHEN d.ref_key ILIKE v_q || '%' THEN 1.5
                     ELSE similarity(qg_unaccent(d.title), qg_unaccent(v_q)) +
                          CASE WHEN qg_unaccent(d.title) ILIKE '%' || qg_unaccent(v_q) || '%' THEN 0.5 ELSE 0 END
                END)::real AS sc
          FROM document d
          JOIN requirement r ON r.document_id = d.id
          JOIN workflow_status ws ON ws.id = r.status_id
         WHERE d.space_id = p_space_id AND NOT d.is_archived
           AND (v_q = ''
                OR (v_num IS NOT NULL AND d.ref_key LIKE '%-' || v_num || '%')
                OR d.ref_key ILIKE v_q || '%'
                OR qg_unaccent(d.title) ILIKE '%' || qg_unaccent(v_q) || '%'
                OR qg_unaccent(d.title) % qg_unaccent(v_q))
         ORDER BY sc DESC, d.updated_at DESC
         LIMIT p_limit;
    END IF;

    IF 'document' = ANY (p_types) THEN
        RETURN QUERY
        SELECT 'document'::text, d.id, NULL::text, d.title, d.doc_type::text, d.space_id,
               (similarity(qg_unaccent(d.title), qg_unaccent(v_q)) +
                CASE WHEN qg_unaccent(d.title) ILIKE '%' || qg_unaccent(v_q) || '%' THEN 0.5 ELSE 0 END)::real AS sc
          FROM document d
         WHERE d.space_id = p_space_id AND NOT d.is_archived
           AND d.doc_type NOT IN ('requirement', 'folder')
           AND (v_q = '' OR qg_unaccent(d.title) ILIKE '%' || qg_unaccent(v_q) || '%'
                OR qg_unaccent(d.title) % qg_unaccent(v_q))
         ORDER BY sc DESC, d.updated_at DESC
         LIMIT p_limit;
    END IF;

    IF 'user' = ANY (p_types) THEN
        RETURN QUERY
        SELECT 'user'::text, u.id, u.handle::text, u.display_name, u.email::text, p_space_id,
               (CASE WHEN u.handle ILIKE v_q || '%' THEN 1.5 ELSE similarity(qg_unaccent(u.display_name), qg_unaccent(v_q)) END)::real AS sc
          FROM app_user u
         WHERE u.account_id = v_space.account_id AND u.status = 'active'
           AND space_member_role(p_space_id, 'user', u.id) IS NOT NULL
           AND (v_q = '' OR u.handle ILIKE v_q || '%' OR u.email ILIKE v_q || '%'
                OR qg_unaccent(u.display_name) ILIKE '%' || qg_unaccent(v_q) || '%')
         ORDER BY sc DESC, u.display_name
         LIMIT p_limit;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Full-text search across every space the user can read.
CREATE OR REPLACE FUNCTION search_documents(
    p_account_id uuid,
    p_actor_type text,
    p_actor_id   uuid,
    p_query      text,
    p_space_id   uuid   DEFAULT NULL,
    p_types      text[] DEFAULT NULL,
    p_limit      int    DEFAULT 25,
    p_offset     int    DEFAULT 0
) RETURNS TABLE (id uuid, space_id uuid, space_key text, doc_type text, ref_key text, title text,
                 status_name text, snippet text, rank real, updated_at timestamptz) AS $$
DECLARE
    v_tsq tsquery := websearch_to_tsquery('spanish', coalesce(p_query, ''));
BEGIN
    RETURN QUERY
    WITH readable AS (
        SELECT s.id, s.key FROM space s
         WHERE s.account_id = p_account_id AND NOT s.is_archived
           AND (p_space_id IS NULL OR s.id = p_space_id)
           AND space_member_role(s.id, p_actor_type, p_actor_id) IS NOT NULL
    )
    SELECT d.id, d.space_id, rs.key, d.doc_type::text, d.ref_key, d.title, ws.name,
           ts_headline('spanish', d.body_md, v_tsq,
                       'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10, MaxFragments=2'),
           (ts_rank_cd(d.search_tsv, v_tsq) +
            CASE WHEN d.ref_key = upper(btrim(p_query)) THEN 10 ELSE 0 END)::real AS rk,
           d.updated_at
      FROM document d
      JOIN readable rs ON rs.id = d.space_id
      LEFT JOIN requirement r ON r.document_id = d.id
      LEFT JOIN workflow_status ws ON ws.id = r.status_id
     WHERE NOT d.is_archived
       AND d.doc_type <> 'folder'
       AND (p_types IS NULL OR d.doc_type::text = ANY (p_types))
       AND (d.search_tsv @@ v_tsq
            OR d.ref_key = upper(btrim(p_query))
            OR qg_unaccent(d.title) ILIKE '%' || qg_unaccent(btrim(p_query)) || '%')
     ORDER BY rk DESC, d.updated_at DESC
     LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;
