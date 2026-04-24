# pipeline/

Modular KubeClaw Swarm Pipeline. All public API is exported from `pipeline/index.js`.

## Directory structure

```
pipeline/
  core/
    config.js          Config loading, validation, model resolution
    constants.js       Shared status strings (STATUS) and exit codes (EXIT_*)
    context.js         AsyncLocalStorage pipeline context
    git.js             Repo-root detection (getRepoRoot)
    logger.js          Structured logger with context-aware dual-write
    paths.js           Path utilities: modulePath, swarmRoot, relPath, etc.
    runtime.js         Run identity (RUN_ID), run stats (_runStats), output(), loadProgress()
    temp.js            Temporary directory lifecycle manager
  integrations/
    discord.js         Discord webhook delivery (simplified; see note below)
    gateway.js         Gateway Tool API client (gatewayInvoke)
    git.js             Re-exports getRepoRoot (thin shim)
    redis.js           Redis module loader and stream helpers
  agents/
    runtime.js         Runtime/harness resolution shim to shared pipeline helpers
    acp-monitor.js     ACP session state polling and classification
    lifecycle.js       Agent spawn/kill/steer/verify helpers
    shutdown.js        Graceful shutdown hooks and agent tracking
  prompts/
    buster-gate.js     Buster gate prompt builder
    buster-instructions.js  Shared Buster instructions loader
    buster-module.js   Buster module prompt builder
    forge.js           Forge prompt builder
    gate-fix.js        Gate fix-and-retest prompt builder
    review.js          Echo reviewer prompt builder
    shared.js          Common prompt building blocks
  runners/
    buster-gate-runner.js  Buster gate lifecycle
    gate-runner.js     Gate dispatch: routes to buster or review runner via GATE_RUNNERS map
    module-runner.js   Module lifecycle runner
    pipeline-runner.js Full pipeline orchestration (runPipeline, findNextStep, printStatus, dryRun)
    review-gate-runner.js  Review gate lifecycle
  services/
    blueprint.js       Blueprint release and control-file sync
    failures.js        Failure classification, escalation, and retry logic
    polling.js         Polling engine: status, Redis, dual-channel, rate-limit recovery
    rate-limit.js      Rate-limit detection and recovery
    status-store.js    Module/gate status read/write, log directory management
    summary.js         Pipeline run summary and review spawner
    telemetry.js       Pipeline event hooks (onModulePass, onGateFail, etc.)
  tests/               Per-module Buster test files (node:test, no external deps)
  tools/
    redis.js           Nova → Buster Redis CLI (send, read-completion)
    lint-report.js     Standalone lint aggregator CLI
    project-summary.js Standalone project summary generator CLI
  cli.js               CLI entry point; delegates to pipeline/index.js exports
  index.js             Narrow public entry surface for pipeline callers
```

## Public API

`pipeline/index.js` is the narrow public entry surface, not a catch-all barrel.
Use it for top-level pipeline entrypoints and public constants. Import lower-level
helpers from their owned modules.

```js
import { runPipeline, loadConfig, STATUS, EXIT_OK } from './pipeline/index.js';
import { createRunId, createRunStats } from './pipeline/core/runtime.js';
import { pollGeneric } from './pipeline/services/polling.js';
```

Supported `index.js` exports:

| Category | Key exports |
|---|---|
| Runner | `runPipeline` |
| Config | `loadConfig` |
| Constants | `STATUS`, `EXIT_OK`, `EXIT_ERROR`, `EXIT_NEEDS_NOVA`, `EXIT_BLOCKED`, `EXIT_TIMEOUT`, `EXIT_RATE_LIMITED` |
| Shutdown | `registerShutdownHooks` |
| Telemetry | `emitEvent`, `emitCostUpdate`, lifecycle/status emitters |

Helpers that are intentionally **not** re-exported from `index.js`:
- run-state helpers in `core/runtime.js`
- git plumbing in `core/git.js`
- polling primitives in `services/polling.js`
- agent, prompt, path, and status internals in their owned modules

## Shared helper ownership

Canonical shared pipeline helper implementations live in `skills/common/pipeline/`.
Nova source files now import those shared owners directly, so the canonical
session/runtime/gateway/lifecycle seams are obvious in search instead of hiding
behind same-name repo facades.

