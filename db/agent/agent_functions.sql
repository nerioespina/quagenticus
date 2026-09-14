-- Agents authenticate with "qga_<prefix>_<secret>". Only a bcrypt hash is stored.
CREATE OR REPLACE FUNCTION agent_authenticate(p_key text) RETURNS agent AS $$
DECLARE
    v_prefix text := split_part(p_key, '_', 2);
    v_agent  agent;
BEGIN
    SELECT * INTO v_agent FROM agent
     WHERE api_key_prefix = v_prefix AND is_active
       AND api_key_hash = crypt(p_key, api_key_hash);
    IF NOT FOUND THEN
        PERFORM pg_sleep(0.1);
        RAISE EXCEPTION 'API key inválida' USING ERRCODE = 'QG401';
    END IF;
    UPDATE agent SET last_seen_at = now() WHERE id = v_agent.id;
    RETURN v_agent;
END;
$$ LANGUAGE plpgsql;

-- Claims a specific requirement for the current agent with a lease.
CREATE OR REPLACE FUNCTION agent_claim(p_requirement_id uuid, p_lease interval DEFAULT '30 minutes')
RETURNS agent_claim AS $$
DECLARE
    v_agent_id uuid := qg_actor_id();
    v_req      requirement;
    v_status   workflow_status;
    v_claim    agent_claim;
    v_progress uuid;
BEGIN
    IF qg_actor_type() <> 'agent' THEN
        RAISE EXCEPTION 'Solo un agente puede reclamar requerimientos' USING ERRCODE = 'QG403';
    END IF;

    SELECT * INTO v_req FROM requirement WHERE document_id = p_requirement_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento no disponible' USING ERRCODE = 'QG409';
    END IF;
    IF v_req.claimed_by_agent_id IS NOT NULL AND v_req.claim_expires_at > now() THEN
        IF v_req.claimed_by_agent_id = v_agent_id THEN
            SELECT * INTO v_claim FROM agent_claim WHERE id = v_req.claim_id;
            RETURN v_claim;
        END IF;
        RAISE EXCEPTION 'Requerimiento ya reclamado por otro agente' USING ERRCODE = 'QG409';
    END IF;

    SELECT * INTO v_status FROM workflow_status WHERE id = v_req.status_id;
    IF NOT v_status.is_agent_claimable THEN
        RAISE EXCEPTION 'El estado «%» no admite reclamos de agentes', v_status.name USING ERRCODE = 'QG422';
    END IF;

    INSERT INTO agent_claim (requirement_id, agent_id, expires_at, previous_status_id)
    VALUES (p_requirement_id, v_agent_id, now() + p_lease, v_req.status_id)
    RETURNING * INTO v_claim;

    UPDATE requirement SET claim_id = v_claim.id, claimed_by_agent_id = v_agent_id,
                           claim_expires_at = v_claim.expires_at, updated_at = now()
     WHERE document_id = p_requirement_id;

    INSERT INTO requirement_member (document_id, subject_type, subject_id, added_by)
    VALUES (p_requirement_id, 'agent', v_agent_id, v_agent_id)
    ON CONFLICT DO NOTHING;

    PERFORM journal_add(p_requirement_id, 'agent_event', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'claimed', 'agent_id', v_agent_id, 'expires_at', v_claim.expires_at)));

    SELECT id INTO v_progress FROM workflow_status
     WHERE account_id = v_req.account_id AND key = 'in_progress';
    IF v_progress IS NOT NULL THEN
        BEGIN
            PERFORM requirement_transition(p_requirement_id, v_progress, NULL, NULL);
        EXCEPTION WHEN OTHERS THEN
            NULL; -- the claim stands even if the workflow forbids the automatic move
        END;
    END IF;

    PERFORM notification_fanout(p_requirement_id, 'agent_claimed', '{}');
    RETURN v_claim;
END;
$$ LANGUAGE plpgsql;

