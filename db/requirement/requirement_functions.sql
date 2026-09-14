-- Appends an element to a jsonb array, ignoring NULL elements.
CREATE OR REPLACE FUNCTION qg_jsonb_push(p_arr jsonb, p_el jsonb) RETURNS jsonb AS $$
    SELECT CASE WHEN p_el IS NULL THEN coalesce(p_arr, '[]') ELSE coalesce(p_arr, '[]') || jsonb_build_array(p_el) END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION qg_jsonb_uuid_array(p jsonb) RETURNS uuid[] AS $$
    SELECT coalesce(array_agg(DISTINCT v::uuid), '{}')
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]' END) AS v
     WHERE v <> '';
$$ LANGUAGE sql IMMUTABLE;

-- Next board position at the bottom of a column.
CREATE OR REPLACE FUNCTION requirement_bottom_position(p_space_id uuid, p_status_id uuid, p_exclude uuid DEFAULT NULL)
RETURNS numeric AS $$
    SELECT coalesce(max(board_position), 0) + 1000
      FROM requirement
     WHERE space_id = p_space_id AND status_id = p_status_id
       AND document_id IS DISTINCT FROM p_exclude;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------
-- Creation
-- ---------------------------------------------------------------------------

-- Creates a complete requirement in one transaction. Payload keys:
--   tracker_id*, title*, body_md, priority_id, status_id, category_id, milestone_id,
--   parent_id, start_date, due_date, estimated_hours, lead_user_id, member_ids[],
--   label_ids[], attachment_ids[], links[{target_id, link_type}]
CREATE OR REPLACE FUNCTION requirement_create_full(p_space_id uuid, p jsonb) RETURNS uuid AS $$
DECLARE
    v_space       space;
    v_tracker     tracker;
    v_status      workflow_status;
    v_priority_id uuid;
    v_category_id uuid := nullif(p->>'category_id', '')::uuid;
    v_milestone_id uuid := nullif(p->>'milestone_id', '')::uuid;
    v_parent_id   uuid := nullif(p->>'parent_id', '')::uuid;
    v_lead        uuid := nullif(p->>'lead_user_id', '')::uuid;
    v_members     uuid[] := qg_jsonb_uuid_array(p->'member_ids');
    v_labels      uuid[] := qg_jsonb_uuid_array(p->'label_ids');
    v_atts        uuid[] := qg_jsonb_uuid_array(p->'attachment_ids');
    v_reporter    uuid := qg_responsible_user_id();
    v_seq         bigint;
    v_doc         document;
    v_m           uuid;
    v_count       int;
    v_link        jsonb;
    v_notify      uuid[];
