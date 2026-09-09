CREATE TABLE prism.design_round (
  id uuid PRIMARY KEY REFERENCES prism.preference_generation(id),
  project_id uuid NOT NULL REFERENCES prism.project(id),
  design_request_id uuid NOT NULL REFERENCES prism.design_request(id),
  architecture_digest text NOT NULL,
  architecture_revision bigint NOT NULL,
  parent_round_id uuid REFERENCES prism.design_round(id),
  source_document_id uuid REFERENCES prism.design_document(id),
  source_revision_id uuid REFERENCES prism.design_revision(id),
  start_key text NOT NULL,
  start_digest text NOT NULL,
  feedback jsonb NOT NULL,
  request jsonb NOT NULL,
  result_digest text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,start_key)
);
ALTER TABLE prism.design_request ADD COLUMN current_round_id uuid REFERENCES prism.design_round(id);
ALTER TABLE prism.design_document ADD COLUMN design_round_id uuid REFERENCES prism.design_round(id);
CREATE INDEX design_document_round_idx ON prism.design_document(design_round_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON prism.design_round TO prism_runtime;
GRANT SELECT ON prism.design_round TO prism_readonly;
