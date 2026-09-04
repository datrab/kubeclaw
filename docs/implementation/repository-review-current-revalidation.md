# Repository review current-main revalidation

## Authority

- Current target: `2c7f52f124b429876feff55965950f36fc3cc9e5` (`origin/main`, frozen 2026-09-04).
- Latest completed review: `9d4e7f212b2646d297217924c079ff26df508421` (42 confirmed findings).
- Older completed review: `39bc74b53e4672c5782227ac0c9dd4535a53c72e` (13 confirmed findings).
- This document revalidates behavior against the current target. It does not copy the old verifier verdict forward.
- Monitoring remained disabled and no production state was changed.

## Disposition summary

- Latest inventory: 37 accepted/current, 3 already fixed by removal, 1 rejected, 1 needs additional reproduction.
- Older inventory: 1 accepted/current regression and 12 already fixed.
- Additional sibling regression found during revalidation: 1 accepted/current.
- Actionable backlog: 39 items (4 P1, 30 P2, 5 P3).

The live-PID resource-lock item is not accepted as a defect yet. Current tests explicitly preserve an expired lock while its process is alive to prevent dual execution. A task-lifecycle reproduction is required before changing that safety boundary.

## Validation commands

Commands below were run from the frozen worktree unless noted.

- `V01`: `npm test --prefix skills/common/plugins/secret-resolver` — passed.
- `V02`: `npm test --prefix skills/common/plugins/command-runner` — passed.
- `V03`: `npm test --prefix skills/nova/plugins/implementation-agent` — passed.
- `V04`: `npm test --prefix skills/common/plugins/runtime-dispatch` — passed.
- `V05`: `npm test --prefix skills/common/plugins/agent-observability` — passed.
- `V06`: `npm test --prefix skills/buster/plugins/kubernetes-fixture` — passed.
- `V07`: `npm test --prefix skills/common/plugins/wait-store` — passed.
- `V08`: `npm test --prefix skills/common/plugins/git-workspace` — passed.
- `V09`: `npm test --prefix skills/buster/plugins/size-budget` — passed.
- `V10`: `node tests/verification/contracts/check-pipeline-observability-durable-attempts.mts` — passed.
- `V11`: `node tests/verification/contracts/check-plugin-system-v2-phase7.mjs` — passed.
- `V12`: `node tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts` — passed.
- `V13`: `node tests/verification/e2e/checkpoints.test.mjs` — 6/6 passed.
- `V14`: `node tests/verification/e2e/approval-operator.test.mts` — 3/3 passed.
- `V15`: `node tests/verification/e2e/run-real-pipeline-failure-matrix.test.mjs` — 18/18 passed.
- `V16`: `npm run test:domain --prefix skills/prism` — 3/3 passed.
- `V17`: `node --test skills/prism/tests/studio-adapter.test.mts` — 8/8 passed.
- `V18`: `node --test contracts/prism/v1/tests/contracts.test.mts` — passed.
- `V19`: `node tests/verification/deployment/check-deployment-truth.mjs` — passed.
- `V20`: P1 boundary harness: confidential secret resolution returned a value with zero fence calls.
- `V21`: P1 boundary harness: unsandboxed `CommandRunner` read `/etc/hostname` despite a `/tmp` writable root.
- `V22`: P1 boundary harness: merge completed, cleanup threw, and the implementation stage returned `blocked`.
- `V23`: P1 manifest harness: mutable LiteLLM image, `Always` pull policy, environment Secret, and mounted Secret all present.
- `V24`: `go test ./cmd/buster-namespace-controller` — not executable in this environment because Go is absent; current Go behavior was checked through source/caller tracing and must run in the fix worktree/CI.
- `V25`: `npm test` in `spikes/prism/puck-adapter` — baseline package cannot resolve its declared Vitest runner; domain behavior was reproduced directly and the dependency defect is recorded with the item.

Passing existing tests do not negate a finding when the reported branch is uncovered. Each accepted code fix must add a failing regression test first.

## Latest 42 findings

