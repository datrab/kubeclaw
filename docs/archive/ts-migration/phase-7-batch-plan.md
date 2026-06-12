# Phase 7 TypeScript Migration Batch Plan

Purpose: migrate the remaining Nova lifecycle/support/tooling surfaces to TypeScript without preserving compatibility authority or unresolved fallback debt, and explicitly record any narrow runtime/package facades that remain intentionally JavaScript.

Phase 7 starts after Phase 6 completion audit commit `1d99d2bc2 docs: record phase six migration completion`.

## Mandatory gates for every Phase 7 batch

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
   - If a touched owning file still says `needs user decision`, `USER_POLICY`, or remains ambiguous at execution time, stop and ask before changing behavior.
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

## Phase 7 scope

Phase 7 owns the remaining Nova/Common JavaScript surfaces after Phase 6:

1. Nova agent/session lifecycle, orchestration, reviewer lifecycle, and shutdown support.
2. Nova approval/Buster gate support layers, compatibility adapters, and non-authoritative runner support files still left in JavaScript.
3. Nova support services: Forge completion, approval signal adapters, artifact bundling, rate-limit/session helpers, remediation/session authority helpers, and telemetry support slices still left in JavaScript.
4. Nova status-store compatibility and lifecycle owners deferred by the Phase 6 audit.
5. Nova prompt/preflight/validation surfaces deferred by the Phase 6 audit.
6. Nova tooling and summary surfaces deferred by the Phase 6 audit: lint-report, project-summary, related formatters/parsers, and operator-facing adapters.
7. Remaining pure Nova/Common role-local facades or packaging adapters only when they are still required after the owning slices migrate; otherwise convert/delete them in Phase 7.

Phase 7 does not own unrelated product feature work. It should not add new compatibility layers while deleting old ones.

## Batch order

### P7-B01 — Nova agent lifecycle and shutdown support

Status: planned first.

Scope:

1. `skills/nova/pipeline/agents/module-workers.ts`.
2. `skills/nova/pipeline/agents/orchestration-healthcheck.ts`.
3. `skills/nova/pipeline/agents/orchestration-lifecycle-events.ts`.
4. `skills/nova/pipeline/agents/orchestration.ts`.
5. `skills/nova/pipeline/agents/reviewer-lifecycle.ts`.
6. `skills/nova/pipeline/agents/shutdown.ts`.
7. `skills/nova/pipeline/cli.ts`.
8. Importers/tests/docs touched by the migrated lifecycle owners.

Ledger rows to resolve:

1. Worker dependency/default seams and Buster dispatch/session fallback.
2. Health-check transcript fallback, identity aliases, and degradation suppression.
3. Orchestration spawn defaults, Buster payload aliases/defaults, stale tracked-session kill handling, and best-effort lifecycle notifications.
4. Reviewer spawn defaults and stale reviewer cleanup.
5. Shutdown tracked-session fallback, placeholder shutdown context, process reaping bounds, signal dedupe, and noncritical telemetry/status persistence policy.
6. CLI legacy canonical-flag proxy deletion, temp-dir context fallback deletion, and retained env/runtime override policy at the external CLI boundary.

Rules:

