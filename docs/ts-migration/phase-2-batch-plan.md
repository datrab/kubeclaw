# Phase 2 Batch Plan

Purpose: scope TypeScript implementation batches before runtime code changes. Phase 2 migrates canonical contracts and result authorities first so later slices cannot preserve legacy result shapes by accident.

Phase 2 rules:

1. Migrate contracts before business logic.
2. Prefer direct `.ts` imports from owning contract modules.
3. Do not create new broad barrels.
4. Delete broad compatibility barrels already marked `DELETE_LEGACY`.
5. Keep role-local facades only when they are accepted external adapters or production-path shims.
6. Preserve `KEEP_TYPED_POLICY` behavior exactly.
7. Implement `STRICTIFY_TS_SLICE` rows while migrating the owning file.
8. Do not keep legacy aliases/fallbacks unless the ledger explicitly keeps them as adapter-only behavior.
9. Every migrated slice must pass `scripts/typecheck-ts-migration.sh`.
10. Existing JS/MJS tests remain valid and should import migrated `.ts` modules explicitly.

## Phase 2 execution order

1. `P2-B01` — Nova generator result contract and barrel deletion.
2. `P2-B02` — Nova validator and worker control-result contracts.
3. `P2-B03` — Nova gate control-result contract.
4. `P2-B04` — Nova pipeline-step result contract.
5. `P2-B05` — Common Redis message and task transport contracts plus role facades.
6. `P2-B06` — Common event, Gateway, and rate-limit contracts plus role facades.
7. `P2-B07` — Nova notification and telemetry sink contracts.
8. `P2-B08` — Common telemetry payload schema plus role facades.

Exit criteria for Phase 2:

- Contract/result authority files in scope are TypeScript.
- Broad contract barrel `skills/nova/pipeline/services/contracts/index.ts` is deleted.
- Role-local shared contract facades remain only where accepted as external adapters.
- Internal contract validation rejects malformed/legacy-shaped authority input according to the fallback ledger.
- `scripts/typecheck-ts-migration.sh` passes.
- Focused contract verification for each migrated contract passes.
- `tests/verification/run-fast-verification.sh` passes before the final Phase 2 commit.

## P2-B01 — Nova generator result contract

Status: selected as the first implementation slice.

### Files in scope

1. `skills/nova/pipeline/services/contracts/generator-result.ts`
   - Rename/migrate to `skills/nova/pipeline/services/contracts/generator-result.ts`.
   - Keep the existing typed generator result/artifact schema behavior.
   - Preserve the strict boundary: non-v1 or non-generator outputs throw `PLUGIN_CONTRACT_INVALID`.
   - Preserve compact output policy: null/falsy artifacts and empty optional fields are omitted.

2. `skills/nova/pipeline/services/contracts/index.ts`
   - Delete this broad namespace barrel.
   - Do not replace it with `index.ts`.
   - Require direct imports from owning contract modules.

3. Direct import updates for generator-result callers
   - `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
   - `skills/nova/pipeline/services/case-study.ts`
   - `skills/nova/pipeline/services/summary.ts`
   - `skills/nova/pipeline/services/summary/project-summary.ts`
   - `tests/verification/contracts/check-generator-result-surface.mjs`

### Why this is first

- Small contract surface: `generator-result.js` is about 132 lines.
- Low dependency risk: it imports only `../contract-diagnostics.js`.
- Runtime callers already use direct module imports, not the broad `contracts/index.js` barrel.
- The fallback ledger already marks the generator result behavior as modern typed policy.
- The fallback ledger marks `contracts/index.js` as `DELETE_LEGACY`, so this slice can remove a broad barrel before it spreads into TypeScript imports.
- Existing verification already has a focused generator-result contract check.

### Authority and ledger decisions

Authority:

- `skills/nova/pipeline/services/contracts/generator-result.ts` owns typed generator result/artifact schema validation and normalization.
- The broad `services/contracts/index.js` namespace barrel is not an authority and should not remain as a public import culture.

Fallback-ledger rows resolved in code:

1. `skills/nova/pipeline/services/contracts/generator-result.ts` — artifact filtering
   - Decision: `KEEP_TYPED_POLICY`
   - Implementation requirement: preserve omission of null artifact entries and empty optional fields.

2. `skills/nova/pipeline/services/contracts/generator-result.ts` — strict typed generator boundary
   - Decision: `KEEP_TYPED_POLICY`
   - Implementation requirement: keep strict generator result validation; do not accept compatibility-shaped generator output.

3. `skills/nova/pipeline/services/contracts/index.ts` — contract namespace barrel
   - Decision: `DELETE_LEGACY`
   - Implementation requirement: delete the broad barrel and keep direct imports.

### Expected import shape after migration

JavaScript callers should import the migrated TypeScript module directly with an explicit `.ts` extension during the mixed migration:

```js
import { buildGeneratorResult } from './contracts/generator-result.ts';
```

The migrated TypeScript module should keep imports explicit as well:

```ts
import { createContractInvalidError } from '../contract-diagnostics.js';
```

### Validation for P2-B01

Minimum checks:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-generator-result-surface.mjs
```