BEGIN
    SELECT * INTO v_space FROM space WHERE id = p_space_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Espacio no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF v_reporter IS NULL THEN
        RAISE EXCEPTION 'Se requiere un usuario responsable para crear requerimientos' USING ERRCODE = 'QG422';
    END IF;
    IF coalesce(btrim(p->>'title'), '') = '' THEN
        RAISE EXCEPTION 'El título no puede estar vacío' USING ERRCODE = 'QG400';
    END IF;

    SELECT * INTO v_tracker FROM tracker
     WHERE id = nullif(p->>'tracker_id', '')::uuid AND account_id = v_space.account_id AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tracker inválido' USING ERRCODE = 'QG422';
    END IF;

    SELECT * INTO v_status FROM workflow_status
     WHERE account_id = v_space.account_id
       AND id = coalesce(nullif(p->>'status_id', '')::uuid, v_tracker.default_status_id,
                         (SELECT id FROM workflow_status WHERE account_id = v_space.account_id AND is_default LIMIT 1),
                         (SELECT id FROM workflow_status WHERE account_id = v_space.account_id ORDER BY ord LIMIT 1));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Estado inicial inválido' USING ERRCODE = 'QG422';
    END IF;

    SELECT id INTO v_priority_id FROM priority
     WHERE account_id = v_space.account_id
       AND id = coalesce(nullif(p->>'priority_id', '')::uuid,
                         (SELECT id FROM priority WHERE account_id = v_space.account_id AND is_default LIMIT 1),
                         (SELECT id FROM priority WHERE account_id = v_space.account_id ORDER BY weight LIMIT 1));
    IF v_priority_id IS NULL THEN
        RAISE EXCEPTION 'Prioridad inválida' USING ERRCODE = 'QG422';
    END IF;

    IF v_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category WHERE id = v_category_id AND space_id = p_space_id) THEN
        RAISE EXCEPTION 'Categoría inválida' USING ERRCODE = 'QG422';
    END IF;
    IF v_milestone_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM milestone WHERE id = v_milestone_id AND space_id = p_space_id) THEN
        RAISE EXCEPTION 'Hito inválido' USING ERRCODE = 'QG422';
    END IF;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM requirement WHERE document_id = v_parent_id AND space_id = p_space_id) THEN
        RAISE EXCEPTION 'Requerimiento padre inválido' USING ERRCODE = 'QG422';
    END IF;

    IF v_lead IS NOT NULL AND NOT (v_lead = ANY (v_members)) THEN
        v_members := v_members || v_lead;
    END IF;
    FOREACH v_m IN ARRAY v_members LOOP
        IF space_member_role(p_space_id, 'user', v_m) IS NULL THEN
            RAISE EXCEPTION 'Uno de los miembros no pertenece al espacio' USING ERRCODE = 'QG422';
        END IF;
    END LOOP;

    v_seq := v_space.ref_counter + 1;
    UPDATE space SET ref_counter = v_seq WHERE id = p_space_id;

    v_doc := document_create(p_space_id, NULL, 'requirement', p->>'title', coalesce(p->>'body_md', ''));
    UPDATE document SET ref_key = v_space.key || '-' || v_seq WHERE id = v_doc.id;

    INSERT INTO requirement (
        document_id, account_id, space_id, tracker_id, status_id, priority_id,
        category_id, milestone_id, parent_id, reporter_id, lead_user_id,
        start_date, due_date, estimated_hours, board_position, closed_at, member_count
    ) VALUES (
        v_doc.id, v_space.account_id, p_space_id, v_tracker.id, v_status.id, v_priority_id,
        v_category_id, v_milestone_id, v_parent_id, v_reporter, v_lead,
        nullif(p->>'start_date', '')::date, nullif(p->>'due_date', '')::date,
        nullif(p->>'estimated_hours', '')::numeric,
        requirement_bottom_position(p_space_id, v_status.id),
        CASE WHEN v_status.is_closed THEN now() END,
        cardinality(v_members)
    );

    INSERT INTO requirement_member (document_id, subject_type, subject_id, is_lead, added_by)
    SELECT v_doc.id, 'user', m, m IS NOT DISTINCT FROM v_lead, qg_actor_id() FROM unnest(v_members) m;

    INSERT INTO document_label (document_id, label_id, creator_id)
    SELECT v_doc.id, l.id, qg_actor_id()
      FROM label l
     WHERE l.id = ANY (v_labels)
       AND l.account_id = v_space.account_id
       AND (l.space_id IS NULL OR l.space_id = p_space_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> cardinality(v_labels) THEN
        RAISE EXCEPTION 'Alguna etiqueta no es válida para este espacio' USING ERRCODE = 'QG422';
    END IF;

    IF cardinality(v_atts) > 0 THEN
        UPDATE attachment
           SET document_id = v_doc.id, status = 'attached'
         WHERE id = ANY (v_atts) AND status = 'staged'
           AND staged_by = qg_actor_id() AND space_id = p_space_id
           AND document_id IS NULL;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count <> cardinality(v_atts) THEN
            RAISE EXCEPTION 'Algunos adjuntos no son válidos o ya fueron usados' USING ERRCODE = 'QG422';
        END IF;
    END IF;

    FOR v_link IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'links') = 'array' THEN p->'links' ELSE '[]' END) LOOP
        INSERT INTO document_link (source_id, target_id, link_type, creator_id)
        SELECT v_doc.id, d.id, coalesce(nullif(v_link->>'link_type', ''), 'relates')::link_type, qg_actor_id()
          FROM document d
         WHERE d.id = (v_link->>'target_id')::uuid AND d.account_id = v_space.account_id AND NOT d.is_archived
        ON CONFLICT DO NOTHING;
    END LOOP;

    PERFORM journal_add(v_doc.id, 'change', NULL, '[{"type":"created"}]');

    PERFORM watcher_add(v_doc.id, 'user', v_reporter);
    FOREACH v_m IN ARRAY v_members LOOP
        PERFORM watcher_add(v_doc.id, 'user', v_m);
    END LOOP;

    IF cardinality(v_members) > 0 THEN
        v_notify := v_members;
        PERFORM notification_fanout(v_doc.id, 'member_added', '{}', NULL, '{}', v_notify);
    END IF;

    PERFORM requirement_readiness_evaluate(v_doc.id);

    RETURN v_doc.id;
END;
$$ LANGUAGE plpgsql;

-- Legacy entry point kept for API/MCP compatibility.
CREATE OR REPLACE FUNCTION requirement_create(
    p_space_id    uuid,
    p_tracker_id  uuid,
    p_title       text,
    p_body_md     text DEFAULT '',
    p_priority_id uuid DEFAULT NULL,
    p_category_id uuid DEFAULT NULL
) RETURNS requirement AS $$
DECLARE
    v_id  uuid;
    v_req requirement;
BEGIN
    v_id := requirement_create_full(p_space_id, jsonb_build_object(
        'tracker_id', p_tracker_id, 'title', p_title, 'body_md', p_body_md,
        'priority_id', p_priority_id, 'category_id', p_category_id));
    SELECT * INTO v_req FROM requirement WHERE document_id = v_id;
    RETURN v_req;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Editing
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS requirement_update(uuid, text, text, uuid, uuid);

