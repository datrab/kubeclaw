# JavaScript to TypeScript Pipeline Migration Plan

Yes — I strongly suggest we map the architecture first, but not as a big theoretical UML exercise.

We should create a **migration map** whose purpose is practical:

1. know every runtime entrypoint,
2. know who imports/calls what,
3. identify canonical authorities,
4. identify every fallback/compat/shim path,
5. decide what gets deleted, renamed, or kept as intentional behavior before TypeScript migration starts.

That is not unnecessary. The code contains the truth, but the hidden risk is exactly what you mentioned: old compatibility paths buried in helpers, status projections, gate completion, polling, and shims.

I inspected the repo first. Evidence:

- Current repo branch: `main`
- Last commit: `6ec030373 phase6: drain observer writes on shutdown`
- Main pipeline area is large:
  - `skills/nova/pipeline`: 204 `.js` files
  - `skills/common/pipeline`: 23 `.js` files
  - `skills/buster`: substantial pipeline surface, about 11k LOC
  - total inspected JS pipeline surface: about 60k LOC
- TypeScript already exists in islands:
  - `skills/common/pipeline/agent-observability/src/*.ts`
  - `skills/nova/pipeline/services/agent-observability-*/*.ts`
  - `plugins/openclaw-agent-observer/src/*.ts`
- Verification already has canonical entrypoints:
  - `tests/verification/run-fast-verification.sh`
  - `tests/verification/run-full-verification.sh`
- There are known compatibility/fallback surfaces in code:
  - `skills/nova/pipeline.ts` thin compatibility CLI shim
  - `skills/nova/pipeline/agents/*` compatibility shims to shared helpers
  - `status-store-compat.js`
  - `compatibility-authority.js`
  - `legacy_status`, `legacy_gate_status`, `legacy_status:gate-status.json`
  - polling comments around legacy agent-side commit/push behavior
  - compatibility projections in pipeline/gate results

## Recommendation

Do the migration in two tracks:

1. **Discovery/cleanup authority track** — identify and delete/resolve fallback behavior.
2. **TypeScript conversion track** — convert one coherent slice at a time.

Do not migrate by “rename all `.js` to `.ts`”. That would preserve messy architecture in typed form.

---

# Proposed Migration Plan

## Phase 0 — Baseline and migration map

Goal: establish current behavior before touching runtime code.

Deliverables:

1. **Entrypoint inventory**
   - Nova CLI: `skills/nova/pipeline.ts` → `pipeline/cli.js` → `pipeline/index.ts`
   - Buster CLI/task processor: `skills/buster/buster-pipeline.ts`
   - Tools:
     - `skills/nova/pipeline/tools/redis.ts`
     - `skills/nova/pipeline/tools/lint-report.ts`
     - `skills/buster/pipeline/tools/verify-task.ts`
     - `skills/buster/pipeline/tools/redis.ts`
   - Verification wrappers under `tests/verification`.

2. **Import/call graph**
   - For each slice: incoming callers, outgoing dependencies, dynamic imports.

3. **Authority registry**
   Define canonical owners for:
   - pipeline config
   - progress/module order
   - status lifecycle
   - gate result
   - worker result
   - Buster completion
   - Redis task contract
   - telemetry event schema
   - session identity
   - git ownership
   - Discord/operator notification

4. **Fallback ledger**
   Every `legacy`, `compat`, `fallback`, `shim`, compatibility projection, or alternate status reader gets classified as:

   - **Delete during migration**
   - **Keep but rename as canonical default**
   - **Keep as external adapter only**
   - **Needs user decision**

Important distinction: not every `fallback` is bad. Example: `fallback_model` may be an intentional default, not a legacy path. But anything that means “accept old shape too” should be removed unless explicitly chosen.

### Phase 0 status — complete

Phase 0 is complete as of `56f6b4344 docs: resolve fallback ledger pass3`. The migration map now has the practical artifacts needed to start TypeScript implementation work:

- `docs/ts-migration/entrypoint-inventory.md`
- `docs/ts-migration/import-call-graph.md`
- `docs/ts-migration/architecture-map.md`
- `docs/ts-migration/authority-registry.md`
- `docs/ts-migration/fallback-ledger.md`
- `docs/ts-migration/fallback-ledger-pass2-batches.md`
- `docs/ts-migration/fallback-ledger-pass3-batches.md`
- `docs/ts-migration/phase-0-batch-plan.md`

