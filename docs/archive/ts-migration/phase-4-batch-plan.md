# Phase 4 TypeScript Migration Batch Plan

Purpose: migrate shared pipeline helpers after Phase 3 completed core/runtime/config/registry. Phase 4 follows the existing phase plan: common helpers first, then role-local adapters that depend on those helpers. Nova runners/gates/workers are intentionally deferred to a later phase unless a direct import boundary requires a tiny adapter update.

## Phase 4 hard gates

Every Phase 4 batch must satisfy both gates before commit.

1. Native Node TypeScript stripping compatibility is mandatory.
   - Use erasable TypeScript only.
   - Do not use enums, runtime namespaces, parameter properties, decorators, path aliases, TypeScript import-assignment syntax, or code that requires emitted-JS transforms.
   - Keep explicit relative `.ts` / `.js` imports.
   - Use type-only syntax only when it is erasable by native Node stripping.
   - Prove compatibility with native Node imports for every migrated `.ts` file in the batch.

2. `docs/ts-migration/fallback-ledger.md` decisions are mandatory.
   - Read the owning-file ledger rows before editing each file.
   - `DELETE_LEGACY` means delete the legacy/fallback path completely. Do not preserve it as a compatibility adapter, live binding, alternate authority, or hidden fallback.
   - `STRICTIFY_TS_SLICE` means keep the intended capability only behind explicit typed evidence/result shapes; silent fallback behavior must be removed or surfaced as typed degraded/failure evidence.
   - `KEEP_TYPED_POLICY` means preserve the behavior and name it in tests/docs as intentional policy.
   - `keep external adapter only` is allowed only when the ledger names an external compatibility adapter; it must not become internal fallback authority.
   - If a row still says `needs user decision`, stop and resolve that policy row before changing behavior.

## Per-batch commit checklist

Before each Phase 4 commit:

1. Update imports to the new `.ts` paths and verify there are no stale runtime/test `.js` imports for files migrated in that batch.
2. Run an unsupported syntax scan over migrated files for:
   - `enum`
   - `namespace`
   - decorators
   - constructor parameter properties
   - `import = require`
3. Run native Node imports for every migrated `.ts` file in the batch.
4. Run `scripts/typecheck-ts-migration.sh`.
5. Run focused contract/behavior checks named by the batch.
6. Run `tests/verification/run-fast-verification.sh`.
7. Run `git diff --check`.
8. Record the fallback-ledger rows resolved and how `DELETE_LEGACY`/`STRICTIFY_TS_SLICE` decisions were enforced.

## Batch order

### P4-B01 — Common telemetry, redaction, and noncritical reporting

Status: completed.

Scope:

1. `skills/common/pipeline/redaction.ts`
   - Preserve `P3-043` as `KEEP_TYPED_POLICY`: fixed secret/token redaction remains the accepted baseline egress policy; semantic DLP stays outside this migration slice.
   - Preserve the other redaction ledger rows as typed policy: content summarization, sanitizer non-crash behavior, Discord file stripping, and bounded transcript head/tail artifacts.

2. `skills/common/pipeline/noncritical-reporting.ts`
   - Preserve arbitrary thrown-value normalization and incident de-dupe/output fallback as `KEEP_TYPED_POLICY`.

3. `skills/common/pipeline/telemetry.ts`
   - Resolve `P3-046` before changing behavior.
   - If the ledger decision is `STRICTIFY_TS_SLICE`, telemetry stream/sequence keys must require typed project/run identity instead of emitting canonical telemetry under `unknown` key segments.

4. Existing agent-observability TypeScript policy rows:
   - `P3-041` temporary `plugin.event` mappings remain deferred unless first-class schemas are approved in this batch.
   - `P3-042` minimal masking profile should stay `KEEP_TYPED_POLICY` unless Raven explicitly asks for broader DLP.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-telemetry-contract.mjs
