# Phase 9 TypeScript Migration Batch Plan

Purpose: finish the remaining unpaired JavaScript pipeline surfaces by either migrating implementation owners to native Node-strippable TypeScript or locking intentionally retained files as pure external/runtime facades.

Phase 9 starts after Phase 8 completion audit commit `437e312b8 docs: record phase eight migration completion`.

## Mandatory gates for every Phase 9 batch

Every batch must satisfy these gates before commit.

1. Native Node TypeScript stripping compatibility:
   - Use erasable TypeScript only.
   - Do not use enums, runtime namespaces, parameter properties, decorators, path aliases, import-equals, angle-bracket assertions, or syntax requiring emitted-JS transforms.
   - Keep explicit relative `.ts` / `.js` imports.
   - Use `import type` for type-only imports.
   - Run an unsupported-syntax scan on every migrated or materially edited `.ts` file in the batch.
   - Prove native Node can import every migrated or materially edited `.ts` file in the batch.

2. File reclutcher and fallback-ledger compliance:
   - Treat `docs/ts-migration/fallback-ledger.md` as the file reclutcher source of truth.
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
   - Stale import search for every deleted `.js` file or deleted behavior surface.
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

## Phase 9 scope

Phase 9 owns the 31 currently unpaired `.js` files under `skills/*` after Phase 8:

1. Buster shared production-path facades under `skills/buster/pipeline/agents/**`, `git-primitives.ts`, and `lifecycle-state.ts`.
2. Buster service implementation owners migrated in P9-B03:
   - `services/capabilities.ts`
   - `services/gateway-health.ts`
   - `services/orphan-recovery.ts`
   - `services/pipeline-helpers.ts`
   - `services/runtime.ts`
   - `services/session-monitor.ts`
3. Buster task execution and queue owners migrated in P9-B04:
   - `services/task-completion.ts`
   - `services/task-lifecycle.ts`
   - `services/task-lifecycle/cleanup.ts`
   - `services/task-lifecycle/completion-signal.ts`
   - `services/task-queue.ts`
   - `services/task-validation.ts`
4. Buster suite path helper migrated in P9-B05:
   - `suites/repo-paths.ts`
5. Nova and Common direct runtime/package facades:
   - `skills/nova/pipeline.ts`
   - `skills/nova/pipeline/agents/*.ts`
   - `skills/nova/pipeline/git-primitives.ts`
   - `skills/nova/pipeline/lifecycle-state.ts`
   - `skills/common/discord-purge.ts`

Phase 9 does not own the 100 paired `.js` files that already have same-path `.ts` owners unless a Phase 9 import change proves one is behavior-bearing or incorrectly retained. Those paired facades move to the final cleanup phase.

## Batch order

### P9-B01 — Unpaired JavaScript reclutcher inventory and facade baseline

Status: completed in P9-B01.

Scope:

1. Audit all 31 unpaired `.js` files listed in Phase 9 scope.
2. Classify each file as:
   - migrate to `.ts`;
   - delete now;
   - retain as accepted external/runtime facade;
   - defer only with a named production packaging blocker.
3. Update `docs/ts-migration/authority-registry.md`, `import-call-graph.md`, `architecture-map.md`, and `fallback-ledger.md` where current docs still describe implementation ownership on stale `.js` paths.
4. Add or extend contract checks that fail if a retained unpaired facade grows behavior or an unclassified unpaired `.js` file appears.

Ledger rows to resolve:

1. All unpaired `.js` rows with accepted external-adapter decisions.
2. Any stale ledger rows that still point at already-migrated Phase 5 through Phase 8 behavior.
3. Any unpaired file that the reclutcher marks delete.

Rules:

1. No implementation migration starts before the inventory is recorded.
2. A retained facade may only re-export a typed owner or perform direct CLI/runtime delegation.
3. Deleted files must be removed from source, tests, docs, and import maps in the same batch.
4. Historical docs may name old `.js` files only when clearly marked historical.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,docs-surface
```

Commit message:

```text
docs: inventory phase nine javascript surfaces
```

### P9-B02 — Buster shared production facades

Status: completed in P9-B02.

Scope:

1. `skills/buster/pipeline/agents/acp-monitor.ts`.
2. `skills/buster/pipeline/agents/lifecycle.ts`.
3. `skills/buster/pipeline/agents/runtime.ts`.
4. `skills/buster/pipeline/agents/session-semantics.ts`.
5. `skills/buster/pipeline/agents/session-termination.ts`.
6. `skills/buster/pipeline/agents/tracked-agents.ts`.
7. `skills/buster/pipeline/git-primitives.ts`.
8. `skills/buster/pipeline/lifecycle-state.ts`.
9. Supporting production-path/import-surface checks.

Ledger rows to resolve:

1. Buster shared role-local facade rows already marked accepted external adapter.
2. Any stale Buster root import or test import that still treats these facades as implementation authority.

Rules:

1. Keep a `.js` file only if production packaging still requires that exact path and it contains no behavior.
2. Prefer direct typed imports for source/tests that do not need the production `.js` path.
3. If a facade is marked delete by the reclutcher, delete it fully and update every importer.
4. Lock retained facades with content/inventory checks.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/runtime/check-runtime-collisions.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: lock buster shared production facades
```

### P9-B03 — Buster support-service implementation owners

Status: completed in P9-B03.

Scope:

1. `skills/buster/pipeline/services/capabilities.ts`.
2. `skills/buster/pipeline/services/gateway-health.ts`.
3. `skills/buster/pipeline/services/orphan-recovery.ts`.
4. `skills/buster/pipeline/services/pipeline-helpers.ts`.
5. `skills/buster/pipeline/services/runtime.ts`.
6. `skills/buster/pipeline/services/session-monitor.ts`.
7. Supporting imports/tests/docs.

Ledger rows to resolve:

1. Capability alias and durable alert rows.
2. Gateway readiness/liveness policy rows.
3. Orphan active-session evidence fence rows.
4. Pipeline helper result/output identity rows.
5. Runtime Discord webhook URL policy rows.
6. Session monitor hard-timeout, transcript, Gateway degradation, and rate-limit delegation rows.

Rules:

1. Migrate behavior-bearing owners to `.ts`; do not leave same-path `.js` implementations behind.
2. Preserve only named `KEEP_TYPED_POLICY` behavior as typed policy.
3. External aliases must normalize at service boundaries and must not leak into task lifecycle or queue authority.
4. If retained, orphan-recovery must remain diagnostic-only and must not become lifecycle authority.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/contracts/check-rate-limit-slice-surface.mjs
node tests/verification/runtime/check-buster-startup-smoke.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: migrate buster support services to typescript
```

### P9-B04 — Buster task completion, lifecycle, and queue spine

Status: completed in P9-B04.

Scope:

1. `skills/buster/pipeline/services/task-completion.ts`.
2. `skills/buster/pipeline/services/task-lifecycle.ts`.
3. `skills/buster/pipeline/services/task-lifecycle/cleanup.ts`.
4. `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts`.
5. `skills/buster/pipeline/services/task-queue.ts`.
6. `skills/buster/pipeline/services/task-validation.ts`.
7. Supporting imports/tests/docs.

Ledger rows to resolve:

1. Completion record/dead-letter terminal-before-ACK policy.
2. Task lifecycle default/canonicalization rows not already resolved by Phase 5.
3. Completion stream absence and completion failure capture rows.
4. Queue stream defaults, poison-message dead-letter, and cleanup failure rows.
5. Task validation identity/capability aliases and forbidden legacy status path rows.

Rules:

1. Completion and ACK behavior must stay typed and terminal-evidence driven.
2. Task payload defaults may remain only when the ledger names them deployment policy or external-boundary normalization.
3. Forbidden legacy fields must remain deleted; do not reintroduce `status_json_path` or old status-file authority.
4. Queue poison-message handling must preserve dead-letter-before-ACK semantics.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/contracts/check-redis-completion-service-surface.mjs
node tests/verification/contracts/check-buster-completion-controller-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: migrate buster task lifecycle spine to typescript
```

### P9-B05 — Remaining repo path and direct runtime/package facades

Status: completed in P9-B05.

