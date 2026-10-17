# Prism design stage

This Nova plugin sends an approved architecture input to the standalone Prism
service. It waits for a human approval. It then imports the immutable Prism
Baseline Bundle.

The approved response includes the actual content-addressed archive. Nova verifies its archive identity, every file checksum, bundle digest, required manifest paths and asset references before persisting the imported archive. Module-plan integration and read-only target materialization for Forge/Buster remain required; this stage alone does not prove that integration.

## Authority

The plugin requests these capabilities:

- `runtime.dispatch`
- `artifacts.read`
- `artifacts.write`
- `operator.request`
- `signal.wait`

Worker Core remains generic. The plugin does not put Prism types in Worker
Core.

## Result

The result contains the approved Baseline Bundle digest and artifact identity.
The stage rejects an invalid operator identity, approval identity, or digest.
It resumes the same durable Nova run after approval.

Wait identity comes from the real durable wait store and is published only after validation. Architecture bytes are verified against the core-provided reference. Tests exercise real wait and Prism artifact stores, including replay, corruption, changed files and unsafe paths; design generation and deployed approval remain separate acceptance checks.