-- Applies a partial update. A key present with null clears the field.
-- Every effective change is recorded in the journal.
CREATE OR REPLACE FUNCTION requirement_patch(p_id uuid, p jsonb, p_version int DEFAULT NULL) RETURNS void AS $$
DECLARE
    v_req      requirement;
    v_new      requirement;
    v_doc      document;
    v_closed   boolean;
    v_details  jsonb := '[]';
    v_title    text;
    v_body     text;
    v_uuid     uuid;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    SELECT * INTO v_doc FROM document WHERE id = p_id;
    SELECT is_closed INTO v_closed FROM workflow_status WHERE id = v_req.status_id;

    p := coalesce(p, '{}') - 'version';
    IF p = '{}' THEN
        RETURN;
    END IF;
    IF v_closed THEN
        RAISE EXCEPTION 'El requerimiento está cerrado; reábrelo para editarlo' USING ERRCODE = 'QG422';
    END IF;
    IF p_version IS NOT NULL AND p_version <> v_doc.version THEN
        RAISE EXCEPTION 'Conflicto de versión: alguien modificó este requerimiento (versión actual %)', v_doc.version
            USING ERRCODE = 'QG409';
    END IF;

    v_new := v_req;

    -- Title and description live in the document.
    IF p ? 'title' OR p ? 'body_md' THEN
        v_title := CASE WHEN p ? 'title' THEN btrim(coalesce(p->>'title', '')) ELSE v_doc.title END;
        v_body  := CASE WHEN p ? 'body_md' THEN coalesce(p->>'body_md', '') ELSE v_doc.body_md END;
        IF v_title = '' THEN
            RAISE EXCEPTION 'El título no puede estar vacío' USING ERRCODE = 'QG400';
        END IF;
        IF v_title IS DISTINCT FROM v_doc.title OR v_body IS DISTINCT FROM v_doc.body_md THEN
            PERFORM document_update(p_id, v_title, v_body, NULL);
            v_details := qg_jsonb_push(v_details, journal_attr('title', v_doc.title, v_title));
            IF v_body IS DISTINCT FROM v_doc.body_md THEN
                v_details := qg_jsonb_push(v_details, jsonb_build_object(
                    'type', 'attr', 'property', 'body_md',
                    'from_version', v_doc.version, 'to_version', v_doc.version + 1));
            END IF;
        END IF;
    END IF;

    IF p ? 'tracker_id' THEN
        SELECT id INTO v_uuid FROM tracker WHERE id = nullif(p->>'tracker_id', '')::uuid AND account_id = v_req.account_id;
        IF v_uuid IS NULL THEN RAISE EXCEPTION 'Tracker inválido' USING ERRCODE = 'QG422'; END IF;
        v_new.tracker_id := v_uuid;
    END IF;

    IF p ? 'priority_id' THEN
        SELECT id INTO v_uuid FROM priority WHERE id = nullif(p->>'priority_id', '')::uuid AND account_id = v_req.account_id;
        IF v_uuid IS NULL THEN RAISE EXCEPTION 'Prioridad inválida' USING ERRCODE = 'QG422'; END IF;
        v_new.priority_id := v_uuid;
    END IF;

    IF p ? 'category_id' THEN
        v_new.category_id := nullif(p->>'category_id', '')::uuid;
        IF v_new.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM category WHERE id = v_new.category_id AND space_id = v_req.space_id) THEN
            RAISE EXCEPTION 'Categoría inválida' USING ERRCODE = 'QG422';
        END IF;
    END IF;

    IF p ? 'milestone_id' THEN
        v_new.milestone_id := nullif(p->>'milestone_id', '')::uuid;
        IF v_new.milestone_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM milestone WHERE id = v_new.milestone_id AND space_id = v_req.space_id) THEN
            RAISE EXCEPTION 'Hito inválido' USING ERRCODE = 'QG422';
        END IF;
    END IF;

    IF p ? 'parent_id' THEN
        v_new.parent_id := nullif(p->>'parent_id', '')::uuid;
        IF v_new.parent_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM requirement WHERE document_id = v_new.parent_id AND space_id = v_req.space_id) THEN
                RAISE EXCEPTION 'Requerimiento padre inválido' USING ERRCODE = 'QG422';
            END IF;
            IF EXISTS (
                WITH RECURSIVE anc AS (
                    SELECT document_id, parent_id FROM requirement WHERE document_id = v_new.parent_id
                    UNION
                    SELECT r.document_id, r.parent_id FROM requirement r JOIN anc ON r.document_id = anc.parent_id
                )
                SELECT 1 FROM anc WHERE document_id = p_id
            ) THEN
                RAISE EXCEPTION 'Ese padre crearía un ciclo' USING ERRCODE = 'QG422';
            END IF;
        END IF;
    END IF;

    IF p ? 'done_ratio' THEN
        v_new.done_ratio := coalesce((p->>'done_ratio')::int, 0);
    END IF;
    IF p ? 'estimated_hours' THEN
        v_new.estimated_hours := nullif(p->>'estimated_hours', '')::numeric;
    END IF;
    IF p ? 'spent_hours' THEN
        v_new.spent_hours := coalesce(nullif(p->>'spent_hours', '')::numeric, 0);
    END IF;
    IF p ? 'start_date' THEN
        v_new.start_date := nullif(p->>'start_date', '')::date;
    END IF;
    IF p ? 'due_date' THEN
        v_new.due_date := nullif(p->>'due_date', '')::date;
    END IF;

    v_details := qg_jsonb_push(v_details, journal_attr('tracker_id',      v_req.tracker_id,      v_new.tracker_id));
    v_details := qg_jsonb_push(v_details, journal_attr('priority_id',     v_req.priority_id,     v_new.priority_id));
    v_details := qg_jsonb_push(v_details, journal_attr('category_id',     v_req.category_id,     v_new.category_id));
    v_details := qg_jsonb_push(v_details, journal_attr('milestone_id',    v_req.milestone_id,    v_new.milestone_id));
    v_details := qg_jsonb_push(v_details, journal_attr('parent_id',       v_req.parent_id,       v_new.parent_id));
    v_details := qg_jsonb_push(v_details, journal_attr('done_ratio',      v_req.done_ratio,      v_new.done_ratio));
    v_details := qg_jsonb_push(v_details, journal_attr('estimated_hours', v_req.estimated_hours, v_new.estimated_hours));
    v_details := qg_jsonb_push(v_details, journal_attr('spent_hours',     v_req.spent_hours,     v_new.spent_hours));
    v_details := qg_jsonb_push(v_details, journal_attr('start_date',      v_req.start_date,      v_new.start_date));
    v_details := qg_jsonb_push(v_details, journal_attr('due_date',        v_req.due_date,        v_new.due_date));

    IF jsonb_array_length(v_details) = 0 THEN
        RETURN;
    END IF;

    UPDATE requirement SET
        tracker_id      = v_new.tracker_id,
        priority_id     = v_new.priority_id,
        category_id     = v_new.category_id,
        milestone_id    = v_new.milestone_id,
        parent_id       = v_new.parent_id,
        done_ratio      = v_new.done_ratio,
        estimated_hours = v_new.estimated_hours,
        spent_hours     = v_new.spent_hours,
        start_date      = v_new.start_date,
        due_date        = v_new.due_date,
        updated_at      = now()
    WHERE document_id = p_id;

    PERFORM journal_add(p_id, 'change', NULL, v_details);

    IF v_new.due_date IS DISTINCT FROM v_req.due_date AND v_new.due_date IS NOT NULL THEN
        PERFORM notification_fanout(p_id, 'due_date_changed', jsonb_build_object('due_date', v_new.due_date));
    END IF;

    PERFORM requirement_readiness_evaluate(p_id);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Workflow
