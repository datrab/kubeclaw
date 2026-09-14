-- Expand compatibility for an application rollback after migration 011. Old
-- writers did not send wire_event_id; preserve their original fallback identity
-- without removing the unique deduplication constraint or changing old rows.
CREATE OR REPLACE FUNCTION prism.preference_event_fill_wire_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.wire_event_id IS NULL THEN
    NEW.wire_event_id := COALESCE(NEW.content->>'eventId', NEW.id::text);
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER preference_event_legacy_insert
BEFORE INSERT ON prism.preference_event
FOR EACH ROW EXECUTE FUNCTION prism.preference_event_fill_wire_id();
