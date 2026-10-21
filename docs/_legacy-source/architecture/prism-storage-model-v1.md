# Prism Storage Model v1

Status: accepted architecture contract

## Decision

Prism uses one dedicated PostgreSQL database with pgvector and the existing
content-addressed platform artifact store.

```text
Dedicated Prism PostgreSQL database
├── canonical project and revision metadata
├── immutable Design Document JSONB snapshots
├── corpus metadata and normalized analysis
├── rights policies
├── append-only preference evidence
├── PostgreSQL full-text search
└── one combined embedding per corpus revision

Platform artifact store
├── architecture inputs
├── source captures where permitted
├── screenshots, media, prototypes, and reports
├── Design Documents exchanged with workers
└── immutable Baseline Bundles
```

Prism does not use Qdrant, Elasticsearch, a graph database, a document database, or
an event store in v1. A second retrieval database requires measured evidence that
PostgreSQL cannot meet an accepted requirement.

## Database ownership

Prism owns a dedicated database, credentials, migrations, connection limits,
monitoring, backup policy, and restoration procedure. It does not share LiteLLM's
database, schema, credentials, migrations, or lifecycle.

Prism can initially use the same PostgreSQL server as another service, but its
logical database remains isolated and can move to another PostgreSQL deployment
without changing domain or pipeline contracts.

Roles:

- `prism_migrator` changes the schema.
- `prism_runtime` performs normal application reads and writes.
- `prism_readonly` supports bounded operational inspection.

Studio has no database credentials. It accesses data through the Prism API.

## Initial tables

The initial model has twelve focused tables:

```text
project
brief_revision
design_document
design_revision
direction
baseline
corpus_item
corpus_revision
rights_policy
corpus_embedding
preference_event
engine_operation
```

Do not add preference projections, generic artifact links, multiple embedding facet
tables, or copied worker telemetry until a real consumer requires them.

## Common rules

- Internal records use UUID primary keys.
- Timestamps use UTC `timestamptz`.
- Versioned domain records are immutable.
- SHA-256 digests use canonical `sha256:...` text.
- JSON documents use validated `jsonb`.
- Foreign keys protect durable relationships.
- Large binary objects remain in the artifact store.
- Indexes are added for demonstrated query paths, not every JSON field.

## Projects and briefs

`project` stores only Prism's project identity and lifecycle link to Nova.

```text
id, external_id, name, status, current_brief_id,
created_at, updated_at, archived_at
```

`brief_revision` stores immutable brief snapshots:

```text
id, project_id, revision, schema_id, content, content_digest,
parent_revision_id, created_by, created_at
```

The Nova architecture input remains an artifact reference inside the brief. Prism
does not copy Nova's complete project or pipeline state.

## Design state

`design_document` gives one evolving design a stable identity:

```text
id, project_id, document_key, current_revision_id, created_at
```

`design_revision` stores a complete validated Design Document snapshot:

```text
id, document_id, revision, schema_id, content, content_digest,
parent_revision_id, operation, created_by, created_at
```

Views, components, nodes, states, flows, and tokens are not decomposed into tables.
They form one versioned document and are read, validated, migrated, and published
together.

`direction` stores proposals before a complete document exists:

```text
id, project_id, direction_key, title, summary, proposal,
preview_artifact_id, content_digest, state, created_at
```

Direction state is `proposed`, `selected`, `rejected`, or `superseded`.

`baseline` stores immutable publication metadata:

```text
id, project_id, design_revision_id, bundle_key, bundle_revision,
bundle_digest, bundle_artifact_id, approval_id, specification_digest,
criteria_digest, preview_index_digest, published_at
```

Nova owns approval. Prism stores only the trusted approval reference bound to the
published inputs.

## Artifact references

V1 uses explicit artifact-reference columns on owning records. It does not use a
generic polymorphic artifact-link table.

Add a dedicated relation table later only when one owner needs an unbounded set of
queryable artifact relationships.

Artifact upload occurs before the short PostgreSQL transaction:

1. Upload the content-addressed object.
2. Verify its digest.
3. Commit the database reference.
4. Garbage-collect uploads that remain unreferenced.

This prevents committed rows from pointing to incomplete uploads.

