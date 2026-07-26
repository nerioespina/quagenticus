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
        creator_id, updater_id
    ) VALUES (
        v_account_id, p_space_id, p_parent_id, p_doc_type,
        btrim(p_title), v_slug, coalesce(p_body_md, ''), coalesce(p_front_matter, '{}'),
        v_actor_id, v_actor_id
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
