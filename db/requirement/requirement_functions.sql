-- Creates a requirement: generates the document, the ref_key, and the requirement row.
CREATE OR REPLACE FUNCTION requirement_create(
    p_space_id    uuid,
    p_tracker_id  uuid,
    p_title       text,
    p_body_md     text DEFAULT '',
    p_priority_id uuid DEFAULT NULL,
    p_category_id uuid DEFAULT NULL
) RETURNS requirement AS $$
DECLARE
    v_account_id  uuid  := current_setting('qg.account_id')::uuid;
    v_actor_id    uuid  := qg_actor_id();
    v_space_key   text;
    v_seq         bigint;
    v_ref_key     text;
    v_status_id   uuid;
    v_priority_id uuid  := p_priority_id;
    v_doc         document;
    v_req         requirement;
BEGIN
    -- Resolve space key for ref_key generation
    SELECT key, ref_counter + 1 INTO v_space_key, v_seq
    FROM space WHERE id = p_space_id FOR UPDATE;

    UPDATE space SET ref_counter = v_seq WHERE id = p_space_id;

    v_ref_key := v_space_key || '-' || v_seq::text;

    -- Get default workflow status for tracker
    SELECT default_status_id INTO v_status_id
    FROM tracker WHERE id = p_tracker_id AND account_id = v_account_id;
    IF v_status_id IS NULL THEN
        SELECT id INTO v_status_id FROM workflow_status
        WHERE account_id = v_account_id AND is_default = true LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró un estado por defecto para el tracker' USING ERRCODE = 'QG422';
    END IF;

    -- Default to first priority if not specified
    IF v_priority_id IS NULL THEN
        SELECT id INTO v_priority_id FROM priority
        WHERE account_id = v_account_id AND is_default = true LIMIT 1;
    END IF;
    IF v_priority_id IS NULL THEN
        SELECT id INTO v_priority_id FROM priority
        WHERE account_id = v_account_id ORDER BY weight LIMIT 1;
    END IF;

    -- Create the base document
    v_doc := document_create(p_space_id, NULL, 'requirement', p_title, p_body_md);

    -- Assign ref_key
    UPDATE document SET ref_key = v_ref_key WHERE id = v_doc.id;

    -- Create requirement record
    INSERT INTO requirement (
        document_id, account_id, space_id,
        tracker_id, status_id, priority_id, category_id,
        reporter_id, created_at, updated_at
    ) VALUES (
        v_doc.id, v_account_id, p_space_id,
        p_tracker_id, v_status_id, v_priority_id, p_category_id,
        v_actor_id, now(), now()
    )
    RETURNING * INTO v_req;

    RETURN v_req;
END;
$$ LANGUAGE plpgsql;

-- Updates editable fields of a requirement.
CREATE OR REPLACE FUNCTION requirement_update(
    p_id          uuid,
    p_title       text     DEFAULT NULL,
    p_body_md     text     DEFAULT NULL,
    p_priority_id uuid     DEFAULT NULL,
    p_category_id uuid     DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_actor_id uuid := qg_actor_id();
BEGIN
    -- Update base document
    IF p_title IS NOT NULL OR p_body_md IS NOT NULL THEN
        PERFORM document_update(p_id, p_title, p_body_md);
    END IF;

    UPDATE requirement SET
        priority_id = coalesce(p_priority_id, priority_id),
        category_id = coalesce(p_category_id, category_id),
        updated_at  = now()
    WHERE document_id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Transitions a requirement to a new workflow state.
CREATE OR REPLACE FUNCTION requirement_transition(
    p_id           uuid,
    p_to_status_id uuid,
    p_comment      text DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_account_id   uuid  := current_setting('qg.account_id')::uuid;
    v_actor_id     uuid  := qg_actor_id();
    v_actor_type   text  := qg_actor_type();
    v_req          requirement;
    v_tracker_id   uuid;
    v_allowed      boolean;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requisito no encontrado' USING ERRCODE = 'QG404';
    END IF;

    IF v_req.status_id = p_to_status_id THEN
        RETURN; -- idempotent
    END IF;

    -- Check transition is defined (from current or wildcard)
    SELECT EXISTS (
        SELECT 1 FROM workflow_transition
        WHERE tracker_id = v_req.tracker_id
          AND (from_status_id = v_req.status_id OR from_status_id IS NULL)
          AND to_status_id = p_to_status_id
          AND v_actor_type::actor_type = ANY(allowed_actors)
    ) INTO v_allowed;

    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Transición no permitida desde el estado actual' USING ERRCODE = 'QG422';
    END IF;

    UPDATE requirement SET
        status_id  = p_to_status_id,
        updated_at = now()
    WHERE document_id = p_id;

    -- Add journal entry
    INSERT INTO journal (
        document_id, account_id, actor_type,
        actor_user_id, actor_agent_id,
        notes_md, details
    ) VALUES (
        p_id, v_account_id, v_actor_type::actor_type,
        CASE WHEN v_actor_type = 'user'  THEN v_actor_id ELSE NULL END,
        CASE WHEN v_actor_type = 'agent' THEN v_actor_id ELSE NULL END,
        p_comment,
        jsonb_build_array(jsonb_build_object(
            'type', 'status_changed',
            'from', v_req.status_id,
            'to',   p_to_status_id
        ))
    );
END;
$$ LANGUAGE plpgsql;

-- Reorders a requirement using fractional indexing.
-- Pass before_id and/or after_id (adjacent requirement document IDs in the same space+status).
CREATE OR REPLACE FUNCTION requirement_reorder(
    p_id        uuid,
    p_before_id uuid DEFAULT NULL,
    p_after_id  uuid DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_before_pos numeric;
    v_after_pos  numeric;
    v_new_pos    numeric;
BEGIN
    IF p_before_id IS NOT NULL THEN
        SELECT board_position INTO v_before_pos FROM requirement WHERE document_id = p_before_id;
    END IF;
    IF p_after_id IS NOT NULL THEN
        SELECT board_position INTO v_after_pos FROM requirement WHERE document_id = p_after_id;
    END IF;

    IF v_before_pos IS NULL AND v_after_pos IS NULL THEN
        -- No neighbors: keep current position (or reset to large value)
        RETURN;
    ELSIF v_before_pos IS NULL THEN
        v_new_pos := v_after_pos - 1000;
    ELSIF v_after_pos IS NULL THEN
        v_new_pos := v_before_pos + 1000;
    ELSE
        v_new_pos := (v_before_pos + v_after_pos) / 2;
    END IF;

    UPDATE requirement SET board_position = v_new_pos, updated_at = now()
    WHERE document_id = p_id;
END;
$$ LANGUAGE plpgsql;
