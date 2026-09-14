-- Creates (or idempotently upserts) a manual link between two documents of the same account.
DROP FUNCTION IF EXISTS document_link_create(uuid, uuid, link_type, text);

CREATE OR REPLACE FUNCTION document_link_create(
    p_source_id  uuid,
    p_target_id  uuid,
    p_link_type  link_type DEFAULT 'relates',
    p_note       text DEFAULT NULL
) RETURNS document_link AS $$
DECLARE
    v_link   document_link;
    v_source document;
    v_target document;
BEGIN
    SELECT * INTO v_source FROM document WHERE id = p_source_id;
    SELECT * INTO v_target FROM document WHERE id = p_target_id AND NOT is_archived;
    IF v_source.id IS NULL OR v_target.id IS NULL OR v_source.account_id <> v_target.account_id THEN
        RAISE EXCEPTION 'Documento destino no encontrado' USING ERRCODE = 'QG404';
    END IF;
    IF p_source_id = p_target_id THEN
        RAISE EXCEPTION 'Un documento no puede enlazarse consigo mismo' USING ERRCODE = 'QG422';
    END IF;
    IF p_link_type IN ('wikilink', 'mentions') THEN
        RAISE EXCEPTION 'Ese tipo de enlace se genera automáticamente desde el texto' USING ERRCODE = 'QG422';
    END IF;

    INSERT INTO document_link (source_id, target_id, link_type, note, creator_id)
    VALUES (p_source_id, p_target_id, p_link_type, p_note, qg_actor_id())
    ON CONFLICT (source_id, target_id, link_type) WHERE target_id IS NOT NULL AND source_journal_id IS NULL
    DO UPDATE SET note = EXCLUDED.note
    RETURNING * INTO v_link;

    PERFORM journal_add(p_source_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'link_added', 'link_type', p_link_type, 'target_id', p_target_id,
        'target_title', coalesce(v_target.ref_key || ' ', '') || v_target.title)));

    RETURN v_link;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION document_link_delete(p_document_id uuid, p_link_id uuid) RETURNS void AS $$
DECLARE
    v_link document_link;
    v_title text;
BEGIN
    DELETE FROM document_link
     WHERE id = p_link_id AND (source_id = p_document_id OR target_id = p_document_id)
       AND NOT is_derived
    RETURNING * INTO v_link;
    IF v_link.id IS NULL THEN
        RAISE EXCEPTION 'Enlace no encontrado' USING ERRCODE = 'QG404';
    END IF;
    SELECT coalesce(ref_key || ' ', '') || title INTO v_title
      FROM document WHERE id = CASE WHEN v_link.source_id = p_document_id THEN v_link.target_id ELSE v_link.source_id END;
    PERFORM journal_add(p_document_id, 'change', NULL, jsonb_build_array(jsonb_build_object(
        'type', 'link_removed', 'link_type', v_link.link_type, 'target_title', v_title)));
END;
$$ LANGUAGE plpgsql;

-- Inverse wording when a link is seen from its target.
CREATE OR REPLACE FUNCTION link_type_inverse(p link_type) RETURNS text AS $$
    SELECT CASE p
        WHEN 'blocks'        THEN 'blocked_by'
        WHEN 'blocked_by'    THEN 'blocks'
        WHEN 'precedes'      THEN 'follows'
        WHEN 'follows'       THEN 'precedes'
        WHEN 'duplicates'    THEN 'duplicated_by'
        WHEN 'duplicated_by' THEN 'duplicates'
        WHEN 'parent_of'     THEN 'child_of'
        WHEN 'child_of'      THEN 'parent_of'
        WHEN 'specifies'     THEN 'specified_by'
        WHEN 'implements'    THEN 'implemented_by'
        WHEN 'wikilink'      THEN 'linked_from'
        WHEN 'mentions'      THEN 'mentioned_in'
        ELSE p::text
    END;
$$ LANGUAGE sql IMMUTABLE;

