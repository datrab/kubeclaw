# Phase 6 TypeScript Migration Batch Plan

Purpose: migrate the remaining Nova orchestration/runtime and Common support surfaces to TypeScript without preserving legacy fallback authority.

Phase 6 starts after Phase 5 completion audit commit `0cc4a2e09 docs: record phase five migration completion`.

## Mandatory gates for every Phase 6 batch

Every batch must satisfy these gates before commit.

1. Native Node TypeScript stripping compatibility:
   - Use erasable TypeScript only.
   - Do not use enums, runtime namespaces, parameter properties, decorators, path aliases, import-equals, angle-bracket assertions, or syntax requiring emitted-JS transforms.
   - Keep explicit relative `.ts` / `.js` imports.
   - Use `import type` for type-only imports.
   - Run an unsupported-syntax scan on every migrated `.ts` file in the batch.
   - Prove native Node can import every migrated `.ts` file in the batch.

2. Fallback ledger compliance:
   - Read `docs/ts-migration/fallback-ledger.md` rows for every touched owning file before changing behavior.
   - `DELETE_LEGACY` means delete completely. Do not keep adapters, hidden fallbacks, live bindings, alternate authority, compatibility shims, permissive old shapes, or TODO-preserved branches.
   - `STRICTIFY_TS_SLICE` means remove silent fallback behavior or surface typed degraded/failure evidence.
   - `KEEP_TYPED_POLICY` means preserve the behavior and name it as intentional policy in code/tests/docs.
   - If a row still says `needs user decision`, `USER_POLICY`, or is ambiguous for a touched owning file, stop and ask before changing behavior.
   - Pure role-local facades may remain only when they are accepted external adapters with no runtime behavior or alternate authority.

3. Required verification before each batch commit:
   - Unsupported TypeScript syntax scan on migrated files.
   - Native Node import check for migrated `.ts` files.
   - `scripts/typecheck-ts-migration.sh`.
   - Focused checks listed by the batch below.
   - `tests/verification/run-fast-verification.sh`.
   - `git diff --check`.
   - Commit only after all verification passes.

4. Required final report per batch:
   - Commit hash.
   - Verification evidence.
   - Detailed changelog.
   - `KEEP_TYPED_POLICY` retained.
   - `STRICTIFY_TS_SLICE` strictified.
   - `DELETE_LEGACY` deleted 100%.

## Phase 6 scope

Phase 6 owns Nova/Common surfaces that still carry orchestration authority, typed contract compatibility, or fallback ledger debt after Phase 5:

1. Common agent-observability mapping/masking and shared contract surfaces not completed in Phase 4.
2. Nova public runtime/index/contract surfaces and broad barrels.
3. Nova Git, blueprint, scheduling, recovery, module-runner, gate-runner, polling, completion, validation, observability, and tool/service slices.
4. Nova role-local facades only when required by the owning migration or packaging checks.

Phase 6 does not own unrelated product feature work. It should not add new compatibility layers while deleting old ones.

## Batch order

### P6-B01 — Common/Nova contract boundary cleanup

Status: planned first.

Scope:

1. `skills/common/pipeline/agent-observability/src/mapping.ts`.
2. `skills/common/pipeline/agent-observability/src/masking.ts`.
3. `skills/common/pipeline/services/rate-limit-contract.ts`.
4. `skills/common/pipeline/services/redis-message-contract.ts`.
5. `skills/nova/pipeline/services/contracts/index.ts`.
6. Direct contract import callers/tests.

Ledger rows to resolve before behavior changes:

1. Common agent-observability temporary plugin-event mappings.
2. Common agent-observability minimal masking profile.
3. Common rate-limit recovery action fallback.
4. Common Redis completion canonical-envelope opt-in.
5. Nova contract namespace barrel — `DELETE_LEGACY`.

Rules:

1. Delete the broad Nova contract namespace barrel and migrate callers to direct owning contract modules.
2. Do not preserve alternate contract authority through a new barrel.
3. Canonicalize Redis completion envelope policy before any consumer relies on mixed envelopes.
4. Masking/mapping rows that still require policy input must be resolved before code changes.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-telemetry-contract.mjs
node tests/verification/contracts/check-redis-completion-service-surface.mjs
node tests/verification/contracts/check-rate-limit-slice-surface.mjs
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,telemetry
```

Commit message:

```text
refactor: tighten nova contract boundaries
```

### P6-B02 — Nova public runtime surface and broad barrel deletion

Status: planned after P6-B01.

Scope:

1. `skills/nova/pipeline/core/runtime.ts`.
2. `skills/nova/pipeline/index.ts`.
3. `skills/nova/pipeline/runners/pipeline-runner.ts`.
4. `skills/nova/pipeline/services/failures.ts`.
5. Import harnesses and docs that depend on broad public re-export surfaces.

Ledger rows to resolve:

1. `core/runtime.js` fallback run context — delete legacy runtime globals/fallback identity.
2. `index.ts` public barrel surface — `DELETE_LEGACY`.
3. `pipeline-runner.js` public runner facade/re-exports — accepted only as a narrow external facade if still required by CLI packaging.
4. `failures.js` broad failure barrel — accepted only as a temporary external adapter if callers cannot be migrated in this batch.

Rules:

1. Delete public helper barrels that make internal Nova services public authority.
2. Keep only explicit CLI/runtime APIs required to start, resume, inspect, or dry-run the pipeline.
3. Runtime identity must come from typed run context, not module globals or fallback aliases.
4. Any remaining facade must be pure and documented with no behavior.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/contracts/check-runtime-collisions.mjs
node tests/verification/runtime/check-nova-startup-smoke.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface
```

Commit message:

```text
refactor: narrow nova runtime public surface
```

### P6-B03 — Nova Git, worktree, and blueprint durability

Status: planned after P6-B02.

Scope:

1. `skills/nova/pipeline/integrations/git-worktree.ts`.
2. `skills/nova/pipeline/services/blueprint.ts`.
3. `skills/nova/pipeline/services/git-soft-fail-observability.ts` if still needed after soft-fail deletion/strictification.
4. Callers in pipeline start, scheduling, gate fix, module release, and docs/tests.

Ledger rows to resolve:

1. Git worktree inspection failure policy and dormant destructive recovery branch.
2. Blueprint architecture fetch fallback — `DELETE_LEGACY` unless an explicit typed offline mode is selected before release/sync.
3. Blueprint pipeline-file-only conflict recovery — `DELETE_LEGACY`.
4. Blueprint gate/control commit failures — `STRICTIFY_TS_SLICE`.
5. Selected-path commit/no-change and release idempotency rows marked `KEEP_TYPED_POLICY`.

Rules:

1. Blueprint release/sync must not use possibly stale remote-tracking cache after fetch failure unless typed offline mode is explicit.
2. Rebase conflicts must not be auto-recovered by path heuristics.
3. Gate/control sync can remain non-authoritative only with typed degraded startup evidence.
4. Git durability failures must not be hidden behind PASS/success paths.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-blueprint-commit-scope.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface
```

Commit message:

```text
refactor: migrate nova git blueprint durability to typescript
```

### P6-B04 — Nova module runner and worker-control authority

Status: planned after P6-B03.

Scope:

1. `skills/nova/pipeline/agents/module-worker-control-results.ts`.
2. `skills/nova/pipeline/runners/module-runner-forge.ts`.
3. `skills/nova/pipeline/runners/module-runner-buster-worker.ts`.
4. `skills/nova/pipeline/runners/module-runner/buster-phase.ts`.
5. `skills/nova/pipeline/runners/module-runner-prebuster.ts`.
6. `skills/nova/pipeline/runners/module-runner-shared.ts`.
7. `skills/nova/pipeline/runners/module-runner.ts`.
8. `skills/nova/pipeline/runners/module-runner/attempt.ts`.
9. `skills/nova/pipeline/runners/module-runner/state-machine.ts`.
10. `skills/nova/pipeline/runners/module-runner/terminal-results.ts`.
11. `skills/nova/pipeline/runners/module-runner/buster-phase/*.ts`.
12. `skills/nova/pipeline/services/contracts/worker-control-result.ts` if required by typed worker authority.

Ledger rows to resolve:

1. Forge transcript progress/no-work heuristic — `DELETE_LEGACY`.
2. Forge-only Git soft PASS — `DELETE_LEGACY`.
3. Buster queued notification suite fallback to `none` — `DELETE_LEGACY`.
4. Buster pre-test verdict-presence heuristic — `DELETE_LEGACY`.
5. Buster failure-class inference and identity alias rows before changing worker result behavior.
6. Buster dispatch identity fallback — `STRICTIFY_TS_SLICE`.
7. Poll failure status authority fallback — `STRICTIFY_TS_SLICE`.
8. Existing module-stage defaults, dependency short-circuit, retry-loop grace, validation reset, and optional artifact refs marked `KEEP_TYPED_POLICY`.

Rules:

1. Forge/Buster worker outcomes must be typed worker-control results, not inferred from transcript text, summary text, or verdict presence.
2. Requested Buster dispatch must validate a typed nonempty suite list before queueing.
3. Forge-only PASS requires durable Git persistence or a typed terminal/degraded failure.
4. Compatibility projections may remain only at documented external boundaries and must not authorize worker outcomes.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-module-runner-slice-surface.mjs
node tests/verification/contracts/check-stage-envelope-primitives-surface.mjs
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: migrate nova module worker authority to typescript
```

### P6-B05 — Nova pipeline scheduling, recovery, and state machine authority

Status: planned after P6-B04.

Scope:

1. `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`.
2. `skills/nova/pipeline/runners/pipeline-runner-scheduling/*.ts`.
3. `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`.
4. `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`.
5. `skills/nova/pipeline/runners/pipeline-runner-loop.ts`.
6. `skills/nova/pipeline/runners/pipeline-runner-start.ts`.
7. `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`.
8. `skills/nova/pipeline/runners/pipeline-runner-lock.ts` only if typed scheduling/recovery imports require it.
9. `skills/nova/pipeline/runners/stage-envelope-primitives.ts`.

Ledger rows to resolve:

1. Stale status age reset without session — `DELETE_LEGACY`.
2. Unreadable scheduled validator completion state treated as empty — `DELETE_LEGACY`.
3. Unknown next step type defaulting to module — `DELETE_LEGACY`.
4. Malformed stage ref omission — `STRICTIFY_TS_SLICE`.
5. Generator config merge — `STRICTIFY_TS_SLICE`.
6. Control-file preparation warning-only path — `STRICTIFY_TS_SLICE`.
7. Lock timing, malformed lock blocking, stale lock reclamation, completion idempotency, terminal cost-report noncritical rows marked `KEEP_TYPED_POLICY`.

Rules:

1. Scheduler must operate on explicit typed step kinds; unknown step types fail validation.
2. Recovery must require typed lifecycle/session evidence, not age-only status reset.
3. Corrupt validator completion state must fail closed or require repair.
4. Control-file prep and generator config degradation must be surfaced as typed evidence.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/contracts/check-stage-envelope-primitives-surface.mjs
node tests/verification/contracts/check-status-store-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,restart-recovery
```

Commit message:

```text
refactor: migrate nova scheduling recovery authority to typescript
```

### P6-B06 — Nova gate and review remediation authority

Status: planned after P6-B05.

Scope:

1. `skills/nova/pipeline/runners/approval-gate-runner.ts`.
2. `skills/nova/pipeline/runners/approval-gate-state.ts`.
3. `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts`.
4. `skills/nova/pipeline/runners/gate-runner.ts`.
5. `skills/nova/pipeline/runners/remediable-gate-engine.ts`.
6. `skills/nova/pipeline/runners/review-gate-control.ts`.
7. `skills/nova/pipeline/runners/review-gate-fix-cycle.ts`.
8. `skills/nova/pipeline/runners/review-gate-output.ts`.
9. `skills/nova/pipeline/runners/review-gate-runner.ts`.
10. `skills/nova/pipeline/runners/review-gate-task.ts`.
11. `skills/nova/pipeline/runners/waitable-gate-engine.ts`.
12. `skills/nova/pipeline/services/contracts/gate-control-result.ts` if required by gate-control authority.

Ledger rows to resolve:

1. Gate Forge fix transcript no-change heuristic — `DELETE_LEGACY`.
2. Review first reviewer fallback — `DELETE_LEGACY`.
3. Review output Git commit soft-fail — `DELETE_LEGACY`.
4. Review remediation limit and timeout global-default fallbacks — `STRICTIFY_TS_SLICE`.
5. Review config resolution and existing output PASS/FAIL aliases — `STRICTIFY_TS_SLICE`.
6. Required lint generation warning-only behavior in review setup — `STRICTIFY_TS_SLICE`.
7. Approval timeout policy, gate dispatch errors as step results, invalid adapters fail-closed, review evidence fan-out, cleanup best-effort, and grounded-issue remediation rows marked `KEEP_TYPED_POLICY`.

Rules:

1. Review/gate remediation must use typed gate-control and review contracts, not transcript or compatibility projections as authority.
2. Reviewer identity must be explicit or selected by a typed primary-reviewer policy.
3. Review output publication must be durable typed evidence or fail/degrade the gate result.
4. Legacy PASS/FAIL aliases in review output must be removed unless isolated at an explicit external adapter boundary.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-remediation-handoff-surface.mjs
node tests/verification/contracts/check-session-authority-slice-surface.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,restart-recovery
```

Commit message:

```text
refactor: migrate nova gate review authority to typescript
```

### P6-B07 — Nova polling, completion, and session authority

Status: planned after P6-B06.

Scope:

1. `skills/nova/pipeline/services/agent-observability-forge-completion.ts`.
2. `skills/nova/pipeline/services/buster-completion-controller.ts`.
3. `skills/nova/pipeline/services/completion-adjudicator.ts`.
4. `skills/nova/pipeline/services/completion-event-adapters.ts`.
5. `skills/nova/pipeline/services/polling.ts`.
6. `skills/nova/pipeline/services/polling-dual.ts`.
7. `skills/nova/pipeline/services/polling-identity.ts`.
8. `skills/nova/pipeline/services/polling-observability.ts`.
9. `skills/nova/pipeline/services/polling-redis-completion.ts`.
10. `skills/nova/pipeline/services/polling-session-end.ts`.
11. `skills/nova/pipeline/services/forge-completion.ts` if still imported by polling/session authority.

Ledger rows to resolve:

1. Forge completion missing repo root returns no meaningful changes — `DELETE_LEGACY`.
2. Polling no-repo Git skip — `DELETE_LEGACY`.
3. Session closed/error no-change success envelope — `DELETE_LEGACY`.
4. Polling-session-end Git polling fallbacks — `STRICTIFY_TS_SLICE`.
5. Completion authority conflict/drift, invalid Redis completion fail-closed, missing session key fail-closed, Git polling error as typed poll result, parse corruption threshold, and old status diagnostic-only rows marked `KEEP_TYPED_POLICY`.

Rules:

1. Polling must require typed repo/session context where Git/session evidence is authoritative.
2. Closed/error sessions without output or changes must be typed no-change/no-output failures, not successful completion envelopes.
3. Completion identity aliases must be canonicalized before Redis/local evidence can authorize terminal state.
4. ACP/hook fallback paths must be external adapters only, not alternate completion authority.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-redis-completion-service-surface.mjs
node tests/verification/contracts/check-session-authority-slice-surface.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,restart-recovery,telemetry
```

Commit message:

```text
refactor: migrate nova polling completion authority to typescript
```

### P6-B08 — Nova validation, lint, budget, and observability services

Status: planned after P6-B07.

Scope:

1. `skills/nova/pipeline/services/arch-validator.ts`.
2. `skills/nova/pipeline/services/arch-validator-checks.ts`.
3. `skills/nova/pipeline/services/lint.ts`.
4. `skills/nova/pipeline/services/module-validators.ts`.
5. `skills/nova/pipeline/services/observability.ts`.
6. `skills/nova/pipeline/services/case-study.ts`.
7. `skills/nova/pipeline/services/summary.ts`.
8. `skills/nova/pipeline/services/failures/presentation.ts`.
9. `skills/nova/pipeline/services/failures/retry-policy.ts`.
10. `skills/nova/pipeline/tools/lint-report/parsers.ts` if typed lint validation requires it.
11. `skills/nova/pipeline/tools/project-summary.ts` and formatters only if summary/observability ownership requires it.

Ledger rows to resolve:

1. Lint missing report tool passes/skips pre-check — `DELETE_LEGACY`.
2. Lint unparseable report passes/skips pre-check — `DELETE_LEGACY`.
3. Budget check failure returns not-exceeded — `DELETE_LEGACY`.
4. Gateway aborted response delivery handling — `STRICTIFY_TS_SLICE`.
5. Module validator stage producer fallback — `STRICTIFY_TS_SLICE`.
6. Review Discord post failure and summary/tool rows must be resolved before behavior changes if still marked `needs user decision`.
7. Deterministic/offline architecture validation, advisory agent judgment, noncritical artifacts, nonzero lint report with output, cleanup/archive noncritical, and generator failure typing rows marked `KEEP_TYPED_POLICY`.

Rules:

1. Configured pre-check lint must fail typed setup when required lint tooling or valid JSON evidence is missing.
2. Hard budget reads must fail closed or return typed unknown requiring operator handling.
3. Aborted Gateway sends cannot be treated as delivered without typed delivery acknowledgement.
4. Observability artifact failures may remain nonterminal only when named typed policy.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-observability-catch-reporting.mjs
node tests/verification/contracts/check-operator-alert-surface.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,telemetry
```

Commit message:

```text
refactor: migrate nova validation observability services to typescript
```

### P6-B09 — Nova agent-observability ingester and plugin sidecar

Status: planned after P6-B08.

Scope:

1. `skills/nova/pipeline/services/agent-observability-evidence/*.ts`.
2. `skills/nova/pipeline/services/agent-observability-ingester/*.ts`.
3. `skills/nova/pipeline/services/agent-observability-runtime.ts`.
4. `skills/nova/pipeline/services/openclaw-plugin-runtime.ts`.
5. Agent-observability docs/tests.

Ledger rows to resolve:

1. Ingester config env/config aliases and string coercion — `STRICTIFY_TS_SLICE`.
2. Evidence comparator and hook-taxonomy adapter rows that are explicitly external adapters.
3. Runtime disabled sidecar, loop defaults/failure isolation, poison record dead-lettering, BUSYGROUP idempotency, non-promoted events, and plugin cleanup rows marked `KEEP_TYPED_POLICY`.
4. Optional Redis client method fallbacks that remain external adapters must stay narrow and documented.

Rules:

1. Keep config-gated rollout as typed policy, but collapse aliases at the config boundary.
2. Poison records must not block consumer groups; invalid telemetry must dead-letter and ACK.
3. Sidecar loop failures may not crash orchestration, but must produce typed degraded evidence.
4. Hook taxonomy adapters must not become lifecycle/completion authority.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-telemetry-contract.mjs
node tests/verification/contracts/check-observability-catch-reporting.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,telemetry
```

Commit message:

```text
refactor: migrate nova agent observability runtime to typescript
```

### P6-B10 — Phase 6 cleanup and verification

Status: completed in final audit commit.

Scope:

1. Remove obsolete `.d.ts` shims created only for JavaScript Nova/Common dependencies if their owning implementation is now `.ts`.
2. Re-run import searches for stale `.js` imports of migrated Phase 6 modules.
3. Update:
   - `docs/ts-migration/authority-registry.md`
   - `docs/ts-migration/import-call-graph.md`
   - `docs/ts-migration/architecture-map.md`
   - `docs/ts-migration/fallback-ledger-pass3-batches.md`
4. Confirm unresolved ledger/pass3 rows are deferred to Phase 7+ or tied to a named future owner.
5. Record a Phase 6 completion audit with native Node import evidence and fallback-ledger compliance evidence.

Final Phase 6 validation:

```bash
scripts/typecheck-ts-migration.sh
tests/verification/run-fast-verification.sh
```

Commit message:

```text
docs: record phase six migration completion
```

## Phase 6 exit criteria

Phase 6 is complete when:

1. Nova/Common files in scope are migrated to `.ts` or explicitly deferred with documented reason.
2. Every Phase 6 `DELETE_LEGACY` row has the legacy behavior deleted 100% in code and covered by tests or audit evidence.
3. Every Phase 6 `STRICTIFY_TS_SLICE` row has typed degraded/failure evidence instead of silent fallback behavior.
4. Every Phase 6 `KEEP_TYPED_POLICY` row is preserved as named intentional policy.
5. Native Node import checks pass for every migrated Phase 6 `.ts` file.
6. `scripts/typecheck-ts-migration.sh` and `tests/verification/run-fast-verification.sh` pass.
7. Phase 6 completion audit is committed.
