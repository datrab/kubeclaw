# Batch B02a — Buster task orchestration top-level services

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/buster/pipeline/integrations/discord-webhook.js
skills/buster/pipeline/runners/suite-runner.js
skills/buster/pipeline/services/discord.js
skills/buster/pipeline/services/git-workflows.js
skills/buster/pipeline/services/orphan-recovery.js
skills/buster/pipeline/services/pipeline-helpers.js
skills/buster/pipeline/services/sandbox-cleanup.js
skills/buster/pipeline/services/task-completion.js
skills/buster/pipeline/services/task-lifecycle.js
```

Scope expansion verified live: 9 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/buster/pipeline/integrations/discord-webhook.js
kubeclaw-main/skills/buster/pipeline/runners/suite-runner.js
kubeclaw-main/skills/buster/pipeline/services/discord.js
kubeclaw-main/skills/buster/pipeline/services/git-workflows.js
kubeclaw-main/skills/buster/pipeline/services/orphan-recovery.js
kubeclaw-main/skills/buster/pipeline/services/pipeline-helpers.js
kubeclaw-main/skills/buster/pipeline/services/sandbox-cleanup.js
kubeclaw-main/skills/buster/pipeline/services/task-completion.js
kubeclaw-main/skills/buster/pipeline/services/task-lifecycle.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-buster-operator-surface.mjs
kubeclaw-main/tests/verification/contracts/check-buster-repo-scoped-paths.mjs
kubeclaw-main/tests/verification/contracts/check-buster-verify-task-scope.mjs
kubeclaw-main/tests/verification/behavior/areas/operator-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/shell-boundary.mjs
kubeclaw-main/tests/verification/behavior/areas/buster-runtime-normalization.mjs
```

## Per-file map

### `skills/buster/pipeline/integrations/discord-webhook.js`

Role: Repo-local compatibility facade for the shared Discord webhook integration.

Imports/dependencies: `../../../common/pipeline/integrations/discord-webhook.js`.

Exports/public surface: Re-exports all common Discord webhook exports.

Defines: No local logic.

Important variables/state: None.

Calls out to: Common helper module.

Called by / expected callers: `services/discord.js` imports `postDiscordWebhook` through this Buster-local production path.

Environment variables / CLI inputs / config fields: Delegated.

Paths built/read/written: None locally.

Authority behavior: Shim only.

Error/retry/terminal behavior: Import failure only locally; delivery behavior delegated to common helper.

Verification coverage: Common helper import contract and Buster Discord behavior tests.

Findings: None.

### `skills/buster/pipeline/runners/suite-runner.js`

Role: Deterministic Buster suite orchestrator for pre-agent tests.

Imports/dependencies: Node `path`/`fs`; suite modules `a11y`, `api`, `build`, `bundle`, `e2e`, `health`, `k8s`, `manifest`, `perf`, `security`, `unit`, `visual-reg`; verdict schema; Buster telemetry `emitEvent`.

Exports/public surface: `runSuiteWithTimeout`, `runSuites`, `EXECUTION_ORDER`, `DEPENDENCIES`.

Defines: `/sandbox/results`, default suite timeout `5 * 60 * 1000`, suite registry, execution order, dependency map, result writer.

Important variables/state: Per-run `results`, `suiteMap`, `criticalFailed`; no module-global mutable state besides constants.

Calls out to: Suite functions, filesystem writes under `/sandbox/results` and optional swarm test log dir, telemetry events `buster.suite_started` and `buster.suite_completed`.

Called by / expected callers: `services/task-lifecycle.js` top-level process task flow.

Environment variables / CLI inputs / config fields: Uses task payload `test_config` or `config`; reads `config.suite_timeout_ms`; uses `payload.project`, `payload.suites`, module id/attempt from caller.

Paths built/read/written: `/sandbox/results/*-verdict.json`, `/sandbox/results/runner-verdict.json`, optional `<logDir>/tests/suites.jsonl`, `<logDir>/tests/verdict[-attempt].json`, and per-suite verdict artifacts.

Authority behavior: Produces Buster suite verdict evidence used for pre-agent decision. Canonical task completion remains in lifecycle/completion stream.

Error/retry/terminal behavior: Missing suite becomes SKIP. Dependency failure skips dependent suite. Suite throw/timeout becomes ERROR verdict, critical only for build/health in catch path. Result artifact write failures are non-blocking WARN console messages.

Verification coverage: Buster pipeline slice asserts timeout wrapper clears handles; shell-boundary covers cleanup-adjacent suite resource tracking; downstream Buster behavior covers suite decisions.

Findings: None.

### `skills/buster/pipeline/services/discord.js`

Role: Buster Discord notification normalizer, actionability/correlation enricher, audit artifact writer, webhook sender, and Discord observability health tracker.

Imports/dependencies: Node `fs`/`path`; runtime webhook resolver; Buster telemetry context/event/close helpers; noncritical reporting; redaction `sanitizeDiscordMessage`; common webhook shim `postDiscordWebhook`.

Exports/public surface: `sendDiscord(message, context = {})`.

Defines: In-memory webhook/audit health maps keyed by `surface:project:run_id`; correlation normalizers; default Impact/Action/Evidence field builders; audit target resolver; webhook mute env check.

Important variables/state: `_discordWebhookHealth`, `_discordAuditHealth` degraded/restored state maps.

