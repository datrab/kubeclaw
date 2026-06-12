# Batch P03 — Nova integrations and external control boundaries

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/integrations/*.js
skills/nova/pipeline/services/discord-fields.js
skills/nova/pipeline/services/redis-log.js
skills/nova/pipeline/tools/redis.js
```

Scope expansion verified live: 7 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/integrations/discord-webhook.js
kubeclaw-main/skills/nova/pipeline/integrations/discord.js
kubeclaw-main/skills/nova/pipeline/integrations/gateway.js
kubeclaw-main/skills/nova/pipeline/integrations/git-worktree.js
kubeclaw-main/skills/nova/pipeline/services/discord-fields.js
kubeclaw-main/skills/nova/pipeline/services/redis-log.js
kubeclaw-main/skills/nova/pipeline/tools/redis.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/common/pipeline/integrations/discord-webhook.js
kubeclaw-main/skills/common/pipeline/integrations/gateway.js
kubeclaw-main/tests/verification/behavior/areas/discord-correlation.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
kubeclaw-main/tests/verification/contracts/check-observability-catch-reporting.mjs
kubeclaw-main/tests/verification/contracts/check-redis-completion-service-surface.mjs
kubeclaw-main/tests/verification/contracts/check-redis-log-ownership.mjs
kubeclaw-main/tests/verification/contracts/check-strict-cli-args-surface.mjs
kubeclaw-main/tests/verification/runtime/check-nova-startup-smoke.mjs
kubeclaw-main/tests/verification/live/redis-backend-smoke.mjs
```

## Per-file map

### `skills/nova/pipeline/integrations/discord-webhook.js`

Role: Repo-local Nova compatibility facade for shared Discord webhook HTTP delivery.

Imports/dependencies: Static re-export from `../../../common/pipeline/integrations/discord-webhook.js`.

Exports/public surface: Re-exports common `DiscordWebhookDeliveryError` and `postDiscordWebhook`.

Defines: No local functions or state.

Important variables/state: None locally. Adjacent common owner defines default timeout `10000` ms and HTTP error body preview cap `500` chars.

Calls out to: Static ESM re-export only. Adjacent common owner calls `fetch` with JSON body and timeout signal.

Called by / expected callers: `integrations/discord.js` imports `postDiscordWebhook` for operator Discord delivery.

Environment variables / CLI inputs / config fields: None in scoped shim.

Paths built/read/written: Static relative import path only.

Authority behavior: Compatibility shim only; common helper owns Discord webhook delivery implementation and production overwrite assumptions.

Error/retry/terminal behavior: No local handling. Common `postDiscordWebhook` throws `DiscordWebhookDeliveryError` for missing URL, missing fetch, non-OK HTTP response, timeout/network/fetch failures; no retry in helper.

Verification coverage: `check-observability-catch-reporting.mjs` includes this surface; Discord integration behavior is exercised through `discord-correlation.mjs`.

Findings: None.

### `skills/nova/pipeline/integrations/discord.js`

Role: Operator Discord notification/audit integration with sanitization, correlation extraction, health degradation/restoration, and test override seams.

Imports/dependencies: Node `fs`, `path`; core logger/runtime stats; telemetry degraded/restored emitters; noncritical reporting; redaction; Discord webhook facade.

Exports/public surface: `discord(config, level, title, description, fields)`, `discordEmbeds(config, embeds, opts)`.

Defines: Correlation parsing helpers, health-key/degraded/restored state, incident reporting, audit JSONL writer, webhook mute logic, test override resolver.

Important variables/state: Module-level `_discordWebhookHealth` and `_discordAuditHealth` maps keyed by surface/project/run id; increments `stats.discord_notifications_sent` on successful webhook delivery.

Calls out to: `sanitizeDiscordMessage`, `postDiscordWebhook`, `emitObservabilityDegraded`, `emitObservabilityRestored`, `reportClassifiedNonBlockingError`, `getRunStats`, `fs.mkdirSync`, `fs.appendFileSync`, test override functions.

Called by / expected callers: Notification contract, plugin contexts, gates/runners/failure presentation, rate-limit surfaces, tests.

Environment variables / CLI inputs / config fields: Reads `process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS`; reads config `_disable_discord_webhooks`, `_testOverrides`, `discord_webhook_url`, `discord_alerts[level]`, `project`, `_runId`, `run_id`, `_logDir`, `_runLogDir`.

Paths built/read/written: Writes audit JSONL to `<config._logDir>/pipeline/discord.jsonl` and `<config._runLogDir>/discord.jsonl` when log dirs exist. No reads.

Authority behavior: Owns Nova Discord operator notification/audit delivery boundary. Audit JSONL is best-effort; Discord webhook delivery is optional based on config/env/alert level.

Error/retry/terminal behavior: Wrapper catches all errors and reports noncritical incidents. Audit write failures mark audit degraded, log WARN, and return `{ ok:false }`. Webhook delivery failures mark webhook degraded, log WARN, and return. Stats update failures report noncritical DEBUG incidents. No retry/backoff locally.

Verification coverage: `discord-correlation.mjs` covers field correlation/audit entries and shared `discord-fields.js` import use. Observability catch-reporting contract includes Discord integration.

Findings: None.

### `skills/nova/pipeline/integrations/gateway.js`

Role: Repo-local Nova compatibility facade for shared OpenClaw gateway invocation helpers.

Imports/dependencies: Static re-export from `../../../common/pipeline/integrations/gateway.js`.

Exports/public surface: Re-exports common `resolveGatewayBaseUrl`, `resolveGatewayInvokeUrl`, `resolveGatewayHealthUrl`, `resolveGatewayToken`, `gatewayInvoke`.

Defines: No local functions or state.

Important variables/state: None locally. Adjacent common owner defines default base URL `http://127.0.0.1:18789`, invoke path `/tools/invoke`, health path `/health`, network retry classifier, and retry loop.

Calls out to: Static ESM re-export only. Adjacent common owner calls `fetch` and `sleep`.

Called by / expected callers: Cost/session/runtime helpers and verification session launch library use gateway invocation surfaces.

Environment variables / CLI inputs / config fields: None in scoped shim. Adjacent common owner reads `OPENCLAW_GATEWAY_URL`, `GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `GATEWAY_TOKEN` and optional invocation overrides.

Paths built/read/written: URL strings only; no filesystem paths.

Authority behavior: Compatibility shim only; common helper owns gateway endpoint/token resolution and request retry semantics.

Error/retry/terminal behavior: No local handling. Common owner retries network-like errors up to `maxRetries` (default 3), sleeps `retryDelayMs` (default 5000 ms), times each request with `timeoutMs` (default 30000 ms), and throws HTTP/non-retry/final errors.

Verification coverage: `check-critical-dynamic-imports.mjs` asserts gateway invocation is statically imported by cost service; runtime session launch helper imports common gateway directly.

Findings: None.

### `skills/nova/pipeline/integrations/git-worktree.js`

Role: Nova Git worktree policy for polling pulls, commit/pull/push synchronization, runtime-state stash handling, and Forge-to-Buster Git handoff.

Imports/dependencies: Node `fs`, `path`; logger/runtime/status constants; shared Git context; failure classifiers; lifecycle tracked-agent count; lifecycle status transition helper; `sleep`.

Exports/public surface: Re-exports Git primitives and `classifyGitPushError`; exports `assessPollingPullSafety`, `isRuntimeStatePath`, `gitPullForPolling`, `gitPullBeforePush`, `gitPushWithRetry`, `gitCommitAndPush`, `gitSyncBeforeBuster`.

Defines: Runtime-state path classification, porcelain parsing/partitioning, stash collect/restore, dirty/unpushed checks, polling safety error, rebase auto-resolve for runtime state, pull core, push retry, commit-and-push flow, Buster handoff sync.

Important variables/state: No module-global mutable state. Mutates passed module `status` in `gitSyncBeforeBuster` by setting `forge_commit_hash`, `forge_diff_stat`, and transitioning status to `READY_FOR_TESTING`. Increments run stats `git_pull_failures`/`git_push_failures` via active run stats.

Calls out to: `gitExec`, `invalidateHeadHash`, `headHash`, `getTrackedAgentCount`, `transitionModuleStatus`, `classifyGitPushError`, `sleep`, `fs.existsSync`.

Called by / expected callers: Module runners, polling services, blueprint/gate-fix release flows, and tests using injected deps.

Environment variables / CLI inputs / config fields: Uses `process.env.GIT_EDITOR='true'` for `git rebase --continue`; reads `config.repo_root`, `config.project`, and run stats context.

Paths built/read/written: Git commands operate in `config.repo_root`; checks `.git/rebase-merge` and `.git/rebase-apply`; classifies `.swarm/logs`, `.swarm/modules/*/status.json`, `*-gate-status.json`, summary/project-summary paths as runtime state; writes Git index/commits/stashes/pushes through Git commands.

Authority behavior: Owns Nova-side non-destructive Git worktree policy. Polling pull fails closed unless worktree is clean/safe; before-push pull refuses non-runtime conflict auto-resolution; runtime-state-only stash conflicts may be auto-resolved in favor of pulled checkout.

Error/retry/terminal behavior: Polling unsafe state throws `POLLING_GIT_UNSAFE`; dirty non-runtime state before stash throws structured `GIT_SYNC_FAILED`; non-runtime rebase conflicts throw `GIT_REBASE_CONFLICT`; push retries transiently by fixed attempt count/delay; `softFail` commit-and-push logs warning and returns error object. No telemetry beyond logs/stats in scoped file.

Verification coverage: Module failure tests inject git sync behavior; public index tests assert Git policy helpers are not exported publicly. Direct runtime-state auto-resolve coverage appears limited.

Findings: `P03-ISSUE-001` added for `isRuntimeStatePath` rejecting relative `.swarm/...` paths, which prevents `tryAutoResolveRebaseForRuntimeState` from recognizing Git conflict paths returned by `git diff --name-only`.

### `skills/nova/pipeline/services/discord-fields.js`

Role: Thin re-export of canonical Discord identity field builders from rate-limit contract.

Imports/dependencies: Static re-export from `./rate-limit-contract.js`.

Exports/public surface: `DISCORD_FIELD_SPECS`, `buildDiscordIdentityFields`, `buildSessionRateLimitDiscordFields`.

Defines: No local functions or state.

Important variables/state: None.

Calls out to: Static ESM re-export only.

Called by / expected callers: Module runner, Buster/review/approval/gate runners, pipeline shared helpers, orchestration, failure presentation, rate-limit builders, tests.

Environment variables / CLI inputs / config fields: None in scoped file.

Paths built/read/written: None.

Authority behavior: Compatibility/export surface; `rate-limit-contract.js` owns actual field schema and builders.

Error/retry/terminal behavior: No local handling.

Verification coverage: `discord-correlation.mjs` asserts key callers import this shared surface.

Findings: None.

### `skills/nova/pipeline/services/redis-log.js`

Role: Non-blocking JSONL artifact logger for Redis exchanges and Redis operation traces.

Imports/dependencies: Node `fs`, `path`; noncritical reporting; Redis log path builder; runtime run id.

Exports/public surface: `getRedisLogTargets`, `appendRedisArtifactRecord`, `logRedisExchange`, `logRedisOperation`, `logRedisSent`, `logRedisReceived`, `closeRedisLog`.

Defines: Noncritical incident reporter, plain-object guard, run-scoped Redis log dir builder, payload truncation/serialization fallback, sync JSONL append writer.

Important variables/state: None; sync writes only. `closeRedisLog()` returns static `{ ok:true, closed:false, reason:'redis_log_uses_sync_jsonl_writes' }`.

Calls out to: `redisLogDir`, `getRunId`, `fs.mkdirSync`, `fs.appendFileSync`, `reportClassifiedNonBlockingError`.

Called by / expected callers: Redis dispatch/completion services and observability surfaces. Contract asserts this module is canonical Redis exchange logging owner.

Environment variables / CLI inputs / config fields: Reads `config._logDir`, `config._runLogDir`, and run id from config/context.

Paths built/read/written: Writes `<redisLogDir(config)>/redis-exchanges.jsonl`, `<redisLogDir(config)>/redis-ops.jsonl`, `<config._runLogDir>/redis/redis-exchanges.jsonl`, and `<config._runLogDir>/redis/redis-ops.jsonl`.

Authority behavior: Owns Redis exchange artifact schema and Redis operation artifact schema. Logging is explicitly non-blocking.

Error/retry/terminal behavior: Non-object records and no targets return skipped results; per-target append failures report noncritical incidents and return `ok:false`; payload serialization failure writes bounded marker and reports incident; outer failures return `ok:false`. No retry/backoff.

Verification coverage: `check-redis-log-ownership.mjs` asserts this module owns Redis exchange helper and observability does not duplicate it.

Findings: None.

### `skills/nova/pipeline/tools/redis.js`

Role: Static Redis adapter and CLI wrapper for Buster task dispatch, completion reads, completion archive, Discord task logging, and completion-service compatibility re-exports.

Imports/dependencies: Node `url`, `fs`, `path`, `module.createRequire`; strict CLI flag parser; `ioredis` via candidate require paths; Redis completion service; dynamic imports of Discord/redaction only for optional task Discord logging.

Exports/public surface: Default `lib` with `client`, `setLogCallback`, `sendTask`, `readCompletion`, `archiveCompletions`, `disconnect`; re-exports Redis completion service helpers.

Defines: Redis singleton, package require fallback, Redis connection factory, Discord field/context helpers, optional Discord task logger, log callback seam, Buster stream key, CLI actions `send`, `read-completion`, `archive-completions`.

Important variables/state: Module-level `_redis` singleton and `_logCallback`; `WEBHOOK_URL` captures `process.env.DISCORD_WEBHOOK` at module evaluation; `BUSTER_STREAM` captures `process.env.BUSTER_TASK_STREAM || 'swarm:buster:tasks'`.

Calls out to: Redis `xadd`, `once('ready')`, `quit`; completion scan/archive helpers; dynamic `import('../integrations/discord.js')` and `import('../redaction.js')`; `parseCliFlagValues`; stdout/stderr/process exit.

Called by / expected callers: Static adapter registry, orchestration dispatch, polling completion services, CLI invocations, live Redis smoke tests.

Environment variables / CLI inputs / config fields: Reads `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `AGENT_NAME`, `DISCORD_WEBHOOK`, `BUSTER_TASK_STREAM`; CLI reads `--action`, `--type`, `--iteration`, `--payload`, `--stream`, `--module`, `--run-id`, `--attempt`, `--dispatch-id`, `--session-key`.

