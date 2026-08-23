-- Prism has not had a production release. There is no legacy project or approval
-- authority to backfill. This migration is part of the first production schema.
CREATE TABLE IF NOT EXISTS prism.design_request (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES prism.project(id) ON DELETE CASCADE,
  architecture_artifact_id text NOT NULL,
  architecture_digest text NOT NULL,
  architecture_revision bigint NOT NULL CHECK (architecture_revision > 0),
  request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS design_request_project_revision_idx
  ON prism.design_request(project_id,architecture_revision);
CREATE INDEX IF NOT EXISTS design_request_project_active_idx
  ON prism.design_request(project_id,created_at DESC) WHERE status='active';
ALTER TABLE prism.approval ADD COLUMN IF NOT EXISTS architecture_digest text;
