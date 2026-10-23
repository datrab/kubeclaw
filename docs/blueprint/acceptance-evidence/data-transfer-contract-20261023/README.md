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
executed by these six utility controls. They establish byte preservation in the original
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

## Continued actual runner diagnostics after the first commit

Two additional synthetic-loader diagnostics execute the actual `TestPlanRunner`
with an injected custom EvidenceStore wrapper and a default file-store backing.
They reuse the fixture definitions before `const calls` from the existing
`check-pipeline-test-plan-runner.mts` contract harness; exact generated sources
are retained as `.mts.raw` evidence (absolute imports bind this checkout).
They do not execute the registered-provider sandbox or production providers.

The completed route observes the entire two-document YAML stream at the custom
store's `selected` input, then verifies the complete stream through the final
returned durable evidence URL. The error-route diagnostic deliberately fails
the first custom-store publication, verifies a second call from `error` staging,
and verifies the same full stream through the final evidence URL. The attempt
correctly remains errored with the injected failure; retained evidence is not
reported as successful provider execution.

An initial custom-store destination outside `artifactRoot` was rejected by
`#readManagedEvidence` with `OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN` AFTER the
store had accepted its input. The successful diagnostic places its backing
store inside the authorized artifact root. This is an actual downstream
consumer constraint, not permission to assume arbitrary custom stores are
valid. A separate initial assertion incorrectly named the error directory
`on-error`; Source and the observation establish the actual name `error`.
Both failed attempts are preserved in operations evidence, not overwritten.

These diagnostics strengthen producer/consumer understanding, but still do not
implement or qualify the discovery adapter. They add no acceptance and do not
change Source custody vectors or release receipts. The next adapter-level
negative must include downstream managed-evidence custody, not stop at store().


## Executed downstream loss controls (continuation)

Baseline: `6ae345c26f0e1f6d0cc855cfe202e2c9fd6ce91f`. Four new
synthetic-loader diagnostics retain the original producer, real staging,
injected custom store, and actual managed-evidence consumer. Each custom store
first checks the complete input and lets the default store write it, then
truncates only that store's output file inside `artifactRoot`. It returns the
original artifact metadata, including the now-stale size and digest. No product
Source, registry, classification or release receipt was modified.

| Route | Input | Final durable content | Result |
| --- | --- | --- | --- |
| completed | two YAML documents, 154 bytes | first document, 55 bytes | full-byte assertion fails |
| error staging after injected first store failure | same YAML stream | first document, 55 bytes | full-byte assertion fails |
| completed | two-item JSON List, 221 bytes | first item only, 110 bytes | full-byte assertion fails |
| error staging after injected first store failure | same JSON List | first item only, 110 bytes | full-byte assertion fails |

All four commands exit 1 at the intended assertion AFTER reading the final
durable evidence URL. The completed routes still report `completed`; the
error routes remain `errored` for the deliberately injected first-store
failure. Raw sources and full assertion logs are retained next to this file;
`downstream-negative-manifest.json` pins their exact bytes. These are expected
negative controls, not passing preservation tests or a qualified adapter.

`#persistWorkerCompletion` reads the custom store's URL with
`#readManagedEvidence`, enforcing the file protocol, containment, identity and
byte budget. It then publishes the bytes it actually read to the durable store.
It does not compare them with the earlier staging input or validate the custom
store's returned digest/size against those input bytes. Thus a readable file
inside `artifactRoot`, and even the original full-input metadata, are not a
full-document custody proof. This observation is not a claim that the runtime
promises to distrust every configured store; it invalidates using its current
interface alone as a documentation DATA-preservation authority.

The next adapter-level proof must explicitly reject unsupported custom stores
or independently establish complete-byte equality through the final consumer.
Checking returned metadata alone is insufficient; even a self-consistent digest
of truncated output cannot prove preservation of the producer's original input.
Do not change product runtime behavior merely to make a documentation authority
pass. Runtime hardening, if separately needed, does not itself enumerate the
API documents in arbitrary provider output. The originally requested
producer/discovery-adapter integration test remains unimplemented, including
cold/warm custody changes; these four controls narrow its required contract.
All five DATA slots remain UNKNOWN and all existing acceptance limits remain.