Paths built/read/written: Resolves current entry path with `fs.realpathSync(fileURLToPath(import.meta.url))`; no artifact paths written directly. Discord logging infers log dirs from payload `pipeline_log_path` and `pipeline_run_log_path`.

Authority behavior: Owns Nova Redis adapter surface for Buster dispatch/completion compatibility; canonical completion identity selection lives in `services/redis-completion.js`. Adapter registry owns whether this adapter is selectable.

Error/retry/terminal behavior: Redis client retry strategy caps per-connection retry delay at 2000 ms and `maxRetriesPerRequest=3`; `sendTask` waits for `ready` if not ready; weak completion identity logs rejection and returns null; Discord task logging catches and ignores all errors; log callback errors ignored; CLI catches errors, prints JSON `{ error }`, exits 1, and disconnects in finally.

Verification coverage: `check-critical-dynamic-imports.mjs` asserts adapter registry statically imports this tool; `check-redis-completion-service-surface.mjs` asserts completion helper ownership/re-exports; `check-strict-cli-args-surface.mjs` includes this CLI; live Redis smoke imports adapter and exercises completion read.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `integrations/discord.js` | `integrations/discord-webhook.js` | `postDiscordWebhook` | Webhook delivery after audit/test/mute/config gates. |
| `integrations/discord.js` | `services/telemetry.js` | `emitObservabilityDegraded`, `emitObservabilityRestored` | Discord webhook/audit health transitions. |
| `integrations/discord.js` | `noncritical-reporting.js` | incident helpers | Wrapper/stats nonblocking incident reporting. |
| `integrations/git-worktree.js` | `core/git-context.js` | Git primitives | Repo-scoped Git command/hash/cache operations. |
| `integrations/git-worktree.js` | `services/failures.js` | `FAIL_PATTERNS`, `classifyGitPushError` | Git error code classification. |
| `integrations/git-worktree.js` | `agents/lifecycle.js` | `getTrackedAgentCount` | Polling pull safety gate. |
| `integrations/git-worktree.js` | `lifecycle-state.js` | `transitionModuleStatus` | Forge-to-Buster status mutation after Git sync. |
| `services/discord-fields.js` | `services/rate-limit-contract.js` | re-exported field builders/specs | Central Discord field schema surface. |
| `services/redis-log.js` | `core/paths.js` | `redisLogDir` | Canonical Redis artifact directory. |
| `services/redis-log.js` | `core/runtime.js` | `getRunId` | Run id for Redis JSONL records. |
| `tools/redis.js` | `services/redis-completion.js` | scan/archive/identity helpers | Completion ownership lives in service helper. |
| `tools/redis.js` | `integrations/discord.js`, `redaction.js` | dynamic imports in `logToDiscord` | Optional task notification path; errors ignored. |
| `integrations/gateway.js` | `skills/common/pipeline/integrations/gateway.js` | `export *` | Nova compatibility facade. |
| `integrations/discord-webhook.js` | `skills/common/pipeline/integrations/discord-webhook.js` | `export *` | Nova compatibility facade. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `integrations/discord.js discord/discordEmbeds` | Test override, mute flag/env, missing webhook, disabled alert level | Config/env/level | Audit first, then override or skip or webhook deliver | Operator notifications are optional and testable. |
| `integrations/discord.js appendDiscordAuditEntries` | No embeds or no log dirs | Embeds/config | Return ok without writes | Audit logging is best-effort. |
| `integrations/discord.js health transitions` | Previous degraded state exists | Health maps | Emit degraded only once and restored on later success | Prevents repeated degradation spam. |
| `integrations/git-worktree.js assessPollingPullSafety` | Active sessions, runtime-only dirty state, unsafe dirty state, unpushed commits | Tracked agents, git status/upstream | Skip, fail, or allow pull | Protects shared worktree from destructive polling pulls. |
| `integrations/git-worktree.js _gitPullCore` | Pull succeeds, rebase in progress, destructive recovery allowed | Git pull result and `.git/rebase-*` dirs | Return ok, auto-resolve runtime conflicts, abort/rethrow/reset | Central Git pull recovery policy. |
| `integrations/git-worktree.js collectRuntimeStateStash` | Dirty entries include non-runtime paths | Git porcelain entries | Throw structured `GIT_SYNC_FAILED`; otherwise stash runtime paths | Prevents stashing source/config changes silently. |
| `integrations/git-worktree.js gitPushWithRetry` | Attempt count and classified failure | Git push error | Sleep/retry until max; throw on final | Fixed retry behavior for transient push failures. |
| `services/redis-log.js logRedisExchange` | Payload large or unserializable | Payload JSON size/serialization | Truncate to bounded preview or marker | Prevents Redis log bloat and serialization crashes. |
| `tools/redis.js readCompletion` | Expected completion identity weak | `run_id`, `attempt`, `dispatch_id`, `session_key` | Emit log callback and return null | Prevents stale completion reads. |
| `tools/redis.js CLI wrapper` | `--action` value | CLI flags | Dispatch send/read/archive or throw | Single executable entrypoint for Redis operations. |
| `common gateway invokeGatewayTool` | Network-like error and attempts left | Error classifier/attempt | Retry after sleep; HTTP and final failures throw | Gateway retry boundary. |
| `common discord postDiscordWebhook` | Missing URL/fetch or non-OK response | URL/fetch/HTTP response | Throw delivery error | Webhook delivery fail-closed to caller. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `integrations/discord.js` | `_discordWebhookHealth`, `_discordAuditHealth` | Project/run/surface health events | First degraded wins until restored; restored merges previous and new correlation | Health state is per project/run/surface. |
| `integrations/discord.js` | Run stats `discord_notifications_sent` | Successful webhook delivery | Increment if stats object available | Delivery count is best-effort. |
| `integrations/git-worktree.js gitSyncBeforeBuster` | Module status object | Commit hash/diff stat/Git sync result | Set commit hash, set diff stat or null, transition to `READY_FOR_TESTING` | Buster handoff records Forge commit. |
| `tools/redis.js` | `_redis` singleton | Redis env/config | Lazy instantiate once; `disconnect` quits and clears | Adapter reuses Redis client per process. |
| `tools/redis.js` | `_logCallback` | `setLogCallback(fn)` | Replace callback | Redis ops can be mirrored to caller artifacts. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `integrations/git-worktree.js tryAutoResolveRebaseForRuntimeState` | While Git rebase dirs exist | None | None | Break when no rebase dirs or throw on non-runtime/new conflict. |
| `integrations/git-worktree.js gitPushWithRetry` | `attempt <= maxRetries` | `sleep(delayMs)`, default 5000 ms | Git push timeout 60000 ms per attempt | Return on success; throw on final failure. |
| `services/redis-log.js appendRedisArtifactRecord` | Iterate log targets | None | None | Returns ok false if any target failed. |
| `tools/redis.js requireFirst` | Iterate package candidates | None | None | Return first require success; throw last error. |
| `tools/redis.js sendTask` | Wait once for Redis `ready` when not ready | Redis client's retryStrategy min(times*50,2000) | `maxRetriesPerRequest=3` | Continue after ready event; Redis errors reject caller. |
| `common gateway invokeGatewayTool` | `attempt <= maxRetries` | `sleep(retryDelayMs)`, default 5000 ms | AbortController timeout default 30000 ms | Return parsed/raw response; throw non-network/final error. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `KUBECLAW_DISABLE_DISCORD_WEBHOOKS` | Environment variable | `integrations/discord.js` | unset/false | `1`, `true`, or `yes` mutes webhook delivery after audit logging. |
| `config._disable_discord_webhooks` | Config/test field | `integrations/discord.js` | false | Mutes webhook delivery. |
| `config.discord_webhook_url` | Config field | `integrations/discord.js` | Required for webhook delivery | Missing URL skips delivery. |
| `config.discord_alerts.<level>` | Config field | `integrations/discord.js` | Level-specific | `discord()` sends only when level flag truthy; `discordEmbeds()` does not check level flags. |
| `config._testOverrides.*.discord/discordEmbeds` | Test override | `integrations/discord.js` | None | Priority list checks multiple override namespaces before generic object scan. |
| `OPENCLAW_GATEWAY_URL`, `GATEWAY_URL` | Environment variables | Common `integrations/gateway.js` via Nova shim | `http://127.0.0.1:18789` | Invoke suffix is normalized. |
| `OPENCLAW_GATEWAY_TOKEN`, `GATEWAY_TOKEN` | Environment variables | Common `integrations/gateway.js` via Nova shim | empty | Adds Bearer authorization when present. |
| `REDIS_HOST` | Environment variable | `tools/redis.js getRedis` | `redis-master.kubeclaw.svc.cluster.local` | Redis host. |
| `REDIS_PORT` | Environment variable | `tools/redis.js getRedis` | `6379` | Parsed with `parseInt`. |
| `REDIS_PASSWORD` | Environment variable | `tools/redis.js getRedis` | undefined | Redis password. |
| `AGENT_NAME` | Environment variable | `tools/redis.js sendTask` | `nova` | Redis task sender field. |
| `DISCORD_WEBHOOK` | Environment variable | `tools/redis.js` | Captured at module load | Optional Redis task Discord logging URL. |
| `BUSTER_TASK_STREAM` | Environment variable | `tools/redis.js` | `swarm:buster:tasks` | Redis stream for Buster tasks. |
| `GIT_EDITOR` | Environment variable override | `git-worktree.js tryAutoResolveRebaseForRuntimeState` | Sets `true` for `git rebase --continue` command | Prevents editor prompt. |
| Redis CLI flags | CLI input | `tools/redis.js` | `--action` required; `--iteration=1`; `--payload={}` | Actions: `send`, `read-completion`, `archive-completions`. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `<config._logDir>/pipeline/discord.jsonl` | `integrations/discord.js appendDiscordAuditEntries` | Operators/tests | Discord audit writer | Project-scoped audit mirror. |
| `<config._runLogDir>/discord.jsonl` | `integrations/discord.js appendDiscordAuditEntries` | Operators/tests | Discord audit writer | Run-scoped audit mirror. |
| `.git/rebase-merge`, `.git/rebase-apply` | Git; checked by `git-worktree.js` | Git pull recovery | Git | Determines rebase recovery state. |
| `.swarm/logs/**`, `.swarm/modules/*/status.json`, `*-gate-status.json`, summary/project-summary paths | `git-worktree.js isRuntimeStatePath` | Git safety/stash/rebase logic | Runtime services outside P03 | Runtime-state allowlist; relative-path bug tracked in `P03-ISSUE-001`. |
| `<redisLogDir(config)>/redis-exchanges.jsonl` | `services/redis-log.js` | Operators/replay | Redis log writer | Project-scoped Redis exchange artifact. |
| `<redisLogDir(config)>/redis-ops.jsonl` | `services/redis-log.js` | Operators/replay | Redis log writer | Project-scoped Redis operation artifact. |
| `<config._runLogDir>/redis/redis-exchanges.jsonl` | `services/redis-log.js` | Operators/replay | Redis log writer | Run-scoped Redis exchange artifact. |
| `<config._runLogDir>/redis/redis-ops.jsonl` | `services/redis-log.js` | Operators/replay | Redis log writer | Run-scoped Redis operation artifact. |
| Redis stream `BUSTER_TASK_STREAM` | `tools/redis.js` | Buster Redis consumers | `tools/redis.js sendTask` | Defaults to `swarm:buster:tasks`. |
| Redis archive stream `<stream>:log` | `tools/redis.js` CLI | Completion readers/archive tooling | `archiveCompletions` | CLI archive action appends `:log`. |
| Gateway invoke URL `/tools/invoke` and health URL `/health` | Common gateway helper | Gateway clients | None | URL-only external API boundary. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Discord webhook delivery state | `integrations/discord.js` | Telemetry degraded/restored events, operators | None. |
| Discord audit JSONL | `integrations/discord.js appendDiscordAuditEntries` | Operators/tests | None. |
| Gateway endpoint/token resolution | `skills/common/pipeline/integrations/gateway.js` via Nova shim | Gateway callers | None. |
| Nova Git worktree policy | `integrations/git-worktree.js` | Module runners/polling/gate fix/blueprint flows | Relative runtime-state path classification issue tracked as `P03-ISSUE-001`. |
| Shared Discord field schema surface | `services/rate-limit-contract.js`, re-exported by `services/discord-fields.js` | Runners/failure/rate-limit Discord builders | Full schema reviewed in rate-limit batch. |
| Redis exchange and ops JSONL artifacts | `services/redis-log.js` | Redis services/operators | None. |
| Nova Redis adapter surface | `tools/redis.js`, selected by `services/adapter-registry.js` | Orchestration/polling/completion services | Completion algorithm authority is `services/redis-completion.js`. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Discord correlation object | `integrations/discord.js` | `{ run_id, session_key, gateway_label, attempt, module_id, gate_id, gate_type, dispatch_id }`, nullable values | Field-name normalizers and `parseAttemptValue` | Audit entries and observability degraded/restored events. |
| Discord audit entry | `integrations/discord.js appendDiscordAuditEntries` | `ts`, `project`, `run_id`, correlation fields, `level`, `title`, `description`, `fields` | `sanitizeDiscordMessage`, field extraction | JSONL audit readers/operators. |
| Discord webhook payload | `integrations/discord.js` | `{ embeds: [{ title, description, color?, fields?, footer?, timestamp? }] }` | `sanitizeDiscordMessage` | Discord webhook API. |
| Observability degraded/restored detail | `integrations/discord.js` | `component:'discord'`, `surface`, `reason`, `detail`, correlation fields, degraded/restored timestamps, optional `restored_after_ms` | Local formatter functions | Telemetry/observability services. |
| Polling safety result | `git-worktree.js assessPollingPullSafety` | `{ safe, action:'skip'\|'fail'\|'pull', reason, details }` | Git status/upstream checks | Polling pull caller. |
| Structured Git error metadata | `git-worktree.js createStructuredGitError` | `error.code`, `error.gitSync: { code, repo_root, project, ...details }` | Local constructor | Module runner/failure handling. |
| Git commit result | `git-worktree.js gitCommitAndPush` | `{ committed: boolean, hash?: string, error?: string }` | Git command flow | Git sync callers. |
| Redis artifact record | `services/redis-log.js appendRedisArtifactRecord` | Arbitrary plain object serialized as JSONL | Plain-object guard | Redis artifact logs. |
| Redis exchange entry | `services/redis-log.js logRedisExchange` | `ts`, `run_id`, `direction`, `type`, `scope`, `scope_id`, `payload` | Payload JSON size/serialization guard | Redis exchange JSONL. |
| Redis operation entry | `services/redis-log.js logRedisOperation` | `ts`, `run_id`, plus event fields | Caller-supplied event | Redis ops JSONL. |
| Redis task stream entry | `tools/redis.js sendTask` | XADD fields `type`, `sender`, `payload` JSON string, `iteration`, `timestamp` | Redis stream write; payload JSON stringify | Buster task consumers. |
| Redis adapter send result | `tools/redis.js sendTask` | `{ status:'sent', id, stream }` | Redis XADD success | Orchestration callers. |
| Redis CLI error output | `tools/redis.js` | JSON `{ error: string }` to stderr | CLI catch | Operators/automation. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | None | None |

