# PCR-SDK-001: portable canonical JSON cutover design

Status: read/design only. No SDK, codec, contract, migration, store or activation
implementation is authorized by this document. Inventory describes the current
working tree. `../design/sdk-canonical-consumers.json` lists 80 canonical-related production
files, including 57 direct SDK consumers and 149 direct SDK call sites. It records
local schema literals and source locations; imported version constants and
transitive aliases are classified below rather than guessed from filenames.

## Decision

Do not replace localeCompare inside the current public canonicalJson in place.
The remaining fix needs an explicit digest-format cutover, not a digest fallback.
Use a portable UTF-16 code-unit ordering for a new SDK codec, retain the old codec
only behind declared legacy contract readers, and start new execution identities
under a new recorded serialization profile. Do not rehash an existing effect,
wait, worktree, review decision or artifact in place.

An SDK-only helper addition would prepare the fix but would not finish it: current
writers and readers must select the new profile together. Conversely, changing
the helper alone silently changes existing artifact bytes and some identifiers.

The smallest safe operational transition is a **new-run/storage epoch**, with
previous runs retained and readable but not silently resumed in the new epoch.
A resumable mixed-version migration is a larger separate design: old unresolved
effects and operator waits cannot be converted into new identities safely.

## Proven byte incompatibility

Actual Node subprocesses, ICU 78.3, serialize the same object differently:

| Producer locale | Input | Bytes | SHA-256 suffix |
| --- | --- | --- | --- |
| en-US | `{ä:1,z:2,a:3}` | `{"a":3,"ä":1,"z":2}` | `db1796e0fb21fbd70c2b4b7ade2a3570a4ace8b2eeb1fe14d324360c6c72bcb2` |
| sv-SE | same | `{"a":3,"z":2,"ä":1}` | `9aabdc44156f32357daefadaa7dcee25eb3b1c98f9a1aeaf560b345590e18e95` |

There is also an insertion-order defect on one host: localeCompare considers
composed `é` and decomposed `é` equal. Two objects containing both distinct keys
with identical values in opposite insertion order retain that order and have
different old hashes. No Unicode normalization may merge these keys.

Old records do not record locale/ICU. A schema-version branch alone cannot
reconstruct unknown historical collation across machines. Retained original
artifact bytes can be verified directly, independently of locale. Historical
semantic digests requiring reserialization need their producer environment or
an explicitly captured legacy profile; do not try several serializers and accept
whichever matches. Unknown provenance must remain an explicit legacy-validation
limitation, not be converted into purportedly verified new data.

## Persisted consumers and version gaps