| ID | Disposition | Sev | Owner / package | Root-cause group | Current evidence | Validation |
|---|---|---:|---|---|---|---|
| C01 | accepted/current | P3 | namespace-controller | simplification | `nullIfEmpty` remains defined and has no caller. | V24 + `rg -n 'nullIfEmpty' cmd/buster-namespace-controller/main.go` |
| C02 | accepted/current | P2 | plugin-foundation/observability | state-recovery | `evaluateCompleteness` still calls `admittedTail(pipelineRunId, 1)` and compares that one-record set to each closure `recordCount`. | V10 |
| C03 | accepted/current | P2 | namespace-controller | deployment-operations | `BUSTER_CONTROLLER_POLL_MS` is converted directly to a duration; zero and negative values reach both sleep loops. | V24 |
| C04 | accepted/current | P2 | agent-observability contract | contracts-data | `isJsonSafe` recurses into arrays without adding/removing the array in `seen`; a self-array reaches stack exhaustion. | contract typecheck plus direct source trace |
| C05 | accepted/current | P2 | nova-core/execution | state-recovery | `Date.parse(invalid)` is `NaN`; `now >= NaN` is false, so `RevocableLease.assertActive` accepts an invalid expiry. | V11 |
| C06 | accepted/current | P2 | deploy/preflight | deployment-operations | `cmd_nova_kubernetes_fixture_preflight` still assigns the literal Secret name and ignores argument 3/environment, although its caller passes a selected name. | V12, V19 |
| C07 | accepted/current | P2 | real-E2E checkpoints | state-recovery | capture and restore still remove the authoritative target before renaming the verified replacement. | V13 |
| C08 | already fixed | P2 | retired buster-suite-runtime | security-trust | The entire legacy package, including `busterEnvironmentSnapshot`, was removed by `b728fb9d4`; successor runtimes pass explicit allowlisted environment fields. | `git show --stat b728fb9d4`; replacement-path search |
| C09 | already fixed | P3 | retired buster-suite-runtime | simplification | The forwarding-only module was deleted with the legacy package in `b728fb9d4`. | `git show --stat b728fb9d4` |
| C10 | accepted/current | P2 | agent-observability contract | contracts-data | Timestamp validation still accepts every non-empty `Date.parse`-compatible string rather than RFC 3339/ISO syntax. | contract typecheck plus direct validator trace |
| C11 | accepted/current | P2 | suite parity reporting | contracts-data | Entry IDs still use host-locale `localeCompare` without a fixed comparator. | `node scripts/suite-parity-report.mjs ... --check` during group fix |
| C12 | accepted/current | P2 | runtime-dispatch | security-trust | HMAC targets accept external plaintext `http:` URLs and trust bounded 2xx JSON as dispatch output. | V04 |
| C13 | accepted/current | P2 | pipeline-test-gate contract | security-trust | Verification checks authority/key/signature but not attestation `schemaVersion` or `algorithm`. | pipeline contract typecheck plus direct verifier trace |
| C14 | accepted/current | P2 | Prism Studio/catalog | contracts-data | One explicit split/overlay child suppresses defaults and produces one child although the catalog requires exactly two. | V17, V18 |
| C15 | accepted/current | P2 | Prism Helm restore proof | deployment-operations | The shell chain drops `prism_restore_proof` only at the beginning and successful end; restore/query failure leaves it behind. | V19 + Helm template inspection |
| C16 | already fixed | P2 | retired buster-suite-runtime | state-recovery | The non-atomic legacy JSONL publisher was deleted in `b728fb9d4`; current artifact storage uses owned durable stores rather than this file. | `git show --stat b728fb9d4`; replacement-path search |
| C17 | accepted/current | P2 | Prism deployment/docs | deployment-operations | Values reference `gatewayToken-prism`; the documented `openclaw-shared-secrets` required-key list still omits it. | V19 |
| C18 | rejected | P2 | real-E2E matrix | contracts-data | The runnable test imports `failure-scenarios.mjs`, which exports both APIs with compatible signatures. The cited `.mts` file is not that test's dependency. The real suite passes 18/18. | V15 |
| C19 | accepted/current | P1 | secret-resolver | security-trust | Confidential resolution skips `fence.assertCurrent` and returns the mapped environment secret. Direct harness observed zero fence calls. | V01, V20 |
| C20 | accepted/current | P2 | agent-observability | contracts-data | Contract declares delivery-target ingress, but neither ingester nor evidence observer subscribes to the emitted delivery-target topic. | V05 |
| C21 | accepted/current | P2 | buster kubernetes-fixture runtime | deployment-operations | Admission allowlists PVC kind but validates neither requested storage, class, nor aggregate capacity. | V12 |
| C22 | accepted/current | P2 | Prism preferences | contracts-data | Invalid `occurredAt` survives projection and produces `NaN` age/effective score. | V16 |
| C23 | accepted/current | P3 | state-store tests | simplification | Package-boundary file list remains `['src/adapter.ts', 'src/adapter.ts']`. | package test plus source assertion |
| C24 | accepted/current | P1 | command-runner | security-trust | Root arguments are emitted only when `sandboxExecutable` exists; direct execution silently ignores supplied roots. Harness read outside the writable root. | V02, V21 |
| C25 | accepted/current | P1 | implementation-agent | state-recovery | Merge happens before `finally` cleanup; cleanup failure becomes `workspaceFailure` and the stage returns blocked despite the completed merge. | V03, V22 |
| C26 | accepted/current | P2 | wait-store | state-recovery | The create path checks signal/fence only before awaiting `store.read`; append has no second authorization/cancellation check. | V07 |
| C27 | accepted/current | P3 | Prism worker-trust template | simplification | `control_upstream_tls` is declared as an anchor and never aliased. | V19 |
| C28 | accepted/current | P2 | verification console | state-recovery | `restore()` restores console streams but never removes the two process listeners installed by `process.once`. | direct source/lifecycle trace |
| C29 | accepted/current | P2 | LiteLLM deployment | deployment-operations | Service still fixes `nodePort: 30050` rather than accepting deployment configuration. | V19 |
| C30 | accepted/current | P1 | LiteLLM deployment | security-trust | `ghcr.io/berriai/litellm:main-latest`, pull-always, `litellm-secrets`, and mounted Google credentials remain in one Pod. | V19, V23 |
| C31 | accepted/current | P2 | real-E2E approval operator | state-recovery | Terminal state is read, transformed, and atomically renamed without compare-and-swap/generation validation; a concurrent terminal writer can be overwritten. | V14 |
| C32 | accepted/current | P2 | git-workspace | contracts-data | `syncPaths` compares both local and remote content with `.trim()`, suppressing whitespace-only changes. | V08 |
| C33 | accepted/current | P3 | container-build preflight | deployment-operations | Temporary root is created before the initial `git rev-parse`, while cleanup starts only in the later `try`; revision failure leaks the tree. | container-build source trace |
| C34 | needs additional reproduction | P2 | nova-core/effect locks | state-recovery | The reported behavior exists, but V11 explicitly requires an expired lock to remain while its owner process is alive to prevent dual execution. Reproduce a dead task within a live process and prove safe ownership transfer before changing policy. | V11 |
| C35 | accepted/current | P2 | tailscale-exposure runtime | state-recovery | Cancellation/failure after the enabling patch has no compensating patch to turn exposure off. | tailscale implementation contracts plus source trace |
| C36 | accepted/current | P2 | pipeline-observability Go contract | contracts-data | Strict decode canonicalizes raw bytes, then unmarshals payload into `any`; later digesting the re-marshaled value loses integers above 2^53. | V24 + cross-language contract trace |
| C37 | accepted/current | P2 | namespace-controller | deployment-operations | Validation accepts `cleanupPolicy=retain`; `expireLease` does not branch on it before namespace deletion. | V24 |
| C38 | accepted/current | P2 | buster kubernetes-fixture runtime | deployment-operations | Lease/pod poll loops pass fixed 15-second child timeouts even when less remains; service polling already uses the correct remaining-deadline pattern. | V12 |
| C39 | accepted/current | P3 | artifact-store tests | simplification | Package-boundary file list repeats `src/adapter.ts`. | package test plus source assertion |
| C40 | accepted/current | P2 | size-budget provider | security-trust | `verifiedFile` closes the checked descriptor and returns a path; baseline/archive readers reopen it later. | V09 |
| C41 | accepted/current | P2 | kubernetes-fixture parity gate | deployment-operations | Gate still asserts `/usr/local/bin/kubectl` rather than resolving the executable through `PATH`. | parity source assertion; V12 |
| C42 | accepted/current | P2 | Prism Puck domain | contracts-data | `node.duplicate` changes only the cloned root ID; descendants retain IDs from the source subtree. | V16, V25 |