Calls out to: Filesystem Discord audit JSONL targets; optional telemetry context; `postDiscordWebhook`; stderr noncritical fallback.

Called by / expected callers: Task lifecycle notifications, rate-limit notifications, Buster operator surfaces.

Environment variables / CLI inputs / config fields: Reads `KUBECLAW_DISABLE_DISCORD_WEBHOOKS` for webhook mute. Resolves webhook from context override or `DISCORD_WEBHOOK_URL`/`DISCORD_WEBHOOK` through `runtime.js`. Context fields include project/run/module/gate/attempt/dispatch/session/log paths/telemetry/actionability.

Paths built/read/written: `<logDir>/discord.jsonl`, sibling `discord.jsonl` next to `pipeline_log_path`, run-scoped `discord.jsonl` next to `pipeline_run_log_path`.

Authority behavior: Operator notification and audit mirror only; does not own completion/status authority. Run-scoped Discord artifact is evidence for operator notifications.

Error/retry/terminal behavior: Audit write failure marks audit degraded, reports classified incident, and returns payload. Webhook delivery is fire-and-forget; failure marks webhook degraded and reports classified incident. Later success emits restored. Missing/muted webhook returns payload without delivery.

Verification coverage: `operator-surface.mjs` covers gate correlation, default actionability, run mirroring, and webhook degraded telemetry. `check-buster-operator-surface.mjs` checks canonical operator surfaces.

Findings: None.

### `skills/buster/pipeline/services/git-workflows.js`

Role: Buster Git sync and push workflow wrapper around shared git primitives.

Imports/dependencies: `getRepoRoot`, `gitExec`, `getCurrentBranch` from Buster git-primitive shim.

Exports/public surface: Re-exports `getRepoRoot`, `gitExec`, `getCurrentBranch`; exports `gitSync(repoRoot, expectedHash, opts)`, `gitPushWithRetry(repoRoot, branch, opts)`.

Defines: Fetch/reset sync strategy; push with pull-rebase retry strategy and optional commit path.

Important variables/state: No in-memory state.

Calls out to: Git CLI through `gitExec`; optional logger.

Called by / expected callers: Task lifecycle git-sync internals, orphan recovery repo-root resolution, `tools/verify-task.js` push helper.

Environment variables / CLI inputs / config fields: Inputs `repoRoot`, `expectedHash`, `branch`, `opts.maxAttempts`, `opts.retryDelayMs`, optional `opts.commitMessage`.

Paths built/read/written: Git working tree/index/HEAD; no direct filesystem paths in this file.

Authority behavior: Buster sync authority for task repo checkout. Optional commit path can stage whole repo.

Error/retry/terminal behavior: `gitSync` catches failures, logs WARN, returns `null`. `gitPushWithRetry` retries pull-rebase/push up to 3 attempts by default, aborts failed rebase between attempts, exponential backoff, throws final push error.

Verification coverage: Verify-task contract checks the current verify-task caller stages only swarm scope; no direct contract covers `gitPushWithRetry(..., { commitMessage })` broad staging.

Findings: `B02a-ISSUE-001`.

### `skills/buster/pipeline/services/orphan-recovery.js`

Role: Startup recovery for persisted Buster active-session state.

Imports/dependencies: Node `fs`; `getRepoRoot`; `resolveBusterActiveSessionPath`; common lifecycle shim `clearActiveSession`, `killSession`, `recoverActiveSession`; runtime diagnostics.

Exports/public surface: `recoverOrphanedActiveSession(options = {})`.

Defines: Persisted active-session JSON inspection and invalid-file cleanup helpers.

Important variables/state: Reads persisted active-session JSON and returns recovery result object; no module-global state.

Calls out to: Filesystem active-session path, common lifecycle recovery/kill/clear helpers, diagnostic artifact writer.

Called by / expected callers: Buster startup path in `buster-pipeline.js`.

Environment variables / CLI inputs / config fields: `options.activeStatePath`, `options.cwd`, `confirmTimeoutMs`, `confirmPollMs`, `cleanupConfirmTimeoutMs`; repo root fallback.

Paths built/read/written: `.swarm/logs/buster/active-session.json` resolved by helper; removes invalid file or preserves file when cleanup is unconfirmed.

Authority behavior: Startup recovery owns whether a persisted Buster active-session marker can be killed/cleared. It preserves evidence when kill is failed/unconfirmed.

Error/retry/terminal behavior: Malformed/missing child session key produces diagnostic and file cleanup attempt. Kill failure or unconfirmed kill returns `ok:false`, diagnostics, and preserves active-session file. Confirmed cleanup clears active session and reports cleaned diagnostic.

Verification coverage: `buster-runtime-normalization.mjs` covers startup crash recovery preservation unless kill confirmed.

Findings: None.

### `skills/buster/pipeline/services/pipeline-helpers.js`

Role: Buster path/result/status helper and canonical Discord embed builder surface.

Imports/dependencies: Node `fs`/`path`; `getRepoRoot`; lifecycle-state helpers; verdict schema; sandbox cleanup service.

Exports/public surface: Active-session path resolver, completion identity builder, rate-limit max pause resolver, status/output/result artifact path resolvers, Buster result resolver, active-agent mark/clear helpers, pre-test verdict builder, Discord embed builders, `doSandboxCleanup`.

Defines: Active-session path `.swarm/logs/buster/active-session.json`; embed footer `Buster Pipeline v2.0`.

