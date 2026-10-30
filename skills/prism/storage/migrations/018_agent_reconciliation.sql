-- Preserve every failed attempt before a deliberate, authenticated retry.
ALTER TABLE prism.agent_job ADD COLUMN attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1);
CREATE TABLE prism.agent_reconciliation (
  decision_id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES prism.agent_job(id),
  actor text NOT NULL,
  decision jsonb NOT NULL,
  prior_attempt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT, INSERT ON prism.agent_reconciliation TO prism_runtime;
GRANT SELECT ON prism.agent_reconciliation TO prism_readonly;
