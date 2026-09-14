-- Canonical section keys defined in the functional spec
CREATE OR REPLACE FUNCTION document_section_key(p_heading text) RETURNS text AS $$
DECLARE
    v_slug text := md_slugify(p_heading);
BEGIN
    RETURN CASE v_slug
        WHEN 'situacion-actual'       THEN 'current_situation'
        WHEN 'current-situation'      THEN 'current_situation'
        WHEN 'problema'               THEN 'problems'
        WHEN 'problemas'              THEN 'problems'
        WHEN 'problems'               THEN 'problems'
        WHEN 'problemas-a-resolver'   THEN 'problems'
        WHEN 'solucion-propuesta'     THEN 'proposed_solution'
        WHEN 'soluciones-propuestas'  THEN 'proposed_solution'
        WHEN 'proposed-solution'      THEN 'proposed_solution'
        WHEN 'criterios-de-aceptacion' THEN 'acceptance_criteria'
        WHEN 'acceptance-criteria'    THEN 'acceptance_criteria'
        WHEN 'consideraciones'        THEN 'considerations'
        WHEN 'considerations'         THEN 'considerations'
        ELSE NULL
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Rebuilds document_section rows from the canonical body_md.
CREATE OR REPLACE FUNCTION document_sections_rebuild(p_document_id uuid)
RETURNS void AS $$
BEGIN
    DELETE FROM document_section WHERE document_id = p_document_id;

    INSERT INTO document_section (document_id, ord, level, section_key, heading, slug, body_md, start_offset, end_offset)
    SELECT
        p_document_id,
        s.ord,
        s.level,
        document_section_key(s.heading),
        s.heading,
        s.slug,
        s.body_md,
        s.start_offset,
        s.end_offset
    FROM md_split_sections(
        (SELECT body_md FROM document WHERE id = p_document_id),
        2
    ) s;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_document_reproject() RETURNS trigger AS $$
BEGIN
    PERFORM document_sections_rebuild(NEW.id);
    IF NEW.doc_type = 'requirement' THEN
        PERFORM requirement_readiness_evaluate(NEW.id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger so it doesn't accumulate duplicates
DROP TRIGGER IF EXISTS document_reproject_trigger ON document;
CREATE TRIGGER document_reproject_trigger
    AFTER INSERT OR UPDATE OF body_md ON document
    FOR EACH ROW EXECUTE FUNCTION trg_document_reproject();
