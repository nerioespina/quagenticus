-- Records attachment changes in the owning document's history.
CREATE OR REPLACE FUNCTION attachment_journal(p_attachment_id uuid, p_action text, p_filename text DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_a attachment;
BEGIN
    SELECT * INTO v_a FROM attachment WHERE id = p_attachment_id;
    IF v_a.document_id IS NULL AND p_action = 'attachment_added' THEN
        RETURN;
    END IF;
    PERFORM journal_add(v_a.document_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', p_action, 'attachment_id', p_attachment_id,
        'filename', coalesce(p_filename, v_a.filename))));
    IF p_action = 'attachment_added' THEN
        PERFORM notification_fanout(v_a.document_id, 'attachment_added',
            jsonb_build_object('filename', v_a.filename));
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Worker: removes staged uploads never adopted. Returns their storage keys so files can be deleted.
CREATE OR REPLACE FUNCTION attachment_purge_staged(p_older_than interval DEFAULT '24 hours')
RETURNS SETOF text AS $$
    DELETE FROM attachment
     WHERE status = 'staged' AND created_at < now() - p_older_than
    RETURNING storage_key;
$$ LANGUAGE sql;