Production packaging keeps the same ownership model. The general and sandbox
images copy the canonical helper files from `skills/common/pipeline/` into
`/app/common/pipeline/...`, and the packaged `/app/skills/pipeline/...` helper
paths are still materialized from the shared common owners.

## Extending the pipeline

### Add a new gate type

1. Create `runners/my-gate-runner.js` with `export async function runMyGate(...)`.
2. Register it in `runners/gate-runner.js`:
   ```js
   import { runMyGate } from './my-gate-runner.js';
   export const GATE_RUNNERS = { buster: runBusterGate, review: runReviewGate, my: runMyGate };
   ```
3. Export `runMyGate` from `index.js`.

### Add a new service

1. Create `services/my-service.js` with named exports.
2. Add the exports to `index.js`:
   ```js
   export { myFunction } from './services/my-service.js';
   ```

### Add a new integration

1. Create `integrations/my-service.js` with named exports.
2. Add the exports to `index.js`.

## Wave 2 Governance

Wave 2 adds a governed execution layer on top of the core pipeline. These components run automatically when the project is configured for governance.

### Architecture Validator (`services/arch-validator.js`)

Runs before module 01. Detects project definition defects (missing files, undefined refs, bad configs) before wasting execution time. Produces:

- `.swarm/logs/architecture-validator/results.json` — machine-readable findings
- `.swarm/logs/architecture-validator/summary.md` — human-readable report

Blocking findings (severity `blocking`) halt the pipeline. Non-blocking findings (`error`, `warn`, `info`) are recorded and the run proceeds.

### Approval Gate (`runners/approval-gate-runner.js`)

A human-in-the-loop gate type. Pauses pipeline execution until an operator approves, rejects, or the timeout elapses. V1 interaction path:

1. Pipeline posts Discord embed via webhook
2. Operator responds via Nova-bridge: `APPROVE gate:<id>` or `REJECT gate:<id> reason: <text>`
3. Nova writes decision to `.swarm/<gate-id>-gate-status.json`
4. Pipeline reads file and resumes or halts

The gate-state file is the **authoritative source of truth** — not Discord message history.

Config still uses lower-case `on_timeout` values (`block` / `continue`), but persisted approval gate state, gate audit artifacts, and emitted `approval.requested.timeout_policy` are normalized to canonical uppercase `BLOCK` / `CONTINUE` for downstream consumers.

### Model/Thinking Policy Log (`core/runtime.js`, `services/telemetry.js`)

Every agent spawn writes an effective-resolution record to `.swarm/logs/pipeline/model-policy.jsonl`. Records which model ran and why (runtime override, scope policy, project default, config default).

### Observability

All governance observability artifacts live under `.swarm/logs/`:

```
.swarm/logs/
├── pipeline/
│   ├── latest.json           ← Pointer to the latest run-scoped audit tree
│   ├── pipeline.jsonl        ← Lifecycle event stream
│   ├── discord.jsonl         ← Persisted Discord audit log
│   ├── nova-injections.jsonl ← Nova escalation handoff audit log
│   ├── model-policy.jsonl    ← Model/thinking resolution log
│   └── summary.json          ← End-of-run summary with governance section
├── architecture-validator/   ← Validator findings and report
├── cost/                     ← Per-agent usage and cost report
├── redis/                    ← Redis exchange log
└── gates/<gate-id>/          ← Approval gate audit artifacts
```

`.swarm/logs/pipeline/latest.json` points operators at the newest run-scoped `pipeline.jsonl`, `discord.jsonl`, `nova-injections.jsonl`, and `summary.json` under `.swarm/logs/pipeline/runs/<run-id>/`, and records the canonical live `telemetry_stream_key` for that run.

`scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>` are the canonical live deployment command surface; `.swarm/logs/pipeline/latest.json` plus the run-scoped audit bundle are the canonical replay/audit surface for that deployment path.

### Governance Docs

| Topic | Reference |
|---|---|
| Full observability layout | `docs/observability-reference.md` |
| Architecture validator reference | `docs/architecture-validator-reference.md` |
| Telemetry contract | `docs/telemetry-event-schema.md` |
| Pipeline reference | `docs/pipeline-reference-v10.md` |

---

## How Buster tests work

Each module has a corresponding test file in `pipeline/tests/`. Tests use
`node:test` with no external dependencies. Buster imports modules directly
(not via the CLI layer) so tests remain fast and isolated.

Run all tests:
```bash
node --test pipeline/tests/
```
