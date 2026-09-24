# Prism Retrieval and Ranking v1

Status: accepted architecture contract

## Decision

Prism uses a small PostgreSQL-native hybrid retrieval pipeline:

```text
structured required/preferred/avoid query
  -> rights and status filters
  -> PostgreSQL full-text candidates
     + exact pgvector candidates
  -> Reciprocal Rank Fusion in PostgreSQL
  -> duplicate and source-family caps in Prism
  -> explained results and coverage gaps
```

V1 does not require a learned reranker, multiple embedding facets, preference score
adjustments, Maximal Marginal Relevance, a retrieval cache service, an approximate
vector index, or a second search database.

## Query contract

```json
{
  "schema": "prism.retrieval-query.v1",
  "mode": "pattern",
  "intent": "Mobile authentication with clear recovery paths.",
  "required": {
    "surface": ["mobile"],
    "flowTypes": ["authentication"],
    "states": []
  },
  "preferred": {
    "audiences": ["consumer"],
    "traits": ["trustworthy", "simple"],
    "patterns": ["password-recovery"]
  },
  "avoid": {
    "traits": ["decorative", "marketing-heavy"]
  },
  "limit": 20,
  "seed": "auth-research-01"
}
```

Required fields are `schema`, `mode`, `intent`, `limit`, and `seed`. Required,
preferred, and avoid maps can be empty.

Allowed modes are:

- `inspiration` for diverse visual directions;
- `pattern` for a concrete interface problem;
- `flow` for a complete journey;
- `consistency` for established project language.

Prism infers design terminology from the brief. Users do not need to construct this
query directly.

## Eligibility filters

Before either retrieval path runs, PostgreSQL excludes items when:

- corpus status is not active;
- rights do not permit design use or embeddings;
- retention has expired;
- the source is removed or restricted for the project;
- a required surface, view, flow, state, or other hard constraint does not match;
- required artifact or analysis integrity cannot be verified.

Rights and safety constraints are never relaxed. When hard filters leave too few
results, Prism reports a coverage gap. It can relax only preferred constraints,
search an external provider, schedule ingestion, or continue with fewer references.

## Candidate generation

PostgreSQL runs two searches over the same eligible corpus revisions:

1. Full-text search over normalized title, summary, surface, view and flow types,
   states, traits, patterns, components, strengths, risks, and applicability.
2. Exact vector search using the one approved combined corpus embedding.

Each path returns a bounded candidate set. They can execute concurrently. Raw text
and vector scores are not added because their scales are unrelated.

## Reciprocal Rank Fusion

PostgreSQL ranks each candidate list independently and combines them with Reciprocal
Rank Fusion:

```text
score = 1 / (k + text rank) + 1 / (k + vector rank)
```

A missing rank contributes zero. V1 uses one fixed, versioned `k` value. The
mechanical implementation follows the public Supabase PostgreSQL hybrid-search
pattern and pgvector's documented hybrid-search guidance.

One versioned database function, such as `prism.search_corpus_v1`, owns eligibility,
candidate generation, ranking, fusion, ordering, and the bounded candidate limit.
Design judgment does not move into SQL.

## Prism selection policy

The Design Engine receives fused candidates and applies only simple deterministic
selection rules:

- remove exact and near-duplicate captures;
- return no more than two references from one product;
- return no more than three references from one source family;
- include more than one visual family for direction generation when available;
- preserve required coverage across requested states or flow steps.

V1 does not use MMR. Add it only when these caps fail a representative diversity
benchmark.

## Result contract

```json
{
  "schema": "prism.retrieval-result.v1",
  "queryDigest": "sha256:...",
  "corpusVersion": "corpus-2026-08-14",
  "retrievalVersion": "prism-retrieval-v1",
  "embeddingModel": "approved-model-version",
  "results": [
    {
      "corpusItemId": "reference-01",
      "corpusRevision": 3,
      "reasons": [
        "Matches mobile authentication",
        "Contains a password recovery path"
      ],
      "matchedRequired": ["surface", "flowTypes"],
      "matchedPreferred": ["trustworthy", "password-recovery"],
      "textRank": 4,
      "vectorRank": 2,
      "rrfScore": 0.0318,
      "artifactId": "artifact:..."
    }
  ],
  "coverage": {
    "requested": 20,
    "returned": 17,
    "gaps": ["Few strong compact recovery examples"]
  }
}
```

Studio normally shows plain-language reasons rather than numerical scores.

## Normalized searchable fields

Corpus normalization supplies:

- title and summary;
- surface, view types, flow types, and states;
- audiences and industries;
- visual and interaction traits;
- patterns and components;
- accessibility strengths and risks;
- general strengths and risks;
- applicable and unsuitable contexts;
- separately recorded craft, usability, accessibility, originality,
  implementation-clarity, and evidence-confidence observations.

These remain JSONB and searchable text initially. Promote fields into columns or
indexes only after query plans demonstrate a need.

Quality dimensions remain separate observations. V1 does not collapse them into a
universal score or use them as arbitrary ranking multipliers.

## External fallback

External providers are not part of the primary index. Prism uses them when the local
corpus has a declared coverage, quality, freshness, or diversity gap.

Durable external evidence passes normal ingestion and rights checks and receives a
Prism-owned identity. Policy can permit temporary use during the current research
session without durable ingestion, but Prism marks it as external and temporary.

## Reproducibility

Retrieval is reproducible from:

```text
query digest
+ corpus version
+ embedding model version
+ retrieval function version
+ selection policy version
```

Do not introduce Redis solely for retrieval caching. Add a disposable cache only
after measurements show it is useful.

## Benchmark and growth triggers

The first benchmark uses a deliberately varied corpus, representative queries,
human-labelled relevance, expected diversity, and explicit coverage-gap cases.

Measure precision and recall at useful result counts, diversity, eligibility-filter
correctness, p50 and p95 latency, explanation correctness, and gap detection.

- Add HNSW only when exact-search p95 misses the accepted target.
- Add embedding facets only after material benchmark relevance improvement.
- Add a learned reranker only after deterministic fusion plateaus and enough trusted
  labels exist.
- Add Qdrant only when PostgreSQL fails measured latency, scale, workload-isolation,
  or multi-vector requirements.

These changes remain internal to the retrieval interface and do not change corpus,
Design Document, Studio, Design Engine, or Baseline Bundle contracts.
