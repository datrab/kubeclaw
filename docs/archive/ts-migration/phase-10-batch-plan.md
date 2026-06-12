# Phase 10 TypeScript Migration Batch Plan

Purpose: finish the JavaScript to TypeScript migration by auditing paired JavaScript facades, deleting no-longer-needed compatibility files, locking intentionally retained runtime/package adapters, and cleaning stale documentation/deployment references.

Phase 10 starts after Phase 9 completion audit commit `bf1597594 docs: record phase nine migration completion`.

Phase 10 is expected to be the final migration phase unless this audit discovers a new behavior-bearing JavaScript surface outside the known inventory.

## Mandatory Gates For Every Phase 10 Batch

Every batch must satisfy these gates before commit.

1. Native Node TypeScript stripping compatibility:
   - Use erasable TypeScript only.
   - Do not use enums, runtime namespaces, parameter properties, decorators, path aliases, import-equals, angle-bracket assertions, or syntax requiring emitted-JS transforms.
   - Keep explicit relative `.ts` / `.js` imports.
   - Use `import type` for type-only imports.
   - Run an unsupported-syntax scan on every migrated or materially edited `.ts` file in the batch.
   - Prove native Node can import every migrated or materially edited `.ts` file and every retained executable/runtime adapter touched by the batch.

2. File reclutcher and fallback-ledger compliance:
   - Treat `docs/ts-migration/fallback-ledger.md` as the file reclutcher source of truth.
   - Read the ledger rows for every touched owning file before changing behavior.
   - `DELETE_LEGACY` means delete completely. Do not keep adapters, hidden fallbacks, live bindings, alternate authority, compatibility shims, permissive old shapes, TODO-preserved branches, or facade files that keep deleted behavior reachable.
   - If the reclutcher marks a file or facade as delete, remove the file and all imports/tests/docs that keep it alive.
   - `STRICTIFY_TS_SLICE` means remove silent fallback behavior or surface typed degraded/failure evidence.
   - `KEEP_TYPED_POLICY` means preserve the behavior and name it as intentional policy in code/tests/docs.
   - If a touched owning file still says `needs user decision`, `USER_POLICY`, `rename as canonical`, or remains ambiguous at execution time, stop and ask before changing behavior.
   - A retained `.js` file may remain only when it is one of:
     - direct executable/runtime delegate required by deployment or operator docs;
     - pure package/import facade over a TypeScript owner;
     - explicit out-of-scope utility already documented and locked by contract.

3. Required verification before each batch commit:
   - Unsupported TypeScript syntax scan on migrated or materially edited files.
   - Native Node import check for migrated/materially edited `.ts` files and retained touched runtime adapters.
   - Stale import/search check for every deleted `.js` file and every obsolete `.js` documentation/deployment reference.
   - `scripts/typecheck-ts-migration.sh`.
   - Focused checks listed by the batch below.
   - `tests/verification/run-fast-verification.sh`.
   - `git diff --check`.
   - Commit only after all verification passes.

4. Required final report per batch:
   - Commit hash.
   - Verification evidence.
   - Detailed changelog under `docs/ts-migration/phase-10-changelogs/`.
   - `KEEP_TYPED_POLICY` retained.
   - `STRICTIFY_TS_SLICE` strictified.
   - `DELETE_LEGACY` deleted 100%.
   - Facades/files deleted or explicitly retained with a contract reason.

## Phase 10 Starting Inventory

Post-Phase-9 source inventory under `skills/*`:

1. Total `.js` files: 118.
2. Paired `.js` files with same-path `.ts` owners: 100.
3. Unpaired `.js` files retained by Phase 9 contract: 18.
   - 16 pure shared production-path facades.
   - 1 direct runtime delegate: `skills/nova/pipeline.ts`.
   - 1 explicit out-of-scope operator utility: `skills/common/discord-purge.ts`.

The Phase 9 unpaired contract remains in force:

```bash
node tests/verification/contracts/check-phase9-unpaired-js-surface.mjs
```

Phase 10 owns the 100 paired `.js` files and the docs/deployment/runtime references that still point at obsolete JavaScript paths. It does not reopen behavior migration broadly; TypeScript owners are already canonical unless a paired `.js` file is discovered to contain behavior instead of a facade/delegate.

