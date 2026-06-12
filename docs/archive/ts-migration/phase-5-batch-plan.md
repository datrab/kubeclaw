# Phase 5 TypeScript Migration Batch Plan

Purpose: migrate the Buster runtime/task-processing surface to TypeScript without carrying forward legacy fallback behavior.

Phase 5 starts after Phase 4 completion audit `a4ef294dd docs: record phase four migration completion`.

## Mandatory gates for every Phase 5 batch

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
   - If a row still says `needs user decision` or is ambiguous for a touched owning file, stop and ask before changing behavior.

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

## Phase 5 scope

Phase 5 owns the Buster runtime/task-processing side of the pipeline:

1. Buster entrypoint and public surface.
2. Buster task lifecycle, queue, completion, Git, session, rate-limit, Discord/operator, cleanup, diagnostics, and base-image services.
3. Buster suite runner, suite verdict contract, and suite implementations.
4. Buster tools used by the task runtime and suites.
5. Buster role-local facades are touched only when required by a Buster-owned import or packaging check.

Phase 5 does not own Nova runner/service/tool migration except for tests/docs needed to keep shared verification green. Remaining Nova service/tool rows are deferred to Phase 6+.

## Batch order

### P5-B01 — Buster entrypoint and public surface narrowing

Status: planned first.

Scope:

1. `skills/buster/buster-pipeline.ts`.
2. Tests/import harnesses that currently rely on broad helper exports from the Buster root module.
3. Minimal docs updates for the Buster public/runtime surface.

Ledger rows to resolve:

1. `skills/buster/buster-pipeline.ts` — public re-export surface — `DELETE_LEGACY`.

Rules:

1. Delete the broad root helper barrel completely.
2. Keep only the explicit runtime entrypoint/API needed to start the Buster process.
3. Migrate callers/tests to owning modules or an explicit narrow CLI/runtime API.
4. Do not preserve broad re-exports through another compatibility file.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/runtime/check-buster-startup-smoke.mjs
node tests/verification/runtime/check-runtime-collisions.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: narrow buster runtime public surface
```

### P5-B02 — Buster task identity, Git sync, and session lifecycle

Status: completed.

Scope:

1. `skills/buster/pipeline/services/git-workflows.ts`.
2. `skills/buster/pipeline/services/task-lifecycle/git-sync.ts`.
3. `skills/buster/pipeline/services/task-lifecycle/session.ts`.
4. Closely coupled task lifecycle helpers if needed for typed result flow:
   - `skills/buster/pipeline/services/task-lifecycle.ts`
   - `skills/buster/pipeline/services/task-lifecycle/cleanup.ts`
   - `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts`

Ledger rows to resolve:

1. `skills/buster/pipeline/services/git-workflows.ts` — `gitSync` target fallback — `DELETE_LEGACY`.
2. `skills/buster/pipeline/services/git-workflows.ts` — `gitSync` failure return — `STRICTIFY_TS_SLICE`.
3. `skills/buster/pipeline/services/git-workflows.ts` — `gitPushWithRetry` defaults/rebase handling — `STRICTIFY_TS_SLICE`.
4. `skills/buster/pipeline/services/task-lifecycle/git-sync.ts` — fast-forward sync mode — `DELETE_LEGACY`.
5. `skills/buster/pipeline/services/task-lifecycle/session.ts` — default model — `DELETE_LEGACY`.

Rules:

1. Require deterministic typed task commit identity before repo sync.
2. Delete implicit reset/fast-forward-to-current-branch behavior.
3. Replace magic `null` Git sync failures with typed failure metadata.
4. Fail closed after final rebase failure; do not push over unresolved upstream state.
5. Delete hardcoded session model fallback; model must come from typed task/session identity or an explicit external operator-default normalization boundary.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/contracts/check-buster-repo-scoped-paths.mjs
node tests/verification/contracts/check-buster-verify-task-scope.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: migrate buster task git session lifecycle to typescript
```

### P5-B03 — Buster suite runner contract and verdict spine

Status: completed.

Scope:

1. `skills/buster/pipeline/runners/suite-runner.ts`.
2. `skills/buster/pipeline/services/verdict-schema.ts`.
3. `skills/buster/pipeline/services/capabilities.ts` if typed suite capability results are required.
4. Suite runner callers/tests.

Ledger rows to resolve:

1. `skills/buster/pipeline/runners/suite-runner.ts` — unknown suite behavior — `DELETE_LEGACY`.
2. `skills/buster/pipeline/runners/suite-runner.ts` — default suite timeout — `STRICTIFY_TS_SLICE`.

Rules:

1. Unknown requested suite names must fail typed validation, not become `SKIP` verdicts.
2. Keep the bounded default suite timeout only for omitted timeout.
3. Reject invalid, zero, negative, falsy, or malformed timeout values.
4. Keep suite verdict shape centralized; do not introduce per-suite ad hoc terminal formats.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/contracts/check-strict-cli-args-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: migrate buster suite runner contract to typescript
```

### P5-B04 — Buster runtime support services

Status: completed.

Scope:

1. `skills/buster/pipeline/services/base-images.ts`.
2. `skills/buster/pipeline/services/rate-limit.ts`.
3. `skills/buster/pipeline/services/sandbox-cleanup.ts`.
4. `skills/buster/pipeline/services/gateway-health.ts` and `orphan-recovery.js` only if needed by typed support-service result shapes.

Ledger rows to resolve:

1. `skills/buster/pipeline/services/base-images.ts` — bare image normalization — `DELETE_LEGACY`.
2. `skills/buster/pipeline/services/base-images.ts` — progress scan fallback — `DELETE_LEGACY`.
3. `skills/buster/pipeline/services/base-images.ts` — podman inspect/pull failures — `STRICTIFY_TS_SLICE`.
4. `skills/buster/pipeline/services/rate-limit.ts` — liveness failure handling — `STRICTIFY_TS_SLICE`.
5. `skills/buster/pipeline/services/sandbox-cleanup.ts` — malformed cleanup state fallback — `STRICTIFY_TS_SLICE`.

Rules:

1. Require fully qualified typed base-image references.
2. Delete mining `.swarm/progress.json` for base-image inputs.
3. Keep pre-pull nonblocking only with typed degraded image-level failures.
4. Represent session liveness as typed states; probe errors/gateway degradation must preserve monitoring and only confirmed closed sessions move to kill action.
5. Distinguish missing cleanup state from corrupt cleanup state with typed diagnostics.

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
refactor: migrate buster runtime support services to typescript
```

### P5-B05 — Buster operator reporting, Discord, telemetry, and diagnostics

Status: completed.

Scope:

1. `skills/buster/pipeline/services/discord.ts`.
2. `skills/buster/pipeline/services/telemetry.ts`.
3. `skills/buster/pipeline/services/logger.ts`.
4. `skills/buster/pipeline/services/runtime-diagnostics.ts`.
5. `skills/buster/pipeline/services/task-queue.ts` and `task-completion.js` only if typed telemetry/completion evidence requires it.

Ledger rows to resolve:

1. `skills/buster/pipeline/services/discord.ts` — Discord webhook mute aliases — `STRICTIFY_TS_SLICE`.
2. Buster telemetry rows marked `KEEP_TYPED_POLICY`: disabled/missing telemetry identity, invalid payload fallback, Redis emission fallback, artifact mirror fallback, and Redis close fallback.
3. `skills/buster/pipeline/services/runtime-diagnostics.ts` — project hint fallback if still owned by this slice.

Rules:

1. Collapse Discord mute aliases into one canonical typed config/env policy.
2. Preserve audit persistence and nonblocking operator notification behavior only as named typed policy.
3. Preserve telemetry degradation evidence without allowing invalid stream events.
4. Do not let observability failures alter task terminal results unless the ledger row explicitly says so.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-operator-surface.mjs
node tests/verification/contracts/check-telemetry-contract.mjs
node tests/verification/contracts/check-observability-catch-reporting.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,discord-correlation,telemetry
```

Commit message:

```text
refactor: migrate buster operator telemetry services to typescript
```

### P5-B06 — Buster deployment and API-facing suites

Status: completed.

Scope:

1. `skills/buster/pipeline/suites/api.ts`.
2. `skills/buster/pipeline/suites/build.ts`.
3. `skills/buster/pipeline/suites/health.ts`.
4. `skills/buster/pipeline/suites/k8s.ts`.
5. `skills/buster/pipeline/suites/manifest.ts`.

Ledger rows to resolve:

1. API suite spec absence and auth/interpolation fallbacks — `DELETE_LEGACY`.
2. Build suite unresolved secret placeholder — `DELETE_LEGACY`.
3. Health suite smoke path auto-detection and Playwright smoke unavailable — `DELETE_LEGACY`.
4. Kubernetes suite missing config, secret copy best-effort, and missing manifest apply handling — `DELETE_LEGACY`.
5. Manifest suite missing deployment skip and optional secret warning — `DELETE_LEGACY`.

Rules:

1. If a suite is requested, missing required suite inputs are typed contract failures, not `SKIP`.
2. Missing secrets fail typed validation because they are production-breaking.
3. Smoke paths must be explicit typed `serve.smoke_paths`; do not infer them from visual-reg baselines.
4. Requested manifest/config paths must exist and parse/apply or fail typed validation.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/contracts/check-buster-repo-scoped-paths.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: migrate buster deployment suites to typescript
```