Phase 0 exit criteria:

- The fallback ledger has no unresolved `needs user decision` rows.
- The fallback ledger has no remaining `rename as canonical behavior/default` rows.
- Pure re-export facades are accepted as low-risk external adapters.
- Legacy shapes, fallback authorities, broad barrels, inferred old behavior, and malformed/unknown accepted objects are marked `DELETE_LEGACY` or `STRICTIFY_TS_SLICE` unless explicitly kept as typed policy.

Implementation rule for Phase 1 onward: each migrated TypeScript slice must obey the ledger decision in its owning row. Do not preserve compatibility behavior just because the old JavaScript accepted it.

---

## Phase 1 — TypeScript infrastructure

Goal: add the TypeScript toolchain and migration guardrails without changing runtime behavior. Phase 1 should make later slice migrations boring and enforceable.

### Phase 1 inputs

Use the Phase 0 artifacts as constraints, not background reading:

- `entrypoint-inventory.md` defines what must keep running.
- `import-call-graph.md` defines compile boundaries and caller impact.
- `authority-registry.md` defines which modules own canonical state/results.
- `fallback-ledger.md` defines what must be deleted, strictified, or kept as typed policy during each slice.
- Existing TypeScript islands already use strict ESM patterns in the OpenClaw agent observer plugin; reuse the useful parts, but do not blindly copy plugin-specific `allowJs` settings into the pipeline migration.

### Phase 1 deliverables

1. **Toolchain decision note**
   - Decide whether the pipeline uses one repo-level TS project or smaller role-local TS projects.
   - Current repo reality: there is no root `package.json`; `skills/buster/package.json` and `plugins/openclaw-agent-observer/package.json` exist.
   - Pick the smallest setup that can typecheck Nova, Buster, and common pipeline slices without introducing a package-management redesign.

