# pipeline/

Modular KubeClaw Swarm Pipeline. The narrow public entry surface is `pipeline/index.ts`; lower-level helpers stay owned by their source modules.

## Directory structure

```
pipeline/
  core/
    config.ts          Config loading, validation, model resolution
    constants.ts       Shared status strings (STATUS)
    context.ts         Pipeline/plugin context and capability narrowing
    git-context.ts     Nova facade for shared repo-scoped Git primitives
    logger.ts          Structured logger with context-aware dual-write
    paths.ts           Path utilities: modulePath, swarmRoot, relPath, etc.
    runtime.ts         Context/config-first run identity/stats helpers, output(), loadProgress()
    temp.ts            Temporary directory lifecycle manager
  integrations/
    discord.ts         Discord webhook/audit integration using shared webhook transport
    gateway.ts         Typed Gateway operation facades
    git-worktree.ts    Nova Git worktree/stash/pull/push policy
    redis.ts           Redis module loader and stream helpers
  agents/
    runtime.ts         Runtime/harness resolution shim to shared pipeline helpers
    acp-monitor.ts     ACP session state polling and classification
    lifecycle.ts       Agent spawn/kill/steer/verify helpers
    shutdown.ts        Graceful shutdown hooks and agent tracking
  prompts/
    buster-gate.ts     Buster gate prompt builder
    buster-instructions.ts  Shared Buster instructions loader
    buster-module.ts   Buster module prompt builder
    forge.ts           Forge prompt builder
    gate-fix.ts        Gate fix-and-retest prompt builder
    review.ts          Echo reviewer prompt builder
    shared.ts          Common prompt building blocks
  runners/
    buster-gate-runner.ts  Buster gate lifecycle
    gate-runner.ts     Gate dispatch: routes to buster or review runner via GATE_RUNNERS map
    module-runner.ts   Module lifecycle runner
    pipeline-runner.ts Narrow public orchestration facade (runPipeline, printStatus, dryRun)
    review-gate-runner.ts  Review gate lifecycle
  services/
    blueprint.ts       Blueprint release and control-file sync
    failures/          Failure classification, presentation, escalation, and retry policy
    polling.ts         Polling engine: status, Redis, dual-channel, rate-limit recovery
    rate-limit.ts      Rate-limit detection and recovery
    status-store.ts    Module/gate status read/write, log directory management
    summary.ts         Pipeline run summary and review spawner
    telemetry.ts       Pipeline event hooks (onModulePass, onGateFail, etc.)
  tests/               Per-module Buster test files (node:test, no external deps)
  tools/
    redis.ts           Nova → Buster Redis CLI (send, read-completion)
    lint-report.ts     Standalone lint aggregator CLI
    project-summary.ts Standalone project summary generator CLI
  cli.ts               CLI entry point; imports owned runtime modules directly
  index.ts             Narrow public entry surface for pipeline callers
```

## Public API

`pipeline/index.ts` is the narrow public entry surface, not a catch-all barrel.
Use it for top-level pipeline entrypoints and public constants. Import lower-level
helpers from their owned modules.

```js
import { runPipeline, loadConfig, STATUS } from './pipeline/index.ts';
import { createRunId, createRunStats } from './pipeline/core/runtime.ts';
import { pollGeneric } from './pipeline/services/polling.ts';
```

Supported `index.ts` exports:

| Category | Key exports |
|---|---|
| Runner | `runPipeline` |
| Config | `loadConfig` |
| Constants | `STATUS` |
| Shutdown | `registerShutdownHooks` |

Helpers that are intentionally **not** re-exported from `index.ts`:
- telemetry and notification helpers in `services/telemetry.js`, `services/notification-dispatch.js`, and `services/notification-contract.ts`
- context/config-first run-state helpers in `core/runtime.ts`
- plugin context helpers in `core/context.ts`
- git plumbing in `core/git-context.ts` / `integrations/git-worktree.ts`
- polling primitives in `services/polling.ts`
- agent, prompt, path, and status internals in their owned modules

## Shared helper ownership

Canonical shared pipeline helper implementations live in `skills/common/pipeline/`.
Nova and Buster keep repo-local common facades under their own
`skills/*/pipeline/...` trees, and runtime source imports those local
production-surface paths.

Production packaging exposes only `/app/skills/...`: image-specific skills are
copied first, then `skills/common/...` is copied over the same tree so canonical
shared implementations replace the repo-local common facades at `/app/skills/pipeline/...`.

## Extending the pipeline

### Add a new gate type

