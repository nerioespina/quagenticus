-- Seed data for a fresh installation
-- Run this after all DDL is applied

DO $$
DECLARE
    v_account_id  uuid;
    v_user_id     uuid;
    v_space_id    uuid;
    v_tracker_bug uuid;
    v_tracker_feat uuid;
    v_tracker_task uuid;
    v_status_new  uuid;
    v_status_tri  uuid;
    v_status_rdy  uuid;
    v_status_prog uuid;
    v_status_rev  uuid;
    v_status_res  uuid;
    v_status_clo  uuid;
    v_prio_low    uuid;
    v_prio_norm   uuid;
    v_prio_high   uuid;
    v_prio_urg    uuid;
BEGIN
    -- Skip if already seeded
    IF EXISTS (SELECT 1 FROM account LIMIT 1) THEN
        RETURN;
    END IF;

    -- Account
    INSERT INTO account (key, name) VALUES ('demo', 'Demo Account')
    RETURNING id INTO v_account_id;

    -- Admin user (password: 'admin123')
    INSERT INTO app_user (account_id, email, password, display_name, is_account_admin, status)
    VALUES (
        v_account_id,
        'admin@demo.local',
        crypt('admin123', gen_salt('bf')),
        'Admin Demo',
        true,
        'active'
    ) RETURNING id INTO v_user_id;

    -- Workflow statuses
    INSERT INTO workflow_status (account_id, key, name, color, ord, is_default) VALUES
        (v_account_id, 'new',         'Nuevo',         '#6b7280', 0,  true)  RETURNING id INTO v_status_new;
    INSERT INTO workflow_status (account_id, key, name, color, ord) VALUES
        (v_account_id, 'triaged',     'Triado',        '#8b5cf6', 10) RETURNING id INTO v_status_tri;
    INSERT INTO workflow_status (account_id, key, name, color, ord, is_agent_claimable) VALUES
        (v_account_id, 'ready',       'Listo',         '#3b82f6', 20, true)  RETURNING id INTO v_status_rdy;
    INSERT INTO workflow_status (account_id, key, name, color, ord) VALUES
        (v_account_id, 'in_progress', 'En Progreso',   '#8b5cf6', 30) RETURNING id INTO v_status_prog;
    INSERT INTO workflow_status (account_id, key, name, color, ord) VALUES
        (v_account_id, 'in_review',   'En Revisión',   '#06b6d4', 40) RETURNING id INTO v_status_rev;
    INSERT INTO workflow_status (account_id, key, name, color, ord, requires_resolution) VALUES
        (v_account_id, 'resolved',    'Resuelto',      '#10b981', 50, true)  RETURNING id INTO v_status_res;
    INSERT INTO workflow_status (account_id, key, name, color, ord, is_closed) VALUES
        (v_account_id, 'closed',      'Cerrado',       '#374151', 60, true)  RETURNING id INTO v_status_clo;

    -- Trackers
    INSERT INTO tracker (account_id, key, name, icon, default_status_id, ord) VALUES
        (v_account_id, 'bug',     'Bug',          '🐛', v_status_new, 0) RETURNING id INTO v_tracker_bug;
    INSERT INTO tracker (account_id, key, name, icon, default_status_id, ord) VALUES
        (v_account_id, 'feature', 'Feature',      '✨', v_status_new, 1) RETURNING id INTO v_tracker_feat;
    INSERT INTO tracker (account_id, key, name, icon, default_status_id, ord) VALUES
        (v_account_id, 'task',    'Task',         '✅', v_status_new, 2) RETURNING id INTO v_tracker_task;

    -- Workflow transitions (for all trackers, allow any → new states)
    INSERT INTO workflow_transition (tracker_id, from_status_id, to_status_id) VALUES
        (v_tracker_bug,  v_status_new,  v_status_tri),
        (v_tracker_bug,  v_status_tri,  v_status_rdy),
        (v_tracker_bug,  v_status_rdy,  v_status_prog),
        (v_tracker_bug,  v_status_prog, v_status_rev),
        (v_tracker_bug,  v_status_rev,  v_status_res),
        (v_tracker_bug,  v_status_res,  v_status_clo),
        (v_tracker_bug,  NULL,           v_status_new);  -- reopen from anywhere

    INSERT INTO workflow_transition (tracker_id, from_status_id, to_status_id) VALUES
        (v_tracker_feat, v_status_new,  v_status_tri),
        (v_tracker_feat, v_status_tri,  v_status_rdy),
        (v_tracker_feat, v_status_rdy,  v_status_prog),
        (v_tracker_feat, v_status_prog, v_status_rev),
        (v_tracker_feat, v_status_rev,  v_status_res),
        (v_tracker_feat, v_status_res,  v_status_clo),
        (v_tracker_feat, NULL,           v_status_new);

    INSERT INTO workflow_transition (tracker_id, from_status_id, to_status_id) VALUES
        (v_tracker_task, v_status_new,  v_status_rdy),
        (v_tracker_task, v_status_rdy,  v_status_prog),
        (v_tracker_task, v_status_prog, v_status_res),
        (v_tracker_task, v_status_res,  v_status_clo),
        (v_tracker_task, NULL,           v_status_new);

    -- Priorities
    INSERT INTO priority (account_id, key, name, weight, color) VALUES
        (v_account_id, 'low',       'Baja',      10, '#6b7280') RETURNING id INTO v_prio_low;
    INSERT INTO priority (account_id, key, name, weight, color, is_default) VALUES
        (v_account_id, 'normal',    'Normal',    20, '#3b82f6', true) RETURNING id INTO v_prio_norm;
    INSERT INTO priority (account_id, key, name, weight, color) VALUES
        (v_account_id, 'high',      'Alta',      30, '#f59e0b') RETURNING id INTO v_prio_high;
    INSERT INTO priority (account_id, key, name, weight, color) VALUES
        (v_account_id, 'urgent',    'Urgente',   40, '#ef4444') RETURNING id INTO v_prio_urg;

    -- Demo Space
    INSERT INTO space (account_id, key, name, description_md, creator_id)
    VALUES (v_account_id, 'DEMO', 'Espacio Demo', '# Espacio de demostración', v_user_id)
    RETURNING id INTO v_space_id;

    INSERT INTO space_member (space_id, subject_type, subject_id, role, granted_by)
    VALUES (v_space_id, 'user', v_user_id, 'admin', v_user_id);

    -- Demo board
    DECLARE
        v_board_id uuid;
    BEGIN
        INSERT INTO board (space_id, account_id, name, creator_id)
        VALUES (v_space_id, v_account_id, 'Tablero Principal', v_user_id)
        RETURNING id INTO v_board_id;

        INSERT INTO board_column (board_id, name, status_id, ord, color) VALUES
            (v_board_id, 'Nuevo',        v_status_new,  0,  '#6b7280'),
            (v_board_id, 'Listo',        v_status_rdy,  1,  '#3b82f6'),
            (v_board_id, 'En Progreso',  v_status_prog, 2,  '#8b5cf6'),
            (v_board_id, 'En Revisión',  v_status_rev,  3,  '#06b6d4'),
            (v_board_id, 'Resuelto',     v_status_res,  4,  '#10b981');
    END;

    RAISE NOTICE 'Seed completado. Usuario: admin@demo.local / admin123';
END;
$$;
