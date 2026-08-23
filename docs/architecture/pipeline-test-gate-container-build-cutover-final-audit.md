# Container-build cutover final audit

The replacement is the sole build authority. The old deploy-coupled `build` suite is absent from the protocol, registry, execution order, dependency graph, and source tree. All 36 parity items remain closed. Static Dockerfile policy remains lint-owned; Kubernetes deployment and health remain separate migrations. A project that needs a running target must declare a Kubernetes or exposure fixture separately and pass it the immutable image output. The shared legacy BuildKit service remains only because the unmigrated Kubernetes fixture suite still uses it.

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