## Older 13 regression findings

| ID | Disposition | Sev | Owner / package | Root-cause group | Current evidence | Validation |
|---|---|---:|---|---|---|---|
| O01 | already fixed | P1 | container-build runtime | security-trust | Legacy builder was removed; successor adds `registry.insecure=true` only for an explicitly configured HTTP registry. | container-build implementation contracts |
| O02 | already fixed | P2 | KubeClaw Helm chart | deployment-operations | `kubeclaw.fullname` now requires and DNS-label-validates `agentRole`; deployment truth includes invalid-role rejection. | V19 |
| O03 | already fixed | P3 | lint baseline tooling | state-recovery | Pruning now writes an exclusive temporary file and atomically renames it, with cleanup in `finally`. | source trace |
| O04 | accepted/current | P2 | real-E2E capability probe | deployment-operations | Gateway capability still reports success solely from token presence and performs no authenticated health request. | capability source trace |
| O05 | already fixed | P2 | kubernetes-fixture provider | state-recovery | Cleanup now requires `released.ok === true` and throws otherwise. | V06 |
| O06 | already fixed | P2 | Prism Helm chart | deployment-operations | Helm now fails unless `control.replicas` is exactly one while the RWO artifact claim is shared. | V19 |
| O07 | already fixed | P2 | security provider | contracts-data | Legacy suite was removed; replacement headers provider has an explicit default HSTS minimum of 31536000. | security implementation contracts |
| O08 | already fixed | P1 | Prism deploy | security-trust | Prism templates require SHA-256 digests and deploy uses digest overrides; the old Prism mutable-tag restart path is absent. | V19 |
| O09 | already fixed | P3 | approval operator | simplification | `parseArgs` now returns immediately for help before requiring `statePath`; regression test passes. | V14 |
| O10 | already fixed | P2 | Dockerfile.general | security-trust | General tools now install locked `ioredis` through `docker/general-tools/package-lock.json`; no global install remains in this image. | V19 |
| O11 | already fixed | P2 | retired API suite | state-recovery | Module-global legacy API suite was deleted; replacement provider code has invocation-local logging. | legacy-retirement contracts |
| O12 | already fixed | P2 | buster runner | state-recovery | `#cleanupFixtures` now removes every retained fixture attempt root in `finally` after provider cleanup. | runner source trace |
| O13 | already fixed | P2 | retired timing utility | contracts-data | The bypassing helper was removed with the legacy runtime and has no successor symbol. | legacy-retirement contracts |