node tests/verification/contracts/check-observability-catch-reporting.mjs
node tests/verification/behavior/verify.mjs --areas foundations,redaction-surface,runtime-surface
```

Commit message:

```text
refactor: migrate shared telemetry redaction helpers to typescript
```

### P4-B02 — Common Gateway, Discord, Redis, and CLI helpers

Status: completed.

Scope:

1. `skills/common/pipeline/integrations/gateway.ts`
   - Preserve transient Gateway retry/liveness and non-JSON result normalization as `KEEP_TYPED_POLICY`.
   - Keep env/body alias behavior only as named external adapter behavior; do not let aliases become new internal authority.

2. `skills/common/pipeline/integrations/discord-webhook.ts`
   - Delete the `payload`/`body` shorthand fallback if the ledger row remains `DELETE_LEGACY`; internal callers must pass canonical webhook body shape.
   - Preserve bounded error response previews as `KEEP_TYPED_POLICY`.

3. `skills/common/pipeline/redis-transport.ts`
   - Preserve secure transport enforcement and missing dependency diagnostics as `KEEP_TYPED_POLICY`.
   - Keep Redis option/env aliases only as external adapter behavior while canonicalizing internal callers.

4. `skills/common/pipeline/cli-args.ts`
   - Preserve strict parser behavior plus schema defaults as `KEEP_TYPED_POLICY`.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-gateway-operation-boundary-surface.mjs
node tests/verification/contracts/check-redis-completion-service-surface.mjs
node tests/verification/contracts/check-strict-cli-args-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,shell-boundary,runtime-surface
```

Commit message:

```text
refactor: migrate shared transport helpers to typescript
```

### P4-B03 — Common agent lifecycle and monitor helpers

Status: completed.

Scope:

1. `skills/common/pipeline/agents/acp-monitor.ts`
   - Preserve transcript flood protection, transcript truncation handling, Gateway-unreachable-with-progress behavior, adapter fatal observability, and bounded idle wait policy where ledger says `KEEP_TYPED_POLICY`.
   - Keep signature/config aliases only as external adapter behavior; internal callers should move toward one typed options shape.

2. `skills/common/pipeline/agents/lifecycle.ts`
   - Preserve active-session files as diagnostic evidence, not restart authority.
   - Preserve layered termination and inactive-list teardown confirmation as `KEEP_TYPED_POLICY`.
   - Apply `STRICTIFY_TS_SLICE` to spawn defaults: keep bounded Gateway retry policy, but require explicit typed runtime/model/agent identity instead of broad runtime/model/agent/label defaults.

3. `skills/common/pipeline/agents/runtime.ts`
   - Keep substring model heuristics only as external adapter behavior; do not treat them as internal runtime authority.

4. `skills/common/pipeline/agents/session-semantics.ts`
   - Keep text status parsing only as external adapter behavior while preferring structured Gateway/session state.

5. `skills/common/pipeline/agents/session-termination.ts`
   - Preserve bounded grace, no-session idempotent success, grace-expired result shaping, and cleanup callback capture as `KEEP_TYPED_POLICY`.

6. `skills/common/pipeline/agents/tracked-agents.ts`
   - Delete silent no-label null/false behavior if the ledger row remains `DELETE_LEGACY`; tracking APIs must require explicit labels or fail contract validation.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-acp-gateway-contract-surface.mjs
node tests/verification/contracts/check-session-authority-slice-surface.mjs
node tests/verification/contracts/check-gate-active-session-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,restart-recovery,stops
```

Commit message:

```text
refactor: migrate shared agent lifecycle helpers to typescript
```

### P4-B04 — Common Git primitives and lifecycle state

Status: completed.

Scope:

1. `skills/common/pipeline/git-primitives.ts`
   - Keep repo/branch aliases only as external adapter behavior while canonicalizing internal callers.
   - Apply `STRICTIFY_TS_SLICE` to `headHash`: replace magic empty string with typed `null` or unavailable Git metadata.

2. `skills/common/pipeline/lifecycle-state.ts`
   - Preserve partial lifecycle initialization and rate-limit phase preservation as `KEEP_TYPED_POLICY`.
   - Delete the hidden `Symbol.for('kubeclaw.pipeline.pendingLifecycleMutation')` side-channel if the ledger row remains `DELETE_LEGACY`; typed transition helpers must return explicit lifecycle mutation/event data.

3. Already-migrated common helpers that may need import cleanup only:
   - `skills/common/pipeline/security.ts`
   - `skills/common/pipeline/timing.ts`

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-status-store-slice-surface.mjs
node tests/verification/contracts/check-common-helper-import-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,resume-idempotence,restart-recovery
```