## Corpus

`corpus_item` provides a stable Prism-owned identity:

```text
id, corpus_key, kind, status, current_revision_id, created_at, archived_at
```

Initial kinds are `screen`, `flow`, `component`, `design-system`, `style`, and
`asset`. Status is `active`, `restricted`, `expired`, or `removed`.

`corpus_revision` stores immutable normalized knowledge:

```text
id, corpus_item_id, revision, source_kind, source_locator_hash,
source_artifact_id, analysis_artifact_id, captured_at, normalized,
searchable_text, search_vector, content_digest, normalization_version,
rights_id, created_at
```

`search_vector` is a stored PostgreSQL full-text projection of `searchable_text`.
`normalized` initially holds design traits, product and surface context, view and
flow types, components, states, layout, typography, palette, strengths, risks, and
applicability. Point 5 defines its exact retrieval fields from representative query
needs.

`rights_policy` keeps enforcement facts queryable:

```text
id, retention, retain_original, allow_derivatives, allow_embedding,
allow_design_use, valid_until, basis, notes, created_at
```

Retention is `full`, `derived`, `analysis-only`, `temporary`, or `forbidden`.
Detailed ingestion and provenance rules remain workstream 9.

## Embeddings

V1 stores one combined embedding per corpus revision:

```text
corpus_embedding
  corpus_revision_id
  model
  model_version
  dimensions
  normalization_version
  source_digest
  embedding vector(<fixed dimension>)
  created_at
```

The embedding input combines permitted visual evidence with normalized semantic,
layout, component, style, and applicability descriptions.

V1 uses one approved model and fixed dimension. Separate semantic, visual, or layout
facets are added only when retrieval benchmarks show a material relevance gain.

Start with exact vector search. Add HNSW or another approximate index only when
representative p95 latency exceeds the accepted target.

## Preferences and engine operations

`preference_event` stores append-only observations, not mutable taste scores:

```text
id, project_id, subject_id, event_type, context, candidates,
decision, evidence, consent_scope, occurred_at, recorded_at
```

Its exact contract remains workstream 6. Derived preference projections are added
only when the ranking pipeline needs them and remain rebuildable.

`engine_operation` stores only domain idempotency linkage:

```text
idempotency_key, attempt_id, operation, output_kind, output_id,
created_at, completed_at
```

Worker-core remains authoritative for attempt state, logs, progress, errors,
resources, cleanup, digests, and receipts. Prism does not copy them.

## Initial indexes

Create only these known query-path indexes:

- brief revisions by project and descending revision;
- design revisions by document and descending revision;
- directions by project and state;
- baselines by project and descending bundle revision;
- corpus revisions by item and descending revision;
- GIN on corpus full-text `search_vector`;
- corpus revisions by rights policy;
- preference events by subject and descending occurrence time;
- preference events by project and descending occurrence time;
- unique engine operation idempotency key.

Do not create global GIN indexes on every JSONB column. Promote frequently filtered
JSON fields into columns or indexes only after query evidence.

## Transactions and recovery hierarchy

Each domain mutation uses one short PostgreSQL transaction. Saving a design revision
inserts the immutable snapshot and moves the document's current-revision pointer.
Publishing inserts one immutable baseline after the content-addressed bundle exists
and its approval and digests have been verified.

Recovery priority is:

1. Published Baseline Bundles are immutable pipeline truth.
2. PostgreSQL is canonical Prism state and history.
3. The artifact store owns content-addressed large objects.
4. Embeddings, search indexes, and future preference projections are derived and
   rebuildable.

Prism can operate with degraded retrieval while embeddings rebuild. It cannot lose
design revisions, rights state, or published bundle references.

## Scaling triggers

- Add an approximate vector index only after exact-search p95 exceeds the target.
- Add embedding facets only after offline relevance improves materially.
- Add Qdrant only when PostgreSQL fails measured latency, scale, workload-isolation,
  or retrieval-complexity requirements.
- Add read replicas or partitioning only for observed workloads.
- Add tables only for data requiring transactional queries that JSONB cannot serve
  clearly.

These changes remain behind the retrieval and repository interfaces. They do not
change the Design Document, Baseline Bundle, Studio API, or Design Engine contract.
