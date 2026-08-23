ALTER TABLE prism.corpus_revision
  ADD COLUMN IF NOT EXISTS source_content_digest text;

ALTER TABLE prism.corpus_revision
  DROP CONSTRAINT IF EXISTS corpus_revision_source_content_digest_format;
ALTER TABLE prism.corpus_revision
  ADD CONSTRAINT corpus_revision_source_content_digest_format
  CHECK (source_content_digest IS NULL OR source_content_digest ~ '^sha256:[a-f0-9]{64}$');