## Paired Inventory Groups

1. Runtime/direct executable delegates:
   - `skills/buster/buster-pipeline.ts`
   - `skills/nova/pipeline/cli.ts`
   - source/docs/deployment references to `skills/nova/pipeline.ts` and runtime `/app/skills/pipeline.ts`

2. Common shared production-path facades:
   - `skills/common/pipeline/agents/*.ts`
   - `skills/common/pipeline/git-primitives.ts`
   - `skills/common/pipeline/lifecycle-state.ts`

3. Nova agent, prompt, and runner paired facades:
   - `skills/nova/pipeline/agents/module-workers.ts`
   - `skills/nova/pipeline/agents/orchestration*.ts`
   - `skills/nova/pipeline/agents/reviewer-lifecycle.ts`
   - `skills/nova/pipeline/agents/shutdown.ts`
   - `skills/nova/pipeline/prompts/*.ts`
   - `skills/nova/pipeline/runners/**/*.ts`

4. Nova service paired facades:
   - `skills/nova/pipeline/services/*.ts`
   - `skills/nova/pipeline/services/failures/*.ts`
   - `skills/nova/pipeline/services/rate-limit-builders/*.ts`
   - `skills/nova/pipeline/services/status-store-compat/*.ts`
   - `skills/nova/pipeline/services/status-store-lifecycle/*.ts`
   - `skills/nova/pipeline/services/summary/*.ts`
   - `skills/nova/pipeline/services/telemetry/*.ts`

5. Nova tool paired facades:
   - `skills/nova/pipeline/tools/lint-report.ts`
   - `skills/nova/pipeline/tools/lint-report/*.ts`
   - `skills/nova/pipeline/tools/project-summary.ts`
   - `skills/nova/pipeline/tools/project-summary-formatters.ts`
   - `skills/nova/pipeline/tools/redis.ts`

6. Retained unpaired files from Phase 9:
   - Buster and Nova shared production-path facades locked by `check-phase9-unpaired-js-surface.mjs`.
   - `skills/nova/pipeline.ts` direct runtime delegate.
   - `skills/common/discord-purge.ts` out-of-scope operator utility.

## Batch Order

### P10-B01 — Paired Facade Reclutcher Inventory And Contract Baseline

Status: completed in P10-B01.

Scope:

1. Enumerate all 100 paired `.js` files with same-path `.ts` owners.
2. Classify each paired `.js` file as:
   - delete now;
   - retain as pure package/import facade;
   - retain as executable runtime/tool delegate;
   - investigate because it contains behavior beyond delegation.
3. Add or extend a verification contract that fails if:
   - a paired `.js` file grows behavior outside its allowed facade/delegate shape;
   - a paired `.js` file is unclassified;
   - a deleted facade is referenced by source/tests/docs/deployment.
4. Update `authority-registry.md`, `import-call-graph.md`, and `architecture-map.md` with the final Phase 10 cleanup baseline.

Ledger rows to resolve:

1. Stale rows that still assign behavior authority to paired `.js` files whose `.ts` owner is canonical.
2. Any paired facade row that the reclutcher marks delete.
3. Any paired runtime delegate row that needs a final retain/delete decision.

Rules:

1. Do not delete a runtime/deployment entrypoint until all production references and local operator docs have an explicit replacement.
2. Do not retain a paired `.js` file only because it exists; every retained file needs a contract reason.
3. Historical docs may name old `.js` paths only when clearly historical.

Focused validation:

```bash
node tests/verification/contracts/check-phase10-paired-facade-surface.mjs
node tests/verification/contracts/check-phase9-unpaired-js-surface.mjs
scripts/typecheck-ts-migration.sh
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,docs-surface
```

P10-B01 result:

1. Added `tests/verification/contracts/check-phase10-paired-facade-surface.mjs`.
2. Locked all 100 paired `.js` files under `skills/*` as 95 pure facades and 5 executable/runtime delegates.
3. Added the Phase 10 contract to the shared fast/full verification contract suite.
4. No files were deleted in this inventory-only batch; later batches own delete/retain execution against this baseline.

Commit message:

```text
docs: inventory phase ten paired facades
```

