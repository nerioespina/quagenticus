-- Adds a journal entry attributed to the current actor. Returns its id.
CREATE OR REPLACE FUNCTION journal_add(
    p_document_id uuid,
    p_kind        journal_kind,
    p_notes_md    text  DEFAULT NULL,
    p_details     jsonb DEFAULT '[]',
    p_reply_to_id uuid  DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_actor_type text := qg_actor_type();
    v_actor_id   uuid := qg_actor_id();
    v_account_id uuid;
    v_id         uuid;
BEGIN
    SELECT account_id INTO v_account_id FROM document WHERE id = p_document_id;
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'QG404';
    END IF;

    IF p_reply_to_id IS NOT NULL THEN
        -- Threads are one level deep: replies to replies attach to the root.
        SELECT coalesce(reply_to_id, id) INTO p_reply_to_id
          FROM journal
         WHERE id = p_reply_to_id AND document_id = p_document_id AND kind = 'comment';
        IF p_reply_to_id IS NULL THEN
            RAISE EXCEPTION 'El comentario al que respondes no existe' USING ERRCODE = 'QG422';
        END IF;
    END IF;

    IF v_actor_type NOT IN ('user', 'agent') OR v_actor_id IS NULL THEN
        v_actor_type := 'system';
        v_actor_id := NULL;
    END IF;

    INSERT INTO journal (
        document_id, account_id, kind, actor_type,
        actor_user_id, actor_agent_id, notes_md, details, reply_to_id
    ) VALUES (
        p_document_id, v_account_id, p_kind, v_actor_type::actor_type,
        CASE WHEN v_actor_type = 'user'  THEN v_actor_id END,
        CASE WHEN v_actor_type = 'agent' THEN v_actor_id END,
        NULLIF(p_notes_md, ''), coalesce(p_details, '[]'), p_reply_to_id
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Builds one attribute-change detail, or NULL when nothing changed.
CREATE OR REPLACE FUNCTION journal_attr(p_property text, p_from anyelement, p_to anyelement)
RETURNS jsonb AS $$
    SELECT CASE WHEN p_from IS DISTINCT FROM p_to
                THEN jsonb_build_object('type', 'attr', 'property', p_property,
                                        'from', to_jsonb(p_from), 'to', to_jsonb(p_to))
           END;
$$ LANGUAGE sql IMMUTABLE;

-- Users @mentioned in a markdown body that resolve inside the document's account.
CREATE OR REPLACE FUNCTION journal_mentioned_users(p_document_id uuid, p_body text) RETURNS uuid[] AS $$
    SELECT coalesce(array_agg(DISTINCT r.target_id), '{}')
      FROM document d, md_resolve_refs(d.account_id, d.space_id, p_body) r
     WHERE d.id = p_document_id AND r.kind = 'user' AND r.target_id IS NOT NULL;
$$ LANGUAGE sql STABLE;

-- Creates a comment: validates, adopts staged attachments, notifies.
CREATE OR REPLACE FUNCTION comment_create(
    p_document_id    uuid,
    p_notes_md       text,
    p_reply_to_id    uuid   DEFAULT NULL,
    p_attachment_ids uuid[] DEFAULT '{}'
) RETURNS uuid AS $$
DECLARE
    v_id       uuid;
    v_adopted   int;
    v_space_id  uuid;
    v_mentioned uuid[];
BEGIN
    IF coalesce(btrim(p_notes_md), '') = '' AND coalesce(cardinality(p_attachment_ids), 0) = 0 THEN
        RAISE EXCEPTION 'El comentario no puede estar vacío' USING ERRCODE = 'QG400';
    END IF;

    SELECT space_id INTO v_space_id FROM document WHERE id = p_document_id;

    v_id := journal_add(p_document_id, 'comment', p_notes_md, '[]', p_reply_to_id);

    IF coalesce(cardinality(p_attachment_ids), 0) > 0 THEN
        UPDATE attachment
           SET journal_id = v_id, status = 'attached', document_id = p_document_id
         WHERE id = ANY (p_attachment_ids)
           AND status = 'staged'
           AND staged_by = qg_actor_id()
           AND space_id = v_space_id
           AND (document_id IS NULL OR document_id = p_document_id);
        GET DIAGNOSTICS v_adopted = ROW_COUNT;
        IF v_adopted <> cardinality(p_attachment_ids) THEN
            RAISE EXCEPTION 'Algunos adjuntos no son válidos o ya fueron usados' USING ERRCODE = 'QG422';
        END IF;
    END IF;

    IF qg_actor_type() = 'user' THEN
        PERFORM watcher_add(p_document_id, 'user', qg_actor_id());
    END IF;

    v_mentioned := journal_mentioned_users(p_document_id, p_notes_md);
    IF cardinality(v_mentioned) > 0 THEN
        PERFORM notification_fanout(p_document_id, 'mentioned',
            jsonb_build_object('excerpt', left(coalesce(p_notes_md, ''), 200)), v_id, '{}', v_mentioned);
    END IF;
    PERFORM notification_fanout(p_document_id, 'commented',
        jsonb_build_object('excerpt', left(coalesce(p_notes_md, ''), 200)), v_id, '{}', NULL, v_mentioned);

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION comment_update(p_id uuid, p_notes_md text) RETURNS void AS $$
DECLARE
    v_j   journal;
    v_new uuid[];
BEGIN
    SELECT * INTO v_j FROM journal WHERE id = p_id AND kind = 'comment' AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comentario no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF coalesce(v_j.actor_user_id, v_j.actor_agent_id) IS DISTINCT FROM qg_actor_id() THEN
        RAISE EXCEPTION 'Solo el autor puede editar el comentario' USING ERRCODE = 'QG403';
    END IF;
    IF coalesce(btrim(p_notes_md), '') = '' THEN
        RAISE EXCEPTION 'El comentario no puede estar vacío' USING ERRCODE = 'QG400';
    END IF;
    UPDATE journal SET notes_md = p_notes_md, edited_at = now() WHERE id = p_id;

    SELECT array_agg(u) INTO v_new FROM unnest(journal_mentioned_users(v_j.document_id, p_notes_md)) u
     WHERE NOT (u = ANY (journal_mentioned_users(v_j.document_id, v_j.notes_md)));
    IF coalesce(cardinality(v_new), 0) > 0 THEN
        PERFORM notification_fanout(v_j.document_id, 'mentioned',
            jsonb_build_object('excerpt', left(p_notes_md, 200)), p_id, '{}', v_new);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Soft delete: the thread keeps a "comentario eliminado" placeholder.
CREATE OR REPLACE FUNCTION comment_delete(p_id uuid, p_is_moderator boolean DEFAULT false) RETURNS void AS $$
DECLARE
    v_j journal;
BEGIN
    SELECT * INTO v_j FROM journal WHERE id = p_id AND kind = 'comment' AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comentario no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF NOT p_is_moderator AND coalesce(v_j.actor_user_id, v_j.actor_agent_id) IS DISTINCT FROM qg_actor_id() THEN
        RAISE EXCEPTION 'Solo el autor puede eliminar el comentario' USING ERRCODE = 'QG403';
    END IF;
    UPDATE journal SET deleted_at = now() WHERE id = p_id;
    DELETE FROM document_link WHERE source_journal_id = p_id;
END;
$$ LANGUAGE plpgsql;
