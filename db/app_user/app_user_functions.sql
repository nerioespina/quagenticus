CREATE EXTENSION IF NOT EXISTS citext; -- Used in app_user.email

CREATE OR REPLACE FUNCTION user_login(p_email citext, p_password text)
RETURNS app_user AS $$
DECLARE v_user app_user;
BEGIN
    SELECT * INTO v_user FROM app_user
     WHERE email = p_email AND status = 'active'
       AND password IS NOT NULL
       AND password = crypt(p_password, password);
    IF NOT FOUND THEN
        PERFORM pg_sleep(0.1);   -- mitigación básica de temporización
        RAISE EXCEPTION 'Credenciales inválidas' USING ERRCODE = 'QG401';
    END IF;
    UPDATE app_user SET last_login_at = now() WHERE id = v_user.id;
    RETURN v_user;
END;
$$ LANGUAGE plpgsql;
