# Phase 3 TypeScript Batch Plan — Core Utilities

Phase 3 migrates low-level, high-fanout utilities after Phase 2 contracts are typed. The goal is to type the modules that later business-logic slices depend on, without changing runtime entrypoint semantics or broad public API shape.

## Current baseline

Phase 2 complete through:

1. `3d8e151f2 refactor: migrate generator result contract to typescript`
2. `3a48e9458 refactor: migrate validator and worker control contracts`
3. `de8b73c44 refactor: migrate gate control contract to typescript`
4. `0479bdffc refactor: migrate pipeline step result contract to typescript`
5. `b19438b44 refactor: migrate redis transport contracts to typescript`
6. `9f98a1e43 refactor: migrate event gateway rate-limit contracts to typescript`
7. `eeade9468 refactor: migrate notification telemetry sink contracts to typescript`
8. `c85fd12c2 refactor: migrate telemetry payload schema to typescript`

Phase 3 source guidance from `docs/ts-migration/phase-plan.md`:

- Migrate `core/constants`, `core/paths`, `core/runtime`, `core/context`, `core/logger`, `core/config`, `core/policy`, `core/registry`, `redaction`, `security`, `timing`, and `serialization`.
- No compatibility barrels unless they are the single public API.

## Phase 3 hard gates

Every implementation batch must satisfy both gates before commit:

1. Native Node type stripping compatibility.
   - Use erasable TypeScript only.
   - No enums, runtime namespaces, parameter properties, decorators, path aliases, or syntax requiring emitted JavaScript transforms.
   - Keep explicit relative `.ts` / `.js` imports and use `import type` for type-only imports.

2. Fallback ledger compliance.
   - Read `docs/ts-migration/fallback-ledger.md` for every owning file in the batch.
   - Follow the recorded decision exactly: `KEEP_TYPED_POLICY`, `STRICTIFY_TS_SLICE`, `DELETE_LEGACY`, or `USER_POLICY`.
   - If the ledger decision is ambiguous or requires product/operator choice, stop and ask before changing behavior.

## Phase 3 rules

1. Keep contracts typed and authoritative.
2. Migrate dependency leaves before modules that call them.
3. Do not convert runtime entrypoints just because utilities move.
4. Keep explicit relative `.ts` / `.js` imports.
5. Do not introduce broad namespace barrels.
6. Preserve public entrypoints unless the fallback ledger marks them `DELETE_LEGACY`.
7. Resolve relevant `fallback-ledger-pass3-batches.md` rows before or while migrating the owning file.
8. Every batch must pass `scripts/typecheck-ts-migration.sh`.
9. Focused verification should be run for the touched surfaces, then `tests/verification/run-fast-verification.sh` before commit.

## P3-B01 — Leaf utilities and shared hygiene

Status: ready to start after this plan lands.

Scope:

1. `skills/nova/pipeline/core/constants.ts`
   - Rename/migrate to `.ts`.
   - Preserve exported constants exactly.
   - Update direct imports.

2. `skills/nova/pipeline/core/logger.ts`
   - Rename/migrate to `.ts`.
   - Preserve log formatting and level semantics.
   - Avoid adding logging abstraction.

3. `skills/nova/pipeline/services/serialization.ts`
   - Rename/migrate to `.ts`.
   - Preserve clone/deep-freeze semantics used by typed contracts.

4. `skills/common/pipeline/timing.ts`
   - Rename/migrate to `.ts`.
   - Remove `skills/common/pipeline/timing.d.ts` once implementation is typed.
   - Preserve `BudgetExhaustedError` shape.

5. `skills/common/pipeline/security.ts`
   - Rename/migrate to `.ts`.
   - Preserve shell/path safety behavior.

6. `skills/common/pipeline/redaction.ts`
   - Rename/migrate to `.ts` if feasible in this batch; otherwise defer to P3-B02 if it needs isolated handling.
   - Resolve `P3-043` from `fallback-ledger-pass3-batches.md` before changing secret regex semantics.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-common-helper-import-surface.mjs
