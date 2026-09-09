CREATE TABLE prism.agent_job (
  id uuid PRIMARY KEY REFERENCES prism.preference_generation(id),
  project_id uuid NOT NULL REFERENCES prism.project(id),
  operation text NOT NULL CHECK (operation IN ('design-set','revise')),
  session_namespace text NOT NULL,
  session_key text NOT NULL,
  request_digest text NOT NULL,
  request jsonb NOT NULL,
  state text NOT NULL DEFAULT 'accepted' CHECK (state IN ('accepted','running','completed','needs_nova','superseded')),
  fence uuid,
  runner_id text,
  expires_at timestamptz,
  result_digest text,
  result jsonb,
  outcome jsonb,
  attempt_envelope jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state IN ('accepted','superseded')) = (fence IS NULL)),
  CHECK ((fence IS NULL) = (attempt_envelope IS NULL)),
  CHECK ((result_digest IS NULL) = (result IS NULL))
);
CREATE INDEX agent_job_queue_idx ON prism.agent_job(state,created_at,id);
CREATE INDEX agent_job_session_idx ON prism.agent_job(session_key,state);
CREATE TABLE prism.agent_revision_start (
  project_id uuid NOT NULL REFERENCES prism.project(id),
  start_key text NOT NULL,
  request_digest text NOT NULL,
  job_id uuid NOT NULL REFERENCES prism.agent_job(id),
  PRIMARY KEY(project_id,start_key)
);
GRANT SELECT, INSERT ON prism.agent_revision_start TO prism_runtime;
GRANT SELECT ON prism.agent_revision_start TO prism_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON prism.agent_job TO prism_runtime;
GRANT SELECT ON prism.agent_job TO prism_readonly;