### P10-B02 — Executable Runtime And Tool Delegates

Status: completed in P10-B02.

Scope:

1. `skills/buster/buster-pipeline.ts`.
2. `skills/nova/pipeline.ts`.
3. `skills/nova/pipeline/cli.ts`.
4. Runtime/deployment references in `my-values/**`, skill docs, package docs, and operator command examples.
5. Any tests that execute Node entrypoints by `.js` path.

Ledger rows to resolve:

1. Buster root executable compatibility shim rows.
2. Nova root direct runtime delegate rows.
3. Nova CLI delegate rows.
4. Any deployment reference that still points at obsolete JavaScript when a TypeScript runtime path is safe.

Rules:

1. Direct executable `.js` files may remain only when production packaging or operator command stability requires that path.
2. Runtime delegates must contain no behavior authority beyond direct import/delegation to typed owners and direct-entry detection.
3. If a `.js` entrypoint is deleted, update every runtime value, docs command, smoke test, and direct-entry check in the same batch.

Focused validation:

```bash
node tests/verification/contracts/check-phase10-executable-delegate-surface.mjs
node tests/verification/runtime/check-nova-startup-smoke.mjs
node tests/verification/runtime/check-buster-startup-smoke.mjs
node tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs
node tests/verification/contracts/check-critical-dynamic-imports.mjs
node tests/verification/runtime/check-runtime-collisions.mjs
scripts/typecheck-ts-migration.sh
```

P10-B02 result:

1. Retained the production Nova and Buster `.js` entrypoints as executable delegates because deployment/operator references still intentionally use `node /app/skills/pipeline.ts` and `node /app/skills/buster-pipeline.ts`.
2. Retained Nova tool `.js` delegates for lint-report, project-summary, and Redis where they are runtime/operator adapter paths over typed owners.
3. Deleted active root tool alias references for `/app/skills/lint-report.ts`, `/app/skills/redis.ts`, and `/app/skills/project-summary.ts`; active docs/config now use `/app/skills/pipeline/tools/*.ts`.
4. Added `tests/verification/contracts/check-phase10-executable-delegate-surface.mjs` to lock retained executable delegates and prevent root tool aliases from returning.

Commit message:

```text
refactor: settle executable migration adapters
```

### P10-B03 — Shared Common And Role-Local Production Facades

Status: completed in P10-B03.

Scope:

1. Paired Common shared facades:
   - `skills/common/pipeline/agents/*.ts`
   - `skills/common/pipeline/git-primitives.ts`
   - `skills/common/pipeline/lifecycle-state.ts`
2. Phase-9-retained unpaired Buster/Nova role-local shared facades:
   - `skills/buster/pipeline/agents/*.ts`
   - `skills/buster/pipeline/git-primitives.ts`
   - `skills/buster/pipeline/lifecycle-state.ts`
   - `skills/nova/pipeline/agents/acp-monitor.ts`
   - `skills/nova/pipeline/agents/lifecycle.ts`
   - `skills/nova/pipeline/agents/runtime.ts`
   - `skills/nova/pipeline/agents/session-semantics.ts`
   - `skills/nova/pipeline/agents/session-termination.ts`
   - `skills/nova/pipeline/agents/tracked-agents.ts`
   - `skills/nova/pipeline/git-primitives.ts`
   - `skills/nova/pipeline/lifecycle-state.ts`
3. Runtime packaging checks that need `/app/skills/pipeline/**` shared-path compatibility.

Ledger rows to resolve:

1. Shared ACP monitor/lifecycle/runtime/session-semantics/session-termination/tracked-agent facade rows.
2. Shared Git primitive and lifecycle-state facade rows.
3. Any row where a role-local facade still looks like behavior authority.

Rules:

1. Source/tests should prefer typed owners unless a production-path facade is the subject under test.
2. Retained facades must be exact re-exports and locked by content checks.
3. Delete any duplicate facade that is not required for source imports, runtime packaging, or documented operator APIs.

Focused validation:

```bash
node tests/verification/runtime/check-runtime-collisions.mjs
node tests/verification/contracts/check-phase9-unpaired-js-surface.mjs
node tests/verification/contracts/check-phase10-paired-facade-surface.mjs
node tests/verification/contracts/check-common-helper-import-surface.mjs
node tests/verification/contracts/check-session-authority-slice-surface.mjs
node tests/verification/contracts/check-gateway-operation-boundary-surface.mjs
scripts/typecheck-ts-migration.sh
```

