# Phase 8 TypeScript Migration Batch Plan

Purpose: finish the runner migration by resolving remaining runner-owned fallback-ledger policy debt, deleting unneeded JavaScript runner facades, and proving the migrated runner control plane remains native Node type-stripping compatible.

Phase 8 starts after Phase 7 completion audit commit `2b8f3ec46 docs: record phase seven migration completion`.

## Mandatory gates for every Phase 8 batch

Every batch must satisfy these gates before commit.

1. Native Node TypeScript stripping compatibility:
   - Use erasable TypeScript only.
   - Do not use enums, runtime namespaces, parameter properties, decorators, path aliases, import-equals, angle-bracket assertions, or syntax requiring emitted-JS transforms.
   - Keep explicit relative `.ts` / `.js` imports.
   - Use `import type` for type-only imports.
   - Run an unsupported-syntax scan on every migrated or materially edited `.ts` file in the batch.
   - Prove native Node can import every migrated or materially edited `.ts` file in the batch.

2. File reclutcher and fallback-ledger compliance:
   - Treat `docs/ts-migration/fallback-ledger.md` as the file reclutcher source of truth for runner-owned delete/strictify/keep decisions.
   - Read the ledger rows for every touched owning file before changing behavior.
   - `DELETE_LEGACY` means delete completely. Do not keep adapters, hidden fallbacks, live bindings, alternate authority, compatibility shims, permissive old shapes, TODO-preserved branches, or facade files that keep deleted behavior reachable.
   - If the reclutcher marks a file or facade as delete, remove the file and all imports/tests/docs that keep it alive.
   - `STRICTIFY_TS_SLICE` means remove silent fallback behavior or surface typed degraded/failure evidence.
   - `KEEP_TYPED_POLICY` means preserve the behavior and name it as intentional policy in code/tests/docs.
   - If a touched owning file still says `needs user decision`, `USER_POLICY`, `rename as canonical`, or remains ambiguous at execution time, stop and ask before changing behavior.
   - Pure role-local facades may remain only when they are accepted external/runtime adapters with no runtime behavior, no alternate authority, and no deleted behavior behind them.

3. Required verification before each batch commit:
   - Unsupported TypeScript syntax scan on migrated or materially edited files.
   - Native Node import check for migrated or materially edited `.ts` files.
   - Stale import search for any deleted `.js` facade or deleted behavior surface.
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
   - Facades/files deleted or explicitly retained.

## Phase 8 scope

Phase 8 owns runner surfaces that are TypeScript after Phase 7 but still need final runner-policy cleanup:

1. Nova module worker, module runner, Forge phase, pre-Buster phase, Buster phase, and terminal result policy.
2. Nova pipeline runner startup, scheduling, recovery, state-machine, terminal, and dependency/facade surfaces.
3. Nova approval, Buster, review, remediable, and waitable gate runner policy.
4. Runner stage-envelope helpers and plugin snapshot/ref construction.
5. Remaining JavaScript runner facades under `skills/nova/pipeline/runners/**` only when they are still required as documented runtime/package adapters; otherwise delete them.
6. Runner-owned unresolved fallback-ledger decisions for module workers, module runners, pipeline scheduling/recovery, and gate/review runners.

Phase 8 does not own unrelated product features, Buster suite/runtime implementation work, or broad service/tool cleanup outside runner-owned call paths. It should not add compatibility layers while deleting old ones.

## Batch order

### P8-B01 — Runner reclutcher inventory and facade baseline

Status: completed in P8-B01.

Scope:

1. Audit every `skills/nova/pipeline/runners/**/*.ts` file that remains after Phase 7.
2. Classify each JavaScript runner file as:
   - delete now;
   - keep as accepted external/runtime facade;
   - defer only with a named external packaging blocker.
3. Update runner entries in:
   - `docs/ts-migration/authority-registry.md`
   - `docs/ts-migration/import-call-graph.md`
   - `docs/ts-migration/architecture-map.md`
   - `docs/ts-migration/fallback-ledger.md`
4. Add or update contract checks that fail if a deleted facade remains importable or a retained facade contains behavior.