Recommended checks before commit:

```bash
tests/verification/run-fast-verification.sh
```

## P2-B02 — Nova validator and worker control-result contracts

Status: planned after P2-B01 proves JS tests can import migrated `.ts` contract modules.

Files in scope:

1. `skills/nova/pipeline/services/contracts/control-result-mapping.ts`
   - Rename/migrate to `.ts`.
   - Keep as a tiny direct helper, not a barrel.

2. `skills/nova/pipeline/services/contracts/validator-control-result.ts`
   - Rename/migrate to `.ts`.
   - Keep strict typed validator boundary.
   - Preserve non-empty validator diagnostic summary policy.
   - Move adapter-only legacy validator output mapping toward typed edge usage; do not let it become canonical authority.

3. `skills/nova/pipeline/services/contracts/worker-control-result.ts`
   - Rename/migrate to `.ts`.
   - Keep strict typed worker boundary.
   - Preserve worker plugin validation rejecting compatibility authority fields.
   - Keep Forge/Buster backend mapping as transitional edge projection only.

4. Direct import/test updates
   - `skills/nova/pipeline/services/module-validators.ts`
   - `skills/nova/pipeline/runners/module-runner-forge.ts`
   - `skills/nova/pipeline/runners/module-runner-prebuster.ts`
   - `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
   - `skills/nova/pipeline/agents/orchestration.ts`
   - `skills/nova/pipeline/agents/module-worker-control-results.ts`
   - module runner helpers that import worker control results
   - `tests/verification/contracts/check-validator-control-result-surface.mjs`
   - `tests/verification/contracts/check-worker-control-result-surface.mjs`

Fallback-ledger rows resolved in code:

- Validator module result mapping: adapter-only; keep at the edge, not as typed authority.
- Validator run-id/module aliases: adapter-only; canonicalize invocation identity where this slice touches callers.
- Validator lint/failure summary fallbacks: `KEEP_TYPED_POLICY` for non-empty operator summaries.
- Validator strict typed boundary: `KEEP_TYPED_POLICY`.
- Worker Forge reason mapping: adapter-only; canonicalize worker failure class.
- Worker Buster failure-class mapping: adapter-only; canonicalize failure-class enum.
- Worker compatibility projections: adapter-only transitional old worker result surface.
- Worker strict typed boundary: `KEEP_TYPED_POLICY`.

Validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-validator-control-result-surface.mjs
node tests/verification/contracts/check-worker-control-result-surface.mjs
```

## P2-B03 — Nova gate control-result contract

Status: planned after validator/worker control result mechanics are proven.

Files in scope:

1. `skills/nova/pipeline/services/contracts/gate-control-result.ts`
   - Rename/migrate to `.ts`.
   - Preserve typed gate action/result schema.
   - Preserve compatibility-authority rejection.
   - Keep review/Buster/approval legacy mappings only as edge adapter projections.

2. Direct import/test updates
   - review gate runner/control files
   - Buster gate runner/control files
   - approval gate runner/control files
   - generic gate runner
   - `tests/verification/contracts/check-gate-control-result-surface.mjs`

Fallback-ledger rows resolved in code:

- Gate compatibility mappings: adapter-only; canonicalize typed gate control as source of truth.
- Status alias sets: adapter-only; canonicalize `gateRunStatus` enum.
- Compatibility authority ban: `KEEP_TYPED_POLICY`.
- Compatibility projection aliases: adapter-only.

Validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-gate-control-result-surface.mjs
```

## P2-B04 — Nova pipeline-step result contract

Status: planned after gate/worker/validator controls are migrated.

Files in scope:

1. `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`
   - Rename/migrate to `.ts`.
   - Preserve typed pipeline step schema/action/outcome/exit authority.
   - Preserve old result-field rejection as typed diagnostics.
   - Strictify ambiguous HALT inference by removing summary-text guessing where the ledger requires it.

2. Direct import/test updates
   - `skills/nova/pipeline/runners/gate-runner.ts`
   - `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
   - `skills/nova/pipeline/runners/pipeline-runner-shared.ts`
   - `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
   - `skills/nova/pipeline/runners/module-runner-shared.ts`
   - `tests/verification/contracts/check-pipeline-step-result-surface.mjs`

Fallback-ledger rows resolved in code:

- Outcome/action aliases: adapter-only; canonicalize typed outcome enum.
- Compatibility authority rejection: `KEEP_TYPED_POLICY`.
- Control-result outcome inference: `STRICTIFY_TS_SLICE`; inference only from typed fields, no summary-text guessing for ambiguous HALT cases.
- Compatibility projection: adapter-only transitional old shape.
- Compatibility status defaults: adapter-only; canonicalize typed outcome/action.
- Rate-limit detail aliases: adapter-only.

Validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-pipeline-step-result-surface.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
node tests/verification/contracts/check-module-runner-slice-surface.mjs
```

## P2-B05 — Common Redis message and task transport contracts

Status: planned after Nova result authority contracts are migrated.

Files in scope:

1. `skills/common/pipeline/services/redis-message-contract.ts`
   - Rename/migrate to `.ts`.
   - Canonicalize internal task/completion envelope validation.
   - Implement `DELETE_LEGACY` for active internal completion validation requiring canonical envelope and stream role.
   - Keep any old Redis record handling only in explicit archive/import adapters if needed later.

2. `skills/common/pipeline/services/task-transport-contract.ts`
   - Rename/migrate to `.ts`.
   - Strictify transport input shape.
   - Keep Redis consumer-group `BUSYGROUP` idempotency as typed policy.

3. Role-local facades
   - `skills/nova/pipeline/services/redis-message-contract.ts`
   - `skills/buster/pipeline/services/redis-message-contract.ts`
   - `skills/nova/pipeline/services/task-transport-contract.ts`
   - `skills/buster/pipeline/services/task-transport-contract.ts`

4. Direct import/test updates
   - Nova/Buster Redis tools, task queue, completion services, completion adapters.
   - `tests/verification/contracts/check-redis-completion-service-surface.mjs`
   - `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`

Fallback-ledger rows resolved in code:

- Redis target/envelope alias normalization: adapter-only; canonicalize producers on snake_case envelope fields.
- Redis task payload target fallback: adapter-only; canonicalize explicit `target_kind`/`target_id` plus `gate_id` for gate tasks.
- Redis completion canonical-envelope opt-in: `DELETE_LEGACY` for active internal validation.
- Task transport object-or-array fields: `STRICTIFY_TS_SLICE`; pick one typed transport input shape and keep raw Redis arrays internal.
- Consumer group idempotency: `KEEP_TYPED_POLICY`.

Validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-redis-completion-service-surface.mjs
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
```

## P2-B06 — Common event, Gateway, and rate-limit contracts

Status: planned after Redis/task transport contracts.

Files in scope:

1. `skills/common/pipeline/services/pipeline-event-contract.ts`
   - Rename/migrate to `.ts`.
   - Keep invalid wait wiring fail-fast policy.
   - Keep deterministic timeout/abort/budget errors.
   - Keep alias normalization only at event adapter edges.

2. `skills/common/pipeline/services/acp-gateway-contract.ts`
   - Rename/migrate to `.ts`.
   - Preserve exact object-key validation for Gateway/session contracts.
   - Keep raw Gateway invoke normalization as adapter-only until per-tool results are typed.

3. `skills/common/pipeline/services/rate-limit-contract.ts`
   - Rename/migrate to `.ts`.
   - Strictify provider handling: no silent Anthropic default except through one explicit typed policy if selected.
   - Preserve no-kill-on-unknown-liveness recovery policy.

4. Role-local facades
   - Nova/Buster pipeline-event, ACP gateway, and rate-limit contract facades stay only as accepted production-path adapters.

5. Direct import/test updates
   - Event bus waiters, ACP monitor/lifecycle/termination callers, rate-limit handlers.
   - `tests/verification/contracts/check-acp-gateway-contract-surface.mjs`
   - rate-limit/session/event focused contract checks.

Fallback-ledger rows resolved in code:

- Pipeline event identity/timestamp aliases: adapter-only; canonicalize event producers.
- Invalid wait configuration: `KEEP_TYPED_POLICY`.
- Wait timeout/abort/budget shaping: `KEEP_TYPED_POLICY`.
- ACP strict object key validation: `KEEP_TYPED_POLICY`.
- Gateway invoke raw normalization: adapter-only.
- Rate-limit Discord identity aliases: adapter-only.
- Rate-limit provider default: `STRICTIFY_TS_SLICE`.
- Rate-limit recovery action fallback: `KEEP_TYPED_POLICY`.

Validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-acp-gateway-contract-surface.mjs
node tests/verification/contracts/check-rate-limit-slice-surface.mjs
node tests/verification/contracts/check-gate-active-session-surface.mjs
```

## P2-B07 — Nova notification and telemetry sink contracts

Status: planned after shared event/rate-limit contracts.

Files in scope:

1. `skills/nova/pipeline/services/notification-contract.ts`
   - Rename/migrate to `.ts`.
   - Keep notification hooks generic.
   - Canonicalize ids/refs at the notification boundary.

2. `skills/nova/pipeline/services/telemetry-sink-contract.ts`
   - Rename/migrate to `.ts`.
   - Preserve immutable sink input and emission-time timestamp policy.
   - Preserve built-in sink private-config boundary.
   - Preserve disabled telemetry nonfatal behavior while surfacing real Redis sink degradation.
   - Strictify Discord telemetry presentation shape.

Fallback-ledger rows resolved in code:

- Notification id aliases: adapter-only; canonicalize notification `ids`.
- Notification ref aliases/defaults: adapter-only; canonicalize notification `refs`.
- Optional Discord presentation: adapter-only; canonicalize presentation envelope.
- Telemetry sink ids/refs aliases: adapter-only.
- Telemetry sink input timestamp/default cloning: `KEEP_TYPED_POLICY`.
- Telemetry sink private config: `KEEP_TYPED_POLICY`.
- Redis sink disabled/failure behavior: `KEEP_TYPED_POLICY`.
- Discord telemetry presentation alternatives: `STRICTIFY_TS_SLICE`.

Validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-telemetry-contract.mjs
```

## P2-B08 — Common telemetry payload schema

Status: planned as the final Phase 2 contract batch because it is broad and heavily tested.

Files in scope:

1. `skills/common/pipeline/services/telemetry/payload-schema.ts`
   - Rename/migrate to `.ts`.
   - Preserve strict payload schema validation.
   - Preserve plugin telemetry projection policy: known identity/status fields top-level, extra plugin data under `details`.

2. Role-local facades
   - `skills/nova/pipeline/services/telemetry/payload-schema.ts`
   - `skills/buster/pipeline/services/telemetry/payload-schema.ts`

3. Direct import/test updates
   - Nova/Buster telemetry services and telemetry contract tests.

Fallback-ledger rows resolved in code:

- Plugin telemetry projection: `KEEP_TYPED_POLICY`.
- Role-local telemetry schema facades: accepted external adapters.

Validation:

```bash
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-telemetry-contract.mjs
tests/verification/run-fast-verification.sh
```

## Final Phase 2 verification

Run before declaring Phase 2 complete:

```bash
scripts/typecheck-ts-migration.sh
tests/verification/run-fast-verification.sh
```

If Phase 2 changed runtime packaging or direct `.ts` runtime imports beyond existing islands, also verify the target Nova/Buster image Node version supports type stripping before converting runtime entrypoints.