P10-B03 result:

1. Retained Common runtime packaging facades and Buster/Nova role-local shared facades because the ledger marks them accepted external adapters.
2. Updated facade comments and contracts so retained reasons are explicit: Common owns behavior; `.js` files are import-path facades only.
3. Deleted no shared facade files in this batch because none of the scoped facade rows were marked `DELETE_LEGACY`.
4. Re-ran runtime collision and facade contracts to prove no retained facade owns behavior.

Commit message:

```text
refactor: settle shared production facades
```

### P10-B04 — Nova Agents, Prompts, And Runner Facades

Status: completed in P10-B04.

Scope:

1. Paired Nova agent facades:
   - `skills/nova/pipeline/agents/module-workers.ts`
   - `skills/nova/pipeline/agents/orchestration-healthcheck.ts`
   - `skills/nova/pipeline/agents/orchestration-lifecycle-events.ts`
   - `skills/nova/pipeline/agents/orchestration.ts`
   - `skills/nova/pipeline/agents/reviewer-lifecycle.ts`
   - `skills/nova/pipeline/agents/shutdown.ts`
2. Prompt facades:
   - `skills/nova/pipeline/prompts/*.ts`
3. Runner facades:
   - `skills/nova/pipeline/runners/**/*.ts`
4. Source/tests/docs imports that still use paired `.js` facade paths unnecessarily.

Ledger rows to resolve:

1. Agent orchestration/reviewer/shutdown rows whose behavior is now owned by `.ts` files.
2. Prompt builder rows whose behavior is now owned by `.ts` files.
3. Runner facade rows retained from Phase 8.

Rules:

1. Delete paired runner/prompt/agent facades unless runtime packaging or public import compatibility still needs the `.js` path.
2. If a facade remains, lock it as a pure re-export over the same-path `.ts` owner.
3. No Phase 8 `DELETE_LEGACY` behavior may remain reachable through a runner facade.

Focused validation:

```bash
node tests/verification/contracts/check-phase10-nova-agent-prompt-runner-facades.mjs
node tests/verification/contracts/check-runner-facade-surface.mjs
node tests/verification/contracts/check-module-runner-slice-surface.mjs
node tests/verification/contracts/check-prompt-ingress-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface
scripts/typecheck-ts-migration.sh
```

P10-B04 result:

1. Retained the scoped Nova agent, prompt, and runner `.js` files only as pure same-path `.ts` re-export facades.
2. Added `tests/verification/contracts/check-phase10-nova-agent-prompt-runner-facades.mjs` to lock this subset directly.
3. Deleted no scoped files because runtime/package verification still imports several `/app/skills/pipeline/{agents,prompts,runners}/**/*.ts` paths and none of the scoped facade files carry behavior.
4. No Phase 8 runner-owned `DELETE_LEGACY` behavior remains in the retained runner facades; the runner facade contract still locks exact content.

Commit message:

```text
refactor: settle nova agent prompt runner facades
```

### P10-B05 — Nova Service Facades

Status: completed in P10-B05.

Scope:

1. Paired Nova service facades under:
   - `skills/nova/pipeline/services/*.ts`
   - `skills/nova/pipeline/services/failures/*.ts`
   - `skills/nova/pipeline/services/rate-limit-builders/*.ts`
   - `skills/nova/pipeline/services/status-store-compat/*.ts`
   - `skills/nova/pipeline/services/status-store-lifecycle/*.ts`
   - `skills/nova/pipeline/services/summary/*.ts`
   - `skills/nova/pipeline/services/telemetry/*.ts`
2. Source/tests/docs imports that can move to typed owners.
3. Final contract coverage for retained service facades.

Ledger rows to resolve:

1. Status-store compatibility/lifecycle service rows.
2. Rate-limit and rate-limit-exit service rows.
3. Redis completion/log/service authority rows.
4. Telemetry, notification, failure-semantics, session-authority, and artifact authority rows.

Rules:

1. Service behavior authority must live in `.ts` owners.
2. Retained `.js` service files must be pure re-export facades only.
3. Delete any paired service facade that is neither public API nor production packaging surface.
4. Any retained compatibility authority must be named in the ledger as typed policy or external adapter, not hidden behind a facade.

Focused validation:

```bash
node tests/verification/contracts/check-phase10-nova-service-facades.mjs
node tests/verification/contracts/check-status-store-slice-surface.mjs
node tests/verification/contracts/check-redis-completion-service-surface.mjs
node tests/verification/contracts/check-remediation-handoff-surface.mjs
node tests/verification/contracts/check-artifact-authority-slice-surface.mjs
node tests/verification/contracts/check-telemetry-contract.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,restart-recovery,resume-idempotence
scripts/typecheck-ts-migration.sh
```

P10-B05 result:

1. Retained the 52 paired Nova service `.js` files only as pure same-path `.ts` re-export facades.
2. Added `tests/verification/contracts/check-phase10-nova-service-facades.mjs` to lock the exact retained service facade set.
3. Deleted no service facade files because runtime/package verification imports many `/app/skills/pipeline/services/**/*.ts` paths and the retained files contain no behavior.
4. Service behavior authority remains in the TypeScript owners; compatibility rows in the ledger are not hidden behind JavaScript implementation code.

Commit message:

```text
refactor: settle nova service facades
```

### P10-B06 — Nova Tool Facades And Operator Commands

Status: completed in P10-B06.

Scope:

1. Paired Nova tool facades:
   - `skills/nova/pipeline/tools/redis.ts`
   - `skills/nova/pipeline/tools/project-summary.ts`
   - `skills/nova/pipeline/tools/project-summary-formatters.ts`
   - `skills/nova/pipeline/tools/lint-report.ts`
   - `skills/nova/pipeline/tools/lint-report/*.ts`
2. Operator command docs and skill docs that still invoke tool `.js` paths.
3. Runtime package command references that intentionally remain JavaScript delegates.

Ledger rows to resolve:

1. Lint-report tool rows.
2. Project-summary tool rows.
3. Redis tool rows.
4. Any operator command row that still points to obsolete `.js`.

Rules:

1. CLI `.js` tool files may remain only as direct executable delegates over typed owners.
2. Non-executable helper facades should be deleted unless public import compatibility requires them.
3. Operator docs must clearly distinguish retained runtime adapters from canonical source TypeScript owners.

Focused validation:

```bash
node tests/verification/contracts/check-strict-cli-args-surface.mjs
node tests/verification/contracts/check-redis-log-ownership.mjs
node tests/verification/contracts/check-implementation-map-sync-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,docs-surface
scripts/typecheck-ts-migration.sh
```

Commit message:

```text
refactor: settle nova tool adapters
```

P10-B06 result:

1. Retained only the three executable Nova tool `.js` delegates: `lint-report.ts`, `project-summary.ts`, and `redis.ts`.
2. Deleted the nine non-executable helper facades: `project-summary-formatters.js` and `lint-report/{constants,container-yaml-tools,discovery,execution,output,parsers,report,tool-registry}.js`.
3. Updated behavior verification and implementation-map docs to use the `.ts` helper owners directly.
4. Added `tests/verification/contracts/check-phase10-nova-tool-adapter-surface.mjs` to keep deleted helper facades deleted and lock the retained operator delegates.

### P10-B07 — Documentation, Deployment, And Final Facade Contract Cleanup

Status: completed in P10-B07.

Scope:

1. Docs and deployment references outside historical/archive docs:
   - `docs/**`
   - `skills/**/SKILL.md`
   - `skills/**/README.md`
   - `skills/**/CONVENTIONS.md`
   - `my-values/**`
   - package metadata and scripts
2. Final facade contract coverage:
   - retained paired facades;
   - retained unpaired facades from Phase 9;
   - retained executable delegates;
   - out-of-scope utility.
3. Final stale-path scans for deleted `.js` files.

Ledger rows to resolve:

1. Stale docs rows that point at deleted owners.
2. Stale deployment references that should now point to TypeScript owners or retained adapters.
3. Any remaining file reclutcher mismatch between docs and actual source.

Rules:

1. Non-historical docs must not describe deleted `.js` files as active owners.
2. Deployment docs may mention `.js` only for intentionally retained runtime adapters.
3. Final contracts must fail on unclassified `.js`, unexpected paired facade behavior, and deleted-path references.

Focused validation:

```bash
node tests/verification/contracts/check-phase9-unpaired-js-surface.mjs
node tests/verification/contracts/check-verification-wrapper-surface.mjs
node tests/verification/contracts/check-implementation-map-sync-surface.mjs
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,docs-surface
scripts/typecheck-ts-migration.sh
```

Commit message:

```text
docs: align final migration references
```

P10-B07 result:

1. Added `tests/verification/contracts/check-phase10-final-reference-surface.mjs`.
2. Locked active docs/deployment/source references so deleted root tool aliases and deleted Nova tool-helper facades cannot reappear outside historical migration/open-issue records and guard contracts.
3. Confirmed retained JavaScript references are limited to intentional runtime/operator adapters or contracted package facades.
4. Updated Phase 10 docs to reflect the current retained JavaScript inventory after P10-B06: 91 paired files plus 18 Phase-9-retained unpaired files.

### P10-B08 — Final TypeScript Migration Completion Audit

Status: completed in P10-B08.

Scope:

1. Re-run all final inventory contracts:
   - unpaired `.js` contract;
   - paired facade contract;
   - runtime collision/import contract;
   - critical dynamic import contract.
2. Re-run stale import searches for every deleted facade group.
3. Update docs:
   - `docs/ts-migration/final-completion-audit.md`
   - `docs/ts-migration/phase-plan.md`
   - `docs/ts-migration/fallback-ledger.md`
   - `docs/ts-migration/authority-registry.md`
   - `docs/ts-migration/import-call-graph.md`
   - `docs/ts-migration/architecture-map.md`
4. Record final changelog under `docs/ts-migration/phase-10-changelogs/`.

Rules:

1. Do not close Phase 10 with any unclassified `.js` under `skills/*`.
2. Do not close Phase 10 with retained paired `.js` files lacking a contract reason.
3. Do not close Phase 10 with a stale ledger row that assigns active behavior to a deleted `.js` owner.
4. Do not close Phase 10 if Node cannot import the retained runtime adapters and all migrated/materially edited `.ts` files.

Focused validation:

```bash
node tests/verification/contracts/check-phase9-unpaired-js-surface.mjs
node tests/verification/runtime/check-runtime-collisions.mjs
node tests/verification/contracts/check-critical-dynamic-imports.mjs
scripts/typecheck-ts-migration.sh
node tests/verification/behavior/verify.mjs --areas foundations,runtime-surface,docs-surface
tests/verification/run-fast-verification.sh
git diff --check
```

Commit message:

```text
docs: record final typescript migration completion
```

P10-B08 result:

1. Added `docs/ts-migration/final-completion-audit.md`.
2. Recorded the final `skills/*` JavaScript inventory: 109 files total, 91 paired and 18 unpaired.
3. Confirmed all retained JavaScript is classified as pure facade, runtime/operator delegate, or explicit out-of-scope utility.
4. Recorded that zero migration phases remain after Phase 10.

## Phase 10 Exit Criteria

1. Every `.js` file under `skills/*` is classified as deleted, retained runtime delegate, retained pure facade, or explicit out-of-scope utility.
2. Every retained paired `.js` file is locked by verification as a pure facade or direct executable delegate.
3. Every non-historical source/test/docs/deployment reference points to a canonical `.ts` owner unless it intentionally uses a retained runtime adapter.
4. Every Phase 10-owned `DELETE_LEGACY` row is deleted 100%.
5. Every Phase 10-owned `STRICTIFY_TS_SLICE` row is strictified with typed evidence or typed policy.
6. Every Phase 10-owned `KEEP_TYPED_POLICY` row is named in code/tests/docs.
7. Native Node can import every migrated/materially edited `.ts` file and every retained runtime adapter.
8. Final verification passes: typecheck, focused contracts, docs/behavior checks, fast verification, and `git diff --check`.
9. `docs/ts-migration/final-completion-audit.md` records the final migration state.

## Remaining Phase Count

Phase 10 is the final migration phase. Zero migration phases remain after P10-B08.