1. Session lifecycle and termination remain the authority; telemetry/Discord must stay non-authoritative side effects.
2. Transcript/Gateway fallback logic may remain only as explicit external-adapter or degraded evidence policy, not hidden health authority.
3. Redis-dispatched worker handling must preserve the persistent-worker policy while canonicalizing typed task/session identity.
4. Shutdown/reaping logic must stay narrowly scoped and idempotent.
5. The CLI remains an external boundary only: it must normalize env/flag input immediately and must not preserve internal legacy key access or temp-dir shape fallback.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-session-authority-slice-surface.mjs
node tests/verification/contracts/check-telemetry-contract.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/runtime/check-nova-startup-smoke.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,telemetry
```

Commit message:

```text
refactor: migrate nova agent lifecycle support to typescript
```

### P7-B02 — Nova approval and Buster gate support layers

Status: planned after P7-B01.

Scope:

1. `skills/nova/pipeline/runners/approval-gate-control.ts`.
2. `skills/nova/pipeline/runners/approval-gate-shared.ts`.
3. `skills/nova/pipeline/runners/buster-gate-completion.ts`.
4. `skills/nova/pipeline/runners/buster-gate-control.ts`.
5. `skills/nova/pipeline/runners/buster-gate-fix-cycle.ts`.
6. `skills/nova/pipeline/runners/buster-gate-runner.ts`.
7. `skills/nova/pipeline/runners/buster-gate-task.ts`.
8. `skills/nova/pipeline/runners/buster-gate-terminal.ts`.
9. `skills/nova/pipeline/runners/pipeline-runner-deps.ts`.
10. `skills/nova/pipeline/runners/pipeline-runner-shared.ts`.
11. Supporting import/test/doc updates.

Ledger rows to resolve:

1. Approval compatibility/control adapters and timeout-policy fallback.
2. Buster completion local/Redis compatibility parsing and operator-visible failure policy.
3. Buster failure-class, issue extraction, and correlation alias fallbacks.
4. Remediation policy defaults and rerun-stage fallback.
5. Retest cleanup best-effort policy.
6. Pipeline-runner dependency seam retention and runner-shared result/status compatibility aliases that must not remain hidden authority.

Rules:

1. Compatibility projections may remain only at documented external boundaries and must not become gate-result authority.
2. Remediation limits/correlation must come from one typed remediation policy before control results are emitted.
3. Completion wait failures must remain operator-visible and fail closed.
4. Retest cleanup may remain best-effort only where the ledger names it observability/support policy.
5. Runner support helpers may keep scoped dependency injection or bounded identity backfill only where the ledger names it policy; they must not re-authorize legacy result/status shapes.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-gate-control-result-surface.mjs
node tests/verification/contracts/check-gate-active-session-surface.mjs
node tests/verification/contracts/check-remediation-handoff-surface.mjs
node tests/verification/contracts/check-buster-completion-controller-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,gates,restart-recovery
```

Commit message:

```text
refactor: migrate nova gate support layers to typescript
```

### P7-B03 — Nova support services, rate-limit, and completion boundaries

Status: planned after P7-B02.

Scope:

1. `skills/nova/pipeline/services/acp-observability.ts`.
2. `skills/nova/pipeline/services/agent-observability-forge-completion.ts`.
3. `skills/nova/pipeline/services/approval-signal-event-adapter.ts`.
4. `skills/nova/pipeline/services/artifact-bundle.ts`.
5. `skills/nova/pipeline/services/contract-diagnostics.ts`.
6. `skills/nova/pipeline/services/correlation.ts`.
7. `skills/nova/pipeline/services/dependencies.ts`.
8. `skills/nova/pipeline/services/durable-operator-alert.ts`.
9. `skills/nova/pipeline/services/failure-semantics.ts`.
10. `skills/nova/pipeline/services/failures/classification.ts`.
11. `skills/nova/pipeline/services/failures/incidents.ts`.
12. `skills/nova/pipeline/services/forge-completion.ts`.
13. `skills/nova/pipeline/services/gate-active-session.ts`.
14. `skills/nova/pipeline/services/gate-fix-scaffold.ts`.
15. `skills/nova/pipeline/services/governance-context.ts`.
16. `skills/nova/pipeline/services/prompt-ingress.ts`.
17. `skills/nova/pipeline/services/rate-limit-builders.ts`.
18. `skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts`.
19. `skills/nova/pipeline/services/rate-limit-exit.ts`.
20. `skills/nova/pipeline/services/rate-limit.ts`.
21. `skills/nova/pipeline/services/redis-completion.ts`.
22. `skills/nova/pipeline/services/redis-log.ts`.
23. `skills/nova/pipeline/services/remediation-handoff.ts`.
24. `skills/nova/pipeline/services/session-authority.ts`.
25. `skills/nova/pipeline/services/system-io-warning.ts`.
26. `skills/nova/pipeline/services/compatibility-authority.ts`.
27. Supporting imports/tests/docs.

