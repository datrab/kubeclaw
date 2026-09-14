-- Publish the complete V3 identity before any remote dispatch. Legacy rows remain readable.
ALTER TABLE prism.engine_operation ADD COLUMN attempt jsonb;
ALTER TABLE prism.engine_operation ADD CONSTRAINT native_operation_identity CHECK (
  attempt IS NULL OR ((jsonb_typeof(attempt) = 'object'
    AND attempt->>'schemaVersion' = 'worker-attempt-envelope.v3'
    AND attempt->>'executionId' = attempt_id
    AND request_digest IS NOT NULL) IS TRUE)
);

CREATE FUNCTION prism.guard_native_operation_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, prism AS $$
BEGIN
  IF OLD.attempt IS NOT NULL THEN
    IF NEW.attempt IS DISTINCT FROM OLD.attempt
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
       OR NEW.request_digest IS DISTINCT FROM OLD.request_digest
       OR NEW.operation IS DISTINCT FROM OLD.operation
       OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result)
       OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
      RAISE EXCEPTION 'PRISM_NATIVE_OPERATION_IDENTITY_IMMUTABLE' USING ERRCODE = '23000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER native_operation_identity_immutable BEFORE UPDATE ON prism.engine_operation
FOR EACH ROW EXECUTE FUNCTION prism.guard_native_operation_identity();