-- Rebuilds the links derived from a document body (wikilinks and #refs).
CREATE OR REPLACE FUNCTION document_links_rebuild(p_document_id uuid) RETURNS void AS $$
DECLARE
    v_doc document;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_document_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    DELETE FROM document_link
     WHERE source_id = p_document_id AND is_derived AND source_journal_id IS NULL;

    INSERT INTO document_link (source_id, target_id, target_text, link_type, is_derived, creator_id)
    SELECT DISTINCT ON (coalesce(r.target_id::text, lower(r.raw)), r.kind)
           p_document_id, r.target_id,
           CASE WHEN r.target_id IS NULL THEN r.raw END,
           CASE r.kind WHEN 'wikilink' THEN 'wikilink' ELSE 'mentions' END::link_type,
           true, qg_actor_id()
      FROM md_resolve_refs(v_doc.account_id, v_doc.space_id, v_doc.body_md) r
     WHERE r.kind IN ('requirement', 'wikilink')
       AND r.target_id IS DISTINCT FROM p_document_id
       AND (r.target_id IS NOT NULL OR r.kind = 'wikilink')
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Rebuilds the links derived from one comment.
CREATE OR REPLACE FUNCTION journal_links_rebuild(p_journal_id uuid) RETURNS void AS $$
DECLARE
    v_j   journal;
    v_doc document;
BEGIN
    SELECT * INTO v_j FROM journal WHERE id = p_journal_id;
    DELETE FROM document_link WHERE source_journal_id = p_journal_id;
    IF v_j.id IS NULL OR v_j.kind <> 'comment' OR v_j.deleted_at IS NOT NULL THEN
        RETURN;
    END IF;
    SELECT * INTO v_doc FROM document WHERE id = v_j.document_id;

    INSERT INTO document_link (source_id, target_id, link_type, is_derived, source_journal_id, creator_id)
    SELECT DISTINCT v_j.document_id, r.target_id, 'mentions'::link_type, true, p_journal_id, qg_actor_id()
      FROM md_resolve_refs(v_doc.account_id, v_doc.space_id, v_j.notes_md) r
     WHERE r.kind IN ('requirement', 'wikilink')
       AND r.target_id IS NOT NULL
       AND r.target_id <> v_j.document_id
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_document_links() RETURNS trigger AS $$
DECLARE
    v_new_mentions uuid[];
    v_src          uuid;
BEGIN
    PERFORM document_links_rebuild(NEW.id);

    -- A new or renamed document may resolve broken wikilinks pointing at it.
    IF TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title THEN
        FOR v_src IN
            SELECT DISTINCT source_id FROM document_link dl
              JOIN document s ON s.id = dl.source_id
             WHERE dl.target_id IS NULL AND s.space_id = NEW.space_id
               AND (lower(dl.target_text) = lower(NEW.title) OR md_slugify(dl.target_text) = NEW.slug)
        LOOP
            PERFORM document_links_rebuild(v_src);
        END LOOP;
    END IF;

    -- Newly @mentioned users are notified.
    IF NEW.body_md IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.body_md END) THEN
        SELECT array_agg(u) INTO v_new_mentions
          FROM unnest(journal_mentioned_users(NEW.id, NEW.body_md)) u
         WHERE TG_OP = 'INSERT'
            OR NOT (u = ANY (journal_mentioned_users(NEW.id, OLD.body_md)));
        IF coalesce(cardinality(v_new_mentions), 0) > 0 THEN
            PERFORM notification_fanout(NEW.id, 'mentioned', '{}', NULL, '{}', v_new_mentions);
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_links_trigger ON document;
CREATE TRIGGER document_links_trigger
    AFTER INSERT OR UPDATE OF body_md, title ON document
    FOR EACH ROW EXECUTE FUNCTION trg_document_links();

CREATE OR REPLACE FUNCTION trg_journal_links() RETURNS trigger AS $$
BEGIN
    IF NEW.kind = 'comment' THEN
        PERFORM journal_links_rebuild(NEW.id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_links_trigger ON journal;
CREATE TRIGGER journal_links_trigger
    AFTER INSERT OR UPDATE OF notes_md, deleted_at ON journal
    FOR EACH ROW EXECUTE FUNCTION trg_journal_links();
