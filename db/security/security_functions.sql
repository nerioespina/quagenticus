-- Role hierarchy helpers shared by the API and by workflow functions.

CREATE OR REPLACE FUNCTION member_role_rank(p_role member_role) RETURNS int AS $$
    SELECT CASE p_role
        WHEN 'viewer'      THEN 1
        WHEN 'contributor' THEN 2
        WHEN 'maintainer'  THEN 3
        WHEN 'admin'       THEN 4
        ELSE 0
    END;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- Effective role of an actor in a space. Account admins are admins of every space
-- of their account. Agents get the role granted through space_member, or
-- contributor when the agent belongs to the account and no explicit grant exists.
CREATE OR REPLACE FUNCTION space_member_role(p_space_id uuid, p_actor_type text, p_actor_id uuid)
RETURNS member_role AS $$
DECLARE
    v_account_id uuid;
    v_role       member_role;
BEGIN
    SELECT account_id INTO v_account_id FROM space WHERE id = p_space_id;
    IF v_account_id IS NULL OR p_actor_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_actor_type = 'user' THEN
        IF EXISTS (SELECT 1 FROM app_user
                    WHERE id = p_actor_id AND account_id = v_account_id
                      AND is_account_admin AND status = 'active') THEN
            RETURN 'admin';
        END IF;
    END IF;

    SELECT sm.role INTO v_role
      FROM space_member sm
     WHERE sm.space_id = p_space_id
       AND sm.subject_type = p_actor_type::actor_type
       AND sm.subject_id = p_actor_id;

    IF v_role IS NULL AND p_actor_type = 'agent' THEN
        IF EXISTS (SELECT 1 FROM agent WHERE id = p_actor_id AND account_id = v_account_id AND is_active) THEN
            v_role := 'contributor';
        END IF;
    END IF;

    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION qg_actor_space_role(p_space_id uuid) RETURNS member_role AS $$
    SELECT space_member_role(p_space_id, qg_actor_type(), qg_actor_id());
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION qg_require_space_role(p_space_id uuid, p_min member_role) RETURNS member_role AS $$
DECLARE
    v_role member_role;
BEGIN
    IF qg_actor_type() = 'system' THEN
        RETURN 'admin';
    END IF;
    v_role := qg_actor_space_role(p_space_id);
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Recurso no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF member_role_rank(v_role) < member_role_rank(p_min) THEN
        RAISE EXCEPTION 'Tu rol (%) no permite esta acción', v_role USING ERRCODE = 'QG403';
    END IF;
    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE;

-- Reporter id for rows that require a human (agents act on behalf of their creator).
CREATE OR REPLACE FUNCTION qg_responsible_user_id() RETURNS uuid AS $$
DECLARE
    v_user uuid;
BEGIN
    IF qg_actor_type() = 'user' THEN
        RETURN qg_actor_id();
    ELSIF qg_actor_type() = 'agent' THEN
        SELECT created_by INTO v_user FROM agent WHERE id = qg_actor_id();
        RETURN v_user;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