2. **Pipeline TypeScript config**
   - Add the minimal `tsconfig` needed for Node ESM.
   - Use `target`/`module` compatible with current Node ESM runtime, preferably `ES2022`/`ESNext` + `NodeNext`.
   - Enable strictness from day one: `strict`, `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` if tolerable.
   - Prefer the Node type-stripping profile for runtime-executed `.ts`: `noEmit`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions`, and explicit `.ts` relative imports.
   - Avoid permanent `allowJs`. If temporary `allowJs` is needed for dependency discovery, document the removal condition and do not let it become the migration strategy.

3. **Build/typecheck commands**
   - Add a deterministic typecheck command. Node's built-in stripper does not typecheck, so `tsc --noEmit` or equivalent remains required for CI/developer feedback.
   - Do not add an emitting build command unless runtime/deployment proves it cannot execute `.ts` directly.
   - If an emitting build is later required, generated JS must be build output, not maintained fallback source.

4. **Runtime output policy**
   - Preferred runtime target: execute erasable TypeScript directly with the supported Node runtime type stripper, avoiding a maintained `dist` tree for pipeline code.
   - Current environment check while planning Phase 1: Node `v24.14.0` exposes built-in TypeScript strip/transform flags; verify the deployment image before relying on direct `.ts` execution.
   - Keep TypeScript syntax erasable: no enums, runtime namespaces, parameter properties, decorators, TS path aliases, or other syntax that requires transpilation.
   - Use `import type` for type-only imports because Node treats non-`type` imports as runtime value imports.
   - Ensure CLI/runtime entrypoints from the Phase 0 inventory can still resolve modules after each slice migrates.

5. **Migration guardrails**
   - Add a short slice checklist file or extend the existing checklist so every migration PR records:
     - files migrated,
     - entrypoints affected,
     - callers/importers touched,
     - fallback-ledger rows resolved in code,
     - tests run,
     - deleted legacy behavior.
   - Add a quick check for accidental unresolved ledger labels in migrated slices.

6. **First no-behavior-change validation**
   - Typecheck passes on the initial TS infrastructure.
   - Existing fast verification still runs.
   - No runtime JS behavior changes are included in Phase 1 unless needed to wire typecheck/build commands.

### Phase 1 non-goals

- Do not migrate contracts yet; that starts in Phase 2.
- Do not rename broad JS surfaces just to satisfy TypeScript.
- Do not keep JS and TS as parallel long-term implementations.
- Do not introduce a bundler/transpiler pipeline unless Node direct execution is proven insufficient for deployment.
- Do not add compatibility adapters beyond narrow external boundaries.

### Phase 1 recommended batch order

1. **P1-B01 — Toolchain shape**
   - Inspect current package boundaries and Node runtime assumptions.
   - Decide repo-level versus role-local TS project layout.
   - Verify target deployment Node version supports the planned type-stripping runtime.
   - Document whether Phase 1 uses direct Node `.ts` execution plus `tsc --noEmit`, or a temporary emitted-JS build.

2. **P1-B02 — Minimal TS config and commands**
   - Add the chosen `tsconfig` file(s).
   - Add typecheck/build commands in the smallest appropriate package manifest or helper script.
   - Run the command and record output.

3. **P1-B03 — Slice migration checklist and guardrails**
   - Add/adjust the per-slice checklist for implementation PRs.
   - Add a simple docs/check script only if it is cheaper than manual review.

4. **P1-B04 — Dry-run first target selection**
   - Select the Phase 2 contracts slice using `authority-registry.md`, `import-call-graph.md`, and `fallback-ledger.md`.
   - Produce the first Phase 2 batch scope before touching runtime code.

### P1-B01 decision — Toolchain shape

Status: planned/accepted for Phase 1 implementation.

Verified local planning environment:

- `node --version` is `v24.14.0`.
- Local Node exposes built-in TypeScript stripping/transform flags.
- Existing runtime entrypoints are Node ESM CLIs: Nova uses `node /app/skills/pipeline.ts`; Buster uses `node /app/skills/buster-pipeline.ts`.
- Production Dockerfiles currently inherit `ghcr.io/openclaw/openclaw:latest`; the exact deployment Node version must be checked before converting runtime entrypoints to `.ts`.

Decision:

- Use **direct Node execution of erasable `.ts` files** as the default runtime model.
- Use **`tsc --noEmit` for typechecking only**. Node stripping does not typecheck.
- Do **not** add a pipeline `dist/` tree or emitting build in Phase 1. Add emitted JS only if deployment proves direct `.ts` execution is unavailable.
- Use role/package-local TS config rather than a repo package-management redesign. The repo currently has no root `package.json`; existing package boundaries are `skills/buster`, `skills/common/pipeline/agent-observability`, and `plugins/openclaw-agent-observer`.
- Keep the OpenClaw agent observer plugin as the exception that still emits `dist`, because plugin packaging already requires runtime extension output. Do not apply that plugin build pattern to pipeline code unless required.

Runtime syntax rules for migrated pipeline `.ts` files:

- Erasable TypeScript only.
- No enums.
- No runtime namespaces.
- No parameter properties.
- No decorators.
- No TS path aliases.
- Use explicit relative extensions, e.g. `./module.ts` for migrated TS imports and `./legacy.js` for unmigrated JS imports.
- Use `import type` for type-only imports.

Test model:

- Existing JavaScript/MJS tests remain valid.
- JS tests may import migrated `.ts` modules directly when they use explicit `.ts` extensions.
- Runtime test execution proves stripped `.ts` behavior; `tsc --noEmit` separately proves type safety.
- During mixed migration, `.ts` modules may import remaining `.js` modules and JS tests may import `.ts` modules, but each slice should reduce mixed surfaces rather than preserving them as compatibility design.

Deployment gate before converting runtime entrypoints:

- Verify the Nova/Buster image Node version supports default type stripping.
- If the image Node version is too old, either update/pin the base image to a supported Node version or temporarily keep CLI entrypoints in JS while migrated internals run through a verified loader strategy.
- Do not convert `node /app/skills/pipeline.ts` or `node /app/skills/buster-pipeline.ts` to `.ts` until this gate is satisfied.

### P1-B02 decision — Minimal TS config and commands

Status: implemented for current TypeScript islands.

Files added/updated:

- `skills/nova/package.json` adds a role-local `typecheck` script.
- `skills/nova/tsconfig.json` typechecks Nova pipeline TypeScript islands with Node type-stripping-compatible settings.
- `skills/buster/tsconfig.json` typechecks Buster pipeline TypeScript islands with the same profile.
- `skills/buster/package.json` adds `npm run typecheck`.
- `skills/common/pipeline/agent-observability/tsconfig.json` now uses the same strict erasable-syntax profile.
- `scripts/typecheck-ts-migration.sh` runs the current Phase 1 typecheck set.
- Runtime collision/common-helper verification now recognizes the accepted TypeScript shared helper shim at `pipeline/agent-observability/src/index.ts`.
- Existing Nova agent-observability TypeScript islands were adjusted to satisfy `exactOptionalPropertyTypes` without adding emitted build output.

Current command:

```bash
scripts/typecheck-ts-migration.sh
```

The command currently runs:

1. `skills/common/pipeline/agent-observability`
2. `skills/nova`
3. `skills/buster`

Config policy:

- `noEmit` only; no pipeline build output is generated.
- Node ESM via `module: NodeNext` and `moduleResolution: NodeNext`.
- Direct Node stripping compatibility via `erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions`, and explicit `.ts` imports.
- Strict flags include `strict`, `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`.
- Nova temporarily enables `allowJs` with `checkJs:false` only so existing TS islands can import current JS services during the mixed migration. This is not the migration strategy and should be removed once those dependencies are typed or moved behind typed declarations.

Validation recorded during P1-B02:

```text
scripts/typecheck-ts-migration.sh
[typecheck] common agent-observability contract
[typecheck] nova pipeline TypeScript islands
[typecheck] buster pipeline TypeScript islands