## Additional current issue found during regression checking

| ID | Disposition | Sev | Owner / package | Root-cause group | Current evidence | Validation |
|---|---|---:|---|---|---|---|
| N01 | accepted/current | P2 | Dockerfile.buster-gateway | security-trust | The old O10 root cause survives in the sibling image: `npm install -g ioredis@5.11.1` resolves outside the copied lockfile, although Dockerfile.general is fixed. | Docker/deployment contract plus Dockerfile source trace |

## Remediation order

1. P1 secret fencing (`C19`).
2. P1 command isolation contract (`C24`).
3. P1 merge/cleanup result semantics (`C25`).
4. P1 immutable LiteLLM deployment (`C30`).
5. P2 security/trust: `C12`, `C13`, `C35`, `C40`, `N01`.
6. P2 state/recovery/concurrency: `C02`, `C05`, `C07`, `C26`, `C28`, `C31`; keep `C34` outside the fix queue until reproduced.
7. P2 contracts/data integrity: `C04`, `C10`, `C11`, `C14`, `C20`, `C22`, `C32`, `C36`, `C42`.
8. P2 deployment/operations: `C03`, `C06`, `C15`, `C17`, `C21`, `C29`, `C37`, `C38`, `C41`, `O04`.
9. P3 simplification: `C01`, `C23`, `C27`, `C33`, `C39`.
10. Review-plugin reporting, current-branch revalidation, backlog output, and measured efficiency changes.

Each logical change gets its own regression test, focused/package/contract gates, exact-diff Auto Review, manual disposition of every review comment, and a clean rerun before commit and push.