`tools/redis.js` dispatches task payloads to Buster and logs a Discord task summary, but scoped files do not build agent prompts or define prompt instructions.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| Common `postDiscordWebhook` via shim | Missing URL/fetch, HTTP non-OK, timeout/network/fetch failure | No local retry | AbortSignal timeout default 10000 ms | Throws `DiscordWebhookDeliveryError` | Error body preview capped at 500 chars. |
| `integrations/discord.js appendDiscordAuditEntries` | Audit filesystem write failure | No | No retry/backoff | Mark audit degraded, log WARN, return `{ ok:false }` | Embed data sanitized before audit write. |
| `integrations/discord.js discord/discordEmbeds` | Webhook delivery failure | No local retry | No retry/backoff | Mark webhook degraded, log WARN, return | Payload sanitized before delivery. |
| `integrations/discord.js discord/discordEmbeds` | Stats update failure or wrapper failure | No | No retry/backoff | Noncritical incident; wrapper swallows | Wrapper failure can suppress detail. |
| Common `gatewayInvoke` via shim | Network-like gateway error | Yes | Up to 3 attempts by default, 5000 ms delay, 30000 ms timeout | Retries network errors, throws final/non-network/HTTP errors | None. |
| `git-worktree.js gitPullForPolling` | Active sessions or runtime-only dirty state | Not error | No retry/backoff | Skips pull with INFO log | None. |
| `git-worktree.js gitPullForPolling` | Dirty unsafe worktree or unpushed commits | No | No retry/backoff | Throws `POLLING_GIT_UNSAFE` | None. |
| `git-worktree.js _gitPullCore` | Rebase conflict | Conditional recovery | Runtime-only auto-resolve loop; otherwise abort/rethrow | Returns recovered or throws conflict/manual recovery error | None. |
| `git-worktree.js gitPushWithRetry` | Git push failure | Yes until max attempts | Default 3 attempts, 5000 ms delay, 60000 ms command timeout | Logs WARN per retry, throws final | None. |
| `git-worktree.js gitCommitAndPush` | Git add/commit/pull/push/stash failure | Caller-selected soft fail | Push retry only | Throws by default; `softFail` returns `{ committed:false,error }` | None. |
| `services/redis-log.js append/log` | Bad record/no target/append/serialization/outer failure | No | No retry/backoff | Returns skipped/ok false; reports noncritical incidents for failures | Payload capped at 2048 chars or serialization marker. |
| `tools/redis.js requireFirst/getRedis` | `ioredis` unavailable or Redis client errors | Redis client retry strategy | Retry delay min(times*50,2000), `maxRetriesPerRequest=3` | Package require throws at import; client errors logged to stderr | None. |
| `tools/redis.js logToDiscord/emitLog` | Discord task logging or log callback failure | No | No retry/backoff | Errors ignored | Discord payload summarized/redacted by imported redaction helpers. |
| `tools/redis.js readCompletion` | Weak expected identity | No | No retry/backoff | Emits log callback and returns null | Logs identity fields only. |
| `tools/redis.js CLI wrapper` | Invalid flags/action/payload/Redis error | No | Redis client may retry internally | Prints JSON error to stderr and exits 1 | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| Common `postDiscordWebhook` via shim | Delivery failure | No in helper | none | none | Helper throws | Caller `integrations/discord.js` emits degradation/logs. |
| `integrations/discord.js appendDiscordAuditEntries` | Audit write failure | Yes | Observability telemetry plus core log | `observability.degraded` surface `audit_log`; WARN log | `markDiscordAuditDegraded` | Audit write loss is surfaced once per degraded period. |
| `integrations/discord.js discord/discordEmbeds` | Webhook delivery failure | Yes | Observability telemetry plus core log | `observability.degraded` surface `webhook`; WARN log | `markDiscordWebhookDegraded` | Restored event emitted on later success. |
| `integrations/discord.js discord/discordEmbeds` | Stats/wrapper failure | Yes | Noncritical reporting log/stderr | classifications `stats_update_failed`, `notification_wrapper_failed` | `reportDiscordIncident` | Wrapper failure suppresses error detail for security. |
| Common `gatewayInvoke` via shim | Gateway failures | No direct telemetry | none | none | Helper throws | Callers own logging/telemetry. |
| `git-worktree.js gitPullForPolling` | Skipped pull | Yes | Core logger | INFO skip message | `log` | Not a telemetry event. |
| `git-worktree.js gitPullForPolling` | Unsafe polling pull | No direct telemetry | none | none | Function throws | Caller owns logging. |
| `git-worktree.js _gitPullCore` | Rebase conflict/recovery | Yes | Core logger | WARN/OK/ERROR log lines | `log` | No structured telemetry in scoped file. |
| `git-worktree.js gitPushWithRetry` | Push retry/final failure | Yes | Core logger and run stats on final failure | WARN/ERROR logs; `git_push_failures` | `log`, `incrementStat` | No Redis/Discord telemetry here. |
| `git-worktree.js gitCommitAndPush` | Soft failure | Yes | Core logger | WARN `Git commit+push failed (soft)` | `log` | Hard failures propagate to caller. |
| `services/redis-log.js append/log` | Append/serialization/outer failure | Yes | Noncritical reporting log/stderr | classifications `redis_artifact_append_failed`, `redis_exchange_payload_serialization_failed`, etc. | `reportRedisLogIncident` | No retry; returns failure result. |
| `tools/redis.js requireFirst/getRedis` | Package/client errors | Partial | stderr for client errors | `[Redis Error]` | Redis client `error` handler | Package load failure occurs at import with no local telemetry. |
| `tools/redis.js logToDiscord/emitLog` | Optional Discord/log callback failure | No | none | none | catch blocks ignore | Intentional non-blocking optional logging. |
| `tools/redis.js readCompletion` | Weak expected identity | Yes if callback installed | Caller-provided Redis op log callback | `read_completion_rejected_weak_identity` | `emitLog` | Without callback, no emitted record. |
| `tools/redis.js CLI wrapper` | CLI/Redis errors | Yes | stderr JSON | `{ error }` | CLI catch | Exits non-zero after error. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P03 modules | ESM, fetch, AbortSignal, fs/path, process/env | `tools/redis.js` uses dynamic import for optional Discord logging. |
| Git binary | System `git` through shared helper | Observed `2.39.5` during review | `git-worktree.js` | Pull/rebase/stash/add/commit/push/status/diff | Failures throw through `gitExec`; selected paths are classified/recovered. |
| Redis package | `ioredis` | Loaded via `requireFirst`; not pinned in scoped file | `tools/redis.js` | Redis task/completion adapter | Import tries `ioredis`, `/app/node_modules/ioredis`, `/usr/local/lib/node_modules/ioredis`; throws last error if missing. |
| Discord HTTP API | Webhook URL with global `fetch` | External service | Common `postDiscordWebhook`, `integrations/discord.js` | Operator notifications | Delivery failures degrade observability. |
| OpenClaw gateway HTTP API | `fetch` to `/tools/invoke` | External local service | Common `gatewayInvoke` via shim | Gateway tool invocation | Network errors retried; HTTP errors throw. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | Discord audit, Git rebase dir checks, Redis logs, Redis CLI realpath | Filesystem artifacts and path checks | Sync writes/checks; many failures are non-blocking. |
| Shared redaction helpers | `../redaction.js` | Internal source | Discord integration and Redis tool optional Discord log | Sanitize Discord messages/payload summaries | Redaction implementation reviewed in common/helper batches. |
| Redis completion service | `services/redis-completion.js` | Internal source | `tools/redis.js` | Completion identity scan/archive | Full algorithm reviewed in polling/completion batch. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Discord webhook delivery | One awaited HTTP POST per call | Common timeout 10000 ms | Failure marks degraded and returns; no queue/retry | Observability degraded/restored | None. |
| Discord audit writes | Synchronous append per target/embed | Up to project/run targets | Append failure degrades audit surface; call continues | WARN + observability degraded | None. |
| Gateway invoke | Sequential retry loop | Default 3 attempts, 5000 ms delay, 30000 ms timeout | Final/non-network/HTTP failure throws | Caller-owned telemetry | None. |
| Git push | Sequential retry loop | Default 3 attempts, 5000 ms delay, 60000 ms Git timeout | Final failure increments stat and throws | Core logs/stat | None. |
| Git rebase auto-resolve | While rebase dirs exist | No sleep/timeout | Non-runtime/new unresolved conflict throws | Core logs | Relative path bug tracked. |
| Redis client | Single module-level client | Redis retry delay min(times*50,2000), maxRetriesPerRequest=3 | Client emits stderr errors; commands reject | stderr only | None. |
| Redis artifact logs | Synchronous append per target | Project/run mirrors | Per-target failure reported, no retry | Noncritical incident | None. |
| Redis completion scan/archive | Delegated to `services/redis-completion.js` | Not defined in scoped file | Service-owned | Log callback records scanned/batches | Review in P17. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | None | None |

