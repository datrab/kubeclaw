# Documentation plan

Agreed. We should plan this like an open-source documentation system, not just “write a big markdown file”.

I inspected the repo/doc layout. Current useful sources are:

- Pipeline code:  
  `/home/node/.openclaw/workspace/git-repo/kubeclaw-main/skills/nova/pipeline`
- Buster code:  
  `/home/node/.openclaw/workspace/git-repo/kubeclaw-main/skills/buster`
- Shared helpers:  
  `/home/node/.openclaw/workspace/git-repo/kubeclaw-main/skills/common`
- Deploy/system surfaces:  
  `charts/`, `docker/`, `scripts/`, `examples/`, `my-values/`, `.github/`, `tests/verification`
- Current/target decision docs:  
  `/home/node/.openclaw/workspace/git-repo/docs/pipeline-hardening`
- Old docs already in target repo:  
  `/home/node/.openclaw/workspace/git-repo/kubeclaw-main/docs`

## Recommended docs structure

Inside:

```text
/home/node/.openclaw/workspace/git-repo/kubeclaw-main/docs
```

I would structure it like this:

```text
docs/
  README.md
  DOCUMENTATION_WORKFLOW.md
  future-implementation-ideas.md
  open-issues.md

  pipeline/
    README.md
    architecture.md
    runtime-flow.md
    file-catalog.md
    dependency-map.md
    implementation-map/
      README.md
      batch-template.md
      env-vars-and-inputs.md
      path-construction.md
      function-call-map.md
      authority-map.md
      external-boundaries.md
      batches/
    lifecycle-and-state.md
    gates.md
    workers.md
    failure-and-recovery.md
    telemetry-and-observability.md
    configuration.md
    artifacts-and-status-files.md
    security-boundaries.md
    cli-reference.md

  system/
    README.md
    component-map.md
    deployments.md
    helm-chart.md
    docker-images.md
    redis.md
    gateway.md
    discord-integration.md
    verification-system.md
    local-development.md

  operators/
    README.md
    getting-started.md
    running-the-pipeline.md
    recovery-runbook.md
    approvals-and-human-gates.md
    debugging.md
    common-failures.md
    maintenance.md

  developers/
    README.md
    adding-features.md
    adding-gates.md
    adding-workers.md
    adding-validators.md
    adding-telemetry.md
    pipeline-contracts.md
    testing-and-verification.md
    coding-conventions.md

  reference/
    config-reference.md
    progress-json-reference.md
    status-json-reference.md
    exit-codes.md
    telemetry-event-schema.md
    gate-control-result-schema.md
    worker-control-result-schema.md
    environment-variables.md

  decisions/
    README.md
    architecture-decisions.md
    plugin-architecture-decisions.md
    event-model-decisions.md
    gate-model-decisions.md
    lifecycle-decisions.md

  archive/
    README.md
```

## Core principle

We should avoid one giant “god doc”.

Instead:

- `pipeline/architecture.md` explains the system design and why it exists.
- `pipeline/file-catalog.md` gives the short description/reasoning for every file.
- `pipeline/dependency-map.md` shows how files/modules depend on each other.
- `pipeline/implementation-map/*` is the detailed review layer: function calls, env vars, paths, authority, dependencies, and per-batch findings from reading the code file by file.
- `operators/*` is task-oriented.
- `developers/*` is extension-oriented.
- `reference/*` is exact contract/config/schema material.
- `decisions/*` captures why the architecture is the way it is.
- `DOCUMENTATION_WORKFLOW.md` preserves the code-audit workflow, style rules, and compaction handoff checklist.
- `future-implementation-ideas.md` keeps candidate ideas out of committed architecture docs.
- `open-issues.md` tracks known gaps, inconsistencies, simplification opportunities, and code-audit findings until GitHub Issues becomes the primary tracker.

That keeps the docs detailed but maintainable.

## Documentation plan

### Phase 1 — Inventory and cleanup plan

No writing yet except maybe an inventory draft.

Before writing any section, read `docs/DOCUMENTATION_WORKFLOW.md` and follow its code-audit, issue-capture, and style rules.

Tasks:

1. Classify every existing doc in `kubeclaw-main/docs`:
   - keep
   - rewrite
   - merge
   - archive
   - delete later with approval

