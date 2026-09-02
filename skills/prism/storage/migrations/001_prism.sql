CREATE TABLE IF NOT EXISTS prism.project (
  id uuid PRIMARY KEY, external_id text NOT NULL UNIQUE, name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','approved','archived')) DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS prism.brief_revision (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES prism.project(id), revision integer NOT NULL,
  schema_id text NOT NULL, content jsonb NOT NULL, content_digest text NOT NULL, parent_revision_id uuid REFERENCES prism.brief_revision(id),
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id, revision), UNIQUE(project_id, content_digest)
);
CREATE TABLE IF NOT EXISTS prism.design_document (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES prism.project(id), document_key text NOT NULL,
  current_revision_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id, document_key)
);
CREATE TABLE IF NOT EXISTS prism.design_revision (
  id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES prism.design_document(id), revision integer NOT NULL,
  schema_id text NOT NULL, content jsonb NOT NULL, content_digest text NOT NULL, parent_revision_id uuid REFERENCES prism.design_revision(id),
  operation jsonb, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, revision), UNIQUE(document_id, content_digest)
);
ALTER TABLE prism.design_document DROP CONSTRAINT IF EXISTS design_document_current_revision_fk;
ALTER TABLE prism.design_document ADD CONSTRAINT design_document_current_revision_fk FOREIGN KEY (current_revision_id) REFERENCES prism.design_revision(id);
CREATE TABLE IF NOT EXISTS prism.direction (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES prism.project(id), direction_key text NOT NULL, title text NOT NULL,
  summary text NOT NULL, proposal jsonb NOT NULL, preview_artifact_id text, content_digest text NOT NULL,
  state text NOT NULL CHECK (state IN ('proposed','selected','rejected','superseded')), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, direction_key)
);
CREATE TABLE IF NOT EXISTS prism.baseline (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES prism.project(id), design_revision_id uuid NOT NULL REFERENCES prism.design_revision(id),
  bundle_key text NOT NULL, bundle_revision integer NOT NULL, bundle_digest text NOT NULL UNIQUE, bundle_artifact_id text NOT NULL,
  approval_id text NOT NULL, specification_digest text NOT NULL, criteria_digest text NOT NULL, preview_index_digest text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id, bundle_key, bundle_revision)
);
CREATE TABLE IF NOT EXISTS prism.rights_policy (
  id uuid PRIMARY KEY, retention text NOT NULL CHECK (retention IN ('full','derived','analysis-only','temporary','forbidden')),
  retain_original boolean NOT NULL, allow_derivatives boolean NOT NULL, allow_embedding boolean NOT NULL,
  allow_design_use boolean NOT NULL, valid_until timestamptz, basis text NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prism.corpus_item (
  id uuid PRIMARY KEY, corpus_key text NOT NULL UNIQUE, kind text NOT NULL, status text NOT NULL CHECK (status IN ('active','restricted','expired','removed')),
  current_revision_id uuid, created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS prism.corpus_revision (
  id uuid PRIMARY KEY, corpus_item_id uuid NOT NULL REFERENCES prism.corpus_item(id), revision integer NOT NULL,
  source_kind text NOT NULL, source_locator_hash text, captured_at timestamptz, normalized jsonb NOT NULL,
  searchable_text text NOT NULL, search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', searchable_text)) STORED,
  content_digest text NOT NULL, normalization_version text NOT NULL, rights_id uuid NOT NULL REFERENCES prism.rights_policy(id),
  source_artifact_id text, analysis_artifact_id text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(corpus_item_id, revision), UNIQUE(corpus_item_id, content_digest)
);
ALTER TABLE prism.corpus_item DROP CONSTRAINT IF EXISTS corpus_item_current_revision_fk;
ALTER TABLE prism.corpus_item ADD CONSTRAINT corpus_item_current_revision_fk FOREIGN KEY (current_revision_id) REFERENCES prism.corpus_revision(id);
CREATE TABLE IF NOT EXISTS prism.corpus_embedding (
  corpus_revision_id uuid PRIMARY KEY REFERENCES prism.corpus_revision(id), model text NOT NULL, model_version text NOT NULL,
  normalization_version text NOT NULL, source_digest text NOT NULL, embedding vector NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prism.preference_event (
  id uuid PRIMARY KEY, project_id uuid REFERENCES prism.project(id), subject_id text NOT NULL, event_type text NOT NULL,
  content jsonb NOT NULL, consent_scope text NOT NULL CHECK (consent_scope IN ('project','personal')), occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prism.engine_operation (
  idempotency_key text PRIMARY KEY, attempt_id text NOT NULL, operation text NOT NULL, output_kind text, output_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS prism.approval (
  id text PRIMARY KEY, project_id uuid NOT NULL REFERENCES prism.project(id), design_revision_id uuid NOT NULL REFERENCES prism.design_revision(id),
  design_digest text NOT NULL, approved_by text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id, design_digest)
);
CREATE INDEX IF NOT EXISTS design_revision_latest_idx ON prism.design_revision(document_id, revision DESC);
CREATE INDEX IF NOT EXISTS corpus_revision_search_idx ON prism.corpus_revision USING gin(search_vector);
CREATE INDEX IF NOT EXISTS corpus_revision_rights_idx ON prism.corpus_revision(rights_id);
CREATE INDEX IF NOT EXISTS preference_event_subject_idx ON prism.preference_event(subject_id, occurred_at DESC);

GRANT USAGE ON SCHEMA prism TO prism_runtime, prism_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA prism TO prism_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA prism TO prism_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE prism_migrator IN SCHEMA prism GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prism_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE prism_migrator IN SCHEMA prism GRANT SELECT ON TABLES TO prism_readonly;
