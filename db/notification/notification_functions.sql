CREATE OR REPLACE FUNCTION watcher_add(p_document_id uuid, p_subject_type actor_type, p_subject_id uuid)
RETURNS void AS $$
    INSERT INTO watcher (document_id, subject_type, subject_id)
    VALUES (p_document_id, p_subject_type, p_subject_id)
    ON CONFLICT DO NOTHING;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION watcher_remove(p_document_id uuid, p_subject_type actor_type, p_subject_id uuid)
RETURNS void AS $$
    DELETE FROM watcher
     WHERE document_id = p_document_id AND subject_type = p_subject_type AND subject_id = p_subject_id;
$$ LANGUAGE sql;

-- Publishes a lightweight event for SSE subscribers. pg_notify collapses identical
-- payloads inside a transaction, so row triggers can call it freely.
CREATE OR REPLACE FUNCTION qg_emit_event(p_type text, p_space_id uuid, p_document_id uuid DEFAULT NULL, p_extra jsonb DEFAULT '{}')
RETURNS void AS $$
BEGIN
    PERFORM pg_notify('qg_events', (jsonb_build_object(
        'type', p_type,
        'space_id', p_space_id,
        'document_id', p_document_id
    ) || coalesce(p_extra, '{}'))::text);
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS notification_fanout(uuid, text, jsonb, uuid, uuid[], uuid[]);

-- Inserts notifications for the people involved in a document and signals them.
--   recipients = watchers ∪ members ∪ lead ∪ reporter ∪ p_extra_users
--   (or exactly p_only_users when given), minus the actor, restricted to users
--   who can still read the space.
CREATE OR REPLACE FUNCTION notification_fanout(
    p_document_id uuid,
    p_event_type  text,
    p_payload     jsonb  DEFAULT '{}',
    p_journal_id  uuid   DEFAULT NULL,
    p_extra_users uuid[] DEFAULT '{}',
    p_only_users  uuid[] DEFAULT NULL,
    p_exclude_users uuid[] DEFAULT '{}'
) RETURNS int AS $$
DECLARE
    v_doc        document;
    v_actor_type text := qg_actor_type();
    v_actor_id   uuid := qg_actor_id();
    v_users      uuid[];
    v_count      int;
    v_payload    jsonb;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_document_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF p_only_users IS NOT NULL THEN
        v_users := p_only_users;
    ELSE
        SELECT array_agg(DISTINCT u) INTO v_users FROM (
            SELECT subject_id AS u FROM watcher
             WHERE document_id = p_document_id AND subject_type = 'user'
            UNION
            SELECT subject_id FROM requirement_member
             WHERE document_id = p_document_id AND subject_type = 'user'
            UNION
            SELECT lead_user_id FROM requirement WHERE document_id = p_document_id AND lead_user_id IS NOT NULL
            UNION
            SELECT reporter_id FROM requirement WHERE document_id = p_document_id
            UNION
            SELECT unnest(coalesce(p_extra_users, '{}'))
        ) s WHERE u IS NOT NULL;
    END IF;

    v_payload := coalesce(p_payload, '{}') || jsonb_build_object(
        'title', v_doc.title,
        'ref_key', v_doc.ref_key,
        'doc_type', v_doc.doc_type,
        'space_id', v_doc.space_id
    );

    WITH ins AS (
        INSERT INTO notification (account_id, user_id, document_id, journal_id, event_type,
                                  actor_type, actor_id, payload)
        SELECT v_doc.account_id, u.id, p_document_id, p_journal_id, p_event_type,
               CASE WHEN v_actor_type IN ('user', 'agent') THEN v_actor_type ELSE 'system' END::actor_type,
               v_actor_id, v_payload
          FROM app_user u
         WHERE u.id = ANY (coalesce(v_users, '{}'))
           AND u.account_id = v_doc.account_id
           AND u.status = 'active'
           AND NOT (v_actor_type = 'user' AND u.id = v_actor_id)
           AND NOT (u.id = ANY (coalesce(p_exclude_users, '{}')))
           AND space_member_role(v_doc.space_id, 'user', u.id) IS NOT NULL
        RETURNING user_id
    )
    SELECT count(*), array_agg(user_id) INTO v_count, v_users FROM ins;

    IF v_count > 0 THEN
        PERFORM pg_notify('qg_events', jsonb_build_object(
            'type', 'notification',
            'space_id', v_doc.space_id,
            'document_id', p_document_id,
            'user_ids', to_jsonb(v_users)
        )::text);
    END IF;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Due-date reminders, run periodically by the worker. One reminder per user/document/event/day.
CREATE OR REPLACE FUNCTION notifications_due_scan() RETURNS int AS $$
DECLARE
    v_req   record;
    v_total int := 0;
    v_event text;
BEGIN
    PERFORM set_config('qg.actor_type', 'system', true);
    FOR v_req IN
        SELECT r.document_id, r.due_date
          FROM requirement r
          JOIN workflow_status ws ON ws.id = r.status_id
         WHERE NOT ws.is_closed
           AND r.due_date IS NOT NULL
           AND r.due_date <= current_date + 1
    LOOP
        v_event := CASE WHEN v_req.due_date < current_date THEN 'due_overdue' ELSE 'due_soon' END;
        IF NOT EXISTS (
            SELECT 1 FROM notification
             WHERE document_id = v_req.document_id AND event_type = v_event
               AND created_at >= date_trunc('day', now())
        ) THEN
            v_total := v_total + notification_fanout(v_req.document_id, v_event,
                jsonb_build_object('due_date', v_req.due_date));
        END IF;
    END LOOP;
    RETURN v_total;
END;
$$ LANGUAGE plpgsql;