2. Classify useful source docs from:
   - `docs/pipeline-hardening/current_state`
   - `docs/pipeline-hardening/target_state`
   - `docs/pipeline-hardening/implementationplan`
   - `docs/pipeline-hardening/final_audits`

3. Build a source-of-truth map:
   - code is truth for current behavior
   - hardening docs are truth for decisions/target architecture
   - verification tests are truth for expected guarantees
   - Helm/Docker/scripts are truth for deployment

Deliverable:

```text
docs/DOCUMENTATION_PLAN.md
```

with the final structure and migration table.

---

### Phase 2 — Pipeline architecture docs

Main deliverables:

```text
docs/pipeline/architecture.md
docs/pipeline/runtime-flow.md
docs/pipeline/lifecycle-and-state.md
docs/pipeline/gates.md
docs/pipeline/workers.md
docs/pipeline/failure-and-recovery.md
docs/pipeline/artifacts-and-status-files.md
```

Content:

- full architecture overview
- lifecycle from CLI start to final exit
- module execution flow
- Forge/Buster/Echo ownership
- gate architecture
- generic gate model
- approval as gate, not special subsystem
- wait/signal/resume model
- state authority and read models
- retry/escalation behavior
- status/artifact ownership
- exit code semantics

Important: this should be code-grounded, not copied from old docs.

---

### Phase 2A — Documentation-driven implementation review

This runs in parallel with Phase 2 and feeds Phase 3. It is not an optional cleanup pass. The documentation phase is also a detailed post-refactor review phase.

Goal:

- read the pipeline implementation in small, complete batches
- document how the code actually wires together
- expose duplicate authority, unclear ownership, over-complex wiring, stale paths, missing verification, and non-canonical helpers
- capture findings immediately so the final docs can be used as a refactor/optimization map

Batch size:

- Use cohesive batches of roughly 5-15 files, adjusted by complexity.
- Prefer natural groups such as `services/status-store*`, `runners/*gate*`, `services/telemetry*`, `core/*`, Buster suites, or shared helpers.
- Do not require the whole codebase to fit in one session. Every batch must be complete enough to stand alone.

Implementation-map deliverables:

```text
docs/pipeline/implementation-map/README.md
docs/pipeline/implementation-map/batch-template.md
docs/pipeline/implementation-map/env-vars-and-inputs.md
docs/pipeline/implementation-map/path-construction.md
docs/pipeline/implementation-map/function-call-map.md
docs/pipeline/implementation-map/authority-map.md
docs/pipeline/implementation-map/external-boundaries.md
docs/pipeline/implementation-map/batches/*.md
```

For every reviewed file, capture at minimum:

- file path and role
- imports and direct dependencies
- exports and public surface
- functions/classes/constants defined
- important variables, state objects, and mutable fields
- direct function calls to other local files
- dynamic calls through registries, plugin tables, callbacks, shell commands, or spawned agents
- `process.env` keys, CLI inputs, config fields, and default values read by the file
- paths built or read/written, including status/progress/artifact files
- authoritative reads and authoritative writes, especially for lifecycle read models, `progress.json`, gate outputs, telemetry, summaries, and Redis-backed state
- error paths, retry/escalation behavior, and terminal result mapping
- verification coverage, if any
- suspicious duplication, unclear authority, unnecessary complexity, dead code, path-safety issues, or stale naming

Per-batch workflow:

1. Pick a cohesive batch and list the source files before writing.
2. Read every file in the batch end to end, plus adjacent contracts/tests/config as needed.
3. Fill a batch note under `docs/pipeline/implementation-map/batches/` using the batch template.
4. Update the cumulative implementation-map indexes: env vars/inputs, path construction, function-call map, authority map, and findings index.
5. Promote stable explanations into the public docs for Phase 2 and Phase 3.
6. Record actionable problems in `docs/open-issues.md` and non-urgent improvement ideas in `docs/future-implementation-ideas.md`.

Completion criteria:

- every file in `skills/nova/pipeline/**`, `skills/buster/**`, and `skills/common/**` that affects the pipeline has been assigned to a reviewed batch
- every reviewed file has imports, exports, functions, dependencies, env/config inputs, path behavior, and authority behavior documented
- every status/progress/artifact authority claim is traceable to the files that read or write it
- every duplicate/non-canonical behavior found during review is either documented as intentional or captured as an issue/future idea
- Phase 3 file catalog and dependency map are generated from these reviewed batches, not from guesses

