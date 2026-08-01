# Artifact store

Provides immutable, canonical-JSON, SHA-256-addressed artifact persistence
behind `artifacts.write` and exact digest-verified reads behind
`artifacts.read`.

Blobs are stored below `blobs/sha256`, never by a caller-controlled path.
Repeated writes of identical content are idempotent. Reads require the exact
digest and re-verify content integrity. Conditional workflow stages may use
`get_latest_json` to resolve the newest catalogued artifact by namespace and
artifact ID; the adapter still verifies its recorded digest before returning
the value. `maxArtifactBytes` optionally bounds
accepted payloads and defaults to 16 MiB.

`npm test` executes real filesystem writes, deduplication, exact reads,
corruption detection, size enforcement, cancellation, and unsupported
operations without agents or the E2E harness.