Scope:

1. `skills/buster/pipeline/suites/repo-paths.ts`.
2. `skills/nova/pipeline.ts`.
3. `skills/nova/pipeline/agents/acp-monitor.ts`.
4. `skills/nova/pipeline/agents/lifecycle.ts`.
5. `skills/nova/pipeline/agents/runtime.ts`.
6. `skills/nova/pipeline/agents/session-semantics.ts`.
7. `skills/nova/pipeline/agents/session-termination.ts`.
8. `skills/nova/pipeline/agents/tracked-agents.ts`.
9. `skills/nova/pipeline/git-primitives.ts`.
10. `skills/nova/pipeline/lifecycle-state.ts`.
11. `skills/common/discord-purge.ts`.
12. Supporting runtime/package checks.

Ledger rows to resolve:

1. Buster suite repo-root/path helper rows.
2. Nova direct runtime CLI facade rows.
3. Nova shared production-path facade rows.
4. Common Discord purge utility rows, if the utility remains in migration scope.

Rules:

1. Direct runtime entrypoints may remain `.js` only as executable delegates to typed owners.
2. Shared production-path facades may remain only as pure re-exports over typed Common owners.
3. Any utility outside the current pipeline-relevant migration scope must be explicitly documented as out of scope; otherwise migrate/delete it in this batch.
4. Stale source imports should prefer typed owners over facade paths unless production packaging requires the facade.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/runtime/check-runtime-collisions.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,docs-surface
```

Commit message:

```text
refactor: settle remaining runtime package facades
```

### P9-B06 — Phase 9 cleanup and verification

Status: completed in P9-B06.

Scope:

1. Re-run the unpaired `.js` inventory and confirm every remaining unpaired file is one of:
   - accepted pure external/runtime facade;
   - explicitly out of scope;
   - deleted.
2. Re-run stale import searches for deleted files and behavior names.
3. Update docs:
   - `docs/ts-migration/phase-9-completion-audit.md`
   - `docs/ts-migration/fallback-ledger.md`
   - `docs/ts-migration/authority-registry.md`
   - `docs/ts-migration/import-call-graph.md`
   - `docs/ts-migration/architecture-map.md`
4. Record detailed batch changelogs under `docs/ts-migration/phase-9-changelogs/`.
5. Record the final phase-count estimate for the remaining migration.

Rules:

1. Do not close Phase 9 with any behavior-bearing unpaired `.js` pipeline file.
2. Do not close Phase 9 with any retained unpaired facade lacking an inventory/contract reason.
3. Do not close Phase 9 with a stale ledger row that still assigns active Phase 9 behavior to a deleted `.js` owner.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
tests/verification/run-fast-verification.sh
git diff --check
```

Commit message:

```text
docs: record phase nine migration completion
```

## Phase 9 exit criteria

1. No behavior-bearing unpaired `.js` pipeline file remains under `skills/*`.
2. Every retained unpaired `.js` file is documented as a pure external/runtime facade or explicit out-of-scope utility.
3. Every Phase 9-owned `DELETE_LEGACY` row is deleted 100%.
4. Every Phase 9-owned `STRICTIFY_TS_SLICE` row is strictified with typed evidence or typed policy.
5. Every Phase 9-owned `KEEP_TYPED_POLICY` row is named in code/tests/docs.
6. Native Node can import every migrated or materially edited `.ts` file.
7. `scripts/typecheck-ts-migration.sh`, focused checks, `tests/verification/run-fast-verification.sh`, and `git diff --check` pass.

## Phase 9 completion status

Completed in P9-B06.

- `tests/verification/contracts/check-phase9-unpaired-js-surface.mjs` reports 18 retained unpaired `.js` files: 16 pure shared facades, 1 direct runtime delegate, and 1 explicit out-of-scope utility.
- No behavior-bearing unpaired `.js` pipeline file remains in the Phase 9 scope.
- `docs/ts-migration/phase-9-completion-audit.md` records the final verification and the remaining phase-count estimate.
- Current phase-count estimate after Phase 9: one final phase remains, Phase 10, for paired-facade, docs, and deployment cleanup.
