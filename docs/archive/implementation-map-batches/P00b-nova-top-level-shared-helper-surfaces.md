# Batch P00b — Nova top-level shared helper surfaces

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/git-primitives.js
skills/nova/pipeline/lifecycle-state.js
skills/nova/pipeline/noncritical-reporting.js
skills/nova/pipeline/redaction.js
skills/nova/pipeline/security.js
skills/nova/pipeline/telemetry.js
skills/nova/pipeline/timing.js
```

Scope expansion verified: 7 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/git-primitives.js
kubeclaw-main/skills/nova/pipeline/lifecycle-state.js
kubeclaw-main/skills/nova/pipeline/noncritical-reporting.js
kubeclaw-main/skills/nova/pipeline/redaction.js
kubeclaw-main/skills/nova/pipeline/security.js
kubeclaw-main/skills/nova/pipeline/telemetry.js
kubeclaw-main/skills/nova/pipeline/timing.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/common/pipeline/git-primitives.js
kubeclaw-main/skills/common/pipeline/lifecycle-state.js
kubeclaw-main/skills/common/pipeline/noncritical-reporting.js
kubeclaw-main/skills/common/pipeline/redaction.js
kubeclaw-main/skills/common/pipeline/security.js
kubeclaw-main/skills/common/pipeline/telemetry.js
kubeclaw-main/skills/common/pipeline/timing.js
kubeclaw-main/tests/verification/contracts/check-common-helper-import-surface.mjs
```

## Per-file map

### `skills/nova/pipeline/git-primitives.js`

Role: Repo-local Nova compatibility facade for shared Git primitives.

Imports/dependencies: Static re-export from `../../common/pipeline/git-primitives.js`.

Exports/public surface: Re-exports common `getRepoRoot`, `gitExec`, `getCurrentBranch`, `setRepoRoot`, `headHash`, and `invalidateHeadHash`.

Defines: No local functions, constants, state, or runtime logic.

Important variables/state: None locally. Adjacent common owner has repo-root/head-hash caches, but this shim does not mutate them directly.

Calls out to: Static ESM re-export only.

Called by / expected callers: `skills/nova/pipeline/core/git-context.js` imports `../git-primitives.js`; contract tests assert common-helper shim ownership.

Environment variables / CLI inputs / config fields: None in scoped file.

Paths built/read/written: Static relative import path only. Common owner uses Git repo paths outside this scoped shim.

Authority behavior: Compatibility shim only; canonical implementation authority is `skills/common/pipeline/git-primitives.js`, and production packaging overwrites `/app/skills/pipeline/git-primitives.js` with that common implementation.

Error/retry/terminal behavior: No local error handling. Import failure propagates to importer. Re-exported common functions may throw or swallow Git failures depending on helper; common implementation is adjacent evidence, with full common-helper review deferred to C00a.

Verification coverage: `tests/verification/contracts/check-common-helper-import-surface.mjs` asserts Nova/Buster shims re-export common helper paths and tests common Git cache behavior.

Findings: None.

### `skills/nova/pipeline/lifecycle-state.js`

Role: Repo-local Nova compatibility facade for shared lifecycle state mutation helpers.

Imports/dependencies: Static re-export from `../../common/pipeline/lifecycle-state.js`.

Exports/public surface: Re-exports common lifecycle helpers including `transitionModuleStatus`, `startModulePhase`, terminal/block/active-agent helpers, pending mutation helpers, retry-status helper, and normalizer.

Defines: No local functions, constants, state, or runtime logic.

Important variables/state: None locally. Adjacent common owner mutates module status objects and stores non-enumerable pending lifecycle mutations on the object via `Symbol.for('kubeclaw.pipeline.pendingLifecycleMutation')`.

Calls out to: Static ESM re-export only.

Called by / expected callers: Nova module runners, pipeline recovery, shutdown, Git worktree, rate-limit, polling, status-store, project-summary, and failure retry policy import this production-local shim path.

Environment variables / CLI inputs / config fields: None in scoped file.

