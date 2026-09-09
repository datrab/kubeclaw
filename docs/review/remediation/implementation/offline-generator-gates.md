# Offline production generator and contract gates

Scoped implementation, resumed and independently rechecked 2026-09-09. No commit, deployment, CI run, provider substitution, or native cluster execution.

The actual real E2E generator lacked the explicit coverage policy required by the production runner. Its final unit suite also ran only the last module verifier. The generator now authors module requirements, owned source paths, and mandatory checks independently of whichever nodes remain in a plan. Final cumulative coverage includes every selected module, and the generated final suite executes each selected module's original `npm run verify:<module>` command. Existing required final integration/security/browser checks and intentional failure nodes remain intact. Scoped one-module scenarios stay scoped.

The cloned repository's actual HEAD is captured immediately after cloning, before fixture writes, and persisted in `progress.real_e2e.coverage_base_revision`. Generation and resume reuse that commit. Before writing, `git merge-base --is-ancestor <base> HEAD` verifies that it exists as a commit in the current history. Missing legacy metadata rejects explicitly rather than guessing or refreshing a baseline. The offline direct materializers now initialize and commit their real fixture repository and record its actual HEAD. This is trusted harness metadata, not an authentication mechanism.

Three stale verification assumptions are corrected:

- The runtime cutover source scan rejects the four explicitly retired authorities already identified by the original gate. It no longer bans every `.v1` substring: registered data/provider contracts have independent versions. Positive retired-string rejection and supported-version negatives exercise the same scanner. Preflight counts are compared with the actual generated graph and activated production registry, with mandatory production stage/module assertions preserved.
- Kubernetes cutover verifies the actual registered image output and fixture input schemas, then resolves and checks the typed producer-to-consumer link. A real exposure output linked into the image port rejects with `TEST_PLAN_LINK_SCHEMA_MISMATCH`. The nested implementation checks the named deployment output rather than assuming output-array order; generated credentials legitimately precede it.
- Tailscale uses the installed genuine kubectl path. Its offline summaries now explicitly identify injected executor vectors and `nativeCluster:false`; the prior `mocks:0` summary was misleading.

Evidence (all commands run from repository root; PATH prefixed with `/workspace/scratch/4e25cf57c177/toolchains/bin` for kubectl gates):

| Command | Result and raw log |
| --- | --- |
| `node --test tests/verification/e2e/production-graph-validation.test.mts contracts/pipeline-test-gate/v1/tests/coverage.test.mts tests/verification/e2e/retired-harness-contracts.test.mjs` | 9/9, `docs/review/evidence/offline-generator-coverage-final.txt` |
| `node --test tests/verification/e2e/fixture-coverage.test.mjs` | 1/1, `docs/review/evidence/offline-generator-baseline-final.txt` |
| `node --test tests/verification/e2e/real-run-workspace.test.mjs tests/verification/deployment/registry-health.test.mts` | 64/64, `docs/review/evidence/offline-generator-workspace-initial.txt` |
| `node tests/verification/e2e/audit-failure-matrix-contracts.mjs` | 92 materialized cases across 8 suites, `docs/review/evidence/offline-generator-failure-matrix-final.txt` |
| `node tests/verification/e2e/check-v2-production-contracts.mts` | PASS, `docs/review/evidence/offline-generator-v2-final.txt` |
| `node tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts` | PASS, `docs/review/evidence/offline-generator-kubernetes-final2.txt` |
| `node tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts` | PASS, `docs/review/evidence/offline-generator-tailscale-final.txt` |
| `node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs <14 source paths below>` | PASS, `docs/review/evidence/offline-generator-lint-final.txt` |
| `git diff --check -- <14 source paths below>` | PASS |

The production graph test actually executes all four original verifier commands. It then removes a mandatory declaration and changes one to advisory, resolves through the original production harness, and confirms missing/advisory coverage without reducing the independently authored policy. The original coverage suite retains skipped, excluded, missing, matrix, and invalid-policy assertions. No provider success outcomes are invented. The baseline test runs the scoped original verifier, commits generated policy, resumes without changing coverage, and fetches a real unrelated Git commit to prove lineage rejection before writes.

