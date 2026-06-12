# Batch P08 — Nova module runner internals

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/runners/module-runner/*.js
skills/nova/pipeline/runners/module-runner/buster-phase/*.js
```

Scope expansion verified live: 10 files, exactly at the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/runners/module-runner/attempt.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/identity.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/preflight.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner/terminal-results.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-module-runner-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-worker-control-result-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/module-failures.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `skills/nova/pipeline/runners/module-runner/attempt.js`

Role: One complete module attempt orchestrator: dependencies, status initialization, Forge phase, pre-Buster preparation, Buster phase, and unexpected terminal fallback.

Imports/dependencies: Node `fs`; constants/logger/path; config policy/model helpers; status-store; blueprint; failure services; correlation; polling; agent orchestration; shutdown; Discord; Git worktree; prompt builders; dependency/validation services; shared module-runner helpers; Forge/pre-Buster/Buster phase helpers; terminal result builders.

Exports/public surface: `getModuleRunnerDeps`, `resolveModuleRunContext`, `executeModuleAttempt` default/named export.

Defines: Default dependency seam, module context resolver, attempt flow.

Important variables/state: Local `status`, `recalledMemoryIds`, `stages`, `needsForge`, `needsBuster`. Initializes/saves status via deps and passes mutable status into phase helpers.

Calls out to: Dependency check, status load/init/save, blueprint release, phase helpers, terminal result builders, failure telemetry, Git/poll/agent deps through helper seams.

Called by / expected callers: Public `module-runner.js` retry loop.

Environment variables / CLI inputs / config fields: Reads module config from `progress.modules[moduleId]`, `config.default_timeout_minutes`, `config.default_max_fails`, `config._testOverrides.moduleRunner`, and `opts.novaPrompt` from caller.

Paths built/read/written: Uses `statusPath(config, dir)` to distinguish missing vs corrupt status; status/prompt/stream paths otherwise delegated.

Authority behavior: Owns per-attempt phase ordering and resume decision. It deliberately refuses blueprint release when an existing status file is corrupt.

Error/retry/terminal behavior: Missing module throws. Dependencies not met terminal `EXIT_ERROR`. Corrupt existing status terminal `EXIT_ERROR` with salvaged identity. Blueprint release failure terminal `EXIT_NEEDS_NOVA`. PASS/BLOCKED skip. Unexpected final status terminal `EXIT_ERROR`. Phase helpers own retry decisions.

Verification coverage: `check-module-runner-slice-surface.mjs`, `pipeline.mjs`, `module-failures.mjs`.

Findings: `P07-ISSUE-001` later resolved the observed P08 Buster crash retry/status guard failure path.

### `skills/nova/pipeline/runners/module-runner/buster-phase.js`

Role: Main Buster phase loop: policy selection, crash retry loop, Redis completion adjudication, and terminal pass/fail/block routing.

Imports/dependencies: Constants/logger; Redis completion adjudicator; lifecycle transition; telemetry; shared module-runner stats/log helpers; Buster phase subhelpers.

Exports/public surface: `runModuleBusterPhase` default/named export.

Defines: Buster phase entry check, crash retry loop, worker result routing, Redis terminal status reconciliation.

Important variables/state: Mutates local `status` across dispatch, poll-failure, and terminal handlers; increments run stats `total_buster_attempts` once per Buster phase entry.

Calls out to: `executeBusterAttemptDispatch`, `handleBusterSpawnFailure`, `handleFailedPollResult`, `handleBusterPassStatus`, `handleBusterFailOrBlockedStatus`, `shouldApplyRedisCompletionToStatus`, `transitionModuleStatus`, `deps.saveStatus`.

Called by / expected callers: `executeModuleAttempt`.

Environment variables / CLI inputs / config fields: Reads module `buster_model`, `max_buster_crash_retries`, config `max_buster_crash_retries`, policy resolution config.

Paths built/read/written: Status writes delegated. No direct path building.

Authority behavior: Owns Buster attempt retry policy and final Buster routing; completion adjudicator owns whether Redis terminal evidence may override local status.

Error/retry/terminal behavior: Non-ok poll results go to poll-failure handler. Spawn failures terminal error. Crash-like failures retry Buster until budget exhausted; terminal status PASS/FAIL/BLOCKED routed to terminal handlers. Unexpected status falls through to `{ status }` for outer attempt fallback.

Verification coverage: `module-failures.mjs` covers Buster crash exhaustion and correlation; `pipeline.mjs` covers normal Buster flow.

Findings: `P07-ISSUE-001` was later resolved for the observed guarded-save path in this file.

### `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.js`

Role: One Buster dispatch attempt: build prompt, validate config, start Buster phase, notify Discord, execute Buster worker.

Imports/dependencies: Constants/logger/runtime; correlation; lifecycle `startModulePhase`; shared Buster Discord/telemetry; `executeBusterWorkerAttempt`.

Exports/public surface: `executeBusterAttemptDispatch`.

Defines: Completion identity generation, prompt build path, first-attempt Buster config validation, phase start/save, worker invocation.

Important variables/state: Mutates `status` through `startModulePhase`; constructs mutable `completionIdentity` updated by worker callbacks.

Calls out to: `deps.buildBusterModulePrompt`, `deps.savePrompt`, `deps.validateBusterConfig`, `deps.discord`, `deps.saveStatus`, `deps.setShutdownContext`, `executeBusterWorkerAttempt`.

Called by / expected callers: `runModuleBusterPhase` retry loop.

Environment variables / CLI inputs / config fields: Uses module/config Buster prompt/config validation inputs and `getRunId(config)`.

Paths built/read/written: Saves Buster prompt through deps; status writes delegated.

Authority behavior: Owns Buster phase start lifecycle edge and pre-dispatch validation boundary.

Error/retry/terminal behavior: Prompt error terminal `EXIT_ERROR`; config validation on first Buster attempt terminal `EXIT_NEEDS_NOVA` after CRITICAL Discord and shutdown-context clear. Worker errors handled by worker adapter.

Verification coverage: `module-failures.mjs`, `pipeline.mjs`.

Findings: `P07-ISSUE-001` was later resolved for the observed repeated `startModulePhase`/status-save behavior in this file.

### `skills/nova/pipeline/runners/module-runner/buster-phase/identity.js`

Role: Correlation precedence helpers for Buster completion identity.

Imports/dependencies: Correlation service result/status resolvers.

Exports/public surface: `resolveCompletionGatewayLabel`, `resolveCompletionDispatchId`, `resolveCompletionSessionKey`.

Defines: Three null-coalescing precedence chains for gateway label, dispatch id, and session key.

Important variables/state: None.

Calls out to: Correlation resolvers.

Called by / expected callers: Buster phase poll failure, terminal failure, and main Buster phase.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns P08 Buster completion correlation fallback order: Redis/result evidence, status, direct fallback, completion identity.

Error/retry/terminal behavior: No throw expected; returns null when no evidence.

Verification coverage: Correlation expectations in `module-failures.mjs`.

Findings: None.

### `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.js`

Role: Non-ok Buster poll result handler: rate-limit, Git polling failure, completion conflict, crash retry, crash exhaustion block.

Imports/dependencies: Constants/logger/runtime; rate-limit finalizer; lifecycle transition/block helpers; shared Discord/telemetry helpers; terminal result builder; identity helpers.

Exports/public surface: `handleFailedPollResult`.

Defines: Rate-limit exit path, fail-closed Git/completion-conflict paths, crash retry path, crash-exhausted BLOCKED path.

Important variables/state: Reloads status from worker result or store, transitions status to READY_FOR_TESTING for crash retry, marks module blocked on crash exhaustion.

Calls out to: `finalizeModuleSessionRateLimitExit`, `transitionModuleStatus`, `markModuleBlocked`, `deps.saveStatus`, `deps.discord`, `emitTerminalBusterCrashTelemetry`.

Called by / expected callers: `runModuleBusterPhase` when `poll_result.ok` is false.

Environment variables / CLI inputs / config fields: Reads `config.rate_limit.max_pauses_per_module`, `timeout`, `maxBusterCrashRetries`, Buster attempt counters.

Paths built/read/written: Status persistence delegated.

Authority behavior: Owns non-terminal poll failure classification for Buster crash retry vs terminal blocked/error/rate-limit.

Error/retry/terminal behavior: Rate-limit terminal rate-limit result; Git error terminal `EXIT_ERROR`; completion conflict terminal `EXIT_BLOCKED`; retryable crash resets READY_FOR_TESTING and asks loop to continue; last crash marks BLOCKED and returns `EXIT_BLOCKED`.

Verification coverage: `module-failures.mjs` directly targets crash exhaustion behavior.

Findings: `P07-ISSUE-001` later resolved the crash retry/exhaustion validation failure.

### `skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.js`

Role: Buster worker spawn failure terminal handler.

Imports/dependencies: Constants/logger/runtime; result correlation; telemetry operator alert; shared Discord/telemetry helpers; identity helpers.

Exports/public surface: `handleBusterSpawnFailure`.

Defines: Spawn failure reason, CRITICAL operator alert payload, module fail telemetry, terminal error result.

Important variables/state: None.

Calls out to: `emitOperatorAlert`, `emitTerminalModuleFailTelemetry`, correlation helpers.

Called by / expected callers: `runModuleBusterPhase` when Buster worker result reason is `spawn_failed`.

Environment variables / CLI inputs / config fields: Uses run id and completion identity inputs.

Paths built/read/written: None.

Authority behavior: Owns Buster spawn-failure terminal mapping.

Error/retry/terminal behavior: Terminal `EXIT_ERROR`; no retry locally because spawn retry belongs to worker backend.

Verification coverage: Module/pipeline behavior tests and worker-control contracts indirectly cover spawn-failure projection.

Findings: None.

### `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.js`

Role: Terminal Buster FAIL/BLOCKED status handler: infrastructure crash, pre-test failure, repeated pre-test failure, and normal agent test failure routing.

Imports/dependencies: Constants/logger/runtime; correlation; lifecycle transition/block helpers; shared Discord/telemetry helpers; identity helpers.

Exports/public surface: `handleBusterFailOrBlockedStatus`.

Defines: Redis source classification, Buster infrastructure crash retry/exhaustion, pre-test classification handling, repeated pre-test detection, code-side pre-test/agent failure routing to `handleFail`.

Important variables/state: Reads/mutates `status.fail_summaries`; transitions READY_FOR_TESTING for infra/config pre-test and crash retry; marks module blocked on exhausted infra crash.

Calls out to: `deps.discord`, `transitionModuleStatus`, `markModuleBlocked`, `deps.saveStatus`, `emitTerminalBusterCrashTelemetry`, `emitTerminalModuleFailTelemetry`, `handleModuleFail`, `buildRetryResult`.

Called by / expected callers: `runModuleBusterPhase` when final status is FAIL or BLOCKED.

Environment variables / CLI inputs / config fields: Uses Redis completion entry `source`/`verdict`, Buster attempt counters, failure helper classifiers.

Paths built/read/written: Status persistence delegated.

Authority behavior: Owns semantic routing between infrastructure problems that preserve Forge output, config/pre-test operator issues, repeated pre-test escalation, and code failures that should route back to Forge retry policy.

Error/retry/terminal behavior: Infrastructure crash retries Buster until exhausted then BLOCKED. Infra/config pre-test returns `EXIT_NEEDS_NOVA`. Repeated pre-test returns `EXIT_NEEDS_NOVA`. Code pre-test and normal agent failures delegate retry budget to `handleFail`.

Verification coverage: `module-failures.mjs`, `pipeline.mjs`, telemetry tests.

Findings: Existing `P07-ISSUE-001` overlaps crash exhaustion paths.

### `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.js`

Role: PASS finalizer for Buster terminal success.

Imports/dependencies: Constants/logger; lifecycle terminal finalizer; telemetry; shared module-runner duration/stats/Discord helpers; PASS result builder.

Exports/public surface: `handleBusterPassStatus`.

Defines: Finalize terminal state, duration computation, status save, phase/module PASS telemetry.

Important variables/state: Mutates `status` terminal fields and cost durations; appends module id to run stats `modules_completed`.

Calls out to: `finalizeTerminalModuleState`, `deps.saveStatus`, `onPhaseCompleted`, `onModulePass`, `buildPassTerminalResult`.

Called by / expected callers: `runModuleBusterPhase`.

Environment variables / CLI inputs / config fields: Uses run id via telemetry context and Buster model/completion identity.

Paths built/read/written: Status persistence delegated.

Authority behavior: Owns Buster PASS terminal projection.

Error/retry/terminal behavior: No catch; save/telemetry errors propagate according to downstream behavior. Returns terminal OK result.

Verification coverage: Pipeline PASS behavior tests.

Findings: None.

### `skills/nova/pipeline/runners/module-runner/preflight.js`

Role: Forge preflight contract validation before spawning Forge.

Imports/dependencies: Logger/runtime; correlation; shared Discord fields/attempt helper; retry result builder.

Exports/public surface: `runModulePreflight` default/named export.

Defines: Preflight validation call, WARN Discord alert, failure routing to `handleFail`.

Important variables/state: Does not mutate status directly; `handleFail` may mutate and persist status.

Calls out to: `deps.runPreflightValidation`, `deps.formatValidationFailures`, `deps.discord`, `deps.handleFail`.

Called by / expected callers: `runModuleForgePhase`.

Environment variables / CLI inputs / config fields: Uses module config and preflight validation deps; max failure budget.

Paths built/read/written: None directly.

Authority behavior: Owns fail-fast preflight gate before Forge worker spawn.

Error/retry/terminal behavior: Passing preflight returns no terminal. Failed preflight sends WARN Discord and delegates retry/fail to `handleFail`.

Verification coverage: Module/pipeline behavior tests indirectly; contract surface test checks export/delegation.

Findings: None.

### `skills/nova/pipeline/runners/module-runner/terminal-results.js`

Role: Small terminal/retry result builder set for module runner.

Imports/dependencies: Constants and correlation helpers.

Exports/public surface: `buildRetryResult`, `buildPassTerminalResult`, `buildFailTerminalResult`, `buildBlockedTerminalResult`, `buildRateLimitTerminalResult`.

Defines: Retry envelope, PASS/FAIL/BLOCKED/rate-limit terminal result shapes.

Important variables/state: None.

Calls out to: Result/status correlation resolvers.

Called by / expected callers: Public module runner, attempt, Forge/preflight/pre-Buster/Buster helpers.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns simple compatibility terminal envelope shapes before conversion to typed pipeline-step results by P07 shared helper.

Error/retry/terminal behavior: No throwing expected; missing fields become null/fallback reason.

Verification coverage: `check-module-runner-slice-surface.mjs` checks exports and behavior surface.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `module-runner.js` | `module-runner/attempt.js` | `executeModuleAttempt` | Public retry loop delegates one-attempt sequencing here. |
| `attempt.js` | `module-runner-forge.js` | `runModuleForgePhase`, `finalizeForgeOnlyPass` | Forge and forge-only PASS stages. |
| `attempt.js` | `module-runner-prebuster.js` | `prepareModuleForBuster` | Pre-Buster validation and Git sync. |
| `attempt.js` | `module-runner/buster-phase.js` | `runModuleBusterPhase` | Buster dispatch/completion loop. |
| `buster-phase.js` | `buster-phase/dispatch.js` | `executeBusterAttemptDispatch` | One crash-retry dispatch attempt. |
| `dispatch.js` | `module-runner-buster-worker.js` | `executeBusterWorkerAttempt` | Registry-backed Buster worker adapter from P07. |
| `buster-phase.js` | `buster-phase/poll-failure.js` | `handleFailedPollResult` | Handles non-ok poll outcomes. |
| `buster-phase.js` | `buster-phase/terminal-failure.js` | `handleBusterFailOrBlockedStatus` | Handles terminal FAIL/BLOCKED status. |
| `buster-phase.js` | `buster-phase/terminal-pass.js` | `handleBusterPassStatus` | Handles terminal PASS status. |
| Buster handlers | `buster-phase/identity.js` | correlation fallback helpers | Dispatch/session/gateway precedence. |
| P08 helpers | `terminal-results.js` | terminal/retry builders | Common envelope builders for outer retry loop. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `executeModuleAttempt` | Dependency check, status exists/corrupt/PASS/BLOCKED/PENDING | Dependency state/status file | Fail, skip, blueprint release/init, or continue | Protects state before phases. |
| `executeModuleAttempt` | `needsForge` / `needsBuster` | Stages/status/current phase | Run Forge, pre-Buster, Buster, or unexpected fallback | Per-attempt phase routing. |
| `executeBusterAttemptDispatch` | Prompt/config validation failure | Prompt result/config validator | Terminal `EXIT_ERROR` or `EXIT_NEEDS_NOVA` | Pre-dispatch fail-fast. |
| `runModuleBusterPhase` | Worker spawn_failed, poll ok, terminal status | Worker result/status | Spawn failure, poll-failure, PASS, FAIL/BLOCKED, retry | Buster loop routing. |
| `handleFailedPollResult` | `rate_limit_exhausted`, `git_error`, `completion_conflict`, crash retry budget | Poll reason/attempt | Rate-limit, fail-closed, block, retry, or crash-exhausted block | Non-ok poll authority. |
| `handleBusterFailOrBlockedStatus` | Redis source/verdict/pre-test class/repeated suite | Redis entry and status fail summaries | Infra crash, operator issue, repeated pre-test, code retry | Buster failure semantic routing. |
| `runModulePreflight` | Preflight pass/fail | Validation result | Continue or Discord+handleFail | Avoids spawning Forge on contract mismatch. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `getModuleRunnerDeps` | Dependency object | Defaults and config overrides | Defaults first, `_testOverrides.moduleRunner` second | Test seams override services. |
| `executeModuleAttempt` | Module status | Missing/PENDING/corrupt/PASS/BLOCKED state | Init only when no existing file; corrupt file aborts | Avoids blueprint overwrite on corrupt status. |
| `dispatch.js` | `completionIdentity` | Run id, status attempt, generated id, worker dispatch | Worker may update dispatch/gateway later | Correlation flows through Buster attempt. |
| `dispatch.js` | Status phase fields | `startModulePhase` inputs | Lifecycle helper mutates phase/status fields then saves | Buster attempt marked TESTING. |
| `handleFailedPollResult` | Status on crash retry/block | Poll reason and retry budget | READY_FOR_TESTING for retry; BLOCKED on exhaustion | Forge output preserved for infra crash. |
| `terminal-failure.js` | Status on infra/config/pre-test outcomes | Redis source/classification | READY_FOR_TESTING, BLOCKED, or handleFail mutation | Separates infra/operator/code failure authority. |
| `terminal-pass.js` | Status terminal fields/cost | Completed time and prior timestamps | Finalize terminal state then compute durations | PASS status persisted before telemetry. |
| `terminal-results.js` | Result envelope | Fail/status/result fields | Correlation helpers fill ids from explicit result/status | Outer runner can project typed step result. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `runModuleBusterPhase` | `for busterAttempt <= maxBusterCrashRetries + 1` | None locally | Crash retry budget from module/config default 2 | Return terminal, continue on crash retry, break unexpected. |
| `executeModuleAttempt` | No local loop | Retry loop belongs to public runner | Timeout passed to phase helpers | Returns terminal/retry envelope. |
| Worker/polling | Delegated to worker backend | Delegated | `timeout` propagated to worker/poll handlers | Worker result drives handlers. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config._testOverrides.moduleRunner` | Test override | `getModuleRunnerDeps` | `{}` | Overrides P08 dependencies. |
| `config.default_timeout_minutes`, `mod.timeout_minutes` | Config/module field | `resolveModuleRunContext` | Module overrides config | Module phase timeout. |
| `config.default_max_fails`, `mod.max_fails` | Config/module field | `resolveModuleRunContext` | Module overrides config | Forge retry budget. |
| `mod.stages` | Module field | `executeModuleAttempt` | `['forge','buster']` | Phase routing. |
| `config.max_buster_crash_retries`, `mod.max_buster_crash_retries` | Config/module field | `runModuleBusterPhase` | `2` | Buster crash retry budget. |
| `mod.buster_model` and policy config | Module/config field | `runModuleBusterPhase` | Policy resolver | Buster worker model. |
| `config.rate_limit.max_pauses_per_module` | Config field | `handleFailedPollResult` | `5` fallback | Rate-limit terminal projection. |
| Redis completion entry `source`, `verdict`, status fields | Runtime input | `terminal-failure.js`, `buster-phase.js` | Worker/poll result | Failure classification and adjudication. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Module `status.json` path | `statusPath(config, dir)` | `attempt.js` corrupt/missing guard | Status-store deps | Existing corrupt file blocks blueprint release. |
| Blueprint/control files | `releaseBlueprint` service | Attempt setup | Blueprint service | Released only for missing/PENDING status. |
| Buster prompt artifact | `deps.savePrompt(config, dir, 'buster', attempt, prompt)` | Operators/worker debugging | Prompt/status service | Concrete path delegated. |
| Status stream/log paths | Status-store/polling/worker services | P08 through status/correlation | Delegated | P08 only carries correlation fields. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| One-attempt module phase sequence | `attempt.js` | Public retry loop/pipeline runner | None. |
| Buster phase crash retry budget and routing | `buster-phase.js`, `poll-failure.js`, `terminal-failure.js` | Module runner/status/telemetry | Existing `P07-ISSUE-001` for guarded status save failure. |
| Buster completion correlation precedence | `buster-phase/identity.js` | Buster terminal/poll handlers | None. |
| Buster prompt/config validation dispatch boundary | `buster-phase/dispatch.js` | Buster worker adapter | None beyond P07 issue. |
| Module terminal/retry envelope | `terminal-results.js` | Public module runner typed projection | None. |
| Preflight contract gate | `preflight.js` | Forge phase | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Module attempt result | `executeModuleAttempt` | `{ retry:boolean, result? }` or retry envelope with fail/correlation fields | Public runner wraps with `buildModuleStepResult` | Pipeline runner loop. |
| Buster completion identity | `executeBusterAttemptDispatch` | `runId`, `attempt`, `dispatchId`, `gateway_label` | Identity helpers | Buster prompt, worker, telemetry/Discord. |
| Buster dispatch result | `executeBusterAttemptDispatch` | `{ completionIdentity, workerOutcome, status }` or `{ terminal }` | Caller checks terminal/worker outcome | Buster retry loop. |
| Poll failure terminal result | `handleFailedPollResult` | Terminal envelopes for rate-limit/git/conflict/block, or `{ retry:true,status }` | Terminal builders/rate-limit finalizer | Buster retry loop. |
| Buster terminal failure result | `handleBusterFailOrBlockedStatus` | Terminal `EXIT_NEEDS_NOVA`/`EXIT_BLOCKED` or retry via handleFail | Failure classifiers and lifecycle helpers | Buster retry loop. |
| Terminal result builders | `terminal-results.js` | PASS `{exit,status}`, FAIL `{exit,reason,...}`, BLOCKED `{exit,reason,module,...}`, rate-limit passthrough | Correlation helpers | Module runner typed projection. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Buster module prompt | `deps.buildBusterModulePrompt` in `dispatch.js` | Delegated `deps.savePrompt(config, dir, 'buster', attempt, prompt)` | Prompt body built outside P08; P08 saves and passes to worker adapter | Buster worker/default backend | Buster worker control result and Redis/status completion. |
| Forge preflight validation | `deps.runPreflightValidation` | None in P08 | Structured validation against module contract before Forge prompt/worker | Validation service dependency | Pass or formatted failure routed through `handleFail`. |

No natural-language prompt body is constructed in P08 scoped files; Buster prompt text is built by the injected prompt builder and persisted/forwarded.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `executeModuleAttempt` | Missing module | No | No retry | Throws | None. |
| `executeModuleAttempt` | Dependencies not met | No | No retry | Terminal `EXIT_ERROR` | None. |
| `executeModuleAttempt` | Existing corrupt status file | No | No retry | Terminal `EXIT_ERROR`, no blueprint release | Salvages only identity strings. |
| `executeModuleAttempt` | Blueprint release failure | No | No retry | Terminal `EXIT_NEEDS_NOVA` | Error included. |
| `executeBusterAttemptDispatch` | Buster prompt build failure | No | No retry | Terminal `EXIT_ERROR` | Error included. |
| `executeBusterAttemptDispatch` | Buster config validation failure | No | Only on first Buster attempt | Terminal `EXIT_NEEDS_NOVA`, shutdown context cleared | Error snippet in Discord field. |
| `handleFailedPollResult` | Rate-limit exhausted | No | Rate-limit finalizer owns details | Terminal rate-limit result | None. |
| `handleFailedPollResult` | Git polling error | No | No retry | Terminal `EXIT_ERROR` fail-closed | Polling details included. |
| `handleFailedPollResult` | Completion conflict | No | No retry | Terminal `EXIT_BLOCKED` fail-closed | Conflict details included. |
| `handleFailedPollResult` | Crash-like poll failure before budget exhausted | Yes | Immediate retry; budget `max_buster_crash_retries + 1` attempts | Reset READY_FOR_TESTING and continue Buster loop | Reason included. |
| `handleFailedPollResult` | Crash budget exhausted | No | No retry | Mark BLOCKED and terminal `EXIT_BLOCKED` | Reason included. |
| `handleBusterSpawnFailure` | Worker spawn failed | No local retry | Backend may retry before result | CRITICAL alert and terminal `EXIT_ERROR` | Error included. |
| `handleBusterFailOrBlockedStatus` | Infra crash from Redis completion | Yes until Buster crash budget exhausted | Immediate retry or BLOCKED | Preserves Forge output | Source included. |
| `handleBusterFailOrBlockedStatus` | Infra/config pre-test issue | No | No retry | Terminal `EXIT_NEEDS_NOVA`; Forge output preserved | Detail included. |
| `handleBusterFailOrBlockedStatus` | Repeated code pre-test failure | No | No retry | Terminal `EXIT_NEEDS_NOVA` | Reason included. |
| `handleBusterFailOrBlockedStatus` | Code pre-test/agent failure | Yes if handleFail budget remains | Delegated to `handleFail` | Retry Forge or terminal fail | Reason included. |
| `runModulePreflight` | Preflight validation failure | Yes if handleFail budget remains | Delegated to `handleFail` | Retry Forge or terminal fail | Validation codes included. |
| `terminal-pass.js` | Status save/telemetry failure | No local catch | No retry | Throws/propagates downstream failure | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `executeModuleAttempt` | Missing module | No direct telemetry | none | none | Function throws | Caller owns error handling. |
| `executeModuleAttempt` | Dependencies not met | Yes | Telemetry/core log | `module.failed`; ERROR log | `emitTerminalModuleFailTelemetry`, `log` | Terminal result returned. |
| `executeModuleAttempt` | Corrupt status file | Yes | Telemetry/core log | `module.failed`; ERROR log | `emitTerminalModuleFailTelemetry`, `log` | Prevents blueprint overwrite. |
| `executeModuleAttempt` | Blueprint release failure | Yes | Telemetry/core log | `module.failed`; ERROR log | `emitTerminalModuleFailTelemetry`, `log` | Terminal needs-Nova result. |
| `executeBusterAttemptDispatch` | Prompt build failure | Yes | Telemetry/core log | `module.failed`; ERROR log | `emitTerminalModuleFailTelemetry`, `log` | Terminal error. |
| `executeBusterAttemptDispatch` | Config validation failure | Yes | Telemetry/core log and Discord/audit | `module.failed`; CRITICAL Discord | `emitTerminalModuleFailTelemetry`, `deps.discord` | Shutdown context cleared. |
| `handleFailedPollResult` | Rate-limit exhausted | Yes | Rate-limit telemetry/Discord/log | rate-limit terminal event | `finalizeModuleSessionRateLimitExit` | Service owns schema. |
| `handleFailedPollResult` | Git polling error | Partial | Terminal result only | none direct | Function return | Caller terminal path projects result. |
| `handleFailedPollResult` | Completion conflict | Yes | Core log and Discord | ERROR log; CRITICAL completion conflict | `log`, `deps.discord` | Terminal blocked result. |
| `handleFailedPollResult` | Crash retry | Yes | Core log and Discord | WARN crash retry | `log`, `deps.discord` | Status reset saved. |
| `handleFailedPollResult` | Crash exhausted | Yes | Core log, status-store, telemetry, Discord | BLOCKED status, `module.failed`/blocked telemetry, CRITICAL Discord | `markModuleBlocked`, `emitTerminalBusterCrashTelemetry`, `deps.discord` | Observed validation failure was resolved in V02a3 as `P07-ISSUE-001`. |
| `handleBusterSpawnFailure` | Worker spawn failed | Yes | Operator alert/Discord and telemetry | `module.operator_alert`; `module.failed` | `emitOperatorAlert`, `emitTerminalModuleFailTelemetry` | Terminal error. |
| `handleBusterFailOrBlockedStatus` | Infra crash retry/exhausted | Yes | Core log, Discord, telemetry on exhausted | WARN/CRITICAL crash events | `log`, `deps.discord`, `emitTerminalBusterCrashTelemetry` | Forge output preserved. |
| `handleBusterFailOrBlockedStatus` | Infra/config pre-test issue | Yes | Core log, Discord, telemetry | WARN/CRITICAL pre-test issue; `module.failed` | `log`, `deps.discord`, `emitTerminalModuleFailTelemetry` | Terminal needs-Nova. |
| `handleBusterFailOrBlockedStatus` | Repeated pre-test failure | Yes | Core log, Discord, telemetry | CRITICAL repeated pre-test; `module.failed` | `log`, `deps.discord`, `emitTerminalModuleFailTelemetry` | Terminal needs-Nova. |
| `handleBusterFailOrBlockedStatus` | Code pre-test/agent failure | Yes downstream | Failure service telemetry/Discord | retry/fail events | `handleModuleFail` | Retry result projected by outer loop. |
| `runModulePreflight` | Preflight validation failure | Yes | Core log, Discord, downstream failure telemetry | WARN preflight fail | `log`, `deps.discord`, `handleFail` | Retry result projected by outer loop. |
| `terminal-pass.js` | Save/telemetry failure | No local telemetry | none | none | Function propagates | Downstream service may log. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P08 modules | ESM, fs status existence checks, async control flow | No package pin in scoped files. |
| Node `fs` built-in | Runtime built-in | Node major 24 observed | `attempt.js` | Detect existing corrupt status file before blueprint release | Existence only; status parse delegated. |
| Plugin/worker registry | Internal source via P07 adapter | Internal | Dispatch and worker execution path | Buster worker adapter and validators | Missing/invalid handlers fail closed. |
| Status-store/lifecycle-state | Internal source | Internal | Attempt and Buster handlers | Status load/save, transitions, blocks, terminal finalize | Guarded status save issue tracked in P07-ISSUE-001. |
| Redis completion adjudicator | Internal source | Internal | `buster-phase.js` | Decide if Redis terminal status can update local status | Drift/conflict becomes blocked/fail-closed. |
| Telemetry/Discord services | Internal/external | Internal/external | All terminal/retry handlers | Operator alerts and module lifecycle events | Sink behavior reviewed elsewhere. |
| Git/blueprint/prompt/failure services | Internal source | Internal | `attempt.js`, dispatch/preflight handlers | Blueprint release, prompt building, sync, retry policy | Delegated through dependency seam. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Buster crash retry loop | Sequential retry loop | `max_buster_crash_retries` default 2 plus final attempt | Exhaustion marks module BLOCKED | WARN/CRITICAL Discord and telemetry | `P07-ISSUE-001` resolved in V02a3 for guarded-save failure. |
| Module attempt | Single phase at a time | Stages array | No parallel work inside attempt | Phase telemetry | None. |
| Buster worker polling | Delegated backend polling | Timeout minutes from module/config | Non-ok result classified by poll-failure handler | Worker/poll telemetry downstream | None. |
| Preflight/dependency checks | Synchronous/sequential before Forge | No queue | Failure blocks worker spawn | Discord/telemetry on failure | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Buster worker dispatch | Worker adapter result with `poll_result`, dispatch/gateway/session/status fields | `executeBusterWorkerAttempt` | Buster phase loop | Backend polling delegated | Routed by spawn/poll/terminal handlers. |
| Redis completion terminal evidence | Redis entry status/source/verdict/session fields | Buster Redis consumer/polling | Completion adjudicator and Buster handlers | No local throttle | `shouldApplyRedisCompletionToStatus` decides local application. |
| Active session correlation | Status/result/completion identity | Worker callbacks/status-store | Terminal telemetry/Discord/stop payloads | Saved by worker callbacks | Correlation fallback order in `identity.js`. |
| ACP rate-limit exit | Rate-limit result from poll failure | Polling/rate-limit service | P08 terminal result builder | Rate-limit service owns pause thresholds | Terminal rate-limit result. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Module runner slice extraction and exports | `tests/verification/contracts/check-module-runner-slice-surface.mjs` | Strong source/import/export coverage | Does not execute every Buster branch. |
| Worker control-result normalization | `tests/verification/contracts/check-worker-control-result-surface.mjs` | Strong contract coverage | Backend behavior covered elsewhere. |
| Buster crash exhaustion/correlation | `tests/verification/behavior/areas/module-failures.mjs` | Direct regression coverage | Previously failed; resolved in V02a3 under `P07-ISSUE-001`. |
| Normal pipeline module flow | `tests/verification/behavior/areas/pipeline.mjs` | Broad behavior coverage | Not focused on every failure class. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P07-ISSUE-001` was resolved in V02a3 and covers the previously observed P08 Buster crash-retry status guard failure.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