Ledger rows to resolve:

1. Forge completion missing-repo-root delete, diff-evidence aliases, telemetry identity aliases, reader-unavailable degradation, and settle-config aliases.
2. Approval filesystem signal adapter fatal-event policy, run-id aliases, and debounce/cancel semantics.
3. Artifact bundle path/identity aliases and fallback-artifact evidence policy.
4. Rate-limit ownership/identity defaults, gate/module identity compatibility, and remaining liveness/degraded handling.
5. Session/remediation/support helper alias rows that remain external adapters only.
6. Legacy Forge completion artifact reading and compatibility-authority stripping that remain external adapter boundaries only.
7. Failure text classification/incidents policy that stays operator-facing support logic without becoming primary authority.

Rules:

1. Forge completion must require typed repo/diff authority and must not report success when repo authority is absent.
2. Approval signal/watcher failures must remain runner-consumable fatal events instead of hidden adapter failures.
3. Artifact fallbacks must stay evidence-only and never gain lifecycle authority.
4. Rate-limit helpers must preserve canonical signal ownership boundaries and explicit degraded states.
5. Text-only failure classification and legacy Forge artifact readers may survive only as typed external adapters around canonical authority, not as alternate completion/result truth.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-rate-limit-slice-surface.mjs
node tests/verification/contracts/check-session-authority-slice-surface.mjs
node tests/verification/contracts/check-artifact-authority-slice-surface.mjs
node tests/verification/contracts/check-operator-alert-surface.mjs
node tests/verification/contracts/check-observability-catch-reporting.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,telemetry
```

Commit message:

```text
refactor: migrate nova support services to typescript
```

### P7-B04 — Nova telemetry, notification, and truth-drift support

Status: planned after P7-B03.

Scope:

1. `skills/nova/pipeline/integrations/discord.ts`.
2. `skills/nova/pipeline/services/discord-fields.ts`.
3. `skills/nova/pipeline/services/notification-dispatch.ts`.
4. `skills/nova/pipeline/services/telemetry-sink-dispatch.ts`.
5. `skills/nova/pipeline/services/telemetry-stream.ts`.
6. `skills/nova/pipeline/services/telemetry.ts`.
7. `skills/nova/pipeline/services/telemetry/builders.ts`.
8. `skills/nova/pipeline/services/telemetry/dispatch.ts`.
9. `skills/nova/pipeline/services/telemetry/progress.ts`.
10. `skills/nova/pipeline/services/telemetry/sinks.ts`.
11. `skills/nova/pipeline/services/truth-drift.ts`.
12. Supporting import/test/doc updates.

Ledger rows to resolve:

1. Telemetry-stream enabled/run-id aliases and nonblocking Redis/client/close fallback policy.
2. Broad telemetry service barrel narrowing or explicit adapter-only retention.
3. Telemetry progress default-field compatibility.
4. Operator-alert durable-first delivery policy.
5. Truth-drift artifact-path aliases and completion-adjudication guard.

Rules:

1. Telemetry remains nonblocking observability, but stream identity/config aliases must be collapsed to typed boundaries.
2. Broad telemetry exports may remain only as narrow documented adapters if still required by runtime callers.
3. Truth-drift diagnostics must stay evidence-only and must not invent missing completion authority.
4. Discord/notification helper failures remain non-authoritative side effects.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-telemetry-contract.mjs
node tests/verification/contracts/check-observability-catch-reporting.mjs
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/contracts/check-implementation-map-sync-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,telemetry
```

Commit message:

```text
refactor: migrate nova telemetry support to typescript
```

### P7-B05 — Nova status-store compatibility and lifecycle

