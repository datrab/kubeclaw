# Batch B05 — Buster support services and tools

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/buster/pipeline/services/base-images.js
skills/buster/pipeline/services/rate-limit.js
skills/buster/pipeline/services/rate-limit-contract.js
skills/buster/pipeline/services/telemetry.js
skills/buster/pipeline/tools/redis.js
skills/buster/pipeline/tools/verify-task.js
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/buster/pipeline/services/base-images.js
kubeclaw-main/skills/buster/pipeline/services/rate-limit.js
kubeclaw-main/skills/buster/pipeline/services/rate-limit-contract.js
kubeclaw-main/skills/buster/pipeline/services/telemetry.js
kubeclaw-main/skills/buster/pipeline/tools/redis.js
kubeclaw-main/skills/buster/pipeline/tools/verify-task.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/common/pipeline/services/rate-limit-contract.js
kubeclaw-main/skills/common/pipeline/telemetry.js
kubeclaw-main/tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-buster-verify-task-scope.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
kubeclaw-main/tests/verification/contracts/check-strict-cli-args-surface.mjs
kubeclaw-main/tests/verification/contracts/check-telemetry-contract.mjs
```

## Per-file map

### `skills/buster/pipeline/services/base-images.js`

Role: Base container-image reference validator, progress-derived image collector, and Podman pre-pull orchestrator.

Imports/dependencies: Node `child_process.execFile`, `util.promisify`, `fs`, `path.join`; `getRepoRoot`; `safeErrorMessage`; system `podman`.

Exports/public surface: `BASE_IMAGES_STATIC`, `normaliseImage(name)`, `validateBaseImageRef(imageRef)`, `loadBaseImagesFromProgress()`, `ensureBaseImages(images, options)`.

Defines: Static Python/Node base image set, Docker-image-reference regex, module-local mutable `BASE_IMAGES` set, invalid-image warning path.

Important variables/state: `BASE_IMAGES` starts from `BASE_IMAGES_STATIC` and is mutated by `loadBaseImagesFromProgress()` using `.swarm/progress.json`.

Calls out to: Repo filesystem, JSON parse, Podman `image exists` and `pull` through argv-safe `execFile`.

Called by / expected callers: Buster runtime/startup warmup path; tests may inject `options.execFileAsync` for pre-pull behavior.

Environment variables / CLI inputs / config fields: No direct env/CLI reads. Reads `progress.base_images` and `progress.modules.*.test_config.serve.image`.

Paths built/read/written: Reads `<repoRoot>/.swarm/progress.json`; no writes.

Authority behavior: Owns the in-process base-image candidate set and validates all pre-pull refs before Podman execution.

Error/retry/terminal behavior: Missing progress file no-ops. Malformed progress or repo lookup logs warning and continues. Invalid refs are ignored with warning. Podman inspect errors other than exit code `1` log and skip pull. Pull failures log and continue. No retries.

Verification coverage: No dedicated base-image contract found in adjacent grep; general shell-boundary coverage relies on `execFile` pattern and image-ref validation.

Findings: None.

### `skills/buster/pipeline/services/rate-limit.js`

Role: Buster child-session rate-limit recovery service. It records pause state, emits canonical pause telemetry/Discord when Buster owns the cooldown, sleeps, probes ACP session liveness, and returns resume/kill action.

Imports/dependencies: `getAcpMonitorState`; Buster Discord `sendDiscord`; Buster telemetry `emitEvent`; shared rate-limit contract builders; `sleep`.

Exports/public surface: `createRateLimitState(config)`, `shouldRetryAfterRateLimit(state)`, `handleRateLimit(state, opts)`.

Defines: Mutable rate-limit state shape, Discord embed sender, local log helper.

Important variables/state: Caller-owned `RateLimitState` mutates `pauseCount` and `currentCooldownS`; `handleRateLimit()` derives module/gate/session identity for telemetry and Discord.

Calls out to: Redis telemetry stream through `emitEvent`, Discord notifications through `sendDiscord`, ACP gateway/session state through `getAcpMonitorState`, timeout sleep.

Called by / expected callers: Buster session-monitor / child-session polling surfaces for local rate-limit cooldowns.

Environment variables / CLI inputs / config fields: No direct env/CLI reads. Inputs are `config.maxPauses`, `initialCooldownS`, `maxCooldownS` and `opts` fields including gateway credentials, Discord webhook, telemetry context, module/gate/dispatch/session identity.

Paths built/read/written: None directly; downstream telemetry/Discord may write run artifacts.

Authority behavior: Authoritative Buster owner for child-session cooldown pauses when `ownsCanonicalSignal` is true. Duplicate callers can set `ownsCanonicalSignal:false` to suppress canonical pause telemetry/Discord.

Error/retry/terminal behavior: `emitEvent()` is awaited but internally non-blocking on errors. `sendRateLimitEmbed()` is not awaited. Cooldown sleeps exactly current cooldown. Liveness check errors log and force `sessionAlive:false`. Gateway unreachable resolves to `resume`; inactive reachable sessions resolve to `kill`. Cooldown doubles after every handled hit, capped at `maxCooldownS`.

Verification coverage: `check-buster-pipeline-slice-surface.mjs` asserts Buster defaults `ownsCanonicalSignal = true`; telemetry contract and behavior polling/module-failure areas cover shared rate-limit identity semantics.

Findings: None.

### `skills/buster/pipeline/services/rate-limit-contract.js`

Role: Repo-local compatibility facade for production `/app/skills/pipeline` rate-limit contract helpers.

Imports/dependencies: Re-exports `../../../common/pipeline/services/rate-limit-contract.js`.

Exports/public surface: All common rate-limit contract exports, including Discord field specs, `buildRateLimitDetectedPayload()`, `formatRateLimitEmbed()`, and `resolveRateLimitRecoveryAction()`.

Defines: None locally.

Important variables/state: None locally.

Calls out to: None locally.

Called by / expected callers: Buster `services/rate-limit.js` and any repo-local tests/imports expecting the Buster path.

Environment variables / CLI inputs / config fields: None locally.

Paths built/read/written: None.

Authority behavior: Common helper owns canonical contract implementation; Buster path is compatibility surface.

Error/retry/terminal behavior: None locally.

Verification coverage: `check-common-helper-import-surface.mjs` and telemetry/rate-limit tests assert import compatibility on shared helpers.

Findings: None.

### `skills/buster/pipeline/services/telemetry.js`

Role: Buster telemetry context and fire-and-forget Redis stream emitter with filesystem fallback/degraded observability artifacts.

Imports/dependencies: Node `fs`/`path`; common telemetry constants/Redis loader; noncritical reporting; redaction `sanitizeTelemetryPayload`; `ioredis` loaded dynamically through common helper.

Exports/public surface: `resolveTelemetryStreamKey(opts)`, `createTelemetryContext(opts)`, `emitEvent(ctx, type, data)`, `closeTelemetry(ctx)`.

Defines: Telemetry identity resolver, envelope builder, Buster fallback correlation builder, fallback JSONL appender, pipeline artifact mirror appender, Redis degraded/restored signaling.

Important variables/state: Telemetry context carries Redis client, canonical stream/seq keys, run identity, module/gate/dispatch/session correlation, log artifact paths, and mutable `_health.redis` degraded/disabled/unavailable state.

Calls out to: Redis `INCR`, `XADD MAXLEN ~ 10000`, `EXPIRE` on sequence key; filesystem JSONL fallback/mirror writes; noncritical incident reporter; redaction sanitizer.

Called by / expected callers: Buster suites and services, especially rate-limit and visual-reg telemetry events.

Environment variables / CLI inputs / config fields: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`; `opts.enabled`, `project`, `runId`/`run_id`, `moduleId`/`module`, `emitter`, `logDir`, `pipelineLogPath`, `pipelineRunLogPath`, `attempt`, `dispatchId`, `sessionKey`, `gateId`, `gateType`.

