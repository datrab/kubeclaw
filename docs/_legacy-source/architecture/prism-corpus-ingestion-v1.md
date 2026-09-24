# Prism Corpus Ingestion v1

Status: accepted architecture contract

## Decision

Prism uses one small, safe ingestion path:

```text
policy check
  -> isolated acquisition
  -> quarantine and validation
  -> normalization
  -> exact duplicate check
  -> embedding
  -> immutable corpus revision
  -> searchable corpus
```

An item is not searchable until all required steps succeed.

## Design goals

The ingestion system must be:

- easy to use with safe defaults;
- horizontally scalable through stateless workers;
- customizable through reviewed source adapters and restrictive policy packs;
- reliable after retries, failures, rights changes, and deletion requests;
- independent from external provider identities and schemas.

## Canonical record

Each published corpus revision stores only the durable facts that Prism needs:

- Prism-owned corpus item ID and immutable revision;
- source class;
- restricted source locator or locator digest when required;
- source and content digests;
- acquisition time;
- rights, retention, attribution, and expiry rules;
- normalized design analysis and searchable text;
- content-addressed artifact references;
- normalization, analysis, and embedding versions;
- parent revision when one exists;
- publication status.

Provider IDs and provider response formats do not become corpus identities or
canonical fields.

## Source classes

V1 supports public web sources, open-source projects, design systems, internal
projects, user uploads, generated material, and temporary provider research.

Each source class uses an installed source adapter. The adapter knows how to acquire
and normalize that source. Source adapters are reviewed code. Project data cannot
install an adapter or arbitrary fetcher.

## Rights policy

Policy is checked before durable acquisition. The effective policy can be stricter
than the requested policy. It cannot silently become less strict.

V1 retention modes are:

- `full`: retain permitted original content, analysis, and embedding;
- `derived`: retain only permitted derivatives, analysis, and embedding;
- `analysis-only`: retain normalized analysis and a permitted embedding;
- `temporary`: retain source content only for a bounded task;
- `forbidden`: retain no source content, derivative, or embedding.

When rights are unclear, Prism uses temporary handling or blocks ingestion for
review. Rights and safety restrictions are never relaxed to increase corpus size.

## Isolated acquisition

Acquisition runs in a bounded ingestion worker. It does not run in Prism control or
Studio.

The worker has restricted egress, no Kubernetes service-account token, no platform
secrets, bounded redirects, bounded response size, bounded execution time, and
isolated temporary storage. It rejects unsupported protocols, private network
targets, metadata endpoints, decompression bombs, uncontrolled downloads, and
redirects to blocked targets.

Public acquisition respects access controls, applicable terms, source rate limits,
and the Robots Exclusion Protocol. Crawler permission does not by itself grant
storage or reuse rights.

## Quarantine and validation

New content enters quarantine before Prism can use it. Validation checks media type,
size, digest, decoding, active content, archive contents, required metadata, and the
effective rights policy.

Unsafe or invalid content does not enter Studio, retrieval, generation, or the
published corpus. SVG and other active formats are sanitized and converted by an
approved tool or rejected.

## Normalization

Normalization creates bounded design information such as surface, view and flow
types, states, audience, traits, patterns, components, strengths, risks, suitable
contexts, unsuitable contexts, and accessibility evidence.

The record distinguishes observed facts from inferred information. Prism must not
present an inferred behavior as an observed fact.

## Duplicate handling

V1 performs exact duplicate detection with content digests. It reuses an existing
content entity instead of storing another binary copy.

Near-duplicate and semantic-similarity checks can suggest related items. They do not
merge records automatically. Advanced duplicate automation is deferred until real
corpus data proves that it is necessary.

## Embedding and publication

Prism creates an embedding only when the rights policy permits it. The embedding is
derived from the immutable corpus revision and records the model, model version,
normalization version, and source digest.

Publication is atomic from the corpus user's perspective. A revision becomes
searchable only after policy, validation, normalization, required artifacts,
embedding, and exact duplicate handling succeed. A failed attempt leaves no partial
searchable revision.

## Retry and scaling model

One logical corpus item is one idempotent Design Engine ingestion attempt. Stateless
workers can process different items in parallel.

```text
ingestion queue
  -> worker 1
  -> worker 2
  -> worker n
```

A retry with the same content, policy, and processing versions returns the existing
result. It does not create a duplicate revision. Large content moves through the
artifact store and never through Nova or Prism control payloads.

Separate capture, analysis, or embedding worker pools are added only after measured
resource or scaling needs justify them.

## Customization

Prism supports two versioned extension types:

- source adapters: reviewed code for acquisition and normalization;
- ingestion policy packs: data that restricts acquisition, retention, attribution,
  expiry, and permitted use.

Projects can select stricter policies. They cannot weaken platform rights or
security rules. Customization changes supported sources and policy. It does not add
runtime authority.

## Refresh and deletion

A changed source or processing version creates a new immutable corpus revision. An
unchanged source does not create a redundant revision.

When rights expire or a deletion request is accepted, Prism immediately removes the
item from retrieval and stops new design use. It then removes governed source
content, derivatives, and embeddings as required. It keeps only the minimum audit
record that policy requires.

Published Baseline Bundles are immutable. Prism must not silently rewrite one. A
rights incident can restrict distribution and require an explicit replacement
baseline.

## Reliability rules

- PostgreSQL stores canonical ingestion and corpus records.
- The artifact store holds content-addressed files.
- Embeddings and search indexes are rebuildable derived data.
- Every artifact is verified by digest before publication.
- Incomplete revisions never enter retrieval.
- Retries are idempotent.
- Expired or restricted items leave retrieval immediately.
- Provider-specific identity never becomes Prism identity.
- Logs use internal IDs and digests and do not contain credentials or private source
  content.

## Deferred work

V1 does not require a provenance graph, graph database, C2PA processing, automated
near-duplicate merging, scheduled recrawling, several specialized worker pools,
generated-prompt archives, or complex corpus-tier workflows.

These features can be added behind the accepted corpus and ingestion interfaces when
legal, operational, quality, or scale evidence proves their value.

## Acceptance checks

Point 9 is implemented only when tests prove that:

1. policy runs before durable acquisition;
2. unsafe content remains quarantined;
3. blocked network targets cannot be reached;
4. exact retries do not create duplicate revisions;
5. incomplete attempts never become searchable;
6. expired rights remove an item from retrieval immediately;
7. governed artifacts and embeddings can be deleted deterministically;
8. a new source adapter cannot weaken platform policy;
9. workers scale horizontally without shared local state;
10. external provider identity does not enter canonical corpus contracts.