Important variables/state: No module-global mutable state; helper functions mutate status JSON when invoked.

Calls out to: Filesystem status/result reads, atomic status JSON writes, lifecycle-state helper mutation, sandbox cleanup resources.

Called by / expected callers: Task lifecycle, task completion, orphan recovery, queue and operator surfaces.

Environment variables / CLI inputs / config fields: Reads payload fields `status_json_path`, `output_file`, `result_artifact_path`, `result_file`, `task_type`, `run_id`, `attempt`, `dispatch_id`, `session`, `rate_limit`, `acp_monitor`; no direct env.

Paths built/read/written: Repo-scoped status JSON, output file, result artifact; `.swarm/logs/buster/active-session.json`; sandbox cleanup paths through cleanup service.

Authority behavior: Result artifact/output file is preferred over legacy status JSON. Active-agent updates go through shared lifecycle-state helper and identity match guards. Completion key uses run/attempt plus dispatch/session correlation.

Error/retry/terminal behavior: Repo path escape throws. Missing/invalid JSON/status artifacts resolve to fail-closed result objects. Status update failures log WARN and return false. Sandbox cleanup policy chosen by scope/stage.

Verification coverage: `check-buster-pipeline-slice-surface.mjs` covers exports, active-agent identity, result artifact precedence, invalid gate output status. `check-buster-repo-scoped-paths.mjs` covers repo-scoped suite path handling adjacent to artifact policy.

Findings: None.

### `skills/buster/pipeline/services/sandbox-cleanup.js`

Role: Buster sandbox cleanup state tracker and policy-controlled destructive cleanup executor.

Imports/dependencies: Node `child_process.execFile`, `util.promisify`, `fs`, `path`; external binaries `podman`, `kubectl`, `nginx`.

Exports/public surface: Sandbox path constants, `CLEANUP_POLICY`, `buildCleanupScopeKey`, `getCleanupStatePath`, `listCleanupStatePaths`, `trackSandboxResources`, `cleanupSandboxResources`.

Defines: Sandbox root `/sandbox`, output dirs `/sandbox/www` and `/sandbox/results`, cleanup state dir `.buster-cleanup`, safe namespace regex `/^(buster|test)-/`, policies `task_scoped`, `startup_sweep`, `shutdown_sweep`, `disabled`.

Important variables/state: JSON state files record tracked `containers`, `images`, `namespaces`.

Calls out to: Atomic state JSON writes, sandbox output directory clearing, `podman stop/rm`, `podman image rm`, `kubectl delete namespace --wait=false`, `nginx -s stop`.

Called by / expected callers: Build/k8s suites track resources; pipeline helpers/task lifecycle run cleanup stages; tests verify policy behavior.

Environment variables / CLI inputs / config fields: Payload identity fields project/module/gate/task/attempt/run/dispatch; options `sandboxRoot`, `cleanupPolicy`, injected `execFileAsync`.

Paths built/read/written: `/sandbox/.buster-cleanup/<scope>.json`, `/sandbox/www`, `/sandbox/results` and configured sandbox root equivalents.

Authority behavior: Cleanup acts only on tracked resources or bounded sandbox output dirs according to policy. Namespace deletion rejects names outside `buster-`/`test-` prefixes.

Error/retry/terminal behavior: Missing/not-found podman/kubectl/nginx errors can be ignored by regex. Failed cleanup leaves remaining resources in state file for retry and returns `ok:false`; policy denial returns evidence without execution.

Verification coverage: `shell-boundary.mjs` covers task-scoped cleanup, startup sweep, disabled policy denial, sibling preservation, sweep, and retry preservation.

Findings: None.

### `skills/buster/pipeline/services/task-completion.js`

Role: Redis completion and dead-letter helper enforcing completion/dead-letter before ACK.

Imports/dependencies: Completion identity fields helper and sanitized runtime error helper.

Exports/public surface: `DEFAULT_DEAD_LETTER_SUFFIX`, `createTaskCompletionState`, `buildTaskCompletionFields`, `emitTaskCompletion`, `resolveDeadLetterStream`, `buildTaskDeadLetterFields`, `writeTaskDeadLetter`, `didProcessResultEmitTerminalCompletion`, `ensureTaskTerminalBeforeAck`.

Defines: Redis completion field arrays and dead-letter field arrays.

Important variables/state: Completion state object `{attempted, terminal, stream, error}` passed by lifecycle/queue.

Calls out to: Redis `xadd` on completion and dead-letter streams.

Called by / expected callers: Task lifecycle completion signal internals and task queue ACK precondition.

Environment variables / CLI inputs / config fields: `BUSTER_TASK_DEAD_LETTER_STREAM`; payload `completion_stream`, `dead_letter_stream`, identity fields, sender/type, payload JSON.

Paths built/read/written: Redis streams only; no filesystem paths.

Authority behavior: Completion stream is the preferred terminal signal. Dead-letter is fallback evidence that allows ACK only when completion cannot be emitted.

Error/retry/terminal behavior: Missing completion stream may skip if no terminal attempt/error. Fallback completion failure falls through to dead-letter. If both completion and dead-letter fail, returns `terminal_guarantee_failed` so caller must not ACK.

Verification coverage: `buster-runtime-normalization.mjs` covers terminal-before-ACK, dead-letter-before-ACK, and no ACK when both fail.

Findings: None.