-- ---------------------------------------------------------------------------

-- Statuses the current actor may move the requirement to.
CREATE OR REPLACE FUNCTION requirement_allowed_statuses(p_id uuid) RETURNS TABLE (status_id uuid) AS $$
DECLARE
    v_req  requirement;
    v_role member_role;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_id;
    v_role := CASE WHEN qg_actor_type() = 'system' THEN 'admin'::member_role ELSE qg_actor_space_role(v_req.space_id) END;
    RETURN QUERY
    SELECT DISTINCT wt.to_status_id
      FROM workflow_transition wt
     WHERE wt.tracker_id = v_req.tracker_id
       AND (wt.from_status_id = v_req.status_id OR wt.from_status_id IS NULL)
       AND (qg_actor_type() = 'system'
            OR (qg_actor_type()::actor_type = ANY (wt.allowed_actors) AND v_role = ANY (wt.allowed_roles)))
    UNION
    SELECT v_req.status_id;
END;
$$ LANGUAGE plpgsql STABLE;

DROP FUNCTION IF EXISTS requirement_transition(uuid, uuid, text);

CREATE OR REPLACE FUNCTION requirement_transition(
    p_id           uuid,
    p_to_status_id uuid,
    p_comment      text DEFAULT NULL,
    p_resolution   text DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_req   requirement;
    v_from  workflow_status;
    v_to    workflow_status;
    v_tr    workflow_transition;
    v_role  member_role;
    v_actor text := qg_actor_type();
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF v_req.status_id = p_to_status_id THEN
        RETURN;
    END IF;

    SELECT * INTO v_from FROM workflow_status WHERE id = v_req.status_id;
    SELECT * INTO v_to FROM workflow_status WHERE id = p_to_status_id AND account_id = v_req.account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Estado destino inválido' USING ERRCODE = 'QG422';
    END IF;

    SELECT * INTO v_tr FROM workflow_transition
     WHERE tracker_id = v_req.tracker_id
       AND (from_status_id = v_req.status_id OR from_status_id IS NULL)
       AND to_status_id = p_to_status_id
     ORDER BY from_status_id NULLS LAST
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transición no permitida de «%» a «%»', v_from.name, v_to.name USING ERRCODE = 'QG422';
    END IF;

    IF v_actor <> 'system' THEN
        v_role := qg_actor_space_role(v_req.space_id);
        IF NOT (v_actor::actor_type = ANY (v_tr.allowed_actors)) THEN
            RAISE EXCEPTION 'Esta transición no está permitida para %', v_actor USING ERRCODE = 'QG403';
        END IF;
        IF v_role IS NULL OR NOT (v_role = ANY (v_tr.allowed_roles)) THEN
            RAISE EXCEPTION 'Tu rol no permite mover a «%»', v_to.name USING ERRCODE = 'QG403';
        END IF;
    END IF;

    IF v_tr.requires_comment AND coalesce(btrim(p_comment), '') = '' THEN
        RAISE EXCEPTION 'Mover a «%» requiere un comentario', v_to.name USING ERRCODE = 'QG422';
    END IF;
    IF v_tr.requires_assignee AND v_req.lead_user_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM requirement_member WHERE document_id = p_id) THEN
        RAISE EXCEPTION 'Mover a «%» requiere un responsable asignado', v_to.name USING ERRCODE = 'QG422';
    END IF;
    IF v_tr.requires_readiness AND coalesce(v_req.readiness_score, 0) < 100 THEN
        RAISE EXCEPTION 'Mover a «%» requiere cumplir la Definition of Ready', v_to.name USING ERRCODE = 'QG422';
    END IF;
    IF v_to.requires_resolution AND coalesce(btrim(p_resolution), '') = '' THEN
        RAISE EXCEPTION 'Mover a «%» requiere indicar la resolución', v_to.name USING ERRCODE = 'QG422';
    END IF;

    UPDATE requirement SET
        status_id      = p_to_status_id,
        updated_at     = now(),
        board_position = requirement_bottom_position(v_req.space_id, p_to_status_id, p_id),
        closed_at      = CASE WHEN v_to.is_closed THEN coalesce(v_req.closed_at, now()) END,
        reopened_count = v_req.reopened_count + CASE WHEN v_from.is_closed AND NOT v_to.is_closed THEN 1 ELSE 0 END,
        resolution     = coalesce(nullif(btrim(p_resolution), ''), CASE WHEN v_to.is_closed OR v_to.requires_resolution THEN v_req.resolution END)
    WHERE document_id = p_id;

    PERFORM journal_add(p_id, 'change', p_comment, jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'type', 'status_changed', 'property', 'status_id',
        'from', v_req.status_id, 'to', p_to_status_id,
        'resolution', nullif(btrim(p_resolution), '')))));

    PERFORM notification_fanout(p_id, 'status_changed',
        jsonb_build_object('from', v_from.name, 'to', v_to.name));

    PERFORM requirement_readiness_evaluate(p_id);
