ALTER TABLE prism.direction
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES prism.design_document(id),
  ADD COLUMN IF NOT EXISTS source_revision_id uuid REFERENCES prism.design_revision(id);

ALTER TABLE prism.direction
  DROP CONSTRAINT IF EXISTS direction_project_id_direction_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS direction_source_key_idx
  ON prism.direction(project_id, source_document_id, direction_key);