tests/verification/run-fast-verification.sh
[fast-verification] fast local verification passed
```

### P1-B03 decision — Slice checklist and guardrails

Status: implemented.

Files added/updated:

- `docs/ts-migration/slice-review-template.md` now uses the accepted Phase 0 ledger decisions: `DELETE_LEGACY`, `STRICTIFY_TS_SLICE`, `KEEP_TYPED_POLICY`, and explicit external adapter/facade decisions.
- `scripts/check-ts-migration-guardrails.mjs` checks the migration docs/config guardrails before typechecking.
- `scripts/typecheck-ts-migration.sh` now runs the guardrail check before role-local typechecks.

Guardrails enforced:

- `fallback-ledger.md` must not contain unresolved `needs user decision` or `rename as canonical` row labels.
- `slice-review-template.md` must contain the required migration review fields and must not retain stale Phase 0 labels.
- Phase 1 TypeScript package manifests must expose `npm run typecheck`.
- Phase 1 pipeline TypeScript configs must stay `noEmit`, strict, NodeNext, and Node type-stripping-compatible.
- Nova's temporary `allowJs/checkJs:false` exception is explicit and limited to the mixed-migration TypeScript island imports.

Validation recorded during P1-B03:

```text
node scripts/check-ts-migration-guardrails.mjs
{"ok":true,"checked":"ts-migration-guardrails"}