Paths built/read/written: Static relative import path only.

Authority behavior: Compatibility shim only. Runtime callers import the production-local `../lifecycle-state.js` surface; common helper owns implementation in repo/dev and production image overwrite owns `/app/skills/pipeline/lifecycle-state.js`.

Error/retry/terminal behavior: No local handling. Common lifecycle owner throws `status object is required` for invalid status objects and `unsupported module phase: <phase>` for invalid phases; shim adds no telemetry.

Verification coverage: `check-common-helper-import-surface.mjs`; multiple behavior tests import `/app/skills/pipeline/lifecycle-state.js`, but those are outside P00b scope.

Findings: None.

### `skills/nova/pipeline/noncritical-reporting.js`

Role: Repo-local Nova compatibility facade for shared noncritical incident reporting and sanitization helpers.

Imports/dependencies: Static re-export from `../../common/pipeline/noncritical-reporting.js`.

Exports/public surface: Re-exports common `sanitizeNonBlockingErrorDetail`, `buildNonBlockingIncidentKey`, `normalizeNonBlockingErrorDetail`, and `reportClassifiedNonBlockingError`.

Defines: No local functions, constants, state, or runtime logic.

Important variables/state: None locally. Adjacent common owner maintains an in-memory `_reportedNonBlockingIncidents` dedupe set.

Calls out to: Static ESM re-export only.

Called by / expected callers: Nova Discord integration, telemetry dispatch/stream, observability, failure incidents, and Redis log helpers import this production-local shim path.

Environment variables / CLI inputs / config fields: None in scoped file.

Paths built/read/written: Static relative import path only.

Authority behavior: Compatibility shim only. Common helper owns noncritical incident keying, secret-sanitized detail formatting, dedupe, and fallback stderr reporting.

Error/retry/terminal behavior: No local handling. Common reporter returns `false` when no key, duplicate key, or stderr write failure; otherwise logs through supplied `log`, supplied `fallback`, or `process.stderr`.

Verification coverage: `check-common-helper-import-surface.mjs`; observability catch-reporting contract tests reference common noncritical-reporting source.

Findings: None.

### `skills/nova/pipeline/redaction.js`

Role: Repo-local Nova compatibility facade for shared redaction, Discord sanitization, prompt artifact, and transcript summary helpers.

Imports/dependencies: Static re-export from `../../common/pipeline/redaction.js`.

Exports/public surface: Re-exports common `shortHash`, `redactSecrets`, `buildRedactionMarker`, `summarizeStructuredValue`, `formatSummaryForDiscord`, `sanitizeTelemetryPayload`, `sanitizeDiscordMessage`, `summarizePayloadForDiscord`, `writeRedactedPromptArtifact`, and `copyRedactedTranscriptArtifact`.

Defines: No local functions, constants, state, or runtime logic.

Important variables/state: None locally. Adjacent common owner defines secret/content key patterns and transcript head/tail retention constants.

Calls out to: Static ESM re-export only.

Called by / expected callers: Nova review/buster gate runners, Redis tool, Discord integration, telemetry stream, polling session-end, gate-fix scaffold, arch validator, case-study, status-store, and summary helpers import the production-local shim path.

Environment variables / CLI inputs / config fields: None in scoped file.

Paths built/read/written: Static relative import path only. Adjacent common owner reads transcript source paths and writes redacted prompt/transcript artifacts when called by downstream modules.

Authority behavior: Compatibility shim only; common helper owns the redaction policy surface, while downstream services own when artifacts are created.

Error/retry/terminal behavior: No local handling. Common transcript summarization catches per-line JSON parse failures and reports once through noncritical reporting fallback to stderr; filesystem read/write errors propagate.

Verification coverage: `check-common-helper-import-surface.mjs`; redaction behavior tests are outside P00b.

Findings: None.

### `skills/nova/pipeline/security.js`

Role: Repo-local Nova compatibility facade for shared path and command-string security helpers.

Imports/dependencies: Static re-export from `../../common/pipeline/security.js`.