-- Claims the highest-priority claimable requirement of a space.
CREATE OR REPLACE FUNCTION agent_claim_next(p_space_id uuid, p_lease interval DEFAULT '30 minutes')
RETURNS agent_claim AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT r.document_id INTO v_id
      FROM requirement r
      JOIN workflow_status ws ON ws.id = r.status_id AND ws.is_agent_claimable
      JOIN priority pr ON pr.id = r.priority_id
      JOIN tracker t ON t.id = r.tracker_id AND t.is_agent_enabled
     WHERE r.space_id = p_space_id
       AND (r.claimed_by_agent_id IS NULL OR r.claim_expires_at < now())
     ORDER BY pr.weight DESC, r.board_position, r.created_at
     LIMIT 1
     FOR UPDATE OF r SKIP LOCKED;
    IF v_id IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN agent_claim(v_id, p_lease);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agent_claim_renew(p_requirement_id uuid, p_lease interval DEFAULT '30 minutes')
RETURNS timestamptz AS $$
DECLARE
    v_exp timestamptz := now() + p_lease;
BEGIN
    UPDATE requirement SET claim_expires_at = v_exp
     WHERE document_id = p_requirement_id AND claimed_by_agent_id = qg_actor_id();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No tienes un reclamo activo sobre este requerimiento' USING ERRCODE = 'QG409';
    END IF;
    UPDATE agent_claim SET expires_at = v_exp, renewals_count = renewals_count + 1
     WHERE id = (SELECT claim_id FROM requirement WHERE document_id = p_requirement_id);
    RETURN v_exp;
END;
$$ LANGUAGE plpgsql;

-- Releases a claim. p_state: resolved | failed | abandoned | expired.
CREATE OR REPLACE FUNCTION agent_release(p_requirement_id uuid, p_state text DEFAULT 'abandoned', p_comment text DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_req   requirement;
    v_claim agent_claim;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_requirement_id FOR UPDATE;
    IF v_req.claim_id IS NULL THEN
        RAISE EXCEPTION 'El requerimiento no está reclamado' USING ERRCODE = 'QG409';
    END IF;
    IF qg_actor_type() = 'agent' AND v_req.claimed_by_agent_id <> qg_actor_id() THEN
        RAISE EXCEPTION 'El reclamo pertenece a otro agente' USING ERRCODE = 'QG403';
    END IF;

    UPDATE agent_claim SET completed_at = now(), completion_state = p_state
     WHERE id = v_req.claim_id
    RETURNING * INTO v_claim;

    UPDATE requirement SET claim_id = NULL, claimed_by_agent_id = NULL, claim_expires_at = NULL, updated_at = now()
     WHERE document_id = p_requirement_id;

    DELETE FROM requirement_member
     WHERE document_id = p_requirement_id AND subject_type = 'agent' AND subject_id = v_claim.agent_id;

    PERFORM journal_add(p_requirement_id, 'agent_event', p_comment, jsonb_build_array(jsonb_build_object(
        'type', 'released', 'agent_id', v_claim.agent_id, 'state', p_state)));

    IF p_state IN ('abandoned', 'failed', 'expired') AND v_claim.previous_status_id IS NOT NULL THEN
        BEGIN
            PERFORM requirement_transition(p_requirement_id, v_claim.previous_status_id, NULL, NULL);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    PERFORM notification_fanout(p_requirement_id, 'agent_released', jsonb_build_object('state', p_state));
END;
$$ LANGUAGE plpgsql;

-- Worker: releases expired leases. Returns how many were released.
CREATE OR REPLACE FUNCTION agent_claims_expire() RETURNS int AS $$
DECLARE
    v_id    uuid;
    v_count int := 0;
BEGIN
    PERFORM set_config('qg.actor_type', 'system', true);
    FOR v_id IN
        SELECT document_id FROM requirement
         WHERE claim_expires_at IS NOT NULL AND claim_expires_at < now()
         FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM agent_release(v_id, 'expired', 'El reclamo expiró sin renovarse.');
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
