# Independent commands / failures

All commands ran in `/home/node/.openclaw/workspace/kubeclaw-config-c0`. Read-only source discovery used `rg --files`, `rg -n`, `cat`, `sed` and JSON parsing. Only this independent review directory was written.

1. `git rev-parse HEAD` → `367b4f88698a3db3e595eadf44f40a8f973cc932`.
2. `node docs/review/evidence/config-acceptance/c0-completion-20261013/independent-runtime-provider-contract-review-01/replay.mjs` initial exit1: `Error: schema with key or id "https://kubeclaw.dev/schemas/api-flow.v1.json" already exists`. No checks completed/acceptance claimed. Cause: current and target flow schema share$id; reviewer replay initially compiled both into one instance. Corrected replay isolates target schema in a separate Ajv instance, preserving strict validation and every schema constraint.
3. Same command, final exit0:30 observations;9 baseline evidence erasures schema-accepted; root0 schema-rejected; step50 current-accepted/target-rejected; JSON.stringify request524289 bytes and response-definition524289 bytes. No execute/activation/network.
4. `python docs/review/evidence/config-acceptance/c0-completion-20261013/independent-runtime-provider-contract-review-01/capture.py` initial exit1: `KeyError: 'field'`. Some original declaration metadata rows lack top-level field; correction reads original source-field fallback without modifying originals. Snapshot copies already written were only review-owned immutable copies.
5. Same capture command, final exit0:67 fields body-equal,408 canonical cases body-equal,408 native bodies retained,257 coordinates with0 mismatches,122 pinned artifacts with0 mismatches. Exact paths/bytes/lossless snapshots in read-identities.json. These are conservation observations, not semantic PASS.

No existing B checker was run, because it writes author-owned observation files. No tests/new generic validators were authored or run. The replay is a specific pure schema/serialization review probe and the Python script captures/navigation-compares inputs.