---

### Phase 3 — File catalog and dependency map

This satisfies the “every file” requirement without making the architecture doc unreadable. It is the public, condensed output of the more detailed Phase 2A implementation-map review.

Deliverables:

```text
docs/pipeline/file-catalog.md
docs/pipeline/dependency-map.md
docs/pipeline/implementation-map/*
```

For each relevant file:

```md
### skills/nova/pipeline/runners/pipeline-runner.ts

Purpose:
- Top-level pipeline execution coordinator.

Owns:
- pipeline sequencing
- resume flow
- terminal result mapping

Depends on:
- pipeline-runner-loop.js
- pipeline-runner-scheduling.js
- status-store lifecycle services
- registry/config services

Reasoning:
- kept as orchestration owner so stage implementations do not decide global lifecycle truth.
```

We should cover at minimum:

- `skills/nova/pipeline/**`
- `skills/buster/**`
- `skills/common/**`
- important `tests/verification/**`
- deployment/control files where relevant

---

### Phase 4 — System/deployment documentation

Deliverables:

```text
docs/system/component-map.md
docs/system/deployments.md
docs/system/helm-chart.md
docs/system/docker-images.md
docs/system/redis.md
docs/system/gateway.md
docs/system/discord-integration.md
docs/system/verification-system.md
```

Content:

- every deployed component
- Helm chart structure
- Docker images and purpose
- Redis role
- gateway role
- Discord integration role
- processor/configmaps/secrets/PVC/RBAC
- verification/deployment checks
- environment assumptions

---

### Phase 5 — Operator guide

Deliverables:

```text
docs/operators/getting-started.md
docs/operators/running-the-pipeline.md
docs/operators/recovery-runbook.md
docs/operators/debugging.md
docs/operators/common-failures.md
docs/operators/maintenance.md
```

Content:

- first setup
- required config
- how to run/resume/status/dry-run
- how to interpret exit codes
- how to recover `NEEDS_NOVA`
- what to inspect during failures
- Redis/gateway/session debugging
- approval gate workflow
- safe operational commands

---

### Phase 6 — Developer extension guide

Deliverables:

```text
docs/developers/adding-features.md
docs/developers/adding-gates.md
docs/developers/adding-workers.md
docs/developers/adding-validators.md
docs/developers/pipeline-contracts.md
docs/developers/testing-and-verification.md
```

Content:

- how to add a feature safely
- how to add a new gate
- how generic gate plugins work
- what core owns vs plugin owns
- contracts for gates/workers/validators/generators
- required tests/verification
- how to avoid breaking lifecycle truth

---

### Phase 7 — Reference docs

Deliverables:

```text
docs/reference/config-reference.md
docs/reference/progress-json-reference.md
docs/reference/status-json-reference.md
docs/reference/exit-codes.md
docs/reference/telemetry-event-schema.md
docs/reference/environment-variables.md
```

These should be exact, dry, stable references.

Existing docs like `PIPELINE-CONFIG-REFERENCE.md`, `progress-json-reference.md`, `telemetry-event-schema.md` may be migrated here if current.

---

### Phase 8 — Decisions/ADR layer

Deliverables:

```text
docs/decisions/README.md
docs/decisions/architecture-decisions.md
docs/decisions/plugin-architecture-decisions.md
docs/decisions/event-model-decisions.md
docs/decisions/gate-model-decisions.md
```

This should distill the hardening docs into open-source-readable decisions.

Important decisions to preserve:

- core owns lifecycle truth
- gates are generic plugins
- approval is just another gate
- plugins recommend; core decides lifecycle
- wait/signal/resume are core services
- canonical events/read-models are the long-term truth
- do not turn KubeClaw into a generic workflow SDK

## Maintainability rules

I recommend we enforce these rules:

1. **No duplicated truth**  
   Architecture explains; reference specifies; operator guide teaches.

2. **Every doc has a clear audience**
   - architecture: maintainers/contributors
   - operators: people running it
   - developers: people extending it
   - reference: exact contract lookup
   - decisions: why it exists this way

3. **File catalog is separate**
   The “every file” requirement belongs in `file-catalog.md`, not inside the main architecture doc.

4. **Detailed implementation review is mandatory**
   The documentation phase must read and map the implementation file by file. The detailed map can be verbose and batch-based; public docs should distill it instead of copying full source code.

