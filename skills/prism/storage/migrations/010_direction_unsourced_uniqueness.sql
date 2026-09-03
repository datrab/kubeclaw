-- PostgreSQL considers NULL values distinct in a normal unique index. Preserve
-- displaced legacy rows before restoring the per-project direction-key invariant.
CREATE TABLE IF NOT EXISTS prism.direction_duplicate_archive (
  direction_id uuid PRIMARY KEY,
  row_data jsonb NOT NULL,
  archive_reason text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

WITH ranked AS MATERIALIZED (
  SELECT d.id, to_jsonb(d) AS row_data,
    row_number() OVER (
      PARTITION BY d.project_id, d.direction_key
      ORDER BY CASE d.state WHEN 'selected' THEN 0 WHEN 'proposed' THEN 1 ELSE 2 END,
        d.created_at, d.id
    ) AS ordinal
  FROM prism.direction d
  WHERE d.source_document_id IS NULL
), archived AS (
  INSERT INTO prism.direction_duplicate_archive(direction_id, row_data, archive_reason)
  SELECT id, row_data, 'duplicate-unsourced-direction-key' FROM ranked WHERE ordinal > 1
  ON CONFLICT (direction_id) DO NOTHING
  RETURNING direction_id
)
DELETE FROM prism.direction d USING archived a WHERE d.id = a.direction_id;

CREATE UNIQUE INDEX IF NOT EXISTS direction_unsourced_key_idx
  ON prism.direction(project_id, direction_key)
  WHERE source_document_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON prism.direction_duplicate_archive TO prism_runtime;
GRANT SELECT ON prism.direction_duplicate_archive TO prism_readonly;
