# Validation and open acceptance

Environment: Node v24.19.0. Dependencies installed with `npm ci --ignore-scripts --no-audit --no-fund` after an offline cache miss. No cluster deployment or image build/publication was performed. Logs in `validation/` retain successful checks and unsuccessful attempts.

| Check | Result | Scope / limitation |
| --- | --- | --- |
| Delivery v3 contract, compiler, stage boundary, durability and cancellation; semantic compiler and inner owners | PASS: 20 tests, 0 failures, 0 skipped | Original registered owner paths, subprocess kill/replay and cancellation; local evidence, not external provider acceptance. `delivery-integration.log` |
| Ops MCP Node tests | PASS: 16 tests | Includes local HTTP/TLS/process and Hubble adapter checks; no real cluster/Hubble flow claim. `ops-integration.log` |
| Cilium policy contracts | PASS: 4 tests | Policy structure and drift handling. Same log |
| Nova TypeScript and Project Summary build | PASS | First portion of `types-integration.log`; the compiler run later in that log failed, separately explained below |
| Lint unit, package/adapter boundary, discovery, ESLint discipline, new type-evidence rules, remediation | PASS | `lint-final.log` contains passing suites before the final environment-blocked function test |
| Lint full package test | BLOCKED / exit 1 | Final `live-function.test.ts` expected success but received blocked: shellcheck and shfmt are not installed. The adapter correctly reported `lint-tool-binary-missing`. This suite is not reported as green |
| Lint TypeScript build | PASS after transient fixture cleanup | `lint-build-clean-final.log`; previous `lint-build-final.log` failed on leftover temporary rule-test inputs |
| Project compiler / legacy authoring import | PASS on stable source | `compiler-stable-final.log`; executedStages=0 and nativeAcceptance=false. Earlier concurrent tests modified the lint package after discovery; immutable-package checks correctly rejected those attempts |
| Versions and generated Knip config | PASS: 22 version checks / 50 plugins | First portion of `static-final.log` |
| Deployment truth and Ops MCP workflow YAML | PASS | `deployment-final.log`. Old DNS-policy/port-text assertions were updated for central Cilium policy structure and quoted ports; the same resolver/service requirements are checked |
| Cilium/deploy shell syntax | PASS | Per Ops integration command |
| Historical acceptance harnesses | Syntax PASS: 15 files; execution NOT RUN | Explicit immutable source/baseline/evidence prerequisites not assembled. Several are historical failure reproducers |
| Archive/inventory verifier | PASS | 262 branches; 278 restored docs; 897 original document blobs validated; 261 non-main refs eligible after publication and fresh ancestry check |
| Cleanup script | Python syntax checked; remote execution NOT RUN | No direct Git credentials and no connector delete-ref operation |

## Integration defects found and fixed

The old lint branch invoked main's now-asynchronous process executor synchronously. The combined implementation now awaits bounded execution, propagates cancellation, awaits tracked-file partitioning, and the empty-target adapter test awaits its result. Earlier failing logs are retained (`lint-integration.log`, `lint-integration-fixed.log`). Assertions were not disabled.

The Cilium branch moved namespace DNS coverage to the central clusterwide policy and encoded ports as strings. Deployment assertions now inspect the actual central selector and both TCP/UDP resolver rules, and accept quoted service ports. A failed pre-adjustment run remains in `static-final.log`.

Concurrent lint rule tests create temporary source files, which can invalidate a compiler registry's immutable package snapshot. Compiler runs during those mutations failed closed. Temporary test directories were quarantined outside the checkout and compiler/build verification repeated on stable source. This is not a reason to relax package integrity checks.

## Still open after consolidation and deletion

- Install shellcheck and shfmt and rerun `npm test --prefix skills/nova/plugins/lint` for its genuine shell-tool function test.
- Run historical acceptance harnesses only with their requested original v2 evidence and immutable candidate/baseline roots. See their directory README and original branch provenance; do not synthesize missing historical proof.
- Run the newly restored Prism concurrent worker-resource attribution acceptance in its required native environment. Syntax/source integration is not a claim that this harness passed.
- Live Cilium migration, clusterwide baseline installation, Hubble authorization/flow visibility, Argo CD reconciliation, and real Kubernetes policy enforcement require a cluster. Static checks do not prove live enforcement. Review/apply central policy prerequisites before removing old policies.
- Native PostgreSQL, delegated writable cgroup-v2, real browser, external provider/OpenClaw and end-to-end production/recovery gates remain open as recorded in the prior review documents. Earlier environment constraints (root PostgreSQL execution, read-only cgroups, browser timeouts and restricted semantic helper execution) have not been bypassed or relabeled as success.
- Full repository/product acceptance, image builds and publication, deployment rollout and production release were not executed as part of this consolidation. Existing finding/status registers retain their actual open state.

These open checks do not block integrating the source and preserving history, per the user's explicit decision. They must still be satisfied before anyone claims the corresponding acceptance or production behavior is verified.