5. **Current behavior must be code-grounded**
   Old docs can inform, but code wins.

6. **Old docs should be archived, not silently deleted**
   We can move obsolete docs to `docs/archive/` after review.

7. **Docs should link, not copy**
   Example: operator recovery guide links to exit-code reference instead of duplicating all exit-code semantics.

## Phase 1 inventory and migration table

Status: initial pass started 2026-05-03.

Phase 1 does not produce the final rewritten documentation. It produces the cleanup map that prevents duplicated truth and tells later phases which existing docs are sources, which docs move, and which docs should be archived after their useful content is migrated.

### Source-of-truth map

| Area | Source of truth | Notes |
| --- | --- | --- |
| Current pipeline behavior | `skills/nova/pipeline/**` | Code wins over older docs for runtime flow, lifecycle, gates, retries, status writes, and exit behavior. |
| Current Buster behavior | `skills/buster/**` | Code wins for suite ordering, deterministic checks, telemetry, crash/rate-limit handling, and worker result semantics. |
| Shared runtime helpers | `skills/common/**` | Use for shared process, config, telemetry, and model/session helper behavior. |
| Verification guarantees | `tests/verification/**` plus relevant scripts | Tests define the behavior we currently claim is guarded. Docs should not promise guarantees that are not covered or intentionally accepted. |
| Deployment/system surfaces | `charts/`, `docker/`, `scripts/`, `examples/`, `my-values/`, `.github/` | These are truth for install, containers, Helm values, gateway/Redis assumptions, and CI/deploy flows. |
| Target architecture/decisions | `../docs/pipeline-hardening/**` | Treat as decision and migration source material. Do not describe target-state docs as current behavior unless verified in code. |
| Existing `docs/**` | Current docs inventory | Useful content source only. Each file must be kept, rewritten, merged, or archived. |

### Existing `kubeclaw-main/docs` migration table

| Source file | Status | Target destination | Action |
| --- | --- | --- | --- |
| `docs/DOCUMENTATION_PLAN.md` | keep | `docs/DOCUMENTATION_PLAN.md` | Active planning document; update through Phase 1, then use as execution checklist. |
| `docs/DOCUMENTATION_WORKFLOW.md` | keep | `docs/DOCUMENTATION_WORKFLOW.md` | Active documentation workflow and style guide; read at the start of each docs session and after compactions. |
| `docs/future-implementation-ideas.md` | keep | `docs/future-implementation-ideas.md` | Active holding file for candidate implementation ideas that are not yet committed roadmap items. |
| `docs/open-issues.md` | keep | `docs/open-issues.md` | Active Markdown issue tracker for code-audit findings, inconsistencies, simplification opportunities, and docs gaps until GitHub Issues becomes the primary tracker. |
| `docs/pipeline-reference-v10.md` | rewrite/merge | `docs/pipeline/architecture.md`, `docs/pipeline/runtime-flow.md`, `docs/pipeline/lifecycle-and-state.md`, `docs/pipeline/artifacts-and-status-files.md`, `docs/operators/running-the-pipeline.md`, `docs/reference/exit-codes.md` | Old broad “god doc”; extract useful explanations, verify against code, then archive original. |
| `docs/buster-test-platform-reference-v2.md` | rewrite/merge | `docs/pipeline/workers.md`, `docs/developers/adding-workers.md`, `docs/reference/buster-config-reference.md` | Split Buster architecture, extension guidance, and config details; verify against current `skills/buster/**`. |
| `docs/BUSTER-CONFIG-REFERENCE.md` | merge | `docs/reference/buster-config-reference.md` | Preserve exact config fields if current; convert from old standalone reference into reference layer. |
| `docs/PIPELINE-CONFIG-REFERENCE.md` | merge | `docs/reference/config-reference.md`, `docs/reference/progress-json-reference.md`, `docs/reference/environment-variables.md` | Split config semantics by contract; remove duplicated `progress.json` material. |
| `docs/configuration-reference.md` | merge/archive | `docs/reference/config-reference.md`, `docs/reference/environment-variables.md` | Short current reference; merge if still accurate, then archive/remove duplicate. |
| `docs/progress-json-reference.md` | keep/rewrite | `docs/reference/progress-json-reference.md` | Likely remains a standalone exact reference; verify fields against loader/schema code before keeping as authoritative. |
| `docs/telemetry-event-schema.md` | keep/rewrite | `docs/reference/telemetry-event-schema.md` | Keep as event-by-event reference if still in parity with telemetry contract and runtime emits. |
| `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` | merge/decision source | `docs/reference/telemetry-event-schema.md`, `docs/pipeline/telemetry-and-observability.md`, `docs/decisions/event-model-decisions.md` | Preserve contract authority and drift rules; distill long-term decisions into decisions layer. |
| `docs/observability-reference.md` | rewrite/merge | `docs/pipeline/telemetry-and-observability.md`, `docs/reference/telemetry-event-schema.md`, `docs/operators/debugging.md` | Split artifact layout, operator debugging, and telemetry schema details. |
| `docs/architecture-validator-reference.md` | rewrite/merge | `docs/pipeline/gates.md`, `docs/developers/adding-validators.md`, `docs/reference/gate-control-result-schema.md`, `docs/reference/validator-control-result-schema.md` | Treat architecture validator as pre-pipeline validation plus validator-control-result behavior; verify current two-phase behavior in code. |
| `docs/SKILLS.md` | rewrite/merge | `docs/developers/adding-features.md`, `docs/developers/coding-conventions.md`, optional `docs/reference/cli-reference.md` | Keep only current skill/developer material; remove obsolete command inventory after replacement. |
| `docs/clawdeck-v4.html` | archive/regenerate | `docs/archive/` or regenerated diagram asset | HTML artifact is not source-of-truth; archive unless we decide to maintain generated diagrams. |
| `docs/pipeline-flow.html` | archive/regenerate | `docs/archive/` or regenerated diagram asset | Same as above; do not rely on static HTML as canonical architecture documentation. |

