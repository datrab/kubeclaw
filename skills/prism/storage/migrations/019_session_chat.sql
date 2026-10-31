-- Chat is conversation, not a preference-generation event.
ALTER TABLE prism.agent_job DROP CONSTRAINT agent_job_id_fkey;
ALTER TABLE prism.agent_job DROP CONSTRAINT agent_job_operation_check;
ALTER TABLE prism.agent_job ADD CONSTRAINT agent_job_operation_check CHECK (operation IN ('design-set','revise','chat'));
ALTER TABLE prism.agent_job ADD COLUMN preference_generation_id uuid GENERATED ALWAYS AS (CASE WHEN operation='chat' THEN NULL ELSE id END) STORED REFERENCES prism.preference_generation(id);
CREATE TABLE prism.agent_chat (
  job_id uuid PRIMARY KEY REFERENCES prism.agent_job(id),
  document_id uuid NOT NULL REFERENCES prism.design_document(id),
  origin_job_id uuid NOT NULL REFERENCES prism.agent_job(id),
  subject_id text NOT NULL,
  message_key text NOT NULL,
  message text NOT NULL,
  reply text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(document_id,subject_id,message_key)
);
GRANT SELECT, INSERT, UPDATE ON prism.agent_chat TO prism_runtime;
GRANT SELECT ON prism.agent_chat TO prism_readonly;