node tests/verification/contracts/check-time-budget-surface.mjs
node tests/verification/contracts/check-operator-alert-surface.mjs
```

Commit message:

```text
refactor: migrate core leaf utilities to typescript
```

## P3-B02 — Paths, runtime identity, and policy

Status: planned after P3-B01.

Scope:

1. `skills/nova/pipeline/core/paths.ts`
   - Rename/migrate to `.ts`.
   - Preserve project/swarm/log path derivation.
   - Avoid changing filesystem authority rules in this batch.

2. `skills/nova/pipeline/core/runtime.ts`
   - Rename/migrate to `.ts`.
   - Resolve `P3-051` fallback run context policy before changing behavior.
   - Preserve run ID/stats helpers and existing runtime call signatures.

3. `skills/nova/pipeline/core/policy.ts`
   - Rename/migrate to `.ts`.
   - Preserve model/policy resolution semantics unless ledger marks a fallback for strictification.

4. `skills/nova/pipeline/core/deps.ts`, `git-context.js`, `platform-config.js`, and `temp.js`
   - Migrate if low risk and directly coupled to the above files.
   - Keep these as small typed utility surfaces.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-time-budget-surface.mjs
node tests/verification/contracts/check-strict-cli-args-surface.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
```

Commit message:

```text
refactor: migrate runtime path policy utilities to typescript
```

## P3-B03 — Plugin context and public core facade

Status: planned after P3-B02.

Scope:

1. `skills/nova/pipeline/core/context.ts`
   - Rename/migrate to `.ts`.
   - Preserve plugin context capability narrowing.
   - Keep typed boundaries from Phase 2 intact.

2. `skills/nova/pipeline/index.ts`
   - Review `P3-052` public barrel surface decision.
   - Do not delete or narrow public exports without an explicit ledger decision.
   - If migrated, preserve public import surface or document/verify replacements.

3. Related context callers/tests as needed.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/behavior/run-behavior-fast.mjs --areas foundations
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/contracts/check-operator-alert-surface.mjs
```

Commit message:

```text
refactor: migrate plugin context utilities to typescript
```

## P3-B04 — Config and registry core

Status: planned after P3-B03.

Scope:

1. `skills/nova/pipeline/core/config.ts`
   - Rename/migrate to `.ts`.
   - Resolve `P3-048` unknown top-level fields policy before changing behavior.

2. `skills/nova/pipeline/core/registry.ts`
   - Rename/migrate to `.ts`.
   - Preserve registry construction and lookup semantics.

3. `skills/nova/pipeline/core/registry/*.ts`
   - Migrate `builtins.js`, `config-normalization.js`, `indexes.js`, and `validation.js` together or in a split sub-batch if type fallout is large.
   - Resolve `P3-049` and `P3-050` before changing custom discovery or invalid schema behavior.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/behavior/run-behavior-fast.mjs --areas foundations
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/contracts/check-implementation-map-sync-surface.mjs
node tests/verification/contracts/check-operator-alert-surface.mjs
```

Commit message:

```text
refactor: migrate config registry core to typescript
```

## P3-B05 — Phase 3 cleanup and verification

Status: completed. Final audit is recorded in `docs/ts-migration/phase-3-completion-audit.md`.

Scope:

1. Remove obsolete `.d.ts` shims created only for JS dependencies if their owning implementation is now `.ts`.
2. Re-run import searches for any stale `.js` imports of migrated Phase 3 modules.
3. Update `docs/ts-migration/authority-registry.md`, `docs/ts-migration/import-call-graph.md`, and `docs/ts-migration/architecture-map.md` for final Phase 3 paths.
4. Confirm remaining unresolved pass3 ledger rows are either deferred to Phase 4+ or tied to their owning future migration batch.

Final Phase 3 validation:

```bash
scripts/typecheck-ts-migration.sh
tests/verification/run-fast-verification.sh
```

Commit message:

```text
docs: record phase three migration completion
```

## Notes on fallback-ledger pass3 rows

`docs/ts-migration/fallback-ledger-pass3-batches.md` is a policy-decision plan, not the same thing as this TypeScript implementation batch plan. Use it as a gate when an owning file enters a TypeScript slice.

Phase 3 directly touches these known pass3 decision rows:

1. `P3-043` — `skills/common/pipeline/redaction.ts` secret regex scope.
2. `P3-048` — `skills/nova/pipeline/core/config.ts` unknown top-level fields.
3. `P3-049` — `skills/nova/pipeline/core/registry/config-normalization.ts` custom module discovery reserved.
4. `P3-050` — `skills/nova/pipeline/core/registry/validation.ts` invalid config schema raw-config return.
5. `P3-051` — `skills/nova/pipeline/core/runtime.ts` fallback run context.
6. `P3-052` — `skills/nova/pipeline/index.ts` public barrel surface.

Default migration stance:

- If behavior is modern safety/ops policy, keep it and name it as `KEEP_TYPED_POLICY`.
- If behavior is compatibility or fallback authority, delete it or strictify it when the owning TypeScript slice migrates.
- If behavior changes product/operator semantics, mark it as `USER_POLICY` and stop for explicit approval.
