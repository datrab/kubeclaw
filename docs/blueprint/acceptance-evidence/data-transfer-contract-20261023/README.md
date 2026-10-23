# Contained-file DATA transfer contract investigation — 2026-10-23

Source baseline: `3d9a31ade4254c15816a2f3e8ae390fc2a67d90e`.
This is a producer/consumer investigation and expanded runtime negative control,
not a positive qualification receipt or a completed acceptance exercise.

## Actual producer and consumer

`RegisteredTestProviderLoader.load` calls `verifiedSnapshot`, which checks the
registered package digest before and after copying its package. The isolated
provider resolves `canonicalModule` within that snapshot. These checks constrain
module identity and integrity. They neither enumerate evidence file contents nor
make arbitrary provider output non-API. The provider receives an evidence
workspace; `instance.execute(invocation, context)` in runner.ts supplies the
result whose declarations are validated, cloned and frozen. Valid declarations
still describe paths, media types and evidence categories, not contained bytes.

The first staging branch selects `errorCandidates` by on-error evidence type;
the second selects `stagedFiles` by completed/output/report evidence types.
Both call `stageEvidenceFiles`. Its `readContainedFile` enforces containment,
regular-file identity and byte limits before publishing the complete Buffer.
No JSON/YAML interpretation occurs in this transfer.

Later `#collectEvidence` selects the error or normal staging directory and
passes each declaration to `this.#store.store`. The configured `evidenceStore`
option can replace `FileEvidenceStore`; therefore the default physical writer
is not the sole publication consumer. Collection also handles runner-generated
log declarations from a separate directory and error-recovery collection.
A proof restricted to the completed provider branch cannot cover those callers.
The default store reads contained bytes, writes them unchanged, and returns
size/digest/URL metadata. The metadata is not a replacement for the document.

## New executed control scope

The existing utility-only runtime test now includes a YAML stream with two API
documents and a Kubernetes JSON List with two complete API objects. Both use
non-authoritative media types (`application/octet-stream` and `text/plain`).
Whole-byte equality is checked after staging AND default storage; digest and
size are independently computed from all input bytes. This catches truncating
a stream to its first document or replacing a List with an envelope summary.
Synthetic ConfigMap/Secret values are fixtures, not cluster or credential data.

All six utility controls pass. No provider process, custom-store implementation,
API client, deployment, Reader exercise or complete producer-family census was
executed by these controls. They establish byte preservation in the original
default utility, not that a future discovery adapter preserves API documents.

## Required next implementation proof

Before qualifying either discovery gate or output-context inventory, add a
failing adapter-level test that feeds a concrete contained-file DATA producer
through the proposed Source-owned transfer proof and checks every document/item
and its original producer, staging and consumer custody. Repeat against a
custom-store context and the error-staging route, or explicitly reject unsupported
contexts without granting a positive role. Assert a changed producer, consumer,
selection or unseen API document fails closed, including warm discovery caches.
A two-document fixture is a negative control, never a finite bound on arbitrary
runtime provider output. Source identity, schema, digest, media type and the
number of registered providers cannot establish such a bound.

Do not modify canonical UNKNOWN roles or ordinary registry receipts. All five
original DATA slots (artifacts.ts41/100, runner.ts1263/1283/1924) remain UNKNOWN.
The original receiver still requires its independent API DATA contract. No
acceptance counts change: 224/261 requirements and 56/89 gates accepted.
`RELEASE_CONFIGURATION_CHANGED: charts/kubeclaw/files/config/knip.json` is
preserved; no release receipts or custody authorities are renewed here.