### `../docs/pipeline-hardening` source groups

| Source group | Status | Target destination | Action |
| --- | --- | --- | --- |
| `../docs/pipeline-hardening/current_state/**` | source material | `docs/pipeline/*`, `docs/pipeline/file-catalog.md`, `docs/pipeline/dependency-map.md`, `docs/pipeline/implementation-map/*` | Use as audited map of current behavior, but re-check mutable facts against code while writing. |
| `../docs/pipeline-hardening/target_state/**` | decision source | `docs/decisions/*`, `docs/developers/pipeline-contracts.md` | Distill target architecture without presenting unimplemented target state as current behavior. |
| `../docs/pipeline-hardening/implementationplan/**` | implementation source | `docs/developers/*`, `docs/decisions/*` | Use for sequencing, contracts, and migration rationale; do not expose internal packet structure as operator docs. |
| `../docs/pipeline-hardening/final_audits/**` | audit/source material | `docs/system/verification-system.md`, `docs/operators/recovery-runbook.md`, `docs/decisions/architecture-decisions.md` | Extract verification expectations, live-test gate/runbook, environment requirements, and security/operational findings. |
| `../docs/pipeline-hardening/PIPELINE_PLUGIN_*` | decision source | `docs/decisions/plugin-architecture-decisions.md`, `docs/developers/adding-gates.md`, `docs/developers/pipeline-contracts.md` | Preserve plugin/gate boundaries, capability/security, failure isolation, registry/loading, composition, and verdict model decisions. |
| `../docs/pipeline-hardening/PIPELINE_EVENT_*` | decision/reference source | `docs/decisions/event-model-decisions.md`, `docs/reference/telemetry-event-schema.md` | Preserve event identity, payload, refs, legality, idempotency, and cutover mapping decisions. |
| `../docs/pipeline-hardening/open-followups/**` | follow-up source | relevant operator/developer docs or backlog | Review after core docs exist; carry only still-relevant operational follow-ups forward. |

### Code validation pass

Status: completed initial validation 2026-05-03.

The migration table above was checked against the live repository layout and current implementation surfaces. The table remains structurally valid, with two target refinements applied during validation:

- `docs/pipeline-reference-v10.md` also feeds `docs/pipeline/artifacts-and-status-files.md` and `docs/reference/exit-codes.md` because exit constants and status/artifact paths are explicit code surfaces.
- `docs/architecture-validator-reference.md` also feeds `docs/reference/validator-control-result-schema.md` because validator outputs have their own typed contract separate from gate outputs.