Exports/public surface: Re-exports common `isPathInside`, `resolveScopedPath`, `validateAllowedPath`, and `tokenizeCommandString`.

Defines: No local functions, constants, state, or runtime logic.

Important variables/state: None locally. Adjacent common owner defines default allowed path prefixes and shell metacharacter rejection pattern.

Calls out to: Static ESM re-export only.

Called by / expected callers: Nova project-summary tool imports `validateAllowedPath`; Buster suites use their equivalent shim. Contract tests verify common helper import boundaries.

Environment variables / CLI inputs / config fields: None in scoped file.

Paths built/read/written: Static relative import path only. Adjacent common owner resolves path inputs against base/scope directories but writes none.

Authority behavior: Compatibility shim only. Common helper owns allowed-prefix validation, scoped path escaping checks, and shell command tokenization rules.

Error/retry/terminal behavior: No local handling. Common helpers throw on empty/non-string paths, null bytes, scope escapes, disallowed prefixes, empty command strings, newline/null byte characters, shell metacharacters, trailing escape, unterminated quote, or no tokens.

Verification coverage: `check-common-helper-import-surface.mjs`; Buster repo-scoped path contract tests import common security helpers.

Findings: None.

### `skills/nova/pipeline/telemetry.js`

Role: Repo-local Nova compatibility facade for shared telemetry transport constants and Redis constructor/key helpers.

Imports/dependencies: Static re-export from `../../common/pipeline/telemetry.js`.

Exports/public surface: Re-exports common `TELEMETRY_STREAM_PREFIX`, `TELEMETRY_SEQ_PREFIX`, `TELEMETRY_SEQ_TTL_SECONDS`, `TELEMETRY_STREAM_MAXLEN`, `loadRedisCtor`, `getTelemetryStreamKey`, and `getTelemetrySeqKey`.

Defines: No local functions, constants, state, or runtime logic.

Important variables/state: None locally. Adjacent common owner defines telemetry stream prefix constants and loads `ioredis` through `createRequire`.

Calls out to: Static ESM re-export only.

Called by / expected callers: Nova telemetry stream and artifact bundle import this top-level shim path; service-level telemetry is in `skills/nova/pipeline/services/telemetry.js` and is a separate batch.

Environment variables / CLI inputs / config fields: None in scoped file.

Paths built/read/written: Static relative import path only; adjacent common owner builds Redis key strings, not filesystem paths.

Authority behavior: Compatibility shim only. Common helper owns shared telemetry Redis key naming constants; Nova service telemetry owns event construction/sinks elsewhere.

Error/retry/terminal behavior: No local handling. Common `loadRedisCtor` catches `require('ioredis')` failure and throws a wrapped `Error('ioredis is required for pipeline telemetry transport')` with `cause`.

Verification coverage: `check-common-helper-import-surface.mjs`; telemetry service contracts are outside P00b.

Findings: None.

### `skills/nova/pipeline/timing.js`

Role: Repo-local Nova compatibility facade for shared timing primitive.

Imports/dependencies: Static re-export from `../../common/pipeline/timing.js`.

Exports/public surface: Re-exports common `sleep(ms)`.

Defines: No local functions, constants, state, or runtime logic.

Important variables/state: None.

Calls out to: Static ESM re-export only.

Called by / expected callers: Nova orchestration healthcheck, Git worktree, polling session-end, ACP observability, and polling helpers import this shim path.

Environment variables / CLI inputs / config fields: None in scoped file.

Paths built/read/written: Static relative import path only.

Authority behavior: Compatibility shim only; common helper owns timing primitive implementation.

Error/retry/terminal behavior: No local handling. Common `sleep(ms)` resolves after `setTimeout(ms)` and does not reject on its own.

