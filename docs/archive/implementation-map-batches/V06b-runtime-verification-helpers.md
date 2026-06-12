# Batch V06b — Runtime verification helpers

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/runtime/README.md
tests/verification/runtime/check-acp-launch.mjs
tests/verification/runtime/check-buster-startup-smoke.mjs
tests/verification/runtime/check-final-gate-hardening.mjs
tests/verification/runtime/check-nova-startup-smoke.mjs
tests/verification/runtime/check-runtime-collisions.mjs
tests/verification/runtime/check-subagent-launch.mjs
tests/verification/runtime/session-launch-lib.mjs
```

Scope expansion verified live: 8 files, under the 10-file maximum. All scoped files were read end to end before conclusions were written.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/runtime/README.md
kubeclaw-main/tests/verification/runtime/check-acp-launch.mjs
kubeclaw-main/tests/verification/runtime/check-buster-startup-smoke.mjs
kubeclaw-main/tests/verification/runtime/check-final-gate-hardening.mjs
kubeclaw-main/tests/verification/runtime/check-nova-startup-smoke.mjs
kubeclaw-main/tests/verification/runtime/check-runtime-collisions.mjs
kubeclaw-main/tests/verification/runtime/check-subagent-launch.mjs
kubeclaw-main/tests/verification/runtime/session-launch-lib.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `tests/verification/runtime/README.md`

Role: Documents runtime/packaging verifier entrypoints and live launch-smoke behavior.

Imports/dependencies: None; markdown only.

Exports/public surface: Human-facing verifier guidance.

Defines: Canonical runtime entrypoints for collision checks and Nova/Buster startup smokes; live launch-smoke entrypoints for subagent/ACP; notes on ACP terminal-after-launch acceptance and default clean-checkout gating.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: Operators and maintainers.

Environment variables / CLI inputs / config fields: None found in scoped file.

Paths built/read/written: Documents verifier paths only.

Authority behavior: Default runtime collision/startup checks are canonical repo/runtime structure guards; ACP launch is explicit local/provider-specific verification.

Error/retry/terminal behavior: None found in scoped file.

Verification coverage: Documentation only.

Findings: None found.

### `tests/verification/runtime/check-acp-launch.mjs`

Role: Live ACP session launch reachability smoke wrapper.

Imports/dependencies: Quiet runtime console, `parseLaunchArgs`, `verifyLaunchReachability`.

Exports/public surface: CLI script with default ACP options; outputs JSON result and nonzero exit on failure.

Defines: ACP defaults: runtime `acp`, model `claude-sonnet-4-6`, agent id `claude`, label prefix `verify-acp-launch`, prompt `Reply with READY and stop.`, timeout 120s, 8 polls, 1000ms poll, `allowTerminalAfterLaunch: true`.

Important variables/state: Parsed launch options and result.

Calls out to: session launch library.

Called by / expected callers: `tests/verification/run-local-acp-verification.sh` / local operators.

Environment variables / CLI inputs / config fields: Launch library flags include runtime/model/cwd/gateway url/token/timeouts/polling/keep-session/prompt/label/agent id/terminal behavior.

Paths built/read/written: Stream log path is returned by launch library; wrapper writes no files directly.

Authority behavior: ACP launch can pass when session is accepted and visible at least once even if terminal shortly after launch due provider/auth behavior.

Error/retry/terminal behavior: Library failure or exception emits JSON error to stderr and sets exit code 1.

Verification coverage: Live reachability wrapper; not repo-only.

Findings: None found.

### `tests/verification/runtime/check-buster-startup-smoke.mjs`

Role: Buster entrypoint startup smoke and shutdown binding guard.

Imports/dependencies: Quiet runtime console, Node assert/fs/path/url/child_process.

Exports/public surface: CLI script; supports `--source-root`; prints `Buster startup smoke passed`.

Defines: `parseArgs`, `runNode`, source checks, syntax check, import/export checks, `--status` JSON subprocess check.

Important variables/state: Buster entrypoint source and parsed status output.

Calls out to: `node --check`, dynamic import of Buster entrypoint, `node skills/buster/buster-pipeline.js --status`.

Called by / expected callers: Runtime verification wrappers/CI.

Environment variables / CLI inputs / config fields: `--source-root`, default cwd.

Paths built/read/written: Reads `skills/buster/buster-pipeline.js`; no writes.

Authority behavior: Buster startup surface must import `doSandboxCleanup`, use `disconnectRedisClient`, export required startup helpers, and keep `--status` JSON with `lastRunLogDir`.

Error/retry/terminal behavior: Syntax/import/status/source drift fails terminal assertions; subprocess timeout defaults to 10s.

Verification coverage: Focused startup/source/API check.

Findings: None found.

### `tests/verification/runtime/check-final-gate-hardening.mjs`

Role: Final runtime hardening guard for pipeline run lock contention/release, launch CLI numeric validation, and launch observation consistency fail-closed behavior.

Imports/dependencies: Quiet runtime console, Node assert/fs/os/path/child_process, lifecycle audit materialization/import helpers, runtime pipeline runner, session-launch-lib.

Exports/public surface: CLI script; prints JSON with check results and exits nonzero if any check failed.

Defines: Materialized general runtime tree, helper subprocess for lock attempts, `runCheck`, four named checks.

Important variables/state: `runtimeRoot`, pipeline runner module, launch lib module, temp helper script, temp lock swarm dirs, check result array.

Calls out to: `acquirePipelineRunLock`, `releasePipelineRunLock`, subprocess helper, `parseLaunchArgs`, `assessLaunchVerification`.

Called by / expected callers: Runtime final-gate verification.

Environment variables / CLI inputs / config fields: Lifecycle audit args (`--source-root`, `--overlay-root`); launch parser numeric flags in fixtures.

Paths built/read/written: Materializes runtime tree; writes temp helper script; writes/reads/removes lock files under temp `.swarm/logs/pipeline/active-run.lock.json`.

Authority behavior: Pipeline concurrency is explicitly bounded to one active owner. Lock release requires rightful owner token. Launch verifier must reject malformed numeric weakening and contradictory observation payloads.

Error/retry/terminal behavior: Contending subprocess fails with `already active`; malformed numeric args throw; invalid observations return `ok:false`, `launchEvidence:'invalid_observation'`, degraded visibility, and explicit non-pass reasons.

Verification coverage: Strong runtime fixture for lock and launch-assessment hardening.

Findings: None found.

### `tests/verification/runtime/check-nova-startup-smoke.mjs`

Role: Nova entrypoint startup smoke, public API export check, and help output check.

Imports/dependencies: Quiet runtime console, Node assert/fs/path/url/child_process.

Exports/public surface: CLI script; supports `--source-root`; prints `Nova startup smoke passed`.

Defines: `parseArgs`, `runNode`, syntax checks for entrypoint/index/CLI, public API checks, `--help` subprocess check.

Important variables/state: Nova entrypoint/index/CLI paths and help output text.

Calls out to: `node --check`, dynamic imports, `node skills/nova/pipeline.js --help`.

Called by / expected callers: Runtime verification wrappers/CI.

Environment variables / CLI inputs / config fields: `--source-root`; subprocess env forces `KUBECLAW_DISABLE_DISCORD_WEBHOOKS=1`.

Paths built/read/written: Reads/imports Nova source; no writes.

Authority behavior: Nova public entrypoint exports load/run/shutdown and exit code constants; CLI owns `main`; help output exposes canonical operator markers.

Error/retry/terminal behavior: Syntax/import/export/help drift fails terminal assertions; subprocess timeout defaults to 10s.

Verification coverage: Focused startup/API/help check.

Findings: None found.

### `tests/verification/runtime/check-runtime-collisions.mjs`

Role: Runtime packaging collision/import guard for general and sandbox images.

Imports/dependencies: Quiet runtime console, Node fs/os/path, lifecycle audit packaging/materialization/import helpers.

Exports/public surface: CLI script; prints JSON packaging report and exits 0 only when all collision/import/drift counters are zero.

Defines: Recursive file walking, relative import resolver, broken relative import collector, effective tree materialization, common import violation collector, shared shim coverage collector, runtime common surface violation collector.

Important variables/state: Source/overlay roots, images `general` and `sandbox`, effective skills temp tree, per-image manifest/collisions/owner drift/import checks/runtime owners, aggregate counters.

Calls out to: `buildManifest`, `effectiveFiles`, `findCollisions`, `expectedPackagedRuntimeOwners`, `materializeRuntimeTree`, `importRuntimeModule`.

Called by / expected callers: Runtime packaging verification wrappers/CI.

Environment variables / CLI inputs / config fields: Lifecycle audit args `--source-root`, `--overlay-root`.

Paths built/read/written: Materializes effective skills tree and runtime trees; imports runtime entrypoints `/app/skills/pipeline.js`, `/app/skills/pipeline/index.js`, `/app/skills/buster-pipeline.js`, `/app/skills/pipeline/tools/redis.js`.

Authority behavior: Expected runtime owners must match lifecycle audit packaging rules. Shared common helpers must have Nova/Buster shims, no direct common imports outside shims, no `/app/common` manifest/import surface, and no broken relative imports.

Error/retry/terminal behavior: Any collision, owner drift, broken relative import, direct common import, missing shim, declaration drift, `/app/common` surface, or failed runtime import yields nonzero exit. No retry.

Verification coverage: Strong packaging/source/runtime import coverage.

Findings: None found.

### `tests/verification/runtime/check-subagent-launch.mjs`

Role: Live subagent session launch reachability smoke wrapper.

Imports/dependencies: Quiet runtime console, `parseLaunchArgs`, `verifyLaunchReachability`.

Exports/public surface: CLI script with default subagent options; outputs JSON result and nonzero exit on failure.

Defines: Subagent defaults: runtime `subagent`, model `openai-codex/gpt-5.4`, label prefix `verify-subagent-launch`, prompt `Reply with READY and stop.`, timeout 120s, 8 polls, 1000ms poll, `allowTerminalAfterLaunch:false`, `allowStoppedCleanup:true`.

Important variables/state: Parsed launch options and result.

Calls out to: session launch library.

Called by / expected callers: Runtime verification wrapper/default clean-checkout gate.

Environment variables / CLI inputs / config fields: Launch library flags include runtime/model/cwd/gateway url/token/timeouts/polling/keep-session/prompt/label/agent id/cleanup behavior.

Paths built/read/written: Stream log path is returned by launch library; wrapper writes no files directly.

Authority behavior: Subagent launch requires visible accepted session and cleanup confirmation, but stopped state can confirm cleanup when allowed.

Error/retry/terminal behavior: Library failure or exception emits JSON error to stderr and sets exit code 1.

Verification coverage: Live reachability wrapper.

Findings: None found.

### `tests/verification/runtime/session-launch-lib.mjs`

Role: Shared live session launch verifier for ACP/subagent runtime reachability, gateway status polling, cleanup, and fail-closed assessment.

Imports/dependencies: Node fs, lifecycle audit `parseArgs`, common lifecycle `spawnSession`/`killSession`, ACP monitor parsing, gateway integration, runtime resolver/model mapping, timing sleep.

Exports/public surface: `parseLaunchArgs`, `observeSessionLaunch`, `assessLaunchVerification`, `verifyLaunchReachability`.

Defines: Boolean and integer arg parsers, status error parser, launch option builder, gateway polling observer, observation consistency checks, launch assessment, spawn/observe/cleanup orchestration.

Important variables/state: No persistent global state; generated labels use timestamp from wrapper/default args.

Calls out to: Gateway `session_status`, `sleep`, `spawnSession`, `killSession`, filesystem stream-log existence check.

Called by / expected callers: ACP/subagent launch wrappers and final gate hardening tests.

Environment variables / CLI inputs / config fields: `--runtime`, `--model`, `--cwd`, `--gateway-url`, `--gateway-token`, `--timeout-seconds`, `--poll-attempts`, `--poll-ms`, `--keep-session`, `--prompt`, `--label-prefix`, `--agent-id`, `--allow-terminal-after-launch`; defaults supplied by wrappers.

Paths built/read/written: Reads stream log existence from `sessionData.streamLogPath`; no direct writes.

Authority behavior: Gateway session status is primary launch evidence. Stream-log-only evidence is degraded and only considered when terminal-after-launch is allowed. Cleanup confirmation comes from kill result, stopped-state allowance, or null when keeping session.

Error/retry/terminal behavior: Numeric args must be integers above minimums. Not-found status errors poll until attempts exhausted; non-not-found status errors return degraded visibility immediately. Contradictory observation payloads fail closed with `invalid_observation`. Cleanup uses 30s confirmation/cleanup timeouts and 500ms poll.

Verification coverage: Shared live launch helper plus final gate hardening contract checks.

Findings: None found.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| ACP/subagent launch wrappers | `session-launch-lib.mjs` | `parseLaunchArgs`, `verifyLaunchReachability` | Runtime-specific defaults wrapped around shared launch verification. |
| Startup smokes | Nova/Buster entrypoints | `node --check`, dynamic import, help/status subprocesses | Ensures entrypoints parse and expose public APIs. |
| Final gate hardening | pipeline runner/session launch lib | lock APIs and launch assessment | Validates concurrency and fail-closed launch observations. |
| Runtime collisions | lifecycle audit lib/runtime modules | packaging manifests/materialized imports | Validates image runtime surfaces. |
| Session launch lib | common lifecycle/gateway/runtime/timing | spawn/status/kill/sleep/model mapping | Live launch reachability implementation. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `parseLaunchArgs` | numeric flag malformed/out of range | timeout/poll values | throw | Prevents weakened launch checks. |
| `observeSessionLaunch` | status success/not-found/non-not-found error | gateway status/error kind | visible result, continue polling, or degraded error result | Launch visibility semantics. |
| `assessLaunchVerification` | active without visible, visible status_error/not_found, state without visibility | observed payload | invalid observation and fail closed | Prevents contradictory launch evidence. |
| `assessLaunchVerification` | terminal after launch/stopped cleanup/keep session | wrapper flags and observed state | stream-log degraded evidence, stopped cleanup, or cleanup null | Runtime-specific launch acceptance. |
| Pipeline lock hardening | existing lock with different owner vs rightful owner | lock token/pid/run | reject contention or release | Single active pipeline owner. |
| Runtime collisions | collisions/owner drift/import drift/common surface drift | packaging manifests/import scans | JSON report and exit 1 on drift | Runtime image integrity. |
| Startup smokes | syntax/import/help/status failure | subprocess/import results | assertion failure | Entrypoint integrity. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| Final gate lock fixture | temp `active-run.lock.json` | lock config/module/token | only rightful lock token releases; wrong token preserves file | single-owner lock invariant. |
| Runtime collision materialization | temp effective skills/runtime trees | source/overlay files | overlay effective tree, image manifest final owners | importable runtime surface. |
| Session launch verification | remote session lifecycle | spawn options and cleanup flag | spawn, observe, optional kill, assess | JSON launch result with evidence/reasons. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `observeSessionLaunch` | attempts <= pollAttempts | `sleep(pollMs)` on not found | wrapper/default poll attempts/ms | success, non-not-found error, or attempts exhausted. |
| `killSession` cleanup | common lifecycle cleanup confirm | 500ms poll | 30s confirm and cleanup timeouts | cleanup confirmed or not. |
| Startup subprocesses | process timeout | none | 10s default timeout | process exits or timeout. |
| Runtime collision scans | files remain | none | none | all files/imports scanned. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `--source-root`, `--overlay-root` | CLI flags | runtime collision/final gate helpers | cwd/null | Runtime materialization roots. |
| `--runtime`, `--model`, `--cwd`, `--gateway-url`, `--gateway-token`, `--timeout-seconds`, `--poll-attempts`, `--poll-ms`, `--keep-session`, `--prompt`, `--label-prefix`, `--agent-id`, `--allow-terminal-after-launch` | CLI flags | session launch lib/wrappers | wrapper defaults | Live session launch verification controls. |
| `KUBECLAW_DISABLE_DISCORD_WEBHOOKS` | Env var | Nova startup subprocess | forced `1` | Avoids Discord side effects during help smoke. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `skills/nova/pipeline.js`, `pipeline/index.js`, `pipeline/cli.js` | repo source | Nova startup smoke | source | Nova public entrypoint/API/help surface. |
| `skills/buster/buster-pipeline.js` | repo source | Buster startup smoke | source | Buster public startup/status surface. |
| temp `.swarm/logs/pipeline/active-run.lock.json` | pipeline runner lock fixture | final gate hardening | pipeline runner fixture | Single active run lock evidence. |
| materialized runtime trees | lifecycle audit helper | runtime collisions/final gate | helper | Image import/collision checks. |
| stream log path | lifecycle spawn runtime | session launch lib | lifecycle runtime | Secondary/degraded launch evidence only. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Nova runtime public API | Nova pipeline entrypoint/index/CLI | startup smoke/operators | None. |
| Buster runtime public API/status | Buster pipeline entrypoint | startup smoke/operators | None. |
| Pipeline active run lock | pipeline runner lock helpers | final gate hardening/pipeline runner | None. |
| Runtime packaging ownership | lifecycle audit manifest rules | runtime collisions/materializers | None. |
| Launch evidence | gateway session status primarily; stream log only degraded fallback | session launch verifier | None. |
| Cleanup confirmation | kill result or allowed stopped state | launch verifier | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Launch options | `parseLaunchArgs` | runtime, model, cwd, gateway, timeout/poll, keep, prompt, label, agentId, terminal/stopped flags | numeric/bool/runtime parsers | launch wrappers. |
| Observed session state | `observeSessionLaunch` | `visible`, `active`, `state`, `observedStates`, `details`, `errors`, `errorKinds`, `degradedVisibility` | ACP state parser/status error parser | launch assessment. |
| Launch assessment/result | `assessLaunchVerification`/`verifyLaunchReachability` | `ok`, `launchConfirmed`, `launchEvidence`, `degradedVisibility`, `cleanupConfirmed`, `nonPassReasons`, runtime/model/session fields | observation consistency checks | launch wrappers/operators. |
| Runtime collision report | collision verifier | aggregate counters, per-image collisions/import checks/owner drift/runtime owners | zero-counter exit policy | CI/operators. |
| Final gate report | final gate hardening | `sourceRoot`, `overlayRoot`, `ok`, `checkCount`, `failedCheckCount`, `checks[]` | check wrapper | CI/operators. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| ACP launch smoke | `check-acp-launch.mjs` defaults | stream log path from lifecycle runtime | `Reply with READY and stop.` | ACP runtime `claude`, gateway status/kill | Accepted/visible launch; terminal after launch allowed. |
| Subagent launch smoke | `check-subagent-launch.mjs` defaults | stream log path from lifecycle runtime | `Reply with READY and stop.` | subagent runtime, gateway status/kill | Accepted/visible launch and cleanup/stopped confirmation. |
| Startup smoke tools | Nova/Buster entrypoints | stdout/help/status JSON | No prompt content | Node subprocess/imports | Clean syntax/API/help/status output. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| Launch wrappers | library result `ok:false` or exception | Depends on operator rerun | library poll settings | JSON stderr and exit 1 | none. |
| `parseLaunchArgs` | malformed numeric args | No | none | throws descriptive error | none. |
| `observeSessionLaunch` | session not found/status error | not-found polls | `pollAttempts`, `pollMs` | not-found may retry; status_error degrades/fails | none. |
| `assessLaunchVerification` | contradictory observation | No | none | fail closed with invalid observation | none. |
| Launch cleanup | cleanup unconfirmed | No in helper | kill confirm 30s, cleanup confirm 30s, 500ms poll | result `ok:false` unless keep/stopped allowed | none. |
| Startup smokes | syntax/import/help/status drift | No | 10s subprocess timeout | terminal assertion failure | Discord disabled for Nova help. |
| Runtime collisions | collision/import/owner/common-surface drift | No | none | JSON report and exit 1 | none. |
| Final gate lock | cross-process contention | No | none | blocked process exits 1 with `already active` | none. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| Launch wrappers/lib | launch failure/exception | Yes/partial | JSON stdout/stderr | `nonPassReasons`, `statusErrors`, result fields | launch wrapper/lib | Live smoke operator evidence. |
| `observeSessionLaunch` | status errors | Yes/partial | launch JSON fields | `statusErrors`, `statusErrorKinds`, `degradedVisibility` | session launch lib | No Redis telemetry. |
| `assessLaunchVerification` | invalid observation | Yes/partial | launch/final gate JSON | `observationIssue`, `launchEvidence:'invalid_observation'` | session launch lib | Fail-closed evidence. |
| Startup smokes | syntax/import/help/status drift | Yes/partial | assertion stderr/stdout | assertion error | startup smoke scripts | No runtime telemetry expected. |
| Runtime collisions | packaging/import drift | Yes/partial | JSON report | aggregate counters and drift arrays | collision verifier | CI/operator evidence. |
| Final gate lock | lock contention | Yes/partial | final gate JSON | blocked attempt stderr `already active` | final gate hardening | Lock file evidence in temp root. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V06b scripts | ESM, subprocesses, fs, assertions | Required. |
| Quiet runtime console helper | local verification helper | repo source | V06b wrappers/smokes | Clean JSON output | Restores before output. |
| Lifecycle audit helper | local verification helper | repo source | runtime collisions/final gate | materialize runtime/parse roots | Drift fails checks. |
| Common lifecycle/gateway/runtime/timing helpers | production source | repo source | session launch lib | spawn/status/kill/sleep/model resolution | Live launch dependency. |
| ACP/subagent runtime/gateway | local runtime service | environment-specific | launch smokes | live reachability | ACP explicit local check; subagent default gate. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Pipeline run lock | one active owner | `PIPELINE_RUN_CONCURRENCY_LIMIT = 1` | cross-process acquisition rejected | lock JSON and blocked subprocess stderr | None. |
| Launch status polling | finite attempts | wrappers default 8 attempts, 1000ms | not-found retries; status_error stops degraded | launch JSON fields | None. |
| Cleanup confirmation | kill/cleanup polling | 30s + 30s, 500ms poll | unconfirmed cleanup marks result non-pass | launch JSON cleanup fields | None. |
| Startup subprocesses | command timeout | 10s default | timeout/nonzero assertion failure | stderr/stdout assertion | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| `session_status` observation | parsed `visible`, `active`, `state`, details/errors | gateway/session monitor | launch verifier | finite poll attempts | launch JSON. |
| ACP launch | runtime/model/agent/cwd/label/prompt | session launch wrapper | common lifecycle spawn | timeoutSeconds | session key/run id/stream log evidence. |
| Subagent launch | runtime/model/cwd/label/prompt | session launch wrapper | common lifecycle spawn | timeoutSeconds | session key/run id/stream log evidence. |
| Session cleanup | kill request with runtime/model/agent/label and gateway identity | launch verifier | common lifecycle kill | 30s confirm/cleanup timeouts | cleanup result in launch JSON. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Runtime packaging collisions/imports | `check-runtime-collisions.mjs` | High packaging/source/runtime import coverage | None found. |
| Nova startup/API/help | `check-nova-startup-smoke.mjs` | Focused startup/API check | None found. |
| Buster startup/status/shutdown bindings | `check-buster-startup-smoke.mjs` | Focused startup/API/source check | None found. |
| Final gate lock/launch hardening | `check-final-gate-hardening.mjs` | Strong lock and launch assessment fixtures | None found. |
| ACP launch reachability | `check-acp-launch.mjs` + launch lib | Live local/provider-specific coverage | Explicit local smoke, not clean-checkout default. |
| Subagent launch reachability | `check-subagent-launch.mjs` + launch lib | Live runtime coverage | Requires live gateway/session runtime. |

Validation evidence:

```text
node --check tests/verification/runtime/check-acp-launch.mjs
node --check tests/verification/runtime/check-buster-startup-smoke.mjs
node --check tests/verification/runtime/check-final-gate-hardening.mjs
node --check tests/verification/runtime/check-nova-startup-smoke.mjs
node --check tests/verification/runtime/check-runtime-collisions.mjs
node --check tests/verification/runtime/check-subagent-launch.mjs
node --check tests/verification/runtime/session-launch-lib.mjs
node tests/verification/runtime/check-runtime-collisions.mjs --source-root "$PWD"
node tests/verification/runtime/check-nova-startup-smoke.mjs --source-root "$PWD" # Nova startup smoke passed
node tests/verification/runtime/check-buster-startup-smoke.mjs --source-root "$PWD" # Buster startup smoke passed
node tests/verification/runtime/check-final-gate-hardening.mjs --source-root "$PWD" # ok true, 4 checks, 0 failed
git diff --check
```

Live ACP/subagent launch wrappers were syntax-checked and their shared launch assessment paths were exercised by final gate hardening; the actual live launch smokes remain explicit runtime/provider checks.

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