| Migration area | Code surfaces checked | Validation result |
| --- | --- | --- |
| Existing docs inventory | `docs/**` | Every source file listed in the migration table exists in the working tree. |
| CLI and operator flow | `skills/nova/pipeline/cli.ts`, `skills/nova/pipeline/core/constants.ts`, `skills/nova/pipeline/runners/pipeline-runner-terminal.ts` | Confirms targets for operator running docs, CLI reference, resume behavior, Nova escalation, and exit-code reference. |
| Pipeline architecture/runtime flow | `skills/nova/pipeline/runners/pipeline-runner*.ts`, `skills/nova/pipeline/runners/module-runner*.ts`, `skills/nova/pipeline/runners/*gate*.ts` | Confirms split across architecture, runtime flow, lifecycle/state, gates, workers, and failure/recovery docs. |
| Lifecycle/state and artifacts | `skills/nova/pipeline/core/paths.ts`, `skills/nova/pipeline/services/status-store*.ts`, `skills/nova/pipeline/services/status-store-lifecycle/**`, `skills/nova/pipeline/services/summary.ts` | Confirms dedicated `artifacts-and-status-files.md`, lifecycle/read-model docs, and status/progress reference docs are needed. |
| Gate/worker/validator contracts | `skills/nova/pipeline/services/contracts/{gate-control-result,worker-control-result,validator-control-result,pipeline-step-result}.ts` | Confirms separate reference docs for gate, worker, validator, and step/control-result contracts. |
| Telemetry/observability | `skills/nova/pipeline/services/telemetry*.ts`, `skills/nova/pipeline/services/telemetry/**`, `skills/nova/pipeline/services/telemetry-sink*.ts`, `tests/verification/contracts/check-telemetry-contract.mjs` | Confirms telemetry docs should be split between observability narrative and exact event/schema reference. |
| Architecture validator | `skills/nova/pipeline/services/arch-validator.ts`, `skills/nova/pipeline/services/arch-validator-checks.ts`, `tests/verification/contracts/check-validator-control-result-surface.mjs` | Confirms the existing reference maps to validator/developer docs, not only generic gate docs. |
| Buster platform/config | `skills/buster/buster-pipeline.ts`, `skills/buster/pipeline/runners/suite-runner.ts`, `skills/buster/pipeline/suites/**`, `skills/buster/pipeline/services/task-validation.ts` | Confirms Buster docs should split architecture/worker behavior from exact suite/config reference. Re-run this check after current uncommitted Buster path/secret-hardening changes are committed or reverted. |
| Shared helpers | `skills/common/pipeline/**` | Confirms common helper material belongs in developer/conventions docs, not operator docs. |
| Verification surface | `tests/verification/**`, `tests/verification/run-*-verification.sh` | Confirms a dedicated verification-system doc and testing/verification developer guide are needed. |
| Deployment/system surface | `charts/**`, `docker/**`, `scripts/**`, `examples/**`, `my-values/**`, `.github/**` | Confirms system docs for Helm, Docker, Redis, gateway, deployment, examples, and local development. |

Validation caveats:

- Existing docs-surface verification still references some current root docs directly; archive/move work must update verification expectations in the same later slice.
- Static HTML files are generated/reference artifacts, not code truth; archive/regenerate remains the right migration action.
- Hardening docs remain decision/source material only. Any target-state claim must be re-checked against code before becoming current-behavior documentation.

### Phase 1 completion criteria

- Every existing doc has one migration action: keep, rewrite, merge, archive, or delete-later-with-approval.
- Every hardening-doc family has a destination and usage rule.
- The future documentation tree is fixed before Phase 2 writing starts.
- `docs/DOCUMENTATION_WORKFLOW.md` is treated as mandatory session bootstrap material.
- Code-audit findings are captured in `docs/open-issues.md` as they are found.
- Future implementation candidates are captured in `docs/future-implementation-ideas.md` as they are found.
- Any archive/delete operation is separated from writing and done only after useful content is migrated.

## Suggested first concrete step

I propose the next step is:

1. Create `docs/DOCUMENTATION_PLAN.md`.
2. Add the final structure above.
3. Add a migration table for existing docs:
   - source file
   - status
   - target destination
   - action
4. Then start with `docs/pipeline/architecture.md` and the first `docs/pipeline/implementation-map/` review batch.

I would not start writing the full docs until that migration table is done.