Ledger rows to resolve:

1. Runner files marked as deleted by the reclutcher or fallback ledger.
2. Runner files marked as accepted external adapters.
3. Runner-owned fallback-ledger row ownership assignment if any row still points at stale `.js` paths.

Rules:

1. A retained facade may only re-export the typed owner or delegate direct CLI/runtime execution.
2. Deleted runner facades must be removed from source, tests, docs, and import maps in the same batch.
3. Documentation-only references may keep historical `.js` names only when clearly marked as historical or runtime facade paths.
4. Do not start policy cleanup until the facade/delete inventory is recorded.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/contracts/check-module-runner-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,docs-surface
```

Commit message:

```text
docs: inventory runner facades for phase eight
```

### P8-B02 — Module worker and typed worker-control authority

Status: completed in P8-B02.

Scope:

1. `skills/nova/pipeline/agents/module-worker-control-results.ts`.
2. `skills/nova/pipeline/agents/module-workers.ts`.
3. `skills/nova/pipeline/runners/module-runner-buster-worker.ts`.
4. `skills/nova/pipeline/runners/module-runner-shared.ts`.
5. Worker-control tests, contract checks, and docs.

Ledger rows to resolve:

1. `P3-047` — Buster failure-class inference.
2. Worker input identity fallbacks that must become typed `ids`/`refs`.
3. Buster dispatch/session fallback rows that may remain only as documented external adapter normalization.

Rules:

1. Buster worker control results must require explicit typed `failure_class`/source evidence; do not infer it from reason strings, final status, source regexes, or old Redis/status shapes.
2. Worker input identity must be canonicalized at the worker boundary before runner logic reads it.
3. Legacy worker-control result fields may be projected only for old external consumers and must not own typed runner decisions.
4. If a failure class cannot be proven from typed evidence, return typed degraded/failure evidence instead of guessing.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-worker-control-result-surface.mjs
node tests/verification/contracts/check-module-runner-slice-surface.mjs
node tests/verification/contracts/check-buster-completion-controller-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,module-failures
```

Commit message:

```text
refactor: tighten nova worker control authority
```

### P8-B03 — Module runner Forge and Buster phase policy

Status: completed in P8-B03.

Scope:

1. `skills/nova/pipeline/runners/module-runner.ts`.
2. `skills/nova/pipeline/runners/module-runner-forge.ts`.
3. `skills/nova/pipeline/runners/module-runner-prebuster.ts`.
4. `skills/nova/pipeline/runners/module-runner/attempt.ts`.
5. `skills/nova/pipeline/runners/module-runner/state-machine.ts`.
6. `skills/nova/pipeline/runners/module-runner/buster-phase.ts`.
7. `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts`.
8. `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts`.
9. `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts`.
10. `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts`.
11. `skills/nova/pipeline/runners/module-runner/terminal-results.ts`.
12. Supporting imports/tests/docs.

Ledger rows to resolve:

1. `P3-060` — queued notification suite fallback.
2. `P3-061` — polling Git failure fail-closed policy.
3. `P3-062` — Forge-only Git soft fail.
4. Module-runner transcript/no-work progress inference and Buster pre-test classification rows that still touch these owners.

Rules:

1. Buster dispatch must require a typed nonempty suite list or fail validation; do not render missing suites as `none`.
2. Polling Git failures must remain fail-closed typed failures with operator-visible evidence.
3. Forge-only PASS must require durable Git persistence or return a typed terminal/degraded failure; do not soft-pass unpublished work.
4. No-work/progress classification must come from typed worker or completion evidence, not transcript text inference.
5. Terminal Buster failure mapping must use explicit typed failure class/source instead of verdict-presence heuristics.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-module-runner-slice-surface.mjs
node tests/verification/contracts/check-session-authority-slice-surface.mjs
node tests/verification/contracts/check-redis-completion-service-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,module-failures,polling
```

Commit message:

```text
refactor: harden nova module runner phase policy
```

### P8-B04 — Pipeline runner scheduling, recovery, and state machine

Status: completed in P8-B04.

Scope:

1. `skills/nova/pipeline/runners/pipeline-runner.ts`.
2. `skills/nova/pipeline/runners/pipeline-runner-start.ts`.
3. `skills/nova/pipeline/runners/pipeline-runner-loop.ts`.
4. `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`.
5. `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`.
6. `skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts`.
7. `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`.
8. `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`.
9. `skills/nova/pipeline/runners/pipeline-runner-deps.ts`.
10. `skills/nova/pipeline/runners/pipeline-runner-shared.ts`.
11. Supporting imports/tests/docs.

Ledger rows to resolve:

1. `P3-063` — stale status age reset without session.
2. `P3-064` — unreadable scheduled-validator completion state.
3. `P3-065` — control-file preparation noncritical policy.
4. `P3-066` — unknown next type defaults to module.
5. Runner dependency/facade rows that are external adapters only.

Rules:

1. Recovery must not reset module status from age alone; require typed lifecycle/session evidence.
2. Corrupt validator completion state must fail closed or require repair instead of being treated as empty.
3. Control-file preparation failures may be non-authoritative only when they emit typed degraded startup evidence.
4. Scheduler next steps must use explicit typed step kind; unknown kinds fail validation instead of defaulting to module.
5. Pipeline runner facades must be narrow public runtime surfaces only.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/contracts/check-pipeline-step-result-surface.mjs
node tests/verification/contracts/check-pipeline-run-lock-lease.mjs
node tests/verification/contracts/check-status-store-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,pipeline,restart-recovery,resume-idempotence
```

Commit message:

```text
refactor: harden nova pipeline runner scheduling authority
```

### P8-B05 — Approval and remediable gate runner policy

Status: completed in P8-B05.

Scope:

1. `skills/nova/pipeline/runners/approval-gate-state.ts`.
2. `skills/nova/pipeline/runners/approval-gate-runner.ts`.
3. `skills/nova/pipeline/runners/approval-gate-control.ts`.
4. `skills/nova/pipeline/runners/approval-gate-shared.ts`.
5. `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts`.
6. `skills/nova/pipeline/runners/gate-runner.ts`.
7. `skills/nova/pipeline/runners/remediable-gate-engine.ts`.
8. Supporting imports/tests/docs.

Ledger rows to resolve:

1. `P3-057` — noncritical approval audit artifact writes.
2. `P3-058` — approval timeout continue policy.
3. `P3-059` — soft-fail Forge fix commit.
4. Remediable-gate controller and fix outcome compatibility rows still classified as external adapter only.

Rules:

1. Approval audit artifacts may stay noncritical only as named observability policy and must never decide approval outcome.
2. Timeout continue/block must be explicit typed approval policy, not a hidden fallback.
3. Forge fix commits must be durable typed evidence or produce typed degraded/failure outcomes; do not soft-pass missing publication.
4. Remediation controller inputs and fix outcomes must use one typed union before the engine loops.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-gate-control-result-surface.mjs
node tests/verification/contracts/check-pipeline-event-contract-surface.mjs
node tests/verification/contracts/check-gate-fix-scaffold-surface.mjs
node tests/verification/contracts/check-remediation-handoff-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,approvals,fix-cycles,gates
```

Commit message:

```text
refactor: harden nova approval gate policy
```

### P8-B06 — Review gate runner and durable publication policy

Status: completed in P8-B06.

Scope:

1. `skills/nova/pipeline/runners/review-gate-control.ts`.
2. `skills/nova/pipeline/runners/review-gate-fix-cycle.ts`.
3. `skills/nova/pipeline/runners/review-gate-output.ts`.
4. `skills/nova/pipeline/runners/review-gate-runner.ts`.
5. `skills/nova/pipeline/runners/review-gate-task.ts`.
6. Supporting imports/tests/docs.

Ledger rows to resolve:

1. `P3-067` — lint report unavailable fallback.
2. `P3-068` — review artifact writes/copies.
3. `P3-069` — Git commit soft-fail.
4. Review remediation limit, reviewer identity, timeout, resume/manual-intervention, and result-vocabulary compatibility rows.

Rules:

1. Configured lint must become typed review setup evidence; optional lint may remain warning-only only when explicitly configured as optional policy.
2. Review evidence artifact writes/copies may remain non-authoritative only as named observability policy.
3. Review output publication must be durable typed evidence or fail/degrade the gate result; do not soft-pass commit/push failure.
4. Review remediation must require explicit reviewer identity or a typed primary-reviewer policy; do not silently pick reviewer 0.
5. Review gate output should require canonical `GO`/`NO-GO` typed output; legacy `PASS`/`FAIL` aliases may remain only at an external adapter boundary if still documented.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-gate-control-result-surface.mjs
node tests/verification/contracts/check-git-soft-fail-observability-surface.mjs
node tests/verification/contracts/check-remediation-handoff-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,gates,fix-cycles,operator-surface
```