P03 scoped files touch external Discord/Gateway/Git/Redis boundaries but define no ACP session, transcript, delta, monitor, or flush protocol.

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Discord correlation fields and audit entries | `tests/verification/behavior/areas/discord-correlation.mjs` | Good behavior coverage for field extraction/audit paths | Does not cover every webhook failure status. |
| Discord webhook/gateway static import boundaries | `tests/verification/contracts/check-critical-dynamic-imports.mjs`, `check-observability-catch-reporting.mjs` | Good source-contract coverage | Common helper behavior covered indirectly. |
| Redis completion helper ownership/re-exports | `tests/verification/contracts/check-redis-completion-service-surface.mjs` | Strong source/export coverage | Completion algorithms reviewed in P17. |
| Redis log ownership | `tests/verification/contracts/check-redis-log-ownership.mjs` | Strong ownership coverage | Direct append failure behavior not exhaustively tested. |
| Strict CLI parser use in Redis tool | `tests/verification/contracts/check-strict-cli-args-surface.mjs` | Good source-contract coverage | CLI runtime action errors not all executed. |
| Git worktree policy public boundary | `tests/verification/behavior/areas/foundations.mjs` | Verifies Git helpers are not public index exports | Direct runtime-state relative path classification missing; see issue. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P03-ISSUE-001` — Git runtime-state classifier rejects relative `.swarm/...` paths, so runtime rebase/stash auto-resolution can miss Git conflict paths.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