Paths built/read/written: `<logDir>/telemetry-fallback.jsonl`; sibling of `pipelineLogPath` or `pipelineRunLogPath` named `buster-telemetry-fallback.jsonl`; direct append to configured `pipelineLogPath`/`pipelineRunLogPath` for mirrored events.

Authority behavior: Owns Buster telemetry event envelope projection into the canonical run stream `pipeline:telemetry:<project>:<runId>` and run-local fallback artifacts.

Error/retry/terminal behavior: Missing identity creates context with Redis unavailable and later emits artifact-only degraded fallback. Disabled telemetry returns context and drops events. Redis init errors report noncritical incidents and create unavailable context. Redis runtime errors report noncritical incidents. Redis emit errors mark degraded once, append `observability.degraded` fallback/mirror events, and never throw to orchestration. Subsequent successful Redis emit triggers `observability.restored` backfill attempt. Close errors are noncritical incidents.

Verification coverage: `check-telemetry-contract.mjs` asserts Buster stream identity validation, canonical stream maxlen, gate fallback correlation, flat payloads, and Buster stream events.

Findings: `B05-ISSUE-001`.

### `skills/buster/pipeline/tools/redis.js`

Role: Legacy Redis task send/read CLI/library for Buster-compatible swarm streams; direct completion path is intentionally removed.

