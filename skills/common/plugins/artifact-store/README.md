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
