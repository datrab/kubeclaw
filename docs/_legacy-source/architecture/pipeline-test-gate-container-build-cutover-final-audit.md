# Container-build cutover final audit

Status: source cutover complete; production acceptance pending deployment

Audience: pipeline maintainers and reviewers

Purpose: record the final Suite 3 cutover evidence.

The replacement is the sole build authority. The old deploy-coupled `build`
suite is absent from active code and configuration. All 36 parity items remain
closed. Project scaffolding creates the replacement node. The generated image
flows to the Kubernetes fixture by a typed link. Nova uses the plan route.
Buster starts the plan runtime and keeps the legacy worker on a separate port
for suites that are not migrated.

The live gate will use the real BuildKit daemon and registry. It will check the
pushed manifest digest, Nova import, failure retries, cancellation, timeout,
and restart recovery. It uses no mock or emulator.

The deployed Buster image does not contain this plan runtime yet. Deploy the
current image before you run the live gate.

Verification: `npm run verify:test-gate:container-build-cutover`.

The final Terra/high branch review reported no actionable finding and classified
the patch as correct. Earlier review cycles found and fixed: post-cutover parity
verification, bounded registry streaming, repository and scratch-root
containment, registry endpoint binding, cutover-to-parity binding, registry
credentials for the BuildKit push, TLS enforcement for credentials, and generic
secret-key build arguments. Later review cycles added case-independent provider
checks, an operator-owned build-argument allowlist at the capability boundary,
and preserved registry-integrity failure codes. A proposal to restore the removed build/deploy
side effect was rejected because `BUILD-SCOPE-002` and `BUILD-DEFECT-001`
require build, deployment, exposure, and health to remain separate authorities.