| Boundary and actual source | Persisted identity / current format | Cutover requirement |
| --- | --- | --- |
| artifact-store adapter; core artifact-checkpoints; SDK source-revision; approval, implementation, Prism and review readers | ArtifactRef has **no schemaVersion or serialization field**. Closed schema has artifactId, namespace, mediaType, digest, sizeBytes, producer. Blob bytes are SDK canonical JSON; metadata is inside pipeline-durable-record.v1. | New reference/read contract must identify the serialization profile or expose authenticated original bytes. Generic payload `schemaVersion` is insufficient: artifact-store accepts arbitrary JSON. Old blob bytes/ref hashes stay immutable. |
| effects/identity.ts, durable-invocation.ts | effect ID hashes idempotency key, attempt, capability, operation and resource. effect-request.v2/effect-receipt.v2 have schema versions but no canonicalization tag. runtime.dispatch lock key also uses this ID. Payload equality uses SDK canonical JSON. | Bind new request identity to an explicit format/profile; exact version dispatch for old receipts. Never calculate a replacement ID for an already accepted request. Fixed ordinary ASCII fields often retain bytes, but the format must still be declared. |
| SDK runtime-workspace; git-workspace/workspace-ownership; runtime-dispatch/workspace-target | runtime-workspace.v1; generation hashes owner object. Owner file path separately hashes workspacePath text. Stored owner JSON uses SDK bytes. | Version owner reference/generation together. Do not rename, adopt, delete or transfer ownership of existing worktrees during conversion. Text-path hash is unaffected. |
| runtime-dispatch/openclaw.ts | collector-v5/session-v1 transport identity hashes `{dispatchId,payload}`; persisted collector paths/session identity derive from it. runtime-agent-attestation.v1 hashes identity. | New collector generation/profile and attestation version; no reuse of a pre-cutover collector as a new attempt. “Attestation” here is a digest, not an asymmetric signature. |
| core lifecycle/wait-request.ts; wait-store adapter | wait-request.v2 / wait-record.v2 / wait-value.v1. Orchestrator wait ID hashes an array of run/stage/attempt (no object sorting); duplicate comparisons use SDK JSON. | Array ID bytes are unaffected by ordering alone. Retain outstanding wait IDs and history; never turn an old decision into a new wait's authority. |
| state/plugins.ts and state-store adapter | plugin-state-entry.v2, plugin-state-record.v2/plugin-state-value.v1; SDK canonical JSON used for duplicate comparison. | No SDK-derived stored hash in these comparisons. Keep existing record versions; perform semantic comparison with the declared record profile if formats are mixed. |
| repository-adapter/revision-reader.ts and review repository/context/snapshot readers | manifestDigest, pathsDigest, inventoryDigest, referencesDigest, rangesDigest; several response objects have **no own schemaVersion** and become inputs to persisted review snapshots. | Introduce a versioned proof envelope and migrate producer/consumer together. Arrays of plain path strings have unchanged bytes; structured arrays/objects must follow the selected profile. |
| review graph, source snapshot, policy/profile/governor, runtime attestation, compilation, jobs, coverage | review-graph.v1, review-source-snapshot.v1, review-policy.v2, repository-review-profile.v1, review-governor.v1, runtime-agent-attestation.v1, scalable-review-compilation.v1, scalable-review-job.v1, review-coverage.v1 | Version hashed contract bodies or add a required versioned digest envelope. Existing parsers compare exact versions; a central function change alone is not sufficient. |
| review map, caches, reports, prepared plans, revalidation, simplification | repository-review-map.v1, review-content-cache.v1, review-report.v2, repository-review-prepared-plan.v1, repository-review-plan.v1, repository-review-report.v1, repository-finding-revalidation.v1, simplification-facts.v1, simplification-candidate-manifest.v1; subordinate cluster/proposal/cache keys often have no independent version | Bump owning contract versions and bind subordinate keys to that version. Preserve old cache blobs; start a new versioned cache namespace rather than deleting or reinterpreting them. Canonical JSONL map readers also require the matching profile. |
| project-summary; core telemetry/audit; project compiler/CLI | delivery-manifest.v1, pipeline-audit.v1; compiled pipeline-definition.v2 and printed definitionDigest; requirement evidence digest | New owning format for self-verifying outputs. The raw journal sourceRecordHash remains unchanged. Compiled source representation must match the recorded graph/run profile. |

The effects module exports the SDK serializer as `canonical`, which is also used
by memory-locks. This is an in-memory key, not a second durable lock hash. File
resource-lock IDs instead hash `type + NUL + canonicalId` directly.

### Adjacent locale algorithms that an SDK change will not repair

Core execution/graph.ts and engine-snapshots.ts have their own localeCompare
serializers. Execution graph arrays/edge lists are also locale-sorted before
hashing, so replacing an object-key serializer alone does not make graph IDs
portable. Their existing envelopes are execution-graph-snapshot.v2 and
run-snapshot.v1. New-run cutover needs new graph/run versions and deterministic
ordering of those lists too. adapter-support.ts has a separate locale serializer
for capability request digests; its in-flight dedupe must follow the same profile.

### Independent formats: do not migrate with the SDK

- Nova FileJournal hashes JSON.stringify of `{sequence,previousHash,entry}`;
  its outer record has no schema version. This is insertion-preserving raw journal
  representation, not SDK canonical JSON. Retain every old line/hash chain.
- Effect result references (effect-result-reference.v1) hash the stored serialized
  result bytes, not SDK canonical bytes. Preserve them.
- Foundation durable records/blobs/delivery/attempts use the independent
  pipeline-observability codec (raw UTF-16 ordering), not SDK canonicalJson.
  Their outer payload digests remain valid when old artifact metadata is retained.
- Remote source snapshot Ed25519 signatures use pipeline-test-gate's explicit
  signing domain and observability codec. Worker trust Ed25519 signatures use
  pipeline-worker-core's already ordinal codec and `kubeclaw-worker-trust-v1`.
  No direct SDK canonical signature dependency was found. Do not resign either.