Imports/dependencies: Node `url`/`fs`; strict CLI parser; runtime Redis loader and Discord webhook resolver; Discord webhook integration; redaction summary helpers; `ioredis`.

Exports/public surface: default `lib` object with `client`, `sendTask()`, `readMyTasks()`, `complete()`, `disconnect()`.

Defines: Lazy singleton Redis client, Discord task logging helper, target-agent-to-stream mapping.

Important variables/state: Module singleton `_redis`; module-level `WEBHOOK_URL` resolved at import time.

Calls out to: Redis `XADD`, `XGROUP CREATE`, `XREADGROUP`, `QUIT`; Discord webhook; process env.

Called by / expected callers: Legacy operator/automation CLI, library imports for Redis task send/read. Completion emission is owned by `buster-pipeline.js` and not this tool.

Environment variables / CLI inputs / config fields: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `AGENT_NAME`, `HOSTNAME`; CLI flags `--action`, `--target`, `--type`, `--iteration`, `--payload`.

Paths built/read/written: No filesystem data paths; uses executable-path comparison to detect direct CLI invocation.

Authority behavior: Owns task send/read helper behavior for legacy Redis streams `swarm:forge:tasks`, `swarm:echo:tasks`, `swarm:buster:tasks`, and `swarm:<AGENT_NAME>:tasks`. Does not own completion emission.

Error/retry/terminal behavior: Redis client retry strategy backs off up to 2000 ms with max 3 retries per request. `sendTask()` waits for `ready` if not ready. Unknown targets throw. `readMyTasks()` creates consumer group, ignoring `BUSYGROUP`. Discord logging failures are swallowed. `complete()` always throws removed-path error. CLI prints JSON error, disconnects, and exits 1.

Verification coverage: `check-critical-dynamic-imports.mjs` asserts no direct `verify-task.js` completion verifier import remains; `check-strict-cli-args-surface.mjs` covers strict parser use.

Findings: None.

### `skills/buster/pipeline/tools/verify-task.js`

Role: Buster-side agent scope firewall and controlled push helper for `.swarm/` project-scope task artifacts.

Imports/dependencies: Node `process`/`fs`/`path`/`url`; strict CLI parser; Buster Git workflow helpers.

Exports/public surface: `validateProjectSlug()`, `normalizeGitPath()`, `isGitPathInside()`, `buildSwarmScope()`, default `verifyAndPush(agentRole, currentProject, opts)`.

Defines: Safe project slug guard; git-path normalization; project root and swarm root builder; Git status parser for porcelain rename lines; selective forbidden-file cleanup.

Important variables/state: Per-run logs array; Git working tree state; commit message defaults to `[<ROLE>] Update task via verify-task.js`.

Calls out to: Git status/checkout/add/commit/current-branch/push-with-retry; filesystem delete for untracked forbidden files; CLI process exit.

Called by / expected callers: Buster-side completion helper/CLI retained for scoped `.swarm` artifacts.

Environment variables / CLI inputs / config fields: CLI `--role`, `--project`, `--message`; `AGENT_ROLE`, `AGENT_NAME`, `CURRENT_PROJECT` fallback.

Paths built/read/written: Git paths under `Projects/<project>/src/.swarm`; may revert/delete changed files outside that scope; stages only the swarm root path.

Authority behavior: Authorizes by project/scope path only, not agent role substring. Commits/pushes only `.swarm` scope after cleanup.