Status: planned after P7-B04.

Scope:

1. `skills/nova/pipeline/services/status-store-compat.ts`.
2. `skills/nova/pipeline/services/status-store-compat/common.ts`.
3. `skills/nova/pipeline/services/status-store-compat/gate-projection.ts`.
4. `skills/nova/pipeline/services/status-store-compat/module-projection.ts`.
5. `skills/nova/pipeline/services/status-store-lifecycle.ts`.
6. `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts`.
7. `skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts`.
8. `skills/nova/pipeline/services/status-store-lifecycle/legality.ts`.
9. `skills/nova/pipeline/services/status-store-lifecycle/projections.ts`.
10. `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts`.
11. `skills/nova/pipeline/services/status-store-lifecycle/refs.ts`.
12. `skills/nova/pipeline/services/status-store-lifecycle/storage.ts`.
13. `skills/nova/pipeline/services/status-store.ts`.
14. Supporting import/test/doc updates.

Ledger rows to resolve:

1. `P3-086` — lifecycle event primary-ref requirements.
2. `P3-087` — malformed canonical lifecycle signal handling.
3. `P3-088` — initialized run-log-dir requirement for canonical lifecycle writes.
4. Remaining compatibility-projection and truth-drift rows that touch status-store support owners.

Rules:

1. Status-store lifecycle writes and read models must have one typed canonical authority.
2. Compatibility projections may remain only at documented reporting/external boundaries.
3. If primary-ref requirements or initialized-write policy still require a product/operator decision at execution time, stop and ask before changing behavior.
4. Malformed canonical lifecycle signals must fail closed or emit typed degraded diagnostics, never silently normalize into authoritative state.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-status-store-slice-surface.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/contracts/check-session-authority-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,gate-session-persistence
```

Commit message:

```text
refactor: migrate nova status store lifecycle to typescript
```

### P7-B06 — Nova prompts, preflight, and validation surfaces

Status: planned after P7-B05.

Scope:

1. `skills/nova/pipeline/prompts/buster-gate.ts`.
2. `skills/nova/pipeline/prompts/buster-instructions.ts`.
3. `skills/nova/pipeline/prompts/buster-module.ts`.
4. `skills/nova/pipeline/prompts/forge.ts`.
5. `skills/nova/pipeline/prompts/gate-fix.ts`.
6. `skills/nova/pipeline/prompts/review.ts`.
7. `skills/nova/pipeline/prompts/shared.ts`.
8. `skills/nova/pipeline/runners/module-runner/preflight.ts`.
9. `skills/nova/pipeline/services/validation.ts`.
10. Supporting import/test/doc updates.

Ledger rows to resolve:

1. `P3-055` — configured substep `FORGE.md` aggregation must not silently skip missing artifacts.
2. `P3-056` — disabled memory recall dead code must be deleted.
3. `P3-090` — missing `FORGE.md` preflight skip policy.
4. Prompt-construction controlled-result policy and backend package context policy.

Rules:

1. Configured prompt inputs must have explicit typed artifacts or fail prompt construction; do not silently skip missing configured substeps.
2. Prompt/preflight failures may remain controlled typed results where the ledger already accepts them.
3. Remove disabled memory-recall dead code; reintroduce recall later only as a typed feature.
4. If required-vs-optional prompt/preflight policy remains ambiguous at execution time, stop and ask before changing behavior.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-validator-control-result-surface.mjs
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,docs-surface
```

Commit message:

```text
refactor: migrate nova prompt validation surfaces to typescript
```

### P7-B07 — Nova tooling, summary, and adapter registry

Status: planned after P7-B06.

Scope:

1. `skills/nova/pipeline/services/adapter-registry.ts`.
2. `skills/nova/pipeline/services/summary-session-cleanup.ts`.
3. `skills/nova/pipeline/services/summary/project-summary.ts`.
4. `skills/nova/pipeline/tools/lint-report.ts`.
5. `skills/nova/pipeline/tools/lint-report/constants.ts`.
6. `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts`.
7. `skills/nova/pipeline/tools/lint-report/discovery.ts`.
8. `skills/nova/pipeline/tools/lint-report/execution.ts`.
9. `skills/nova/pipeline/tools/lint-report/output.ts`.
10. `skills/nova/pipeline/tools/lint-report/parsers.ts`.
11. `skills/nova/pipeline/tools/lint-report/report.ts`.
12. `skills/nova/pipeline/tools/lint-report/tool-registry.ts`.
13. `skills/nova/pipeline/tools/project-summary-formatters.ts`.
14. `skills/nova/pipeline/tools/project-summary.ts`.
15. `skills/nova/pipeline/tools/redis.ts` if still required by typed adapter/tool callers.
16. Supporting import/test/doc updates.

Ledger rows to resolve:

1. `P3-091` — lint-report regex export extraction.
2. `P3-092` — project-summary scope grouping regexes.
3. `P3-093` — project-summary prompt filename census.
4. Adapter-registry alias rows that remain allowlisted external adapters only.
5. Project-summary Git/JSON fallback strictification and incomplete-gate/non-authoritative Discord policy.

Rules:

1. Summary scope/category and agent invocation counts must come from structured metadata/telemetry, not title regexes or prompt filename heuristics.
2. Tool/summary Git and JSON fallback behavior may remain partial/nonfatal only with typed unavailable/malformed diagnostics.
3. Adapter registries remain allowlisted boundaries and must fail closed on unknown adapters.
4. Summary Discord posting remains operator notification, not summary authority.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/contracts/check-generator-result-surface.mjs
node tests/verification/contracts/check-strict-cli-args-surface.mjs
node tests/verification/contracts/check-implementation-map-sync-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,docs-surface,governance
```

Commit message:

```text
refactor: migrate nova tooling summary surfaces to typescript
```

### P7-B08 — Phase 7 cleanup and verification

Status: completed in P7-B08.

Scope:

1. Remove obsolete `.d.ts` shims created only for JavaScript Nova/Common dependencies if their owning implementation is now `.ts`.
2. Re-run import searches for stale `.js` imports of migrated Phase 7 modules.
3. Audit any remaining JavaScript owners and confirm each one is an intentional pure external/runtime facade with no hidden authority; otherwise migrate/delete it in this batch.
4. Update:
   - `docs/ts-migration/authority-registry.md`
   - `docs/ts-migration/import-call-graph.md`
   - `docs/ts-migration/architecture-map.md`
   - `docs/ts-migration/fallback-ledger-pass3-batches.md`
5. Confirm unresolved ledger/pass3 rows are either resolved in Phase 7 or deferred to a named future owner.
6. Record a Phase 7 completion audit with native Node import evidence and fallback-ledger compliance evidence.

Final Phase 7 validation:

```bash
scripts/typecheck-ts-migration.sh
tests/verification/run-fast-verification.sh
```

Commit message:

```text
docs: record phase seven migration completion
```

## Phase 7 exit criteria

Phase 7 is complete when:

1. Phase 7-owned Nova/Common implementation files are migrated to `.ts`; any remaining `.js` files are explicitly retained as documented pure external/runtime facades with no hidden authority.
2. Every Phase 7 `DELETE_LEGACY` row has the legacy behavior deleted 100% in code and covered by tests or audit evidence.
3. Every Phase 7 `STRICTIFY_TS_SLICE` row has typed degraded/failure evidence instead of silent fallback behavior.
4. Every Phase 7 `KEEP_TYPED_POLICY` row is preserved as named intentional policy.
5. Native Node import checks pass for every migrated Phase 7 `.ts` file.
6. `scripts/typecheck-ts-migration.sh` and `tests/verification/run-fast-verification.sh` pass.
7. Phase 7 completion audit is committed.
