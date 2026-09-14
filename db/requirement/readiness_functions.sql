-- Definition of Ready: evaluates completeness criteria and stores score + report.
CREATE OR REPLACE FUNCTION requirement_readiness_evaluate(p_document_id uuid) RETURNS int AS $$
DECLARE
    v_doc      document;
    v_req      requirement;
    v_criteria jsonb := '[]';
    v_passed   int := 0;
    v_total    int := 0;
    v_score    int;

BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_document_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_doc FROM document WHERE id = p_document_id;

    WITH checks(key, label, passed) AS (
        VALUES
        ('title', 'Título descriptivo (10+ caracteres)', length(btrim(v_doc.title)) >= 10),
        ('current_situation', 'Sección «Situación actual»',
            EXISTS (SELECT 1 FROM document_section WHERE document_id = p_document_id
                     AND section_key = 'current_situation' AND length(btrim(body_md)) > 0)),
        ('problems', 'Sección «Problemas a resolver»',
            EXISTS (SELECT 1 FROM document_section WHERE document_id = p_document_id
                     AND section_key = 'problems' AND length(btrim(body_md)) > 0)),
        ('proposed_solution', 'Sección «Soluciones propuestas»',
            EXISTS (SELECT 1 FROM document_section WHERE document_id = p_document_id
                     AND section_key = 'proposed_solution' AND length(btrim(body_md)) > 0)),
        ('acceptance_criteria', 'Criterios de aceptación en forma de checklist',
            EXISTS (SELECT 1 FROM document_section WHERE document_id = p_document_id
                     AND section_key = 'acceptance_criteria' AND body_md ~ '(^|\n)\s*[-*]\s+\[[ xX]\]')),
        ('assignee', 'Responsable o miembros asignados',
            v_req.lead_user_id IS NOT NULL OR v_req.lead_agent_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM requirement_member WHERE document_id = p_document_id)),
        ('estimate', 'Estimación de horas', v_req.estimated_hours IS NOT NULL)
    )
    SELECT jsonb_agg(jsonb_build_object('key', key, 'label', label, 'passed', passed)),
           count(*) FILTER (WHERE passed), count(*)
      INTO v_criteria, v_passed, v_total
      FROM checks;

    v_score := (v_passed * 100) / greatest(v_total, 1);

    UPDATE requirement
       SET readiness_score  = v_score,
           readiness_report = jsonb_build_object('score', v_score, 'ready', v_passed = v_total, 'criteria', v_criteria),
           readiness_at     = now()
     WHERE document_id = p_document_id
       AND readiness_score IS DISTINCT FROM v_score
        OR (document_id = p_document_id AND readiness_report IS DISTINCT FROM
            jsonb_build_object('score', v_score, 'ready', v_passed = v_total, 'criteria', v_criteria));

    RETURN v_score;
END;
$$ LANGUAGE plpgsql;