### `skills/buster/pipeline/services/task-lifecycle.js`

Role: Top-level Buster task orchestration from validated payload through cleanup, Git sync, suites, session spawn/monitor/kill/outcome, final cleanup, telemetry, Discord, and completion signal.

Imports/dependencies: Node `path.join`; Buster telemetry; suite runner; logger; Discord; pipeline helpers; task validation; runtime diagnostics; task-completion state; task-lifecycle internal cleanup/git/session/completion modules.

Exports/public surface: `getLastRunLogDir`, `processTask(payload, opts)`.

Defines: `TASK_LIFECYCLE_STATE.lastRunLogDir`; local Discord helpers; process stage machine.

Important variables/state: Per-task outcome/reason/stage/spawn/session/completion/suites state; module-global last run log dir for status command.

Calls out to: Validation, telemetry, logger, sandbox cleanup, git sync, suite runner, Discord, session spawn/monitor/kill/outcome internals, completion signal, status active-agent clear, telemetry close.

Called by / expected callers: Buster entrypoint/task queue.

Environment variables / CLI inputs / config fields: Payload `suites`, `test_config`/`config`, `serve_type`, `commit_hash`, `project`, `run_id`, `attempt`, `timeout_seconds`, `session.timeout_seconds`, `status_json_path`, `log_dir`, pipeline log paths, gate/session identity; opts `telemetryEnabled`.

Paths built/read/written: Default log dir `.swarm/logs/buster/<module>/attempt-<attempt>`, `buster-pipeline.jsonl`, status JSON path, sandbox/result paths via callees, Discord artifacts and completion streams via callees.

Authority behavior: Coordinates but delegates completion emission to `completion-signal.js`, active-agent state to helpers, and result authority to artifact/session helpers. Final `buster.task_completed` telemetry is emitted regardless of exit path after validation succeeds.

Error/retry/terminal behavior: Git sync failure, critical suite failure, spawn/monitor failure, and internal error return fail task result. `finally` always runs final cleanup, active-agent clear, completion signal, logger flush, and telemetry close after validation succeeds.

