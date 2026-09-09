CREATE TABLE prism.preference_project_policy (
  project_id uuid NOT NULL REFERENCES prism.project(id),
  subject_id text NOT NULL,
  personal_enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY(project_id,subject_id)
);
CREATE TABLE prism.preference_generation (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES prism.project(id),
  subject_id text,
  snapshot_digest text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