Commit message:

```text
refactor: migrate shared git lifecycle helpers to typescript
```

### P4-B05 — Role-local shared-helper facades

Status: completed.

Scope:

1. Nova role-local facades over common helpers:
   - `skills/nova/pipeline/agents/acp-monitor.ts`
   - `skills/nova/pipeline/agents/lifecycle.ts`
   - `skills/nova/pipeline/agents/runtime.ts`
   - `skills/nova/pipeline/agents/session-semantics.ts`
   - `skills/nova/pipeline/agents/session-termination.ts`
   - `skills/nova/pipeline/agents/tracked-agents.ts`
   - `skills/nova/pipeline/git-primitives.ts`
   - `skills/nova/pipeline/integrations/discord-webhook.ts`
   - `skills/nova/pipeline/integrations/gateway.ts`
   - `skills/nova/pipeline/lifecycle-state.ts`
   - `skills/nova/pipeline/noncritical-reporting.ts`
   - `skills/nova/pipeline/redaction.ts`
   - `skills/nova/pipeline/redis-transport.ts`
   - `skills/nova/pipeline/telemetry.ts`

2. Buster role-local facades over common helpers:
   - matching `skills/buster/pipeline/*` facades where present.

Rules:

1. If packaging still requires the role-local path, keep it as a tiny external adapter and point it at the canonical common `.ts` implementation.
2. If no runtime or packaging path requires the role-local facade, delete it and update imports to the canonical common helper.
3. Do not add broad barrels.
4. Do not preserve any facade marked `DELETE_LEGACY`.

Focused validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-common-helper-import-surface.mjs
node tests/verification/runtime/check-runtime-collisions.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,shell-boundary
```

Commit message:

```text
refactor: align shared helper facades with typed common modules
```

### P4-B06 — Phase 4 cleanup and verification

Status: completed.

Scope:

1. Remove obsolete `.d.ts` shims created only for JavaScript dependencies if their owning implementation is now `.ts`.
2. Re-run import searches for stale `.js` imports of migrated Phase 4 modules.
3. Update:
   - `docs/ts-migration/authority-registry.md`
   - `docs/ts-migration/import-call-graph.md`
   - `docs/ts-migration/architecture-map.md`
4. Confirm unresolved pass3 ledger rows are either deferred to Phase 5+ or tied to their owning future migration batch.
5. Record a Phase 4 completion audit with native Node import evidence and fallback-ledger compliance evidence.

Final Phase 4 validation:

```bash
scripts/typecheck-ts-migration.sh
tests/verification/run-fast-verification.sh
```

Commit message:

```text
docs: record phase four migration completion
```

## Phase 4 exit criteria

Phase 4 is complete when:

1. Selected common shared helper files are migrated to `.ts` or explicitly deferred with a documented reason.
2. Every Phase 4 `DELETE_LEGACY` row has the legacy behavior deleted in code and covered by tests or audit evidence.
3. Every Phase 4 `STRICTIFY_TS_SLICE` row has typed degraded/failure evidence instead of silent fallback behavior.
4. Native Node import checks pass for every migrated Phase 4 `.ts` file.
5. `scripts/typecheck-ts-migration.sh` and `tests/verification/run-fast-verification.sh` pass.
6. Phase 4 completion audit is committed.
