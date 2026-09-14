-- Row triggers that publish change events for SSE clients (see internal/events).
CREATE OR REPLACE FUNCTION trg_qg_emit() RETURNS trigger AS $$
DECLARE
    v_row      record;
    v_doc_id   uuid;
    v_space_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_row := OLD;
    ELSE
        v_row := NEW;
    END IF;

    CASE TG_TABLE_NAME
        WHEN 'requirement' THEN
            v_doc_id := v_row.document_id; v_space_id := v_row.space_id;
        WHEN 'document' THEN
            v_doc_id := v_row.id; v_space_id := v_row.space_id;
        WHEN 'document_link' THEN
            v_doc_id := v_row.source_id;
        WHEN 'attachment' THEN
            v_doc_id := v_row.document_id; v_space_id := v_row.space_id;
        ELSE
            v_doc_id := v_row.document_id;
    END CASE;

    IF v_space_id IS NULL AND v_doc_id IS NOT NULL THEN
        SELECT space_id INTO v_space_id FROM document WHERE id = v_doc_id;
    END IF;
    IF v_space_id IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM qg_emit_event(TG_TABLE_NAME, v_space_id, v_doc_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['requirement', 'document', 'journal', 'attachment', 'document_link',
                             'requirement_member', 'document_label']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS qg_emit_trigger ON %I', t);
        EXECUTE format('CREATE TRIGGER qg_emit_trigger AFTER INSERT OR UPDATE OR DELETE ON %I
                        FOR EACH ROW EXECUTE FUNCTION trg_qg_emit()', t);
    END LOOP;
END $$;
