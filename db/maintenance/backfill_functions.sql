-- Idempotent data backfills that need functions (run on every install, cheap when nothing is pending).
DO $$
BEGIN
    PERFORM set_config('qg.actor_type', 'system', true);
    PERFORM requirement_readiness_evaluate(document_id)
       FROM requirement
      WHERE readiness_at IS NULL;
END $$;
