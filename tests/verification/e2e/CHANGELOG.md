# Real E2E Harness Changelog

## 2026-07-16

- Normalized restored checkpoints so harness-owned runtime defaults, scenario module scope, and generated `.swarm` contracts are refreshed before each scenario mutation.
- Added suite/scenario selection controls and boundary-aware execution so module and gate scenarios stop after the contract under test instead of continuing through the full pipeline.
- Disabled terminal extras outside full-pipeline scope and normalized all harness agent models to the configured fallback model.
- Hardened evidence contracts so success, failure, module-boundary, and degraded-observability checks validate only the phases that actually ran.
- Added the failure-matrix contract audit to materialize every suite/scenario in fresh and restored modes without launching agents, catching stale checkpoint, scope, model, and malformed-output assumptions before real runs.
- Tightened Buster identity, timeout, completion, and Redis selection authority so Buster-focused scenarios fail through the module/Buster owner rather than generic runtime config paths.
- Updated retryable Forge malformed-output evidence to require deterministic malformed publication plus retry rejection/recovery, while keeping Echo malformed output as the terminal malformed-gate case.
- Verified suite 2 `module-failure-retry` green from the resumed failing point through completion.
- Hardened suite 3 `human-gates` by preserving typed gate failure classes, mapping review timeouts to canonical timeout terminals, and validating pipeline-review timeouts as terminal generator failures.
- Moved pipeline review E2E authority fully into `swarm.config.json`, scrubbed stale `progress.pipeline_review` from restored checkpoints, and fixed `SWARM_CONFIG` precedence so run-scoped config wins over platform defaults.
- Reordered terminal completion generators so pipeline review runs before case study; a failing pipeline review now halts before optional case study work.
- Verified suite 3 `human-gates` green from the resumed failing point through completion.
- Fixed suite 4 run config generation so Buster Redis adapters use the canonical repo-registered tool path instead of a cloned worktree path; `buster-gate-failure` and `namespace-lease-denied` then reached and passed their intended final-Buster contracts.

## 2026-07-17

- Replaced the Buster namespace lease controller's JavaScript entrypoint with a compact Go binary while preserving the existing `BusterNamespaceLease` CRD, spec/status fields, finalizer, RBAC, and Helm values contract.
- Updated the namespace-controller image to build via the existing GitHub image workflow from `cmd/buster-namespace-controller/**`, using a Go build stage and distroless non-root runtime.
- Removed the legacy JS controller source and updated Docker, Helm, deployment truth checks, and docs so the Go controller is the only namespace-controller implementation path.
- Hardened Suite 5 `git-authority` by routing pre-Buster Git sync errors through canonical Git failure classification, preserving raw Git diagnostics for evidence root-cause checks, and applying module-boundary success evidence to non-retry success scenarios such as dirty-worktree preservation.
- Verified Suite 5 `git-authority` green from `git-dirty-worktree-preserved` through completion.
- Hardened Suite 6 runtime-infrastructure evidence by starting the pipeline lifecycle before Redis preflight and preserving the root Redis connection error as the canonical `econnrefused` terminal class.
- Verified Suite 6 scenarios `redis-unavailable`, `architecture-validator-block`, and `pipeline-cancelled` green with early scenario boundaries.
- Hardened Suite 6 degraded-observability handling so Discord delivery failures are not muted by expected-failure harness policy, terminal extras stay disabled for the scenario, and degraded evidence is rechecked before recording clean completion.
- Verified `discord-unavailable` green from its restored terminal-delivery checkpoint.
- Aligned `pipeline-summary-failure` evidence with the canonical terminal-generator failure class emitted by Nova (`error` for unavailable generator execution).
- Hardened Suite 7 module-graph evidence so it derives the canonical four-module graph from `progress.real_e2e.multi_module`, validates dependency-aware Buster task ordering, and allows sibling modules to complete in either order.
- Verified Suite 7 `module-graph` green from `multi-module-dependent-success` through completion after confirming `multi-module-independent-success` independently.
- Scoped module/git crash-resume scenarios to the module boundary and made crash queue evidence boundary-aware, so non-controller crash scenarios no longer require skipped final-Buster queue tasks.
- Derived crash-resume lock wait budgets from `config.locks.pipeline_run.lease_ms` so the harness waits for the same lease contract Nova enforces after an injected crash.
- Changed crash-resume injection to use `SIGKILL` and signal-based evidence, preserving `SIGTERM` for explicit cancellation scenarios.
- Fixed crash-resume Buster handoff semantics so resumed modules adopt an in-flight Buster dispatch from durable status identity, poll that dispatch, and avoid republishing or archiving the same queued attempt.
- Moved module Buster `TESTING` lifecycle emission to the dispatch hook so durable crash-resume state records Buster dispatch/session identity instead of stale Forge identity.
- Projected module phase-start session refs into canonical active-session read models so crash recovery can replay lifecycle events and still adopt interrupted Forge/Buster dispatches.
- Cleared prior active sessions when lifecycle replay enters a new module phase without session identity, preventing stale Forge sessions from blocking Buster crash resume.
- Included dispatch/session identity in module phase-start lifecycle idempotency so restored identity-less checkpoint markers cannot mask a later real Buster dispatch event.
- Preserved observed-terminal Buster dispatches during stale recovery so the resumed Buster phase polls the durable completion instead of resetting and republishing the task.
- Removed the non-product `real_e2e.crash_injected` event from crash lifecycle evidence; durable crash authority is now the crash marker plus the production checkpoint.