- Repository revision HMAC proof is random activation-key HMAC over
  `attemptId + NUL + head`, not SDK JSON. It is intentionally activation-local.
- Raw artifact/content/git/image/binary hashes and SDK sha256Text/sha256Bytes do
  not change. A content hash identifies exact bytes, not a serialization method.

## Concrete implementation sequence (requires separate authorization)

1. Define `sdk-json-utf16.v2`: plain JSON domain already accepted by the hardened
   SDK, exact UTF-16 code-unit key order, no locale, normalization or silent
   undefined conversion. Keep JSON.stringify scalar spelling and array order.
   Do not call it full RFC8785 unless invalid-Unicode admission is separately
   aligned: current SDK accepts lone surrogate strings that JSON.stringify escapes.
   Iterative traversal can remove call-stack dependence without an arbitrary tiny
   depth cutoff; capacity limits belong to each existing ingress/store boundary.
2. Add explicit profile selection to new **run-snapshot.v2** / new execution graph
   format, and to the corresponding source schemas that generate SDK types.
   Artifact references need a self-contained version/profile for export outside a
   run; the current closed ArtifactRef schema cannot accept an extra field. Use a
   new protocol/reference contract, not an undocumented optional field. Effect
   requests likewise need an explicit new identity format. This is the minimum
   coordinated contract surface, not an SDK-only patch.
3. Migrate the enumerated versioned payload writers and verifiers together. Bind
   hashes to owning version/profile; add version to unversioned repository-proof
   responses. Keep SHA-256 byte digest syntax unchanged. Audit locales used to
   order arrays before hashing (review inventories/graphs as well as core graph).
4. At the artifact read boundary, verify retained raw bytes against the existing
   reference before parsing. Return/consume that authenticated representation,
   rather than reserializing a parsed legacy value under the current locale.
   New references explicitly select the new serialization contract. Legacy
   metadata is recognized only through its declared legacy store/run format;
   there is no content-based or failed-hash fallback.
5. Add strict version-dispatched read-only readers for retained old runs and
   owning payload formats. Unknown versions fail. Legacy semantic-digest checking
   must use a declared original runtime/collation profile; if unavailable, expose
   raw verified history with its explicit limitation rather than claim successful
   semantic validation. The schema did not save enough information to invent it.
6. Before activation, produce a read-only inventory of owned runs/stores, pending
   effects/waits, package pins, artifact formats and available producer profiles.
   Let existing accepted operations finish/reconcile under their pinned old
   runtime. Unresolved operations block an automatic cutover; no forced clear.
7. Explicitly configure fresh owned execution/artifact/cache namespaces and new
   run IDs for the new profile. Preserve the old locations as read-only history.
   Do not delete, rename or rewrite existing journal/blob/worktree data. Existing
   runs cannot be silently resumed with new hashes; if resumed at all, select
   their explicit legacy runtime/contract. A full resumable migration would need
   an additional transaction/identity mapping design and is not proposed here.

Adding a portable function while all production callers retain the old implicit
one does not close PCR-SDK-001. Likewise, absence of known active production data
is not evidence that deletion or an unversioned clean start is authorized.

## Reviewable validation before activation

- Native subprocess vectors under en-US, sv-SE and tr-TR; reversed insertion
  order, composed/decomposed distinct keys, supplementary characters and integer
  object keys. New bytes identical across locales; old golden bytes unchanged.
- Retained real artifact blobs, effect journals, runtime owner records and review
  caches read through exact old-version dispatch. Corruption/unknown profile fails;
  no fallback serializer or old-record rewriting.
- New artifact writer + core checkpoint + every named reader agree on one byte
  contract. Tampered parsed data cannot replace authenticated raw artifact bytes.
- New effect/collector identities never replay a pending old request under a new
  ID. Old receipt lookup remains tied to its original request and idempotency key.
- Original restart, source-revision, approval, review cache/map, delivery and audit
  tests run with both explicit read formats and the new write format. Plugin
  package pins and graph snapshots prevent mixed-version execution.
- Migration/activation preflight fails on unresolved ownership, unavailable legacy
  profile or nonempty unexpected destination. No deletion or foreign-store writes.
