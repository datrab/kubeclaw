ALTER TABLE prism.preference_event ADD COLUMN wire_event_id text;
UPDATE prism.preference_event SET wire_event_id=COALESCE(content->>'eventId',id::text);
ALTER TABLE prism.preference_event ALTER COLUMN wire_event_id SET NOT NULL;
ALTER TABLE prism.preference_event ADD CONSTRAINT preference_event_wire_id_unique UNIQUE(wire_event_id);
ALTER TABLE prism.preference_event ADD COLUMN request_digest text;
ALTER TABLE prism.preference_event ADD COLUMN decision_response jsonb;
ALTER TABLE prism.preference_event ADD CONSTRAINT preference_event_receipt_pair CHECK ((request_digest IS NULL) = (decision_response IS NULL));