scripts/typecheck-ts-migration.sh
[guardrail] ts migration docs/config
{"ok":true,"checked":"ts-migration-guardrails"}
[typecheck] common agent-observability contract
[typecheck] nova pipeline TypeScript islands
[typecheck] buster pipeline TypeScript islands
```

### P1-B04 decision — First Phase 2 contracts slice

Status: implemented as planning scope only; no runtime code migrated in this batch.

First Phase 2 implementation slice: **P2-B01 — Nova generator result contract**.

Scope is recorded in `docs/ts-migration/phase-2-batch-plan.md`. The selected files are:

- `skills/nova/pipeline/services/contracts/generator-result.ts` -> `generator-result.ts`
- `skills/nova/pipeline/services/contracts/index.ts` deleted as `DELETE_LEGACY`
- direct import updates in scheduler/generator callers and focused generator-result verification

Why this slice is first:

- Small contract surface with low dependency risk.
- Existing callers already use direct imports.
- Focused verification exists in `tests/verification/contracts/check-generator-result-surface.mjs`.
- It proves JS-test-to-TS-module imports before larger result/transport contracts move.
- It resolves the broad `services/contracts/index.js` namespace barrel as `DELETE_LEGACY` before TypeScript import culture can preserve it.

Validation target for the implementation slice:

```text
scripts/typecheck-ts-migration.sh
node tests/verification/contracts/check-generator-result-surface.mjs
tests/verification/run-fast-verification.sh
```

Exit criteria for Phase 1:

- TypeScript infrastructure exists and typechecks deterministically.
- The runtime entrypoint strategy is documented.
- The Node type-stripping versus emitted-JS policy is documented.
- The slice checklist/guardrails are ready.
- The first Phase 2 contracts batch is scoped.

---

## Phase 2 — Contracts and types first

Migrate canonical contracts before business logic. Concrete implementation batches are scoped in `docs/ts-migration/phase-2-batch-plan.md`.

Start with:

- `services/contracts/*`
- `services/*-contract.js`
- telemetry payload schemas
- Redis message contract
- task transport contract
- rate-limit contract
- ACP gateway contract
- result types:
  - pipeline step result
  - gate control result
  - worker control result
  - validator control result
  - generator result

Why first: once these are typed, later slices cannot accidentally keep old result shapes.

This is also where we should remove compatibility-shaped result acceptance at internal plugin boundaries.

---

## Phase 3 — Core utilities

Concrete implementation batches are scoped in `docs/ts-migration/phase-3-batch-plan.md`.

Migrate low-level, high-fanout modules:

- `core/constants`
- `core/paths`
- `core/runtime`
- `core/context`
- `core/logger`
- `core/config`
- `core/policy`
- `core/registry`
- `redaction`
- `security`
- `timing`
- `serialization`

Rule: no compatibility barrels unless they are the single public API.

---

## Phase 4 — Shared pipeline helpers

Concrete implementation batches are scoped in `docs/ts-migration/phase-4-batch-plan.md`.

Migrate `skills/common/pipeline` next.

This matters because Nova and Buster both currently use shared/helper shim surfaces.

Targets:

- ACP monitor
- lifecycle helpers
- gateway integration
- Discord webhook transport
- Redis transport
- git primitives
- noncritical reporting
- lifecycle state
- telemetry/event contract helpers

This is where we decide whether `skills/nova/pipeline/agents/*` shims survive. My recommendation: **remove repo-local compatibility shims and import the canonical shared module directly**, unless packaging absolutely requires the adapter.

---

## Phase 5 — State authorities

Migrate and simplify the places most likely to contain hidden legacy behavior:

- `status-store.js`
- `status-store-lifecycle/*`
- `status-store-compat.js`
- `compatibility-authority.js`
- `correlation.js`
- `truth-drift.js`
- completion adjudication
- session authority
- gate active session

Target end state:

- one authoritative status lifecycle model
- no reading legacy status files as authority
- no compatibility-shaped result objects
- compatibility projections removed or isolated only at external reporting edge

---

## Phase 6 — Integrations

Migrate external boundaries:

- Gateway API
- Redis
- Discord
- Git/worktree
- OpenClaw plugin runtime
- notification dispatch

Rule: integrations should convert messy external data into typed internal contracts immediately. No external shape should leak into runners.

---

## Phase 7 — Agents/session lifecycle

Migrate:

- spawn/kill/steer
- ACP monitor
- session termination
- tracked agents
- orchestration
- reviewer lifecycle
- module workers

This slice should remove old transcript/session fallbacks if they are only there to support older behavior. If they represent real degradation modes, rename them as explicit degraded modes, not “fallback”.

---

## Phase 8 — Runners

Finish runner migration after contracts/state are typed:

- pipeline runner
- module runner
- forge phase
- buster phase
- gate runner
- approval gate
- review gate
- buster gate
- remediable/waitable gate engines
- scheduling/recovery/terminal logic

This is the riskiest behavior surface, so it should come after the lower layers are stable. After Phase 7 migrated the runner owners to TypeScript, Phase 8 focuses on runner-owned policy cleanup, file reclutcher deletes, and facade removal/retention decisions.

---

## Phase 9 — Buster pipeline

Migrate Buster after shared helpers and contracts are stable:

- `skills/buster/buster-pipeline.ts`
- `pipeline/services/task-*`
- suites
- tools
- telemetry
- rate-limit handling
- sandbox cleanup
- session monitor

Target end state:

- one task lifecycle
- one completion signal contract
- one Redis task/completion shape
- no old gate status or local FS completion fallback unless explicitly canonical

---

## Phase 10 — CLI/tools/docs cleanup

Final migration:

- Nova CLI
- Buster CLI
- Redis tools
- lint/project summary tools
- docs
- deployment references
- verification docs

This is where we delete obsolete JS shims and update docs so humans/agents see only the new canonical paths.

---

# Per-slice checklist

For every migrated section, I suggest we produce this exact checklist:

```text
Slice:
Files migrated:
Runtime entrypoints affected:
Incoming callers:
Outgoing dependencies:
Canonical authority used:
Fallback/legacy/shim hits found:
Fallback decision:
  - DELETE_LEGACY:
  - STRICTIFY_TS_SLICE:
  - KEEP_TYPED_POLICY:
  - external adapter/facade:
Behavior invariants:
Tests run:
Docs updated:
Deleted files:
```

That gives you exactly what you asked for: what is called where, where fallbacks existed, and what was simplified.

---

# Current next artifact

Phase 0 produced the migration map under `docs/ts-migration/`. The next artifact is a Phase 1 toolchain decision note in this file, followed by the minimal TypeScript config/commands.

Recommended first implementation target after Phase 1 remains: **contracts + status/result authority**, not CLI. That gives the biggest payoff against hidden legacy fallbacks.

---

## Phase 5 — Buster runtime/task-processing TypeScript migration

Status: completed; see `docs/ts-migration/phase-5-completion-audit.md`.

Goal: migrate the Buster runtime/task-processing surface without carrying forward legacy fallback behavior.

Mandatory Phase 5 rule: every batch must prove native Node TypeScript stripping compatibility and must follow `docs/ts-migration/fallback-ledger.md` exactly. Anything marked `DELETE_LEGACY` must be deleted completely, not preserved through adapters, hidden fallbacks, live bindings, or compatibility shims.

Phase 5 batch order:

1. `P5-B01` — Buster entrypoint and public surface narrowing.
2. `P5-B02` — Buster task identity, Git sync, and session lifecycle.
3. `P5-B03` — Buster suite runner contract and verdict spine.
4. `P5-B04` — Buster runtime support services.
5. `P5-B05` — Buster operator reporting, Discord, telemetry, and diagnostics.
6. `P5-B06` — Buster deployment and API-facing suites.
7. `P5-B07` — Buster evidence and quality suites.
8. `P5-B08` — Buster visual evidence and tools.
9. `P5-B09` — Phase 5 cleanup and verification.

## Phase 6 — Nova/Common orchestration authority TypeScript migration

Status: completed; see `docs/ts-migration/phase-6-completion-audit.md`.

Goal: migrate the remaining Nova orchestration/runtime and Common support surfaces without carrying forward legacy fallback authority.

Mandatory Phase 6 rule: every batch must prove native Node TypeScript stripping compatibility and must follow `docs/ts-migration/fallback-ledger.md` exactly. Anything marked `DELETE_LEGACY` must be deleted completely, not preserved through adapters, hidden fallbacks, live bindings, alternate authority, or compatibility shims.

Phase 6 batch order:

1. `P6-B01` — Common/Nova contract boundary cleanup.
2. `P6-B02` — Nova public runtime surface and broad barrel deletion.
3. `P6-B03` — Nova Git, worktree, and blueprint durability.
4. `P6-B04` — Nova module runner and worker-control authority.
5. `P6-B05` — Nova pipeline scheduling, recovery, and state machine authority.
6. `P6-B06` — Nova gate and review remediation authority.
7. `P6-B07` — Nova polling, completion, and session authority.
8. `P6-B08` — Nova validation, lint, budget, and observability services.
9. `P6-B09` — Nova agent-observability ingester and plugin sidecar.
10. `P6-B10` — Phase 6 cleanup and verification.

## Phase 7 — Nova lifecycle/support/tooling TypeScript migration

Status: completed; see `docs/ts-migration/phase-7-completion-audit.md`.

Goal: migrate the remaining Nova lifecycle/support/tooling implementation owners without carrying forward compatibility authority, unresolved fallback debt, or undocumented JavaScript runtime facades.

Mandatory Phase 7 rule: every batch must prove native Node TypeScript stripping compatibility and must follow `docs/ts-migration/fallback-ledger.md` exactly. Anything marked `DELETE_LEGACY` must be deleted completely, not preserved through adapters, hidden fallbacks, live bindings, alternate authority, or compatibility shims.

Phase 7 batch order:

1. `P7-B01` — Nova agent lifecycle and shutdown support.
2. `P7-B02` — Nova approval and Buster gate support layers.
3. `P7-B03` — Nova support services, rate-limit, and completion boundaries.
4. `P7-B04` — Nova telemetry, notification, and truth-drift support.
5. `P7-B05` — Nova status-store compatibility and lifecycle.
6. `P7-B06` — Nova prompts, preflight, and validation surfaces.
7. `P7-B07` — Nova tooling, summary, and adapter registry.
8. `P7-B08` — Phase 7 cleanup and verification.

## Phase 8 — Nova runner policy/facade cleanup

Status: completed; see `docs/ts-migration/phase-8-completion-audit.md`.

Goal: finish the runner migration by resolving remaining runner-owned fallback-ledger policy debt, deleting unneeded JavaScript runner facades, and proving the runner control plane remains native Node type-stripping compatible.

Mandatory Phase 8 rule: every batch must prove native Node TypeScript stripping compatibility and must follow the file reclutcher plus `docs/ts-migration/fallback-ledger.md` exactly. Anything marked `DELETE_LEGACY` or delete must be deleted completely, not preserved through adapters, hidden fallbacks, live bindings, alternate authority, compatibility shims, permissive old shapes, or retained facade files.

Phase 8 batch order:

1. `P8-B01` — Runner reclutcher inventory and facade baseline.
2. `P8-B02` — Module worker and typed worker-control authority.
3. `P8-B03` — Module runner Forge and Buster phase policy.
4. `P8-B04` — Pipeline runner scheduling, recovery, and state machine.
5. `P8-B05` — Approval and remediable gate runner policy.
6. `P8-B06` — Review gate runner and durable publication policy.
7. `P8-B07` — Stage envelope and waitable gate cleanup.
8. `P8-B08` — Phase 8 cleanup and verification.

## Phase 9 — Remaining unpaired JavaScript and facade cleanup

Status: completed; see `docs/ts-migration/phase-9-completion-audit.md`.

Goal: finish the remaining unpaired JavaScript pipeline surfaces by either migrating implementation owners to native Node-strippable TypeScript or locking intentionally retained files as pure external/runtime facades.

Mandatory Phase 9 rule: every batch must prove native Node TypeScript stripping compatibility and must follow the file reclutcher plus `docs/ts-migration/fallback-ledger.md` exactly. Anything marked `DELETE_LEGACY` or delete must be deleted completely, not preserved through adapters, hidden fallbacks, live bindings, alternate authority, compatibility shims, permissive old shapes, or retained facade files.

Phase 9 starts from the concrete post-Phase-8 inventory: 31 unpaired `.js` files under `skills/*`. Behavior-bearing files must migrate or be deleted. Retained files must be documented pure runtime/package facades, direct entrypoint delegates, or explicitly out-of-scope utilities.

Phase 9 batch order:

1. `P9-B01` — Unpaired JavaScript reclutcher inventory and facade baseline.
2. `P9-B02` — Buster shared production facades.
3. `P9-B03` — Buster support-service implementation owners.
4. `P9-B04` — Buster task completion, lifecycle, and queue spine.
5. `P9-B05` — Remaining repo path and direct runtime/package facades.
6. `P9-B06` — Phase 9 cleanup and verification.

## Phase 10 — Final paired-facade, docs, and deployment cleanup

Status: complete; Phase 10 is the final JavaScript to TypeScript migration phase. See `docs/ts-migration/phase-10-batch-plan.md` and `docs/ts-migration/final-completion-audit.md`.

Goal: finish the migration by auditing the paired `.js` facade inventory, deleting any facade no longer required by production packaging, and updating docs/deployment references so humans and agents see only canonical TypeScript owners plus explicitly retained runtime adapters.

Phase 10 should own:

1. The paired `.js` files that already have same-path `.ts` owners.
2. Runtime/deployment references that still point at obsolete JavaScript paths.
3. Verification contracts that lock the final accepted facade list.
4. Final stale-ledger cleanup after Phase 9 completion.
5. The final TypeScript migration completion audit.

Phase 10 batch order:

1. `P10-B01` — Paired facade reclutcher inventory and contract baseline.
2. `P10-B02` — Executable runtime and tool delegates.
3. `P10-B03` — Shared Common and role-local production facades.
4. `P10-B04` — Nova agents, prompts, and runner facades.
5. `P10-B05` — Nova service facades.
6. `P10-B06` — Nova tool facades and operator commands.
7. `P10-B07` — Documentation, deployment, and final facade contract cleanup.
8. `P10-B08` — Final TypeScript migration completion audit.

Final phase count: zero migration phases remain after Phase 10.