Verification coverage: `check-common-helper-import-surface.mjs`; runtime session-launch helper imports common timing directly.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `skills/nova/pipeline/git-primitives.js` | `skills/common/pipeline/git-primitives.js` | `export *` | Nova shim delegates all Git primitive exports to common owner. |
| `skills/nova/pipeline/lifecycle-state.js` | `skills/common/pipeline/lifecycle-state.js` | `export *` | Nova shim delegates all lifecycle-state exports to common owner. |
| `skills/nova/pipeline/noncritical-reporting.js` | `skills/common/pipeline/noncritical-reporting.js` | `export *` | Nova shim delegates all noncritical reporting exports to common owner. |
| `skills/nova/pipeline/redaction.js` | `skills/common/pipeline/redaction.js` | `export *` | Nova shim delegates all redaction exports to common owner. |
| `skills/nova/pipeline/security.js` | `skills/common/pipeline/security.js` | `export *` | Nova shim delegates all security exports to common owner. |
| `skills/nova/pipeline/telemetry.js` | `skills/common/pipeline/telemetry.js` | `export *` | Nova shim delegates telemetry constants/key helpers to common owner. |
| `skills/nova/pipeline/timing.js` | `skills/common/pipeline/timing.js` | `export *` | Nova shim delegates timing primitive to common owner. |
| `skills/nova/pipeline/core/git-context.js` | `skills/nova/pipeline/git-primitives.js` | `getRepoRoot`, `gitExec`, `getCurrentBranch`, `setRepoRoot`, `headHash`, `invalidateHeadHash` | Expected Nova production-local import path. |
| Nova module/status/rate-limit/polling/failure services | `skills/nova/pipeline/lifecycle-state.js` | lifecycle mutation helpers | Expected callers use shim path rather than `skills/common/pipeline` directly. |
| Nova observability/Discord/Redis/failure services | `skills/nova/pipeline/noncritical-reporting.js` | noncritical reporting helpers | Expected callers use shim path. |
| Nova gate/status/summary/Discord/telemetry helpers | `skills/nova/pipeline/redaction.js` | redaction/artifact helpers | Expected callers use shim path. |
| `skills/nova/pipeline/tools/project-summary.js` | `skills/nova/pipeline/security.js` | `validateAllowedPath` | Expected caller for Nova security shim in current search results. |
| `skills/nova/pipeline/services/telemetry-stream.js`; `skills/nova/pipeline/services/artifact-bundle.js` | `skills/nova/pipeline/telemetry.js` | Redis telemetry constants/key helpers | Top-level telemetry shim is separate from service-level telemetry emitters. |
| Nova polling/ACP/Git wait helpers | `skills/nova/pipeline/timing.js` | `sleep` | Expected callers use shim path. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| Scoped P00b shim files | None found in scoped files | None | Static `export *` only | Confirms no Nova-specific branch logic lives in these top-level helper facades. |

Adjacent common-owner logic read for surface context but deferred to C00a for full common-helper authority: `git-primitives.js` branch fallback from detached HEAD to newest origin ref then `main`; `lifecycle-state.js` status/phase route selection; `redaction.js` key/pattern-based sanitization; `security.js` path/command rejection guards; `telemetry.js` Redis constructor load failure wrapping.

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| Scoped P00b shim files | None found in scoped files | None | Static re-export only | Shims do not own mutable state. |