Intermediate logs are retained. `offline-generator-kubernetes-initial.txt` records an incorrect negative-test output name; `offline-generator-kubernetes-final.txt` records the stale nested output-index assumption. Both were corrected, not suppressed. Original registry-health failure evidence remains unchanged.

Boundaries: dry-run graph validation and contract vectors do not establish real Nova agent execution, loaded Buster server → provider → registry execution, Kubernetes admission/TokenReview, cluster lifecycle, Tailscale publication, or deployed workload/Ready behavior. Kubernetes implementation, parity and cutover summaries now also explicitly report `injectedExecutorVectors:true` and `nativeCluster:false`; their injected executor responses are classified as offline contract evidence. Actual native/live gates remain open.

Original source scope (14 paths; resumed scope additionally includes `tests/verification/contracts/check-pipeline-kubernetes-fixture-parity.mts`):

```
tests/verification/e2e/fixture-coverage.mjs
tests/verification/e2e/fixture-coverage.test.mjs
tests/verification/e2e/real-run-workspace.mjs
tests/verification/e2e/production-graph-validation.test.mts
tests/verification/e2e/audit-failure-matrix-contracts.mjs
tests/verification/deployment/registry-health.test.mts
tests/verification/e2e/check-v2-production-contracts.mts
tests/verification/e2e/retired-harness-contracts.mjs
tests/verification/e2e/retired-harness-contracts.test.mjs
tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts
tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts
tests/verification/contracts/check-pipeline-tailscale-exposure-implementation.mts
tests/verification/contracts/check-pipeline-tailscale-exposure-parity.mts
tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts
```

The previous freeze covered these 14 source files, this note, and the 13 original evidence files. The resumed package has 15 source files because the Kubernetes parity summary also needed correction. No project compiler, runtime policy, or other concurrent source changes belong to this slice. The changes to `capabilities.mts` and `check-real-e2e-capabilities.mjs` belong to Buster readiness, not this package.

## Resumed verification, 2026-09-09

The earlier implementation was reviewed causally against D03/D08/D10. The final gate runs every selected module's original verifier; the independently authored policy does not shrink when declarations are deleted or made advisory. The recorded Git baseline remains unchanged during resume and rejects unrelated history before generator writes. Schema-link validation uses the installed original registry and resolver, including a wrong-schema negative case. Existing assertions were preserved. The only additional source change during this resume corrects the three Kubernetes evidence summaries; no new executor doubles or substitutions were introduced.

All commands below completed with exit code **0** from the repository root. Raw new logs are in `docs/review/evidence/resume-20260909/offline/`:

| Command | Result | Log |
| --- | --- | --- |
| `node --test tests/verification/e2e/production-graph-validation.test.mts contracts/pipeline-test-gate/v1/tests/coverage.test.mts tests/verification/e2e/retired-harness-contracts.test.mjs tests/verification/e2e/fixture-coverage.test.mjs tests/verification/e2e/real-run-workspace.test.mjs` | 71 passed, 0 skipped | `coverage-workspace.log` |
| `node --test tests/verification/deployment/registry-health.test.mts` | 3 passed, 0 skipped; original providers and real local TLS/auth endpoints | `registry-health.log` |
| `node tests/verification/e2e/audit-failure-matrix-contracts.mjs` | 92 locally materialized cases, 8 suites | `failure-matrix.log` |
| `node tests/verification/e2e/check-v2-production-contracts.mts` | Production graph dry-run passed: 16 stages, 48 packages | `v2-contracts.log` |
| `PATH=/workspace/scratch/4e25cf57c177/toolchains/bin:$PATH node tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts` | Offline contract gate passed | `kubernetes.log` |
| `PATH=/workspace/scratch/4e25cf57c177/toolchains/bin:$PATH node tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts` | Offline contract gate passed | `tailscale.log` |
| `node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs <15 paths in source-paths.txt>` | Passed | `lint.log` |
| `git diff --check -- <15 paths in source-paths.txt>` | Passed | `diff-check.log` |

This closes the scoped generator and stale offline-gate defects, and adds local support for PATH-T13-001's cumulative-coverage implementation. It does **not** close that finding's outstanding native cumulative pipeline/provider/Ready-delivery acceptance. No deployment, CI invocation, live cluster access, commit or staging was performed in this resumed package. Existing executor-vector gates are supplemental contract evidence, not genuine Kubernetes/Tailscale execution.
