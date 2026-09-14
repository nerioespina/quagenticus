-- Database smoke tests. Run against a scratch database after install_database.sh:
--   psql -v ON_ERROR_STOP=1 -f db/tests/smoke_test.sql
-- Everything runs inside a transaction that is rolled back.
BEGIN;
SET search_path = quagenticus, public;

DO $$
DECLARE
    v_admin   app_user;
    v_ana     uuid;
    v_space   uuid;
    v_tracker uuid;
    v_status  record;
    v_ready   uuid;
    v_resolved uuid;
    v_req     uuid;
    v_req2    uuid;
    v_r       requirement;
    v_c       uuid;
    v_n       int;
    v_pos     numeric;
    v_ok      boolean;
BEGIN
    SELECT * INTO v_admin FROM app_user WHERE email = 'admin@demo.local';
    SELECT id INTO v_space FROM space WHERE key = 'DEMO' AND account_id = v_admin.account_id;
    SELECT id INTO v_tracker FROM tracker WHERE key = 'feature' AND account_id = v_admin.account_id;
    SELECT id INTO v_ready FROM workflow_status WHERE key = 'ready' AND account_id = v_admin.account_id;
    SELECT id INTO v_resolved FROM workflow_status WHERE key = 'resolved' AND account_id = v_admin.account_id;

    PERFORM set_config('qg.actor_type', 'user', true);
    PERFORM set_config('qg.actor_id', v_admin.id::text, true);
    PERFORM set_config('qg.account_id', v_admin.account_id::text, true);

    -- handle trigger + membership
    INSERT INTO app_user (account_id, email, password, display_name, status)
    VALUES (v_admin.account_id, 'ana.perez.smoke@demo.local', crypt('x', gen_salt('bf')), 'Ana Pérez', 'active')
    RETURNING id INTO v_ana;
    ASSERT (SELECT handle FROM app_user WHERE id = v_ana) = 'ana.perez.smoke', 'handle derived from email';
    ASSERT space_member_role(v_space, 'user', v_ana) IS NULL, 'non member has no role';
    ASSERT space_member_role(v_space, 'user', v_admin.id) = 'admin', 'account admin is admin';
    INSERT INTO space_member (space_id, subject_type, subject_id, role) VALUES (v_space, 'user', v_ana, 'contributor');

    -- create full
    v_req := requirement_create_full(v_space, jsonb_build_object(
        'tracker_id', v_tracker, 'title', 'Exportar reportes a PDF',
        'body_md', E'## Situación actual\nNo hay export.\n## Criterios de aceptación\n- [ ] genera PDF',
        'member_ids', jsonb_build_array(v_ana), 'lead_user_id', v_admin.id,
        'status_id', v_ready, 'estimated_hours', 4));
    SELECT * INTO v_r FROM requirement WHERE document_id = v_req;
    ASSERT v_r.status_id = v_ready, 'initial status honoured';
    ASSERT v_r.member_count = 2, 'lead added as member';
    ASSERT v_r.readiness_score IS NOT NULL, 'readiness computed';
    ASSERT (SELECT count(*) FROM notification WHERE user_id = v_ana AND event_type = 'member_added') = 1, 'member notified';
    ASSERT (SELECT count(*) FROM journal WHERE document_id = v_req AND kind = 'change') = 1, 'creation journaled';

    -- patch clears a field and journals it
    PERFORM requirement_patch(v_req, '{"estimated_hours": null, "title": "Exportar reportes a PDF y CSV"}');
    SELECT * INTO v_r FROM requirement WHERE document_id = v_req;
    ASSERT v_r.estimated_hours IS NULL, 'null clears field';
    ASSERT EXISTS (SELECT 1 FROM journal WHERE document_id = v_req
                    AND details @> '[{"property":"estimated_hours"}]'), 'patch journaled';

    -- version conflict
    BEGIN
        PERFORM requirement_patch(v_req, '{"body_md": "x"}', 1);
        v_ok := false;
    EXCEPTION WHEN SQLSTATE 'QG409' THEN v_ok := true;
    END;
    ASSERT v_ok, 'stale version rejected';

    -- transition requiring resolution
    BEGIN
        PERFORM requirement_transition(v_req, v_resolved, NULL, NULL);
        v_ok := false;
    EXCEPTION WHEN SQLSTATE 'QG422' THEN v_ok := true;
    END;
    ASSERT v_ok, 'resolution required';
    PERFORM requirement_transition(v_req, v_resolved, 'Listo', 'Implementado');
    ASSERT (SELECT resolution FROM requirement WHERE document_id = v_req) = 'Implementado', 'resolution stored';

    -- comments, mentions and derived links
    v_req2 := requirement_create_full(v_space, jsonb_build_object('tracker_id', v_tracker, 'title', 'Segundo'));
    v_c := comment_create(v_req2, format('Relacionado con #%s, ver @ana.perez.smoke', split_part((SELECT ref_key FROM document WHERE id = v_req), '-', 2)));
    ASSERT (SELECT count(*) FROM document_link WHERE source_journal_id = v_c AND target_id = v_req) = 1, 'comment ref creates link';
    ASSERT (SELECT count(*) FROM notification WHERE user_id = v_ana AND event_type = 'mentioned') = 1, 'mention notified';
    PERFORM comment_delete(v_c);
    ASSERT (SELECT count(*) FROM document_link WHERE source_journal_id = v_c) = 0, 'deleted comment drops links';

    -- wikilinks resolve when the target appears
    PERFORM document_update(v_req2, NULL, 'Ver [[Glosario de términos]]', NULL);
    ASSERT (SELECT count(*) FROM document_link WHERE source_id = v_req2 AND target_id IS NULL) = 1, 'broken wikilink stored';
    PERFORM document_create(v_space, NULL, 'note', 'Glosario de términos', '');
    ASSERT (SELECT count(*) FROM document_link WHERE source_id = v_req2 AND link_type = 'wikilink' AND target_id IS NOT NULL) = 1, 'wikilink resolved';

    -- move / reorder in same column
    PERFORM requirement_transition(v_req2, v_ready, NULL, NULL);
    v_pos := requirement_move(v_req2, NULL, NULL, (SELECT document_id FROM requirement WHERE status_id = v_ready AND document_id <> v_req2 ORDER BY board_position LIMIT 1));
    ASSERT v_pos IS NOT NULL, 'reorder returns position';

    -- search
    ASSERT EXISTS (SELECT 1 FROM search_suggest(v_space, '#' || split_part((SELECT ref_key FROM document WHERE id = v_req2), '-', 2)) WHERE id = v_req2), 'suggest by number';
    ASSERT EXISTS (SELECT 1 FROM search_suggest(v_space, 'ana', ARRAY['user'])), 'suggest users';
    ASSERT EXISTS (SELECT 1 FROM search_documents(v_admin.account_id, 'user', v_admin.id, 'reportes')), 'full text search';

    -- members
    PERFORM requirement_members_set(v_req2, ARRAY[v_ana], v_ana);
    ASSERT (SELECT lead_user_id FROM requirement WHERE document_id = v_req2) = v_ana, 'lead set';
    ASSERT (SELECT count(*) FROM requirement_member WHERE document_id = v_req2 AND is_lead) = 1, 'single lead flag';

    RAISE NOTICE 'smoke tests passed';
END $$;

ROLLBACK;