END;
$$ LANGUAGE plpgsql;

-- Reorders using fractional indexing inside the requirement's current column.
-- before_id = card above, after_id = card below. Returns the new position.
DROP FUNCTION IF EXISTS requirement_reorder(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION requirement_reorder(
    p_id        uuid,
    p_before_id uuid DEFAULT NULL,
    p_after_id  uuid DEFAULT NULL
) RETURNS numeric AS $$
DECLARE
    v_req        requirement;
    v_before_pos numeric;
    v_after_pos  numeric;
    v_new_pos    numeric;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento no encontrado' USING ERRCODE = 'QG404';
    END IF;

    FOR i IN 1..2 LOOP
        v_before_pos := NULL;
        v_after_pos := NULL;
        IF p_before_id IS NOT NULL AND p_before_id <> p_id THEN
            SELECT board_position INTO v_before_pos FROM requirement
             WHERE document_id = p_before_id AND space_id = v_req.space_id AND status_id = v_req.status_id;
        END IF;
        IF p_after_id IS NOT NULL AND p_after_id <> p_id THEN
            SELECT board_position INTO v_after_pos FROM requirement
             WHERE document_id = p_after_id AND space_id = v_req.space_id AND status_id = v_req.status_id;
        END IF;

        IF v_before_pos IS NULL AND v_after_pos IS NULL THEN
            RETURN v_req.board_position;
        END IF;

        -- Rebalance the column when neighbours are too close (or inverted by concurrent moves).
        IF v_before_pos IS NOT NULL AND v_after_pos IS NOT NULL AND (v_after_pos - v_before_pos) < 0.000001 AND i = 1 THEN
            UPDATE requirement r SET board_position = s.rn * 1000
              FROM (SELECT document_id, row_number() OVER (ORDER BY board_position, created_at) AS rn
                      FROM requirement WHERE space_id = v_req.space_id AND status_id = v_req.status_id) s
             WHERE r.document_id = s.document_id;
            CONTINUE;
        END IF;
        EXIT;
    END LOOP;

    IF v_before_pos IS NULL THEN
        v_new_pos := v_after_pos - 1000;
    ELSIF v_after_pos IS NULL THEN
        v_new_pos := v_before_pos + 1000;
    ELSE
        v_new_pos := round((v_before_pos + v_after_pos) / 2, 10);
    END IF;

    UPDATE requirement SET board_position = v_new_pos WHERE document_id = p_id;
    RETURN v_new_pos;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS requirement_move(uuid, uuid, uuid, uuid);
-- Moves a requirement: optional transition plus reorder, atomically.
CREATE OR REPLACE FUNCTION requirement_move(
    p_id           uuid,
    p_to_status_id uuid DEFAULT NULL,
    p_before_id    uuid DEFAULT NULL,
    p_after_id     uuid DEFAULT NULL,
    p_comment      text DEFAULT NULL,
    p_resolution   text DEFAULT NULL
) RETURNS numeric AS $$
BEGIN
    PERFORM 1 FROM requirement WHERE document_id = p_id FOR UPDATE;
    IF p_to_status_id IS NOT NULL THEN
        PERFORM requirement_transition(p_id, p_to_status_id, p_comment, p_resolution);
    END IF;
    RETURN requirement_reorder(p_id, p_before_id, p_after_id);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Members and lead
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION requirement_member_add(p_id uuid, p_user_id uuid, p_notify boolean DEFAULT true)
RETURNS boolean AS $$
DECLARE
    v_req  requirement;
    v_name text;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF space_member_role(v_req.space_id, 'user', p_user_id) IS NULL THEN
        RAISE EXCEPTION 'El usuario no es miembro del espacio' USING ERRCODE = 'QG422';
    END IF;

    INSERT INTO requirement_member (document_id, subject_type, subject_id, is_lead, added_by)
    VALUES (p_id, 'user', p_user_id, p_user_id IS NOT DISTINCT FROM v_req.lead_user_id, qg_actor_id())
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE requirement SET member_count = (SELECT count(*) FROM requirement_member WHERE document_id = p_id),
                           updated_at = now()
     WHERE document_id = p_id;

    SELECT display_name INTO v_name FROM app_user WHERE id = p_user_id;
    PERFORM journal_add(p_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'member_added', 'user_id', p_user_id, 'user_name', v_name)));
    PERFORM watcher_add(p_id, 'user', p_user_id);
    IF p_notify THEN
        PERFORM notification_fanout(p_id, 'member_added', '{}', NULL, '{}', ARRAY[p_user_id]);
    END IF;
    PERFORM requirement_readiness_evaluate(p_id);
    RETURN true;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION requirement_member_remove(p_id uuid, p_user_id uuid) RETURNS boolean AS $$