### P5-B07 — Buster evidence and quality suites

Status: completed.

Scope:

1. `skills/buster/pipeline/suites/a11y.ts`.
2. `skills/buster/pipeline/suites/bundle.ts`.
3. `skills/buster/pipeline/suites/e2e.ts`.
4. `skills/buster/pipeline/suites/perf.ts`.
5. `skills/buster/pipeline/suites/security.ts`.
6. `skills/buster/pipeline/suites/unit.ts`.

Ledger rows to resolve:

1. Bundle missing build output skip — `DELETE_LEGACY`.
2. Bundle scan/probe fallbacks — `STRICTIFY_TS_SLICE`.
3. E2E missing tests skip — `DELETE_LEGACY`.
4. Perf informational mode and missing score skip — keep no-threshold evidence-only PASS as `KEEP_TYPED_POLICY`; delete silently skipped enforced missing categories.
5. Unit missing/no-op tests skip — `DELETE_LEGACY`.
6. Any informational-mode rows still marked `KEEP_TYPED_POLICY` must be named explicitly as evidence-only mode.

Rules:

1. Requested suites must fail typed validation when required evidence/test inputs are missing.
2. Evidence-only PASS is allowed only when explicitly configured as no-threshold/informational policy.
3. Probe/read failures may stay nonfatal only when represented as typed unknown/degraded metadata.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: migrate buster quality suites to typescript
```

### P5-B08 — Buster visual evidence and tools

Status: completed.

Scope:

1. `skills/buster/pipeline/suites/visual-reg.ts`.
2. `skills/buster/pipeline/suites/visual-reg-discord.ts`.
3. `skills/buster/pipeline/tools/screenshot.ts`.
4. `skills/buster/pipeline/tools/visual-audit.ts`.
5. `skills/buster/pipeline/tools/verify-task.ts`.
6. `skills/buster/pipeline/tools/redis.ts`.

Ledger rows to resolve:

1. Visual-reg paths/baseline fallbacks, HTML baseline auto-generation, missing baseline skip, and single-path compatibility — `DELETE_LEGACY`.
2. Visual-reg Discord delivery summary fallback — `STRICTIFY_TS_SLICE`.
3. Screenshot Prism/setup route special-case — `DELETE_LEGACY`.
4. Screenshot page JavaScript error warnings — `DELETE_LEGACY`.
5. Verify-task no-change success — `KEEP_TYPED_POLICY` for true no-change success and `STRICTIFY_TS_SLICE` for cleanup proof.
6. Verify-task cleanup failure nonterminal — `DELETE_LEGACY`.
7. Redis tool identity defaults — resolve per ledger before touching; if ambiguous, stop and ask.

Rules:

1. Visual baselines must be explicit reviewed artifacts.
2. Requested visual-reg suite must fail when explicit baseline metadata is missing.
3. Screenshot/baseline capture must fail typed validation on page JavaScript errors.
4. Verify-task success must mean intended cleanup succeeded or report typed failure evidence.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-buster-verify-task-scope.mjs
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,buster-runtime-normalization
```

Commit message:

```text
refactor: migrate buster visual tools to typescript
```

### P5-B09 — Phase 5 cleanup and verification

Status: completed.

Scope:

1. Remove obsolete `.d.ts` shims created only for JavaScript dependencies if their owning implementation is now `.ts`.
2. Re-run import searches for stale `.js` imports of migrated Phase 5 modules.
3. Update:
   - `docs/ts-migration/authority-registry.md`
   - `docs/ts-migration/import-call-graph.md`
   - `docs/ts-migration/architecture-map.md`
4. Confirm unresolved ledger/pass3 rows are deferred to Phase 6+ or tied to their owning future migration batch.
5. Record a Phase 5 completion audit with native Node import evidence and fallback-ledger compliance evidence.

Final Phase 5 validation:

```bash
scripts/typecheck-ts-migration.sh
tests/verification/run-fast-verification.sh
```

Commit message:

```text
docs: record phase five migration completion
```

## Phase 5 exit criteria

Phase 5 is complete when:

1. Buster runtime/task-processing files in scope are migrated to `.ts` or explicitly deferred with a documented reason.
2. Every Phase 5 `DELETE_LEGACY` row has the legacy behavior deleted 100% in code and covered by tests or audit evidence.
3. Every Phase 5 `STRICTIFY_TS_SLICE` row has typed degraded/failure evidence instead of silent fallback behavior.
4. Every Phase 5 `KEEP_TYPED_POLICY` row is preserved as named intentional policy.
5. Native Node import checks pass for every migrated Phase 5 `.ts` file.
6. `scripts/typecheck-ts-migration.sh` and `tests/verification/run-fast-verification.sh` pass.
7. Phase 5 completion audit is committed.
