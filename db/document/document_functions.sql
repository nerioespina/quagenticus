CREATE OR REPLACE FUNCTION document_is_readable(p_id uuid) RETURNS boolean AS $$
BEGIN
    RETURN true; -- TODO: full permission check via space_member
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION document_get_authorized(p_id uuid, p_mode text) RETURNS document AS $$
DECLARE v_doc document;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    RETURN v_doc;
END;
$$ LANGUAGE plpgsql STABLE;

-- Creates a document and saves the initial version.
CREATE OR REPLACE FUNCTION document_create(
    p_space_id    uuid,
    p_parent_id   uuid,
    p_doc_type    document_type,
    p_title       text,
    p_body_md     text DEFAULT '',
    p_front_matter jsonb DEFAULT '{}'
) RETURNS document AS $$
DECLARE
    v_account_id uuid := current_setting('qg.account_id')::uuid;
    v_actor_id   uuid := qg_actor_id();
    v_slug       text;
    v_doc        document;
BEGIN
    IF btrim(p_title) = '' THEN
        RAISE EXCEPTION 'El título no puede estar vacío' USING ERRCODE = 'QG400';
    END IF;

    v_slug := md_slugify(p_title);

    -- Disambiguate slug collisions
    IF EXISTS (
        SELECT 1 FROM document
        WHERE space_id = p_space_id
          AND coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = coalesce(p_parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND slug = v_slug
          AND is_archived = false
    ) THEN
        v_slug := v_slug || '-' || to_hex(floor(random() * 65536)::int);
    END IF;

    INSERT INTO document (
        account_id, space_id, parent_id, doc_type,
        title, slug, body_md, front_matter,
        creator_id, updater_id, creator_agent_id
    ) VALUES (
        v_account_id, p_space_id, p_parent_id, p_doc_type,
        btrim(p_title), v_slug, coalesce(p_body_md, ''), coalesce(p_front_matter, '{}'),
        qg_responsible_user_id(), v_actor_id,
        CASE WHEN qg_actor_type() = 'agent' THEN v_actor_id END
    )
    RETURNING * INTO v_doc;

    -- Save initial version
    INSERT INTO document_version (document_id, version, title, body_md, front_matter, actor_type, actor_id)
    VALUES (v_doc.id, 1, v_doc.title, v_doc.body_md, v_doc.front_matter,
            qg_actor_type()::actor_type, v_actor_id);

    RETURN v_doc;
END;
$$ LANGUAGE plpgsql;

-- Updates a document body/title with optimistic concurrency check.
CREATE OR REPLACE FUNCTION document_update(
    p_id      uuid,
    p_title   text DEFAULT NULL,
    p_body_md text DEFAULT NULL,
    p_version int  DEFAULT NULL   -- if provided, checked for optimistic lock
) RETURNS document AS $$
DECLARE
    v_actor_id uuid := qg_actor_id();
    v_doc      document;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_id AND is_archived = false;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'QG404';
    END IF;

    IF p_version IS NOT NULL AND v_doc.version != p_version THEN
        RAISE EXCEPTION 'Conflicto de versión: el documento fue modificado. Versión actual: %', v_doc.version
            USING ERRCODE = 'QG409';
    END IF;

    -- Save snapshot before overwrite
    INSERT INTO document_version (document_id, version, title, body_md, front_matter, actor_type, actor_id)
    VALUES (v_doc.id, v_doc.version, v_doc.title, v_doc.body_md, v_doc.front_matter,
            qg_actor_type()::actor_type, v_actor_id)
    ON CONFLICT (document_id, version) DO NOTHING;

    UPDATE document SET
        title      = coalesce(btrim(p_title),  title),
        body_md    = coalesce(p_body_md,        body_md),
        version    = version + 1,
        updater_id = v_actor_id,
        updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_doc;

    RETURN v_doc;
END;
$$ LANGUAGE plpgsql;

-- Maintains parent_id, depth and the materialized path of a document.
CREATE OR REPLACE FUNCTION document_set_parent(p_id uuid, p_parent_id uuid) RETURNS void AS $$
DECLARE
    v_parent document;
    v_doc    document;
    v_path   text := '/';
    v_depth  int := 0;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_id;
    IF p_parent_id IS NOT NULL THEN
        SELECT * INTO v_parent FROM document WHERE id = p_parent_id;
        IF v_parent.id IS NULL OR v_parent.space_id <> v_doc.space_id OR v_parent.doc_type <> 'folder' THEN
            RAISE EXCEPTION 'La carpeta destino no es válida' USING ERRCODE = 'QG422';
        END IF;
        IF p_parent_id = p_id OR v_parent.path LIKE '%/' || p_id::text || '/%' THEN
            RAISE EXCEPTION 'No puedes mover una carpeta dentro de sí misma' USING ERRCODE = 'QG422';
        END IF;
        v_path := coalesce(nullif(v_parent.path, ''), '/') || p_parent_id::text || '/';
        v_depth := v_parent.depth + 1;
    END IF;

    UPDATE document SET parent_id = p_parent_id, path = v_path, depth = v_depth WHERE id = p_id;

    -- descendants keep their relative path
    UPDATE document c
       SET path  = v_path || p_id::text || '/' || substr(c.path, length(coalesce(nullif(v_doc.path, ''), '/') || p_id::text || '/') + 1),
           depth = v_depth + 1 + (c.depth - v_doc.depth - 1)
     WHERE c.path LIKE '%/' || p_id::text || '/%' AND c.id <> p_id;
END;
$$ LANGUAGE plpgsql;

-- Moves a document to a folder (or root) and places it between siblings.
CREATE OR REPLACE FUNCTION document_move(p_id uuid, p_parent_id uuid, p_before_id uuid DEFAULT NULL, p_after_id uuid DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_before numeric;
    v_after  numeric;
    v_pos    numeric;
BEGIN
    PERFORM 1 FROM document WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    PERFORM document_set_parent(p_id, p_parent_id);

    SELECT position INTO v_before FROM document WHERE id = p_before_id AND parent_id IS NOT DISTINCT FROM p_parent_id;
    SELECT position INTO v_after  FROM document WHERE id = p_after_id  AND parent_id IS NOT DISTINCT FROM p_parent_id;
    v_pos := CASE
        WHEN v_before IS NOT NULL AND v_after IS NOT NULL THEN (v_before + v_after) / 2
        WHEN v_before IS NOT NULL THEN v_before + 1000
        WHEN v_after IS NOT NULL THEN v_after - 1000
        ELSE (SELECT coalesce(max(position), 0) + 1000 FROM document
               WHERE space_id = (SELECT space_id FROM document WHERE id = p_id)
                 AND parent_id IS NOT DISTINCT FROM p_parent_id AND id <> p_id)
    END;
    UPDATE document SET position = v_pos WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;