DECLARE
    v_name text;
BEGIN
    PERFORM 1 FROM requirement WHERE document_id = p_id FOR UPDATE;
    DELETE FROM requirement_member WHERE document_id = p_id AND subject_type = 'user' AND subject_id = p_user_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    UPDATE requirement SET
        member_count = (SELECT count(*) FROM requirement_member WHERE document_id = p_id),
        lead_user_id = CASE WHEN lead_user_id = p_user_id THEN NULL ELSE lead_user_id END,
        updated_at   = now()
     WHERE document_id = p_id;

    SELECT display_name INTO v_name FROM app_user WHERE id = p_user_id;
    PERFORM journal_add(p_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'member_removed', 'user_id', p_user_id, 'user_name', v_name)));
    PERFORM requirement_readiness_evaluate(p_id);
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Sets (or clears) the lead. The lead is always also a member.
CREATE OR REPLACE FUNCTION requirement_set_lead(p_id uuid, p_user_id uuid) RETURNS void AS $$
DECLARE
    v_req  requirement;
    v_name text;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF v_req.lead_user_id IS NOT DISTINCT FROM p_user_id THEN
        RETURN;
    END IF;

    IF p_user_id IS NOT NULL THEN
        PERFORM requirement_member_add(p_id, p_user_id, false);
    END IF;

    UPDATE requirement_member SET is_lead = false WHERE document_id = p_id AND is_lead;
    UPDATE requirement SET lead_user_id = p_user_id, updated_at = now() WHERE document_id = p_id;
    IF p_user_id IS NOT NULL THEN
        UPDATE requirement_member SET is_lead = true
         WHERE document_id = p_id AND subject_type = 'user' AND subject_id = p_user_id;
    END IF;

    SELECT display_name INTO v_name FROM app_user WHERE id = p_user_id;
    PERFORM journal_add(p_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'lead_changed', 'from', v_req.lead_user_id, 'to', p_user_id, 'user_name', v_name)));
    IF p_user_id IS NOT NULL THEN
        PERFORM notification_fanout(p_id, 'assigned_lead', '{}', NULL, '{}', ARRAY[p_user_id]);
    END IF;
    PERFORM requirement_readiness_evaluate(p_id);
END;
$$ LANGUAGE plpgsql;

-- Replaces the member list atomically.
CREATE OR REPLACE FUNCTION requirement_members_set(p_id uuid, p_user_ids uuid[], p_lead_user_id uuid DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_u uuid;
BEGIN
    PERFORM 1 FROM requirement WHERE document_id = p_id FOR UPDATE;
    FOR v_u IN
        SELECT subject_id FROM requirement_member
         WHERE document_id = p_id AND subject_type = 'user'
           AND NOT (subject_id = ANY (coalesce(p_user_ids, '{}')))
    LOOP
        PERFORM requirement_member_remove(p_id, v_u);
    END LOOP;
    FOREACH v_u IN ARRAY coalesce(p_user_ids, '{}') LOOP
        PERFORM requirement_member_add(p_id, v_u);
    END LOOP;
    PERFORM requirement_set_lead(p_id, p_lead_user_id);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Labels and time
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION document_label_add(p_document_id uuid, p_label_id uuid) RETURNS void AS $$
DECLARE
    v_doc   document;
    v_label label;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_document_id;
    SELECT * INTO v_label FROM label
     WHERE id = p_label_id AND account_id = v_doc.account_id
       AND (space_id IS NULL OR space_id = v_doc.space_id) AND NOT is_archived;
    IF v_label.id IS NULL THEN
        RAISE EXCEPTION 'Etiqueta no válida para este espacio' USING ERRCODE = 'QG422';
    END IF;
    INSERT INTO document_label (document_id, label_id, creator_id)
    VALUES (p_document_id, p_label_id, qg_actor_id())
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
        UPDATE label SET usage_count = usage_count + 1 WHERE id = p_label_id;
        PERFORM journal_add(p_document_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
            'type', 'label_added', 'label_id', p_label_id, 'label_name', v_label.name, 'color', v_label.color)));
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION document_label_remove(p_document_id uuid, p_label_id uuid) RETURNS void AS $$
DECLARE
    v_label label;
