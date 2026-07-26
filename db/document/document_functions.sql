-- Document functions (stubs)
CREATE OR REPLACE FUNCTION document_is_readable(p_id uuid) RETURNS boolean AS $$
BEGIN
    RETURN true; -- TODO: Implement permissions
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION document_get_authorized(p_id uuid, p_mode text) RETURNS document AS $$
DECLARE v_doc document;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'QG404';
    END IF;
    RETURN v_doc;
END;
$$ LANGUAGE plpgsql STABLE;
