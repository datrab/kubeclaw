# Artifact store

Provides immutable, canonical-JSON, SHA-256-addressed artifact persistence
behind `artifacts.write` and exact digest-verified reads behind
`artifacts.read`.

Blobs are stored below `blobs/sha256`, never by a caller-controlled path.
Artifact metadata uses the shared pipeline durable-record interface. The
embedded file driver stores metadata in `records/store.json`. It does not use
the former `catalog.jsonl` file.
Repeated writes of identical content are idempotent. Reads require the exact
digest and re-verify content integrity. Conditional workflow stages may use
`get_latest_json` to resolve the newest catalogued artifact by namespace and
artifact ID; the adapter still verifies its recorded digest before returning
the value. `maxArtifactBytes` optionally bounds
accepted payloads and defaults to 16 MiB.

`artifactRoot` selects the embedded driver root. `maximumRecords` and
`maximumStoreBytes` bound its metadata store. A later remote driver can keep
the same artifact capability and durable-store contract.

The adapter admits the bounded metadata record before it writes the blob. A
failed metadata admission cannot leave an unreferenced blob. If blob storage
has a transient failure, the same idempotent request completes the missing
content-addressed write on retry. Reads expose only metadata whose blob is
present. A pending newest record does not hide an older completed artifact.

`npm test` executes real filesystem writes, deduplication, exact reads,
corruption detection, size enforcement, cancellation, and unsupported
operations without agents or the E2E harness.

New producers can explicitly select `payload.encoding: "kubeclaw-json.utf16.v1"`
for `put_json`; the persisted ArtifactRef records the same closed encoding tag.
New implementation-agent completion artifacts use this portable codec. Omitted
encoding retains historical bytes for other producer contracts; unknown codecs
reject. Reusing a stored idempotency key with a different encoding/reference
rejects rather than reidentifying existing data.

`get_json_bytes` and `get_latest_json_bytes` use the same digest/latest selection,
ownership grants and blob store as their existing counterparts. They return
`schemaVersion: "artifact-json-bytes.v1"`, `jsonBytes`, `value`, `digest`,
`sizeBytes`, and `artifact`. JSON text is the original stored content, including
historical ordering. SDK source readers, repair evidence, human approval,
project summary, pipeline-review evidence and demo evidence/handoff verify that
proof instead of reserializing the value under their local locale. Existing
`get_json` / `get_latest_json` response fields remain unchanged.

The codec changes outer artifact bytes only. Embedded semantic digests (review
subjects, source input approval, report/cache identity, repair orders and other
legacy domains) are not migrated or silently recalculated. Each needs its own
producer/consumer version cutover before general pipeline locale portability
can be claimed. Deploy these SDK, registry, writer and reader changes together;
old adapters do not implement the new explicit read operations.

New exact `get_json_bytes` additionally requires `payload.reference` containing
the complete expected ArtifactRef; the recorded producer and encoding must match.
It can therefore read an older legitimate ref even after another producer wrote
identical bytes under the same artifact ID. Missing reference rejects; an
existing ID/digest with incompatible expected metadata reports
`ARTIFACT_REFERENCE_CORRUPT`. Latest byte reads keep their existing current-run
latest selection and the caller verifies the complete returned ref.