BEGIN
    DELETE FROM document_label WHERE document_id = p_document_id AND label_id = p_label_id;
    IF FOUND THEN
        SELECT * INTO v_label FROM label WHERE id = p_label_id;
        UPDATE label SET usage_count = greatest(usage_count - 1, 0) WHERE id = p_label_id;
        PERFORM journal_add(p_document_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
            'type', 'label_removed', 'label_id', p_label_id, 'label_name', v_label.name, 'color', v_label.color)));
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION time_entry_add(p_id uuid, p_hours numeric, p_spent_on date DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid AS $$
DECLARE
    v_user uuid := qg_responsible_user_id();
    v_eid  uuid;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Se requiere un usuario' USING ERRCODE = 'QG422';
    END IF;
    INSERT INTO time_entry (document_id, user_id, hours, spent_on, note)
    VALUES (p_id, v_user, p_hours, coalesce(p_spent_on, current_date), nullif(btrim(p_note), ''))
    RETURNING id INTO v_eid;
    UPDATE requirement SET spent_hours = spent_hours + p_hours, updated_at = now() WHERE document_id = p_id;
    PERFORM journal_add(p_id, 'change', p_note, jsonb_build_array(jsonb_build_object(
        'type', 'time_logged', 'hours', p_hours, 'spent_on', coalesce(p_spent_on, current_date))));
    RETURN v_eid;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION time_entry_delete(p_entry_id uuid, p_is_moderator boolean DEFAULT false) RETURNS void AS $$
DECLARE
    v_e time_entry;
BEGIN
    DELETE FROM time_entry
     WHERE id = p_entry_id AND (p_is_moderator OR user_id = qg_responsible_user_id())
    RETURNING * INTO v_e;
    IF v_e.id IS NULL THEN
        RAISE EXCEPTION 'Registro de tiempo no encontrado' USING ERRCODE = 'QG404';
    END IF;
    UPDATE requirement SET spent_hours = greatest(spent_hours - v_e.hours, 0), updated_at = now()
     WHERE document_id = v_e.document_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Clone, archive, move between spaces, promote notes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION requirement_clone(p_id uuid, p_title text DEFAULT NULL) RETURNS uuid AS $$
DECLARE
    v_src  v_requirement;
    v_new  uuid;
BEGIN
    SELECT * INTO v_src FROM v_requirement WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    v_new := requirement_create_full(v_src.space_id, jsonb_build_object(
        'tracker_id', v_src.tracker_id,
        'title', coalesce(nullif(btrim(p_title), ''), v_src.title || ' (copia)'),
        'body_md', v_src.body_md,
        'priority_id', v_src.priority_id,
        'category_id', v_src.category_id,
        'milestone_id', v_src.milestone_id,
        'parent_id', v_src.parent_id,
        'estimated_hours', v_src.estimated_hours,
        'label_ids', (SELECT coalesce(jsonb_agg(label_id), '[]') FROM document_label WHERE document_id = p_id),
        'links', jsonb_build_array(jsonb_build_object('target_id', p_id, 'link_type', 'relates'))
    ));
    PERFORM journal_add(v_new, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'cloned_from', 'ref_key', v_src.ref_key, 'document_id', p_id)));
    RETURN v_new;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION document_archive(p_id uuid, p_archived boolean) RETURNS void AS $$
