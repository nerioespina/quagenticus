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

-- Derives a unique @handle from the e-mail when none is given.
CREATE OR REPLACE FUNCTION app_user_unique_handle(p_account_id uuid, p_seed text, p_exclude uuid DEFAULT NULL)
RETURNS text AS $$
DECLARE
    v_base text;
    v_try  text;
    v_n    int := 1;
BEGIN
    v_base := left(regexp_replace(lower(coalesce(p_seed, '')), '[^a-z0-9._-]', '', 'g'), 30);
    IF v_base !~ '^[a-z]' THEN
        v_base := 'u' || v_base;
    END IF;
    v_try := v_base;
    WHILE EXISTS (
        SELECT 1 FROM app_user
         WHERE account_id = p_account_id AND handle = v_try
           AND id IS DISTINCT FROM p_exclude
    ) LOOP
        v_n := v_n + 1;
        v_try := v_base || v_n;
    END LOOP;
    RETURN v_try;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_app_user_handle() RETURNS trigger AS $$
BEGIN
    IF NEW.handle IS NULL OR btrim(NEW.handle) = '' THEN
        NEW.handle := app_user_unique_handle(NEW.account_id, split_part(NEW.email::text, '@', 1), NEW.id);
    ELSE
        NEW.handle := lower(NEW.handle);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_user_handle_trigger ON app_user;
CREATE TRIGGER app_user_handle_trigger
    BEFORE INSERT OR UPDATE OF handle ON app_user
    FOR EACH ROW EXECUTE FUNCTION trg_app_user_handle();
