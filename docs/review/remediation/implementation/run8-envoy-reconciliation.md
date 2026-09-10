# Envoy reconciliation onto reviewed Dispatch integration

Fresh remote head `1d7e6f8834b6e3f3f477a5af48832f74f5321757` matches all
3,803 blobs, modes and types of local `6c5678985782eeebd6157b5438ec64b345eaaad0`.
Current remote resume instructions, ledgers, register and original IFR-07-001 /
IFR-25-001 requirements reread. Frozen baseline IDs rederived from remote
`c38779c71bb92bc15c3fcb89930348e5417aa475`: exactly the same 47 IDs as the scope.

Own isolated checkout `run8-envoy`, source `25c6fda`, replays only the previously
independently reviewed Envoy source and evidence. All ten changed source paths
are byte-identical to approved `057005a`; Dispatch and all other base paths remain
unchanged. Existing Product chart changes retained. Immutable third-party cache
files are hardlinked; workspace package links resolve this checkout. No dependency
installation or mutation, deployment, CI run, production change or MAIN update.

## Real rerun results

Official Envoy 1.39.0 asset digest/provenance remains in
`docs/review/evidence/run6-envoy-release-provenance.json`. Executable:
`/workspace/scratch/15fb596e6560/run6-envoy-tools/envoy-1.39.0-linux-x86_64`.
Helm PATH prerequisite: `/workspace/scratch/4e25cf57c177/toolchains/bin`.

- `KUBECLAW_TEST_ENVOY=<absolute executable above> node tests/verification/deployment/check-worker-trust-envoy-native.mjs`: exit 0. All six original configurations validated by actual Envoy; real TLS/filesystem SDS valid → wrong URI → recovered → genuinely expired → recovered. Both installed certificate serial/SAN/validity contexts and subsequent readiness checked; health/bootstrap remain 200, no reused sessions, admin route 404, real stderr failure event. Full sequential rerun saved after reviewer explicitly confirmed its native process exited; initial successful poll segment also retained.
- `node --test tests/verification/deployment/worker-trust-readiness.test.mjs tests/verification/deployment/prism-product-decisions.test.mjs`: 6/6, zero skips, exit 0.
- Original `check-deployment-truth.mjs`, `check-worker-trust-spiffe.mts`, `check-rollout-health.mjs`: all exit 0. Original rollout remains an actual render gate, not a live rollout claim.
- ESLint with `charts/kubeclaw/files/config/eslint.config.mjs` on native/readiness/rollout test files: exit 0.

Raw outputs: `docs/review/evidence/run8-envoy-native-final.txt`,
`run8-envoy-native-initial.txt`, `run8-envoy-chart-gates.txt` in the same directory.
Independent reviewer uses its separate fresh `run8-envoy-review` checkout and
independently generated certificates; prior approval is `0a3cb494fc0c29351b18a52e060cb5550f8ae923`.

## Next action and unchanged boundaries

Independent reviewer must finish fresh-head reconciliation approval; root must
read the fresh integration head before integrating the exact reviewed delta.
If that head changed, reconcile and repeat affected genuine tests first.
No overall finding closure: actual SPIRE gRPC/UDS renewal/attestation, operator
alarm delivery, real Pod rollout and old-peer rejection remain unproved.
IFR-07-001 and IFR-25-001 stay incomplete; no substitute mock/shim or weakened gate.