Verification coverage: Buster pipeline slice and runtime normalization cover exports, monitor handling, terminal completion behavior, Discord surface, cleanup catches.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `services/task-lifecycle.js` | `runners/suite-runner.js` | `runSuites` | Executes ordered pre-agent suites and returns suite summary/critical decision. |
| `services/task-lifecycle.js` | `services/discord.js` | `sendDiscord` | Sends suite, failure, session/operator embeds with task correlation. |
| `services/task-lifecycle.js` | `services/pipeline-helpers.js` | status/result/embed helpers | Resolves status path, clears active agent, builds embeds. |
| `services/task-lifecycle.js` | `services/task-completion.js` | `createTaskCompletionState` | Tracks whether terminal completion was emitted. |
| `services/pipeline-helpers.js` | `services/sandbox-cleanup.js` | `cleanupSandboxResources` | Chooses cleanup policy for generic cleanup entrypoints. |
| `services/task-completion.js` | `services/pipeline-helpers.js` | `buildCompletionIdentityFields` | Adds run/attempt/dispatch/session/completion key fields to Redis completion. |
| `services/orphan-recovery.js` | `services/pipeline-helpers.js` | `resolveBusterActiveSessionPath` | Locates persisted active-session state. |
| `services/orphan-recovery.js` | `agents/lifecycle.js` | `recoverActiveSession`, `killSession`, `clearActiveSession` | Startup orphan cleanup path. |
| `services/discord.js` | `integrations/discord-webhook.js` | `postDiscordWebhook` | Fire-and-forget webhook delivery. |
| `services/git-workflows.js` | `git-primitives.js` | `gitExec`, `getCurrentBranch` | Fetch/reset/rebase/push workflow. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `suite-runner.js checkDependencies` | Previous critical dependency FAIL or ERROR | `DEPENDENCIES`, completed suite map | Return skip reason | Prevents dependent suites from running after critical blockers. |
| `suite-runner.js runSuites` | Missing suite registry entry | Suite name | SKIP verdict and completion telemetry | Unknown suite is non-terminal evidence, not a crash. |
| `suite-runner.js runSuites` | Suite throw/timeout | Promise race result | ERROR verdict; build/health marked critical in catch | Preserves deterministic suite result shape. |
| `discord.js sendDiscord` | Message shape contains embeds/content/files | input message | Normalize full message or wrap as one embed | Supports legacy embed-call surface. |
| `discord.js sendDiscord` | Webhook muted/missing | context and env | Return audit payload without delivery | Operator audit persists even when webhook disabled. |
| `git-workflows.js gitSync` | Expected hash present | `expectedHash` | Reset hard to hash or `origin/<currentBranch>` | Deterministic task checkout when commit supplied. |
| `git-workflows.js gitPushWithRetry` | Optional `commitMessage` present | `opts.commitMessage` | Runs `git add -A` and commit before push loop | Broad staging issue captured in B02a finding. |
| `orphan-recovery.js recoverOrphanedActiveSession` | Active file absent/invalid/recoverable | Active-session JSON | No-op, diagnostic+cleanup, or kill recovery | Startup crash recovery policy. |
| `pipeline-helpers.js resolveBusterAgentResult` | Rate-limited, non-terminal, gate, module artifact | session result and task type | RATE_LIMITED/TIMEOUT/gate output/result artifact/legacy status outcome | Completion outcome authority routing. |
| `sandbox-cleanup.js normalizeCleanupPolicy` | Policy name/object/stage and payload scope | cleanup policy, stage, payload | task-scoped/startup/shutdown/disabled profile | Destructive cleanup guardrail. |
| `task-completion.js ensureTaskTerminalBeforeAck` | Completion already emitted, stream missing, fallback fail | process result, payload, error | Already-emitted/no-stream/fallback completion/dead-letter/terminal guarantee failed | ACK safety invariant. |
| `task-lifecycle.js processTask` | Git/suite/spawn/monitor/internal stages | stage results | FAIL/NO_SUBAGENT/session outcome/final completion | Top-level task terminal routing. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `suite-runner.js writeResults` | Suite verdict artifacts | suite map, module/project/attempt | Writes runner verdict plus each suite, attempt suffix in swarm dir | Best-effort evidence. |
| `discord.js` health maps | `_discordWebhookHealth`, `_discordAuditHealth` | degraded/restored events by project/run/surface | Emit degraded once until restored success | Avoids duplicate degradation spam. |
| `discord.js appendCorrelationFields` | Embed fields | existing field names and correlation | Preserve existing Impact/Action/Evidence/correlation fields; append missing | Canonical operator actionability. |
| `pipeline-helpers.js markBusterActiveAgent` | status JSON active_agent | previous active_agent, payload, sessionData | New session values win, previous fallback retained | Atomic status update via lifecycle helper. |
| `pipeline-helpers.js clearBusterActiveAgent` | status JSON active_agent | expected run/attempt/dispatch/session | Clear only if tracked identity matches | Prevents clearing another active session. |
| `sandbox-cleanup.js trackSandboxResources` | cleanup state JSON | existing state and new resources | Unique merge of containers/images/namespaces | Cleanup can accumulate resources over suite stages. |
| `sandbox-cleanup.js cleanupStateFile` | cleanup state JSON | cleanup successes/failures | Remove cleaned resources, rewrite remaining, unlink empty state | Failed cleanup remains retryable. |
| `task-lifecycle.js processTask` | per-task lifecycle state | stage outcomes | outcome/reason updated as stages progress; finally emits final state | Final completion sees latest reason/outcome. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `suite-runner.js runSuites` | Iterate ordered suites | None | Per-suite `suite_timeout_ms` or 300000 ms | All suites processed, with SKIP/ERROR on blockers. |
| `suite-runner.js runSuiteWithTimeout` | Promise race | Timer only | Caller-provided suite timeout | Suite resolves/rejects or timeout rejects; timeout cleared in finally. |
| `git-workflows.js gitPushWithRetry` | Attempts `1..maxAttempts` | Exponential `retryDelayMs * 2^(attempt-1)` | Pull timeout 30000 ms, push timeout 60000 ms | Push success returns; final failure throws. |
| `sandbox-cleanup.js cleanupStateFile` | Iterate tracked containers/images/namespaces | External command timeouts | podman 30000 ms, kubectl 15000 ms | Every tracked resource attempted; remaining state persisted. |
| `task-lifecycle.js processTask` | Linear stage flow | Delegated to callee services | Session timeout defaults 1800s and delegated to session internals | Returns after failure or completed outcome; finally always runs. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `KUBECLAW_DISABLE_DISCORD_WEBHOOKS` | Env var | `discord.js discordWebhookDeliveryMuted` | unset/false means delivery allowed | `1`, `true`, `yes` mute delivery but audit still writes. |
| `DISCORD_WEBHOOK_URL`, `DISCORD_WEBHOOK` | Env vars via runtime helper | `discord.js buildCorrelationContext` | context override first | Webhook URL source for Buster Discord. |
| `BUSTER_TASK_DEAD_LETTER_STREAM` | Env var | `task-completion.js resolveDeadLetterStream` | `${streamKey}:dead-letter` | Dead-letter stream override. |
| `payload.test_config` / `payload.config` | Task payload config | `suite-runner.js`, `task-lifecycle.js` | `{}` | Suite timeout and suite-specific configs. |
| `config.suite_timeout_ms` | Task config | `suite-runner.js runSuites` | 300000 ms | Per-suite safety timeout. |
| `payload.suites` | Task payload | `task-lifecycle.js`, `suite-runner.js` | `[]` | Ordered according to `EXECUTION_ORDER`. |
| `payload.status_json_path`, `output_file`, `result_artifact_path`, `result_file` | Task payload paths | `pipeline-helpers.js` | missing path returns null/fail result | Repo-scoped by helper. |
| `payload.log_dir`, `pipeline_log_path`, `pipeline_run_log_path` | Task payload paths | `task-lifecycle.js`, `discord.js` | `.swarm/logs/buster/<module>/attempt-<attempt>` | Controls logs and Discord audit mirrors. |
| `payload.completion_stream`, `dead_letter_stream` | Redis stream names | `task-completion.js` | missing stream can skip; dead-letter suffix default | Completion/ACK safety. |
| `cleanupPolicy`, `sandboxRoot`, `execFileAsync` | Cleanup options | `sandbox-cleanup.js` | inferred policy, `/sandbox`, promisified `execFile` | Test injection and destructive cleanup guardrail. |
| `opts.commitMessage`, `maxAttempts`, `retryDelayMs` | Git workflow options | `git-workflows.js` | no commit, 3 attempts, 2000 ms base | Commit path currently broad stages. |
| `opts.telemetryEnabled` | Runtime option | `task-lifecycle.js` | telemetry context default | Overrides Buster telemetry context. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `/sandbox/results/*-verdict.json`, `/sandbox/results/runner-verdict.json` | `suite-runner.js` | Operators/tests | `writeResults` | Scratch suite evidence. |
| `<logDir>/tests/suites.jsonl` | `suite-runner.js` | Operators/tests | suite log sink | Best-effort suite event artifact. |
| `<logDir>/tests/verdict[-attempt].json`, `<suite>-verdict[-attempt].json` | `suite-runner.js` | Operators/tests | `writeResults` | Durable Buster suite evidence. |
| `<logDir>/discord.jsonl` and pipeline/run sibling `discord.jsonl` | `discord.js resolveDiscordAuditTargets` | Operators/tests | `persistDiscordArtifact` | Operator audit mirror. |
| `.swarm/logs/buster/active-session.json` | `pipeline-helpers.js resolveBusterActiveSessionPath` | orphan recovery/lifecycle | common lifecycle helpers | Active-session recovery evidence. |
| Repo-scoped status/output/result paths | `pipeline-helpers.js` | result resolver/status helper | active-agent helper writes status JSON | Result artifact/output file preferred over legacy status JSON. |
| `/sandbox/.buster-cleanup/<scope>.json` | `sandbox-cleanup.js getCleanupStatePath` | cleanup service | `trackSandboxResources`, `cleanupStateFile` | Cleanup retry state. |
| `/sandbox/www`, `/sandbox/results` | cleanup constants | cleanup service/operators | `cleanupSandboxResources` clears contents by policy | Bounded sandbox output cleanup only. |
| Redis completion/dead-letter streams | payload/env fields | Nova/task queue | `task-completion.js` Redis `xadd` | Completion/dead-letter before ACK invariant. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Buster suite verdict evidence | `suite-runner.js` | task lifecycle/operators | None. |
| Buster Discord audit artifacts | `discord.js` | operators/tests | Notification evidence only. |
| Buster repo sync/reset state | `git-workflows.js gitSync` | task lifecycle | Broad optional commit path tracked as B02a issue. |
| Buster active-agent status projection | `pipeline-helpers.js` via lifecycle-state helper | Nova/status readers/recovery | None. |
| Buster result outcome from child agent | `pipeline-helpers.js resolveBusterAgentResult` | task lifecycle/completion | Result artifact/output file preferred; legacy status fallback. |
| Buster sandbox cleanup state | `sandbox-cleanup.js` | cleanup service/startup sweeps | None. |
| Buster Redis terminal completion/dead-letter | `task-completion.js` and lifecycle internals | Nova poller/task queue | None. |
| Buster task lifecycle terminal orchestration | `task-lifecycle.js` | task queue/Nova completion stream/operators | Internals mapped in B02b. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Suite result object | Suite modules / `suite-runner.js` | `suite`, `status`, optional `critical`, `duration_ms`, `reason`, `error`, `findings`, `checks_passed`, `checks_failed`, `top_finding` | `createSuiteVerdict`, suite code | `runSuites`, Discord embeds, completion telemetry. |
| Runner verdict | `createRunnerVerdict` via suite runner/helper | Module/project plus suite verdict map | verdict schema | Suite artifacts/pre-test verdict. |
| Discord audit entry | `discord.js persistDiscordArtifact` | `ts`, `channel:'discord'`, `source:'buster'`, module/gate/project/run/attempt/dispatch/session, `actionability`, `payload` | `sanitizeDiscordMessage`, append field helpers | Operators/tests. |
| Cleanup state file | `sandbox-cleanup.js trackSandboxResources` | `containers:string[]`, `images:string[]`, `namespaces:string[]` | `mergeState`, `uniqueValues` | Cleanup sweeps. |
| Cleanup result | `cleanupSandboxResources` | `ok`, `duration_seconds`, `cleanup_policy`, `cleaned`, optional `errors`, optional `policy_denied` | local policy/result builders | Task lifecycle/logs/tests. |
| Completion stream fields | `buildTaskCompletionFields` | Redis flat fields: `type=completion`, `module`, `status`, `outcome`, `source`, `reason`, `summary`, identity fields, `timestamp`, optional verdict/max pauses | `buildCompletionIdentityFields` | Nova poller/task queue. |
| Dead-letter stream fields | `buildTaskDeadLetterFields` | Redis flat fields: `type=task_dead_letter`, source/reason/detail/phase/stream/id/sender/type/project/module/gate/run/attempt/dispatch/completion/payload metadata/timestamp | `safeErrorMessage`, flat JSON conversion | Task queue/operators. |
| Process task result | `task-lifecycle.js` | `{ outcome, reason, completion }` where completion is state object | lifecycle local state | task queue ACK guarantee. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Buster task lifecycle session handoff | `task-lifecycle.js` | None generated in scoped file | Passes `payload.prompt \|\| ''` to `spawnTaskSession`; prompt construction lives outside B02a | Session spawn/monitor/kill internal services | Child agent must produce result artifact/output file consumed by `resolveBusterAgentResult`. |
| Buster operator Discord embeds | `pipeline-helpers.js`, `discord.js` | `discord.jsonl` audit artifacts | Suite/session/failure embed fields plus Impact/Action/Evidence enrichment | Discord webhook payload `{content?, embeds[]}` | Operator-visible notification and audit payload. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `suite-runner.js runSuiteWithTimeout` | Suite timeout or thrown error | No within runner | Per-suite timeout default 300000 ms | ERROR verdict, critical for build/health catch path | Error message stored in verdict. |
| `suite-runner.js writeResults/logSink` | Suite artifact append/write failure | No | One write attempt | Non-blocking WARN and continue | None beyond message. |
| `discord.js persistDiscordArtifact` | Audit JSONL write failure | Yes on future send | One write per target per notification | Marks audit degraded, reports incident, returns payload | `sanitizeDiscordMessage`; incident detail controlled. |
| `discord.js postDiscordWebhook` | Webhook delivery failure | Yes on future send | Fire-and-forget one webhook call | Marks webhook degraded and reports incident; task continues | Message sanitized before delivery. |
| `git-workflows.js gitSync` | Fetch/reset/hash failure | No local retry | Fetch timeout 30000 ms | Logs WARN and returns `null` | Git error first line only. |
| `git-workflows.js gitPushWithRetry` | Rebase/push failure | Yes | Up to 3 attempts, exponential backoff, pull timeout 30000 ms, push timeout 60000 ms | Throws final push failure; may try push after final rebase failure | Git error first line in logs. |
| `orphan-recovery.js recoverOrphanedActiveSession` | Invalid active-session JSON or cleanup failure | Cleanup attempted once | File unlink once; killSession once with common confirm options | Diagnostic and `ok:false` on unconfirmed/failed kill; preserves file when unconfirmed | `safeErrorMessage`/diagnostic sanitizers. |
| `pipeline-helpers.js resolve*Path` | Payload path escapes repo root | No | None | Throws; caller catches at lifecycle/task level | Path in error. |
| `pipeline-helpers.js resolveBusterAgentResult` | Missing/invalid artifact/status/result | No | None | Fail-closed outcome/reason summary object | JSON parse error message included. |
| `pipeline-helpers.js updateTrackedStatusJson` | Status update read/write failure | No | One atomic write attempt | WARN and returns false | Error message only. |
| `sandbox-cleanup.js cleanupStateFile` | podman/kubectl/nginx failure | Retry later via remaining state | Command timeouts 30000/15000/5000 ms; ignore not-found patterns | Returns errors and preserves failed tracked resources | Command stderr/stdout/error captured. |
| `task-completion.js ensureTaskTerminalBeforeAck` | Completion xadd failure | Dead-letter fallback | One completion attempt then one dead-letter attempt | Allows ACK only if completion or dead-letter succeeds; otherwise terminal guarantee failed | `safeErrorMessage` for dead-letter detail. |
| `task-lifecycle.js processTask` | Git/suite/spawn/monitor/internal failure | Delegated by stage | Linear stages; final cleanup always after validation | Returns fail task result and finally emits completion signal | `safeErrorMessage` for internal error. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `suite-runner.js runSuiteWithTimeout` | Suite timeout/throw | Yes | Buster telemetry and verdict artifacts | `buster.suite_completed`, suite verdict | `emitSuiteCompleted`, `writeResults` | ERROR verdict carries reason/error. |
| `suite-runner.js writeResults/logSink` | Artifact write failure | Partial | stdout/stderr console only | `[SUITE-RUNNER] non-blocking ...` | `warnNonBlocking` | Non-terminal; no structured telemetry. |
| `discord.js persistDiscordArtifact` | Audit write failure | Yes | Telemetry and stderr incident | `observability.degraded` surface `audit_log`; classified incident | `markDiscordAuditDegraded`, `reportBusterDiscordIncident` | Restored on later successful audit write. |
| `discord.js postDiscordWebhook` | Webhook delivery failure | Yes | Telemetry and stderr incident | `observability.degraded` surface `webhook`; classified incident | `markDiscordWebhookDegraded`, `reportBusterDiscordIncident` | Restored on later successful webhook delivery. |
| `git-workflows.js gitSync` | Fetch/reset/hash failure | Partial | Logger if supplied | WARN `Git sync failed` | local `log` | Task lifecycle converts null to task failure/Discord/completion. |
| `git-workflows.js gitPushWithRetry` | Rebase/push failure | Partial | Logger if supplied | WARN rebase/push attempt | local `log` | Final throw caller owns telemetry. |
| `orphan-recovery.js recoverOrphanedActiveSession` | Invalid file/kill failed/unconfirmed | Yes | Process diagnostic JSONL and console | `observability.degraded` diagnostic record | `reportBusterRuntimeDiagnostic` | Preserves active-session file on unconfirmed cleanup. |
| `pipeline-helpers.js resolve*Path` | Path escape throw | Indirect | Task lifecycle catch/log/Discord/completion | task failure embed/completion | caller `processTask` | Helper itself emits none. |
| `pipeline-helpers.js resolveBusterAgentResult` | Missing/invalid result | Indirect | Task lifecycle Discord/completion | session complete/failure and completion stream | caller outcome publication | Helper returns fail result. |
| `pipeline-helpers.js updateTrackedStatusJson` | Status update failure | Partial | console WARN | `[STATUS] Failed to update ...` | local catch | No structured telemetry; low-risk cleanup path. |
| `sandbox-cleanup.js cleanupStateFile` | Cleanup command failure | Yes through caller | Cleanup result telemetry/log from task lifecycle cleanup stage | sandbox cleanup event/result | `runSandboxCleanupStage` caller | Service result includes errors; state preserved. |
| `task-completion.js ensureTaskTerminalBeforeAck` | Completion/dead-letter failure | Yes via Redis evidence when possible; otherwise return failure | Redis completion/dead-letter stream or task queue error path | completion/dead-letter/terminal guarantee failure | `emitTaskCompletion`, `writeTaskDeadLetter`, caller queue | No ACK if both fail. |
| `task-lifecycle.js processTask` | Stage/internal failure | Yes | Buster telemetry, Discord, logger, completion stream | `buster.task_completed`, failure embed, completion | lifecycle finally/catch | Validation errors before telemetry context are caller-owned. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Common Discord webhook helper | Internal `skills/common/pipeline/integrations/discord-webhook.js` | Internal | `discord-webhook.js`, `discord.js` | Webhook HTTP delivery | Shim import failure at module load. |
| Node `fs`/`path` | Built-in | Node 24 observed in B01 | Suite runner, Discord, helpers, cleanup, recovery | JSONL/artifact/state path operations | Failures are mostly non-terminal except guarded path throws. |
| Git CLI | System `git` via common primitive | Runtime installed | `git-workflows.js` | fetch/reset/rebase/push/rev-parse | Sync returns null; push retries/throws. |
| Redis stream client | Provided to task completion | `ioredis` elsewhere | `task-completion.js` | completion/dead-letter `xadd` | Caller owns connection/errors. |
| `podman` | System binary | Runtime installed | `sandbox-cleanup.js` | stop/rm containers/images | Not-found ignored; failures preserved for retry. |
| `kubectl` | System binary | Runtime installed | `sandbox-cleanup.js` | delete tracked namespaces | Namespace names must start `buster-` or `test-`. |
| `nginx` | System binary | Runtime installed | `sandbox-cleanup.js` | stop sandbox web server | Not-running errors ignored. |
| Buster suite modules | Internal source | Internal | `suite-runner.js` | Deterministic pre-agent checks | Missing registry entry becomes SKIP. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Suite execution | Sequential ordered loop | `EXECUTION_ORDER`; suite timeout default 300000 ms | Timeout becomes ERROR verdict | suite telemetry/verdicts | None. |
| Discord webhook delivery | Fire-and-forget Promise per send | Webhook mute env; no queue | Failure degraded event/incident; task not blocked | Discord audit and telemetry | None. |
| Discord degraded state | Map per surface/project/run | In-memory | Suppresses duplicate degraded until restored | restored/degraded telemetry | State resets on process restart. |
| Git push retry | Serial attempts | max 3, base delay 2000 ms | Final failure throws | logger/caller telemetry | Broad commit path tracked. |
| Sandbox cleanup | Serial resource cleanup loops | command timeouts 30s/15s/5s | Remaining resources persisted | cleanup result/errors | None. |
| Task completion ACK guard | Completion xadd then dead-letter xadd | completion stream/dead-letter stream | No ACK if both fail | Redis evidence or terminal guarantee failure | None. |
| Task lifecycle | One linear process per task invocation | queue controls external concurrency | Finally cleanup/completion after stage return | task telemetry/logs/completion | Queue concurrency outside B02a. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Buster task lifecycle session handoff | `payload.prompt`, `timeoutSeconds`, status path, module/project/task/session identity passed to `spawnTaskSession` | `task-lifecycle.js` | B02b session internals/common ACP runtime | One spawn after suites pass | Session data and Discord spawn embed. |
| Buster monitor/outcome handoff | `sessionData`, `sessionResult`, `elapsedSeconds`, `dispatchIdForCompletion`, `sessionKeyForCompletion` | B02b monitor internals returned to `task-lifecycle.js` | `publishTaskOutcome`, completion signal | Linear kill then outcome publication | Task result/completion/Discord. |
| Orphaned active-session recovery | Persisted active-session record containing child session key/runtime/model/labels | common lifecycle helper recovered by `orphan-recovery.js` | Startup recovery | One kill request with confirmation options | process diagnostics and active-session file preservation/clear. |
| Completion stream identity | Redis completion fields with run/attempt/dispatch/session/completion key | `task-completion.js` | Nova dual-channel poller/task queue | One xadd per fallback/completion signal | Redis completion stream. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Suite timeout wrapper clears timeout and Buster helper exports stay stable | `check-buster-pipeline-slice-surface.mjs` | Good | None. |
| Discord operator actionability, run mirroring, gate correlation, webhook degradation | `operator-surface.mjs`, `check-buster-operator-surface.mjs` | Good | None. |
| Sandbox cleanup uses argv-safe scoped commands, policy denial, state preservation | `shell-boundary.mjs` | Good | None. |
| Result artifact precedence, active-agent identity clear, rate-limit max pause projection | `check-buster-pipeline-slice-surface.mjs` | Good | None. |
| Verify-task current caller stages only swarm scope | `check-buster-verify-task-scope.mjs` | Good for caller | Gap: `gitPushWithRetry` optional commitMessage broad staging tracked as B02a issue. |
| Completion/dead-letter before ACK | `buster-runtime-normalization.mjs` | Good | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `B02a-ISSUE-001` — `gitPushWithRetry(..., { commitMessage })` stages the entire worktree with `git add -A`.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