Error/retry/terminal behavior: Invalid/missing project errors. Git status failure is critical. No changes returns success/action none. Forbidden tracked files are checked out from HEAD; untracked forbidden files are removed. Cleanup failures are logged and not immediately terminal. If no changes remain, success/action `reverted_all_bad_files`. Git add/commit/push errors throw as Git push conflict errors. CLI prints JSON error and exits 1.

Verification coverage: `check-buster-verify-task-scope.mjs` asserts safe slug/path helpers, no role-substring authorization, scoped git add, and scope warning marker; `check-strict-cli-args-surface.mjs` covers strict parser use.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| Buster startup/runtime | `base-images.js` | `loadBaseImagesFromProgress`, `ensureBaseImages` | Warms Podman image cache from static and progress-derived image refs. |
| `rate-limit.js` | `rate-limit-contract.js` | `buildRateLimitDetectedPayload`, `buildSessionRateLimitDiscordFields`, `formatRateLimitEmbed`, `resolveRateLimitRecoveryAction` | Shared contract helpers build telemetry/Discord payloads and resume/kill decision. |
| `rate-limit.js` | `telemetry.js` | `emitEvent` | Emits canonical `rate_limit.detected` when Buster owns sleep. |
| `rate-limit.js` | `agents/acp-monitor.js` | `getAcpMonitorState` | Post-cooldown liveness probe for child session. |
| `telemetry.js` | common telemetry facade | `getTelemetryStreamKey`, `getTelemetrySeqKey`, `loadRedisCtor` | Shared stream key, sequence key, Redis constructor. |
| `redis.js` | runtime/Discord/redaction helpers | `loadRedisCtor`, `resolveDiscordWebhookUrl`, `postDiscordWebhook`, redaction summary helpers | Legacy stream send/read and optional redacted Discord logging. |
| `verify-task.js` | Git workflow helpers | `gitExec`, `getRepoRoot`, `getCurrentBranch`, `gitPushWithRetry` | Scope firewall, commit, and push. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `base-images.js addBaseImageCandidate` | Bare image and `allowBare:false` | Raw image from progress module serve config | Rejects image without registry/path unless `docker.io` | Avoids accepting ambiguous task-provided image names from module config. |
| `base-images.js ensureBaseImages` | Podman `image exists` success | Exit status | Logs cached and skips pull | Avoids unnecessary pulls. |
| `base-images.js ensureBaseImages` | Podman `image exists` throws code `1` | Error code | Pull image | Treats code `1` as missing image only. |
| `rate-limit.js handleRateLimit` | `ownsCanonicalSignal` true | Caller option | Emit Redis telemetry and Discord pause signal | Prevents duplicate canonical pause events when another owner already emits. |
| `rate-limit.js handleRateLimit` | `taskType === 'gate_test'` | Task type/module id | Uses module id as gate id and clears module id in signal identity | Preserves gate-scoped rate-limit identity. |
| `rate-limit.js handleRateLimit` | Gateway unreachable or session active | ACP monitor state | Resume monitor | Keeps degraded visibility from killing active/unknown sessions. |
| `telemetry.js createTelemetryContext` | `enabled === false` | Options | Return disabled context and drop later events | Allows intentional telemetry disable. |
| `telemetry.js createTelemetryContext` | Missing project/run id | Options | Return unavailable context; later artifact-only degraded signal | Prevents unknown canonical Redis stream writes. |
| `telemetry.js emitEvent` | No ctx/type, disabled ctx, or no Redis | Context/type | Return or mark degraded without throwing | Telemetry never blocks orchestration. |
| `redis.js` | `--action send/read/complete` | CLI action | Send, read, removed completion error | Keeps legacy completion path disabled. |
| `verify-task.js verifyAndPush` | Changed file outside project or swarm root | Git status paths | Revert tracked or remove untracked forbidden paths | Enforces `.swarm`-only scope. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `base-images.js loadBaseImagesFromProgress` | Module-local `BASE_IMAGES` set | Static images, `progress.base_images`, module `serve.image` | Start static; append valid progress base_images; append valid fully-qualified module images | Set contains validated refs only. |
| `rate-limit.js createRateLimitState/handleRateLimit` | `RateLimitState` | Config and detections | Defaults max pauses 3, initial cooldown 120s, max 600s; each handle increments pause and doubles cooldown capped | Caller can test retry budget and preserve cooldown across hits. |
| `telemetry.js buildEnvelope` | Event envelope | Context plus sanitized data | Context supplies defaults; data fields override attempt/dispatch/session and explicit `module_id`; data spread is last | Flat event payload on canonical stream. |
| `telemetry.js markTelemetryDegradedOnce/emitRestoredIfNeeded` | `ctx._health.redis` | Emit failures/successes | First failure marks degraded and writes fallback; later success clears degraded and attempts restored backfill | One degraded period per context until restored. |
| `redis.js getRedis/disconnect` | Singleton `_redis` | Env config | Lazy create Redis client; disconnect quits and nulls | Shared client per process. |
| `verify-task.js verifyAndPush` | Git working tree/index | Porcelain paths | Cleanup forbidden paths first; stage only `swarmRoot`; commit; push with retry | No broad `git add -A` in this helper. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `base-images.js loadBaseImagesFromProgress` | Progress base image/module loops | None | None | All entries considered; invalid entries skipped. |
| `base-images.js ensureBaseImages` | Each candidate image | None | `podman image exists` timeout 5000 ms; `podman pull` timeout 300000 ms | Continues after inspect/pull failures. |
| `rate-limit.js handleRateLimit` | One detected cooldown | `sleep(cooldownS * 1000)`; next cooldown doubles | Cooldown from mutable state | Returns `resume` or `kill` after liveness probe. |
| `telemetry.js Redis client` | ioredis retry strategy | `times > 2 ? null : min(times*200,1000)` | connect/command timeout 3000 ms | Redis failures degrade telemetry only. |
| `redis.js Redis client/read` | ioredis retry and xreadgroup block | retry min(times*50,2000); `BLOCK 2000` | `maxRetriesPerRequest:3` | Read returns stream result or throws; group BUSYGROUP ignored. |
| `verify-task.js verifyAndPush` | Changed files and bad files loops | Git push retry delegated to `gitPushWithRetry` | None locally | Cleanup then commit/push, or return none/reverted_all_bad_files. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `.swarm/progress.json base_images` | Runtime artifact input | `base-images.js` | Optional | Additional pre-pull image refs. |
| `.swarm/progress.json modules.*.test_config.serve.image` | Runtime artifact input | `base-images.js` | Optional | Added only when fully-qualified enough for `allowBare:false`. |
| `createRateLimitState(config)` | Runtime config object | `rate-limit.js` | `maxPauses=3`, `initialCooldownS=120`, `maxCooldownS=600` | Buster pause budget and backoff. |
| `handleRateLimit(opts)` | Runtime options | `rate-limit.js` | module `unknown`, provider `Unknown`, phase `buster`, `ownsCanonicalSignal=true` | Gateway/Discord/telemetry/session correlation inputs. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Env vars | `telemetry.js`, `redis.js` | Redis service DNS, `6379`, no password | Redis transport configuration. |
| Telemetry context opts | Runtime options | `telemetry.js` | enabled true, emitter `buster/pipeline/services/telemetry` | Project/run identity is required for canonical stream emission. |
| Redis tool CLI flags | CLI input | `tools/redis.js` | `iteration=1`, `payload={}` | `--action` required; actions send/read/complete. |
| `AGENT_NAME`, `HOSTNAME` | Env vars | `tools/redis.js` | no default for read; hostname fallback `pod` | Sender and Redis consumer identity. |
| Verify-task CLI/env | CLI/env input | `tools/verify-task.js` | role from `AGENT_ROLE`/`AGENT_NAME`/`unknown`; project from `CURRENT_PROJECT` | Safe project slug required. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `<repoRoot>/.swarm/progress.json` | `base-images.js` via `getRepoRoot()` and `join` | `base-images.js` | Progress/status producer outside B05 | Optional source for image warmup candidates. |
| `pipeline:telemetry:<project>:<runId>` | common telemetry key helper | Redis consumers | `telemetry.js emitEvent` | Canonical Buster telemetry stream. |
| `pipeline:telemetry:seq:<project>:<runId>` | common telemetry key helper | Redis consumers | `telemetry.js emitEvent` | Sequence counter with 7-day TTL. |
| `<logDir>/telemetry-fallback.jsonl` | `telemetry.js appendFallbackEvent` | Operators/replay | `telemetry.js` | Buster fallback artifact when Redis unavailable/degraded. |
| sibling `buster-telemetry-fallback.jsonl` | `telemetry.js appendFallbackEvent` from pipeline log path dirs | Operators/replay | `telemetry.js` | Run-level fallback artifact. |
| configured `pipelineLogPath` / `pipelineRunLogPath` | Caller opts | Operators/replay | `telemetry.js appendPipelineArtifactEvent` | Mirrors normal/degraded/restored events when configured. |
| Redis streams `swarm:*:tasks` | `redis.js` mapping/env | `redis.js` | `redis.js sendTask` and other agents | Legacy task stream surface; no completion stream ownership. |
| `Projects/<project>/src/.swarm` | `verify-task.js buildSwarmScope` | `verify-task.js` Git scope check | `verify-task.js` stages/commits this path only | Authoritative verify-task allowed write scope. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Base image pre-pull candidate set | `base-images.js` | Podman pre-pull loop/startup logs | None. |
| Buster child-session cooldown state | `rate-limit.js` caller-owned `RateLimitState` mutated by `handleRateLimit` | Session monitor / completion status | None. |
| Canonical Buster rate-limit pause signal | `rate-limit.js handleRateLimit` when `ownsCanonicalSignal` | Redis telemetry, Discord operators, monitor loop | None. |
| Buster telemetry event envelope | `services/telemetry.js` | Redis stream consumers, run artifact replay | Event-type payload schema owner missing; tracked as `B05-ISSUE-001`. |
| Legacy Redis task send/read streams | `tools/redis.js` | Swarm agents/operators | Completion emission explicitly removed. |
| Verify-task `.swarm` commit scope | `tools/verify-task.js` | Git remote / Buster completion users | Existing broad-staging issue remains in shared `gitPushWithRetry` optional commit path, not this helper path. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Base image validation result | `validateBaseImageRef` | `{ok:false, reason:string}` or `{ok:true, value:string}` | `IMAGE_REF_RE`, trim/length checks | Base image loader/pre-pull. |
| RateLimitState | `createRateLimitState` | `{maxPauses:number, initialCooldownS:number, maxCooldownS:number, pauseCount:number, currentCooldownS:number}` | Constructor defaults only | Rate-limit monitor callers. |
| `handleRateLimit` result | `rate-limit.js` | `{action:'resume'\|'kill', cooldownMs:number, gatewayUnreachable:boolean, gatewayDetail:string\|null, sessionAlive:boolean}` | `resolveRateLimitRecoveryAction` | Session monitor loop. |
| `rate_limit.detected` payload | `rate-limit.js` via common contract | `run_id?`, `module_id?`, `gate_id?`, `gate_type?`, `agent_type?`, `attempt?`, `dispatch_id?`, `gateway_label?`, `session_key?`, `provider`, `retry_after_seconds?`, `cooldown_ms?`, `resume_at?`, `pause_count?`, `max_pauses?`, `detail?` | `buildRateLimitDetectedPayload`; no event registry | Telemetry stream and consumers. |
| Buster telemetry envelope | `telemetry.js buildEnvelope` | `v:1`, `type`, `ts`, `project`, `run_id`, `seq`, `source:'buster'`, `emitter`, `module_id`, `attempt`, `dispatch_id`, `session_key`, plus flat sanitized data | `sanitizeTelemetryPayload`; identity resolver | Redis stream, pipeline artifacts. |
| Telemetry degraded/restored payload | `telemetry.js` | `component`, `surface`, `reason`, `detail`, `module_id`, `gate_id`, `gate_type?`, `attempt`, `dispatch_id`, `session_key`, `stream_key`, timestamps, impacted/restored fields | Local builders only | Fallback artifacts, Redis stream restored event. |
| Redis send task entry | `tools/redis.js sendTask` | XADD fields `type`, `sender`, `payload` JSON string, `iteration`, `timestamp` | CLI JSON parse only; target stream allowlist | Target agent stream readers. |
| Redis send result | `tools/redis.js sendTask` | `{status:'sent', id:string, stream:string}` | Local construction | CLI/operators. |
| Verify-task result | `tools/verify-task.js` | Success none `{status:'success', action:'none', logs}`; reverted `{status:'success', action:'reverted_all_bad_files', logs}`; pushed `{status:'success', action:'pushed', files_pushed:number, commit_hash:string, logs}`; CLI error `{status:'error', error}` | Safe project/path helpers and Git operations | Buster completion/operator callers. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| B05 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `base-images.js loadBaseImagesFromProgress` | Missing/malformed progress, invalid image refs | No | No retry | Missing no-op; malformed logs warning; invalid refs skipped | `safeErrorMessage` for thrown errors. |
| `base-images.js ensureBaseImages` | Podman inspect/pull failure | No | inspect timeout 5000 ms; pull timeout 300000 ms | Logs error and continues next image | `safeErrorMessage` for errors. |
| `rate-limit.js handleRateLimit` | Telemetry/Discord failures | No local retry | Telemetry Redis retry internal; Discord call fire-and-forget | Does not block cooldown/liveness flow | No local redaction; downstream telemetry/Discord helpers sanitize as applicable. |
| `rate-limit.js handleRateLimit` | ACP liveness check failure | No | After cooldown sleep only | Logs warning; returns based on `sessionAlive:false` / gateway state | Error message logged directly. |
| `telemetry.js createTelemetryContext/emitEvent` | Missing identity, disabled telemetry, Redis init/runtime/emit/close failure, fallback write failure | Redis client has limited retry | Redis retry up to 2 reconnect attempts, connect/command timeout 3000 ms; stream maxlen 10000; seq TTL 7 days | Disabled drops; missing/unavailable marks degraded artifact-only; emit never throws; close failure incident only | `sanitizeTelemetryPayload`; incident reporter. |
| `redis.js` | Unknown target, missing env, Redis connection/read/write errors, bad JSON payload, removed complete action | Redis client retry | Retry min(times*50,2000), maxRetriesPerRequest 3; read BLOCK 2000 | Library throws; CLI JSON error exits 1; Discord log failures ignored | Discord payload summary redacted by default. |
| `verify-task.js verifyAndPush` | Invalid project, Git status/add/commit/push failure, forbidden path cleanup failure | Push retry delegated | `gitPushWithRetry` handles push retry; no local sleep | Invalid/status/git failure terminal; cleanup failure logged and flow continues | No secret redaction; logs file paths/errors. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `base-images.js loadBaseImagesFromProgress` | Missing/malformed progress or invalid refs | Partial | stdout/stderr only | `[BASE_IMAGES]` warning/log lines | `console.warn`, `console.log` | No Redis telemetry; startup warmup is non-critical. |
| `base-images.js ensureBaseImages` | Podman inspect/pull failure | Partial | stdout/stderr only | `[BASE_IMAGES]` error/log lines | `console.error`, `console.log` | No Redis telemetry; pre-pull continues. |
| `rate-limit.js handleRateLimit` | Rate-limit pause and telemetry/Discord failure | Yes/partial | Redis stream/fallback via telemetry; Discord best-effort; stdout | `rate_limit.detected`, rate-limit Discord embed, `[RATE-LIMIT]` logs | `emitEvent`, `sendRateLimitEmbed`, `log` | Discord send not awaited. |
| `rate-limit.js handleRateLimit` | ACP liveness check failure | Partial | stdout only plus returned action/result | `[RATE-LIMIT] [WARN] Liveness check failed...` | `log` | No separate telemetry after liveness failure. |
| `telemetry.js emitEvent/createTelemetryContext` | Redis identity/init/emit/close/fallback failures | Yes | Redis stream when healthy; fallback JSONL; pipeline artifacts; noncritical incidents stderr fallback | `observability.degraded`, `observability.restored`, incident classifications | `markTelemetryDegradedOnce`, `emitRestoredIfNeeded`, `reportBusterTelemetryIncident` | Event-type payload schema gap tracked as `B05-ISSUE-001`. |
| `redis.js` | Send/read/CLI failures | Partial | CLI JSON stderr/stdout; Redis client error stderr | `{error:...}`, `[Redis Error]` | CLI wrapper, Redis error listener | No telemetry stream for legacy tool failures. |
| `verify-task.js verifyAndPush` | Scope cleanup/Git failures | Yes | Returned/printed JSON logs/errors | `logs[]`, CLI `{status:'error'}` | `verifyAndPush`, CLI wrapper | No Redis telemetry; caller must persist output. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| `podman` | System binary | runtime installed | `base-images.js` | Image cache inspection and pull | Inspect/pull failures log and continue. |
| `ioredis` | npm package via runtime/common loader | runtime installed | `telemetry.js`, `redis.js` | Telemetry stream and legacy task streams | Telemetry degrades non-blocking; legacy tool can fail CLI/library calls. |
| Redis server | External service | Redis stream API | `telemetry.js`, `redis.js` | Canonical telemetry stream and task queues | Timeouts/retries bounded; telemetry fallback artifacts exist. |
| Discord webhook service | External HTTPS API/helper | Webhook API | `rate-limit.js`, `redis.js` | Operator pause/task notifications | Failures are non-critical; redis task logging redacts payload summary. |
| ACP gateway/session API | Gateway helper through `getAcpMonitorState` | Runtime gateway | `rate-limit.js` | Post-cooldown child-session liveness | Gateway unreachable maps to resume. |
| Git CLI | System binary through Git helpers | runtime installed | `verify-task.js` | Status, cleanup, commit, push | Push retry delegated to helper. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Base image pre-pull | Sequential image loop | Static + progress set | Slow/missing image delays/logs but continues | `[BASE_IMAGES]` logs | None. |
| Rate-limit cooldown | Pause budget and exponential backoff | max pauses 3, initial 120s, max 600s | Caller can stop when `shouldRetryAfterRateLimit` false; each hit doubles cooldown | `rate_limit.detected` and logs | None. |
| Telemetry Redis stream | Stream maxlen approximate cap | `TELEMETRY_STREAM_MAXLEN=10000`, seq TTL 7 days | Redis failure degrades to fallback artifacts; emit non-blocking | degraded/restored artifacts/events | Event schema owner gap tracked. |
| Telemetry Redis client | Connection retries/timeouts | retry up to 2, connect/command 3000 ms, maxRetriesPerRequest 1 | Mark degraded once and do not block orchestration | noncritical incidents/fallback | None. |
| Legacy Redis read | Consumer group read cap/block | `COUNT` caller value default 1, `BLOCK 2000` | Returns available entries or null/throws | CLI JSON or error | None. |
| Verify-task Git push | Push retry delegated | `gitPushWithRetry` defaults | Terminal error if push/commit fails | JSON result/error logs | Existing broad-staging issue belongs to shared helper optional commit path. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Buster rate-limit liveness probe | `getAcpMonitorState(childSessionKey, null, {}, {gatewayUrl,gatewayToken})` returns `sessionActive`, `gatewayUnreachable`, `gatewayDetail`/`detail` | ACP monitor/gateway | `rate-limit.js handleRateLimit` | One probe after cooldown sleep; no stream log path and fresh previous state | Returned `sessionAlive`, `gatewayUnreachable`, `gatewayDetail`; `[RATE-LIMIT]` logs. |
| Buster rate-limit session identity | `session_key`, optional `dispatch_id`, `gateway_label`, module/gate identity | `rate-limit.js` | Telemetry/Discord/operators | Emitted once per owned cooldown; duplicate owners can suppress with `ownsCanonicalSignal:false` | `rate_limit.detected` payload and Discord fields. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Buster rate-limit canonical pause default | `check-buster-pipeline-slice-surface.mjs` | Surface coverage | Behavior primarily covered through shared rate-limit tests, not this Buster file alone. |
| Buster telemetry stream identity and envelope behavior | `check-telemetry-contract.mjs` | Good for stream/envelope/fallback joins | No event-type payload validator; tracked as `B05-ISSUE-001`. |
| Redis tool completion path removed | `check-critical-dynamic-imports.mjs` | Surface coverage | Does not execute CLI actions. |
| Redis/verify-task strict CLI parser use | `check-strict-cli-args-surface.mjs` | Surface coverage | Does not execute malformed argv for these two tools. |
| Verify-task swarm-only scope | `check-buster-verify-task-scope.mjs` | Good helper/source coverage | No end-to-end Git push fixture for all cleanup branches. |
| Base image pre-pull validation | None found in scoped-adjacent tests | Gap | Consider a small unit contract for image ref validation and Podman code-1 pull branch if this warmup becomes critical. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `B05-ISSUE-001` — Buster telemetry accepts arbitrary event-type payloads without a centralized schema/validator owner.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