Adjacent common-owner state observed for context: Git helper caches repo roots and head hashes per repo; lifecycle helper mutates status objects/history/active-agent/completion fields and stores non-enumerable pending lifecycle mutation records; noncritical reporting dedupes incidents in memory.

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| Scoped P00b shim files | None found in scoped files | None | None | None |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | P00b scoped files are static re-export shims and read no environment variables, CLI flags, config fields, or process inputs. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `../../common/pipeline/git-primitives.js` | Static import specifier in `skills/nova/pipeline/git-primitives.js` | ESM loader | None | Common owner for Git primitives. |
| `../../common/pipeline/lifecycle-state.js` | Static import specifier in `skills/nova/pipeline/lifecycle-state.js` | ESM loader | None | Common owner for lifecycle state helpers. |
| `../../common/pipeline/noncritical-reporting.js` | Static import specifier in `skills/nova/pipeline/noncritical-reporting.js` | ESM loader | None | Common owner for noncritical reporting helpers. |
| `../../common/pipeline/redaction.js` | Static import specifier in `skills/nova/pipeline/redaction.js` | ESM loader | None | Common owner for redaction helpers. |
| `../../common/pipeline/security.js` | Static import specifier in `skills/nova/pipeline/security.js` | ESM loader | None | Common owner for security helpers. |
| `../../common/pipeline/telemetry.js` | Static import specifier in `skills/nova/pipeline/telemetry.js` | ESM loader | None | Common owner for telemetry Redis constants/key helpers. |
| `../../common/pipeline/timing.js` | Static import specifier in `skills/nova/pipeline/timing.js` | ESM loader | None | Common owner for timing primitive. |
| `/app/skills/pipeline/<helper>.js` | Production packaging described by `skills/nova/pipeline/README.md`; verified by helper import contract | Runtime callers | Image build overwrites Nova shim path with common implementation | P00b confirms repo-local shim source matches runtime overwrite assumption. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Nova top-level shared helper shim files | `skills/nova/pipeline/*.js` shim files in P00b, each as static facade only | Nova production-local imports and tests | None. |
| Shared helper implementation authority | `skills/common/pipeline/{git-primitives,lifecycle-state,noncritical-reporting,redaction,security,telemetry,timing}.js` | Nova/Buster compatibility shims and runtime `/app/skills/pipeline/*` overwrite | Common helper algorithms are captured in C00a; P00b only confirms Nova shim surface. |
| Production-local import boundary | Nova runtime modules importing `../<helper>.js` or similar local shim path | `check-common-helper-import-surface.mjs` | None. Contract forbids direct `common/pipeline` imports outside shims. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Nova shared-helper shim module namespace | Each P00b shim file | Static ESM module with only re-exported named exports from corresponding `skills/common/pipeline/*.js` file | ESM loader plus `check-common-helper-import-surface.mjs` source assertion | Nova runtime modules importing production-local helper paths. |
| Lifecycle pending mutation record exposed through shim | Adjacent common `lifecycle-state.js` functions | Non-enumerable symbol value with keys such as `eventType` or `lifecycleIntent`, `oldStatus`, `newStatus`, `previousPhase`, `phase`, `now`, `note`, plus optional `completionSummary`, `activeAgent`, `attemptStartedAt`, `phaseStartedAt`, `completedAt`, `clearActiveAgent`, and blocked fields | `peekPendingLifecycleMutation`, `updatePendingLifecycleMutation`, `consumePendingLifecycleMutation` | Status-store and lifecycle projection callers outside P00b. |
| Noncritical incident log line | Adjacent common `reportClassifiedNonBlockingError` | Text line `[<reporter>] <message> (classification=<classification>)[: <detail>]`; deduped by incident key | `normalizeNonBlockingErrorDetail`; secret sanitizer | Supplied log/fallback or stderr. |
| Redaction structured summary | Adjacent common `summarizeStructuredValue` | `{ redacted: true, label, value_type, json_bytes, sha256, keys?, item_count?, identifiers? }` | Safe identifier picker and `shortHash` | Discord formatting and payload summaries. |
| Redacted transcript artifact | Adjacent common `copyRedactedTranscriptArtifact` | JSONL first row `{ type: 'transcript.summary', redacted: true, total_events, stored_events, truncated, sha256 }`, followed by per-event rows `{ index, ts, kind, phase, offset, redacted: true, text_chars, text_sha256 }` | Per-line JSON parse fallback and redaction summary builder | Downstream artifact readers. |
| Telemetry Redis key constants | Adjacent common `telemetry.js` | Stream key `pipeline:telemetry:<project\|unknown>:<runId\|unknown>`; sequence key `pipeline:telemetry:seq:<project\|unknown>:<runId\|unknown>`; maxlen `10000`; TTL `604800` seconds | `getTelemetryStreamKey`, `getTelemetrySeqKey` | Telemetry stream/artifact services. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | None | None |