1. Create the runner/control-result implementation in the owning `runners/` or `services/` slice.
2. Register the gate through the plugin/registry ownership surface so `gate-runner.js` can dispatch it by stage/type.
3. Add tests for the gate control result and scheduler projection.
4. Do **not** add the gate runner to `index.ts` unless it is intentionally becoming part of the supported public API.

### Add a new service

1. Create `services/my-service.js` with named exports.
2. Import it directly from its owned module from runtime code.
3. Export it from `index.ts` only after deciding it is a supported public API surface.

### Add a new integration

1. Create `integrations/my-service.js` with named exports.
2. Keep the integration imported by its owner/caller module.
3. Export it from `index.ts` only if external callers need that integration as a stable public contract.

## Wave 2 Governance

Wave 2 adds a governed execution layer on top of the core pipeline. These components run automatically when the project is configured for governance.

### Architecture Validator (`services/arch-validator.ts`)

Runs before module 01. Detects project definition defects (missing files, undefined refs, bad configs) before wasting execution time. Produces:

- `.swarm/logs/architecture-validator/results.json` — machine-readable findings
- `.swarm/logs/architecture-validator/summary.md` — human-readable report

Blocking findings (severity `blocking`) halt the pipeline. Non-blocking findings (`error`, `warn`, `info`) are recorded and the run proceeds.

### Approval Gate (`runners/approval-gate-runner.js`)

A human-in-the-loop gate type. Pauses pipeline execution until an operator approves, rejects, or the timeout elapses. V1 interaction path:

1. Pipeline posts Discord embed via webhook
2. Operator responds via Nova-bridge: `APPROVE gate:<id>` or `REJECT gate:<id> reason: <text>`
3. Nova writes operator decision evidence to the configured gate state artifact
4. Pipeline syncs that evidence into approval wait lifecycle/read-model state and resumes or halts

Approval wait lifecycle/read-model state is the **authoritative source of truth**. The gate-state file is operator evidence, and Discord message history is only the UI.

Config still uses lower-case `on_timeout` values (`block` / `continue`), but persisted approval gate state, gate audit artifacts, and emitted `approval.requested.timeout_policy` are normalized to canonical uppercase `BLOCK` / `CONTINUE` for downstream consumers.

### Model/Thinking Policy Log (`core/policy.ts`)

`core/policy.ts` owns model/thinking override resolution and appends an effective-policy record to `.swarm/logs/pipeline/model-policy.jsonl` for each spawn path that resolves policy. Records which model ran and why (runtime override, scope policy, project default, platform fallback).

### Observability

All governance observability artifacts live under `.swarm/logs/`:

```
.swarm/logs/
├── pipeline/
│   ├── latest.json           ← Pointer to the latest run-scoped audit tree
│   ├── pipeline.jsonl        ← Lifecycle event stream
│   ├── discord.jsonl         ← Persisted Discord audit log
│   ├── nova-injections.jsonl ← Nova escalation handoff audit log
│   ├── buster-telemetry-fallback.jsonl ← Buster Redis-telemetry fallback/degradation mirror
│   ├── model-policy.jsonl    ← Model/thinking resolution log
│   └── summary.json          ← End-of-run summary with governance section
├── architecture-validator/   ← Validator findings and report
├── cost/                     ← Per-agent usage and cost report
├── redis/                    ← Redis exchange log
└── gates/<gate-id>/          ← Approval gate audit artifacts
```

`.swarm/logs/pipeline/latest.json` points operators at the newest run-scoped `pipeline.jsonl`, `discord.jsonl`, `nova-injections.jsonl`, `buster-telemetry-fallback.jsonl`, `redis/redis-exchanges.jsonl`, `redis/redis-ops.jsonl`, and `summary.json` under `.swarm/logs/pipeline/runs/<run-id>/`, and records the canonical live `telemetry_stream_key` for that run.

`scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>` are the canonical live deployment command surface; `.swarm/logs/pipeline/latest.json` plus the run-scoped audit bundle are the canonical replay/audit surface for that deployment path.

### Governance Docs

| Topic | Reference |
|---|---|
| Full observability layout | `docs/archive/legacy-root-docs/observability-reference.md` |
| Architecture validator reference | `docs/archive/legacy-root-docs/architecture-validator-reference.md` |
| Telemetry contract | `docs/archive/legacy-root-docs/telemetry-event-schema.md` |
| Pipeline reference | `docs/archive/legacy-root-docs/pipeline-reference-v10.md` |

---

## How Buster tests work

Each module has a corresponding test file in `pipeline/tests/`. Tests use
`node:test` with no external dependencies. Buster imports modules directly
(not via the CLI layer) so tests remain fast and isolated.

Run all tests:
```bash
node --test pipeline/tests/
```