Commit message:

```text
refactor: harden nova review gate publication
```

### P8-B07 — Stage envelope and waitable gate cleanup

Status: completed in P8-B07.

Scope:

1. `skills/nova/pipeline/runners/stage-envelope-primitives.ts`.
2. `skills/nova/pipeline/runners/waitable-gate-engine.ts`.
3. Runner call sites that build stage refs, invocation refs, artifact refs, or wait controllers.
4. Supporting imports/tests/docs.

Ledger rows to resolve:

1. Stage ref missing-part strictification.
2. Waitable gate compatibility projection rows that remain external adapter only.
3. Wait-controller fail-fast policy rows.

Rules:

1. Malformed stage refs must fail typed validation instead of being silently omitted.
2. Optional artifact refs may still include only materialized artifacts as named `KEEP_TYPED_POLICY`.
3. Wait controllers must fail fast when missing or invalid, and thrown wait-loop errors must preserve stage-started evidence.
4. Compatibility projections must stay projection-only and must not become wait/gate authority.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-stage-envelope-primitives-surface.mjs
node tests/verification/contracts/check-gate-control-result-surface.mjs
node tests/verification/contracts/check-pipeline-step-result-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,gates,governance
```

Commit message:

```text
refactor: strictify nova runner stage envelopes
```

### P8-B08 — Phase 8 cleanup and verification

Status: completed in P8-B08.

Scope:

1. Delete any remaining runner `.js` facade marked delete by the reclutcher.
2. Re-run stale import searches for deleted runner files and deleted behavior symbols.
3. Audit every remaining runner `.js` file and confirm each one is a documented pure external/runtime facade with no hidden authority.
4. Update:
   - `docs/ts-migration/authority-registry.md`
   - `docs/ts-migration/import-call-graph.md`
   - `docs/ts-migration/architecture-map.md`
   - `docs/ts-migration/fallback-ledger.md`
5. Confirm runner-owned fallback-ledger rows are resolved or deferred to a named future owner with explicit reason.
6. Record a Phase 8 completion audit with native Node import evidence, file reclutcher evidence, and fallback-ledger compliance evidence.

Final Phase 8 validation:

```bash
scripts/typecheck-ts-migration.sh
tests/verification/run-fast-verification.sh
```

Commit message:

```text
docs: record phase eight migration completion
```

## Phase 8 exit criteria

Phase 8 is complete when:

1. Every runner-owned `DELETE_LEGACY` row has the legacy behavior deleted 100% in code and covered by tests or audit evidence.
2. Every runner-owned `STRICTIFY_TS_SLICE` row has typed degraded/failure evidence instead of silent fallback behavior.
3. Every runner-owned `KEEP_TYPED_POLICY` row is preserved as named intentional policy.
4. Every runner `.js` file is either deleted or documented as a pure external/runtime facade with no hidden authority.
5. Native Node import checks pass for every migrated or materially edited Phase 8 `.ts` file.
6. Stale import searches find no imports of deleted runner facades or deleted behavior symbols.
7. `scripts/typecheck-ts-migration.sh` and `tests/verification/run-fast-verification.sh` pass.
8. Phase 8 completion audit is committed.