Adjacent common `writeRedactedPromptArtifact` can write prompt metadata artifacts, but P00b scoped files do not build prompts or define agent behavior.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| P00b scoped shim files | Static common import/re-export failure | No | No retry/backoff | Importer fails during ESM module resolution/evaluation | None locally. |
| Adjacent common `git-primitives.js getCurrentBranch` | `git rev-parse --abbrev-ref HEAD` failure or detached `HEAD` | Fallback, not retry | Second Git command attempts newest origin ref; no sleep/backoff | Falls back to `HEAD`, then origin ref, then `main` | None. |
| Adjacent common `git-primitives.js headHash` | Missing repo root or Git hash failure | No | No retry/backoff | Missing repo returns empty string; Git failure returns empty string | None. |
| Adjacent common `lifecycle-state.js` helpers | Invalid/missing status object or unsupported phase | No | No retry/backoff | Throws `Error`; caller decides terminal behavior | None. |
| Adjacent common `noncritical-reporting.js reportClassifiedNonBlockingError` | Duplicate incident, missing key, logging/fallback/stderr failure | No | Dedupe by in-memory key; no retry/backoff | Returns `false` for duplicate/no-key/stderr failure; returns `true` when reported | Sanitizes known secret patterns and truncates detail. |
| Adjacent common `redaction.js summarizeTranscriptEvent` | Transcript JSON parse failure | No | Noncritical incident dedupe; no retry/backoff | Reports noncritical debug incident and falls back to raw line metadata | Emits redacted event summary only. |
| Adjacent common `redaction.js write/copy artifact` | Filesystem read/write failure | No | No retry/backoff | Throws to caller | Writes redacted metadata only; source content omitted/summarized. |
| Adjacent common `security.js` validators | Empty path/command, null byte, scope escape, disallowed prefix, shell metacharacter, bad quoting/escape | No | No retry/backoff | Throws `Error`; caller decides terminal behavior | None. |
| Adjacent common `telemetry.js loadRedisCtor` | `ioredis` unavailable | No | No retry/backoff | Throws wrapped `Error` with original cause | None. |
| Adjacent common `timing.js sleep` | Timer delay | Not an error path | Caller-controlled delay | Promise resolves after `setTimeout`; no rejection path | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| P00b scoped shim files | Static common import/re-export failure | No | none | none | ESM loader | Importer receives module load failure; no local telemetry possible in shim. |
| Adjacent common `git-primitives.js getCurrentBranch` | Git branch lookup fallback | No | none | none | Function catches internally | Silent fallback is intentional helper behavior; caller may log context elsewhere. |
| Adjacent common `git-primitives.js headHash` | Missing repo/Git hash failure | No | none | none | Function catches internally | Returns empty string silently. |
| Adjacent common `lifecycle-state.js` helpers | Invalid status or unsupported phase | No | none | none | Function throws | Caller-level services own telemetry. |
| Adjacent common `noncritical-reporting.js reportClassifiedNonBlockingError` | Reported noncritical incident | Yes when not duplicate and output succeeds | Supplied log function, supplied fallback, or process stderr | Text incident line with classification | `reportClassifiedNonBlockingError` | Returns `false` with no telemetry if duplicate/no key/stderr write failure. |
| Adjacent common `redaction.js summarizeTranscriptEvent` | Transcript event parse failed | Yes | process stderr via noncritical fallback unless deduped | `classification=transcript_event_parse_failed` | `reportClassifiedNonBlockingError` from `summarizeTranscriptEvent` | Fallback event summary uses raw line metadata without exposing text. |
| Adjacent common `redaction.js write/copy artifact` | Filesystem read/write failure | No | none | none | `fs.readFileSync`/`fs.writeFileSync` throws | Caller-level services own telemetry. |
| Adjacent common `security.js` validators | Path/command validation rejection | No | none | none | Function throws | Caller-level tools/services own telemetry. |
| Adjacent common `telemetry.js loadRedisCtor` | `ioredis` unavailable | No | none | none | Function throws wrapped error | Telemetry transport loader cannot emit telemetry without Redis dependency. |
| Adjacent common `timing.js sleep` | Timer delay | Not applicable | none | none | `setTimeout` | No error path in helper. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Common shared helper modules | `skills/common/pipeline/*.js` | Internal source | All P00b Nova shim files | Canonical implementation for repo/dev and production overwrite | Import failure terminates importers; C00a owns full common implementation review. |
| Node ESM loader | Node runtime | Observed `v24.14.0` during review | All P00b shim files | Static `export * from ...` resolution | No local catch in shims. |
| Git binary | System `git` | Observed `2.39.5` during review | Adjacent common `git-primitives.js` | `rev-parse`, `for-each-ref` helpers exposed through shim | `gitExec` throws; `getCurrentBranch`/`headHash` have fallback behavior. |
| Node `child_process.execFileSync` | Runtime built-in | Node major 24 observed | Adjacent common `git-primitives.js` | Synchronous Git execution | Default timeout 30000 ms, maxBuffer 50 MiB in `gitExec`. |
| Node `path` built-in | Runtime built-in | Node major 24 observed | Adjacent common `git-primitives.js`, `security.js` | Resolve repo/path scopes | Throws only through helper validation. |
| Node `crypto` built-in | Runtime built-in | Node major 24 observed | Adjacent common `noncritical-reporting.js`, `redaction.js` | Secret/content fingerprints | Deterministic SHA-256 markers. |
| Node `fs` built-in | Runtime built-in | Node major 24 observed | Adjacent common `redaction.js` | Redacted prompt/transcript artifact IO | IO failures propagate. |
| `ioredis` | Node package loaded with `createRequire` | Not pinned in scoped files | Adjacent common `telemetry.js loadRedisCtor` | Redis telemetry transport constructor | Missing package throws wrapped error. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Scoped P00b shim files | None found in scoped files | None | None | None | None. |
| Adjacent common `git-primitives.js gitExec` | Synchronous process timeout/max buffer | `30000` ms timeout; `50 * 1024 * 1024` maxBuffer | `execFileSync` throws on timeout or maxBuffer overflow | None in helper unless caller logs | Full common-helper review deferred to C00a. |
| Adjacent common `telemetry.js` Redis stream constants | Stream maxlen constant | `TELEMETRY_STREAM_MAXLEN = 10000`; sequence TTL `604800` seconds | Enforcement occurs in telemetry stream service, not this helper | None in helper | Confirm stream trimming behavior in telemetry batch P16. |
| Adjacent common `redaction.js copyRedactedTranscriptArtifact` | Transcript summary retention | First 80 events and last 40 events | Middle events omitted when transcript longer than 120 kept indexes | Output artifact has `truncated` boolean and counts | None. |
| Adjacent common `noncritical-reporting.js` | Incident dedupe set | In-memory `_reportedNonBlockingIncidents` | Duplicate incidents return `false` and emit nothing | Return value only | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| None found in scoped files | None | None | None | None | None |

Adjacent redaction transcript summary can summarize ACP/session transcript JSONL lines generically, but P00b scoped files define no ACP protocol semantics.

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Nova and Buster helper shims exist for every `skills/common/pipeline/*.js` helper and re-export common owner | `tests/verification/contracts/check-common-helper-import-surface.mjs` | Strong source-shape coverage; iterates common inventory and checks every Nova/Buster shim | Does not execute every helper through Nova shim path. |
| Runtime code imports production-local shim paths instead of `common/pipeline` directly | `tests/verification/contracts/check-common-helper-import-surface.mjs` | Strong static scan for direct common imports outside shims | Static only. |
| Common Git primitives cache repo-scoped head hashes and invalidation | `tests/verification/contracts/check-common-helper-import-surface.mjs` | Good behavior coverage for Git helper exposed through shim | Focused on common direct import, not Nova shim import. |
| Pipeline README documents repo-local compatibility shims and production `/app/skills/pipeline` surface | `tests/verification/contracts/check-common-helper-import-surface.mjs` | Contract asserts docs wording | README full docs coverage belongs to P00a and docs batches. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
