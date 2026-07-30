-- Creates (or idempotently upserts) a link between two documents.
-- Uses ON CONFLICT so re-linking the same source/target/link_type pair
-- updates the note instead of raising an unmapped unique-violation (23505).
CREATE OR REPLACE FUNCTION document_link_create(
    p_source_id  uuid,
    p_target_id  uuid,
    p_link_type  link_type DEFAULT 'relates',
    p_note       text DEFAULT NULL
) RETURNS document_link AS $$
DECLARE
    v_link document_link;
BEGIN
    INSERT INTO document_link (source_id, target_id, link_type, note, creator_id)
    VALUES (p_source_id, p_target_id, p_link_type, p_note, qg_actor_id())
    ON CONFLICT (source_id, target_id, link_type) WHERE target_id IS NOT NULL
    DO UPDATE SET note = EXCLUDED.note
    RETURNING * INTO v_link;
    RETURN v_link;
END;
$$ LANGUAGE plpgsql;
