CREATE EXTENSION IF NOT EXISTS vector;
DROP SCHEMA IF EXISTS prism_spike CASCADE;
CREATE SCHEMA prism_spike;

CREATE TABLE prism_spike.corpus_revision (
  id bigint PRIMARY KEY,
  product_family text NOT NULL,
  source_family text NOT NULL,
  category text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'restricted', 'removed')),
  allow_design_use boolean NOT NULL,
  searchable_text text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', searchable_text)) STORED,
  embedding vector(16) NOT NULL
);

CREATE INDEX corpus_revision_text_idx ON prism_spike.corpus_revision USING gin (search_vector);
CREATE INDEX corpus_revision_eligibility_idx ON prism_spike.corpus_revision (status, allow_design_use, category);

CREATE OR REPLACE FUNCTION prism_spike.search_corpus_v1(
  query_text text,
  query_embedding vector(16),
  required_category text,
  result_limit integer DEFAULT 50,
  candidate_limit integer DEFAULT 100
) RETURNS TABLE (
  id bigint,
  product_family text,
  source_family text,
  category text,
  text_rank bigint,
  vector_rank bigint,
  rrf_score double precision
) LANGUAGE sql STABLE AS $$
WITH eligible AS (
  SELECT c.*
  FROM prism_spike.corpus_revision c
  WHERE c.status = 'active'
    AND c.allow_design_use
    AND (required_category IS NULL OR c.category = required_category)
),
text_candidates AS (
  SELECT e.id, row_number() OVER (
    ORDER BY ts_rank_cd(e.search_vector, websearch_to_tsquery('simple', query_text)) DESC, e.id
  ) AS rank
  FROM eligible e
  WHERE e.search_vector @@ websearch_to_tsquery('simple', query_text)
  ORDER BY ts_rank_cd(e.search_vector, websearch_to_tsquery('simple', query_text)) DESC, e.id
  LIMIT candidate_limit
),
vector_candidates AS (
  SELECT e.id, row_number() OVER (ORDER BY e.embedding <=> query_embedding, e.id) AS rank
  FROM eligible e
  ORDER BY e.embedding <=> query_embedding, e.id
  LIMIT candidate_limit
),
fused AS (
  SELECT coalesce(t.id, v.id) AS id,
    t.rank AS text_rank,
    v.rank AS vector_rank,
    coalesce(1.0 / (60 + t.rank), 0) + coalesce(1.0 / (60 + v.rank), 0) AS rrf_score
  FROM text_candidates t
  FULL OUTER JOIN vector_candidates v USING (id)
)
SELECT e.id, e.product_family, e.source_family, e.category,
  f.text_rank, f.vector_rank, f.rrf_score
FROM fused f
JOIN eligible e USING (id)
ORDER BY f.rrf_score DESC, e.id
LIMIT result_limit;
$$;