DECLARE
    v_doc document;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF v_doc.is_archived = p_archived THEN
        RETURN;
    END IF;
    IF NOT p_archived AND EXISTS (
        SELECT 1 FROM document
         WHERE space_id = v_doc.space_id AND NOT is_archived AND id <> p_id
           AND coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce(v_doc.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
           AND slug = v_doc.slug
    ) THEN
        UPDATE document SET slug = slug || '-' || to_hex(floor(random() * 65536)::int) WHERE id = p_id;
    END IF;
    UPDATE document SET is_archived = p_archived,
                        archived_at = CASE WHEN p_archived THEN now() END,
                        updater_id = qg_responsible_user_id(), updated_at = now()
     WHERE id = p_id;
    -- archiving a folder archives its content
    IF p_archived THEN
        UPDATE document SET is_archived = true, archived_at = now()
         WHERE path LIKE '%/' || p_id::text || '/%' AND NOT is_archived;
    END IF;
    PERFORM journal_add(p_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', CASE WHEN p_archived THEN 'archived' ELSE 'restored' END)));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION requirement_move_space(p_id uuid, p_space_id uuid) RETURNS text AS $$
DECLARE
    v_req    requirement;
    v_doc    document;
    v_target space;
    v_seq    bigint;
    v_ref    text;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF v_req.space_id = p_space_id THEN
        RETURN (SELECT ref_key FROM document WHERE id = p_id);
    END IF;
    SELECT * INTO v_target FROM space WHERE id = p_space_id AND account_id = v_req.account_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Espacio destino no encontrado' USING ERRCODE = 'QG404';
    END IF;
    SELECT * INTO v_doc FROM document WHERE id = p_id;

    v_seq := v_target.ref_counter + 1;
    v_ref := v_target.key || '-' || v_seq;
    UPDATE space SET ref_counter = v_seq WHERE id = p_space_id;

    UPDATE document SET space_id = p_space_id, ref_key = v_ref, parent_id = NULL, path = '', depth = 0,
                        slug = CASE WHEN EXISTS (SELECT 1 FROM document WHERE space_id = p_space_id AND slug = v_doc.slug
                                                  AND parent_id IS NULL AND NOT is_archived)
                                    THEN v_doc.slug || '-' || to_hex(floor(random() * 65536)::int) ELSE v_doc.slug END
     WHERE id = p_id;

    UPDATE requirement SET space_id = p_space_id, category_id = NULL, milestone_id = NULL, parent_id = NULL,
                           board_position = requirement_bottom_position(p_space_id, v_req.status_id, p_id),
                           updated_at = now()
     WHERE document_id = p_id;
    UPDATE requirement SET parent_id = NULL WHERE parent_id = p_id;
    UPDATE attachment SET space_id = p_space_id WHERE document_id = p_id;

    DELETE FROM document_label dl USING label l
     WHERE dl.document_id = p_id AND l.id = dl.label_id AND l.space_id IS NOT NULL;
    DELETE FROM requirement_member m
     WHERE m.document_id = p_id AND m.subject_type = 'user'
       AND space_member_role(p_space_id, 'user', m.subject_id) IS NULL;
    UPDATE requirement SET
        member_count = (SELECT count(*) FROM requirement_member WHERE document_id = p_id),
        lead_user_id = CASE WHEN EXISTS (SELECT 1 FROM requirement_member WHERE document_id = p_id AND subject_id = lead_user_id)
                            THEN lead_user_id END
     WHERE document_id = p_id;

    PERFORM journal_add(p_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'moved_space', 'from_ref', v_doc.ref_key, 'to_ref', v_ref,
        'from_space_id', v_req.space_id, 'to_space_id', p_space_id)));
    RETURN v_ref;
END;
$$ LANGUAGE plpgsql;

-- Turns a note/wiki into a requirement keeping id, history, attachments and links.
CREATE OR REPLACE FUNCTION document_promote(p_id uuid, p_tracker_id uuid, p_priority_id uuid DEFAULT NULL) RETURNS text AS $$
DECLARE
    v_doc    document;
    v_space  space;
    v_status uuid;
    v_prio   uuid;
    v_seq    bigint;
    v_ref    text;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_id AND NOT is_archived FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF v_doc.doc_type NOT IN ('note', 'wiki') THEN
        RAISE EXCEPTION 'Solo notas y wikis pueden convertirse en requerimiento' USING ERRCODE = 'QG422';
    END IF;
    SELECT * INTO v_space FROM space WHERE id = v_doc.space_id FOR UPDATE;

    SELECT coalesce(t.default_status_id,
                    (SELECT id FROM workflow_status WHERE account_id = v_space.account_id AND is_default LIMIT 1))
      INTO v_status
      FROM tracker t WHERE t.id = p_tracker_id AND t.account_id = v_space.account_id AND t.is_active;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Tracker inválido' USING ERRCODE = 'QG422';
    END IF;
    SELECT id INTO v_prio FROM priority
     WHERE account_id = v_space.account_id
       AND id = coalesce(p_priority_id, (SELECT id FROM priority WHERE account_id = v_space.account_id AND is_default LIMIT 1));

    v_seq := v_space.ref_counter + 1;
    v_ref := v_space.key || '-' || v_seq;
    UPDATE space SET ref_counter = v_seq WHERE id = v_space.id;

    UPDATE document SET doc_type = 'requirement', ref_key = v_ref, parent_id = NULL, updated_at = now() WHERE id = p_id;
    INSERT INTO requirement (document_id, account_id, space_id, tracker_id, status_id, priority_id, reporter_id, board_position)
    VALUES (p_id, v_space.account_id, v_space.id, p_tracker_id, v_status, v_prio,
            coalesce(v_doc.creator_id, qg_responsible_user_id()),
            requirement_bottom_position(v_space.id, v_status));

    PERFORM watcher_add(p_id, 'user', coalesce(v_doc.creator_id, qg_responsible_user_id()));
    PERFORM journal_add(p_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'promoted', 'from_type', v_doc.doc_type, 'ref_key', v_ref)));
    PERFORM requirement_readiness_evaluate(p_id);
    RETURN v_ref;
END;
$$ LANGUAGE plpgsql;
