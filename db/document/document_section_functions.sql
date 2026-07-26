-- Document section functions (stubs)
CREATE OR REPLACE FUNCTION document_sections_rebuild(p_document_id uuid)
RETURNS void AS $$
BEGIN
    -- TODO: Implement from spec
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_document_reproject() RETURNS trigger AS $$
BEGIN
    PERFORM document_sections_rebuild(NEW.id);
    -- PERFORM document_links_rebuild(NEW.id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_reproject_trigger
    AFTER INSERT OR UPDATE OF body_md ON document
    FOR EACH ROW EXECUTE FUNCTION trg_document_reproject();
