# Batch C00a — Common root and core pipeline helpers

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/common/discord-purge.js
skills/common/pipeline/cli-args.js
skills/common/pipeline/git-primitives.js
skills/common/pipeline/lifecycle-state.js
skills/common/pipeline/noncritical-reporting.js
skills/common/pipeline/redaction.js
skills/common/pipeline/security.js
skills/common/pipeline/telemetry.js
skills/common/pipeline/timing.js
```

Scope expansion verified live: 9 files, under the 10-file maximum. All scoped files were read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/common/discord-purge.js
kubeclaw-main/skills/common/pipeline/cli-args.js
kubeclaw-main/skills/common/pipeline/git-primitives.js
kubeclaw-main/skills/common/pipeline/lifecycle-state.js
kubeclaw-main/skills/common/pipeline/noncritical-reporting.js
kubeclaw-main/skills/common/pipeline/redaction.js
kubeclaw-main/skills/common/pipeline/security.js
kubeclaw-main/skills/common/pipeline/telemetry.js
kubeclaw-main/skills/common/pipeline/timing.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-common-helper-import-surface.mjs
kubeclaw-main/tests/verification/contracts/check-strict-cli-args-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/redaction-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/shell-boundary.mjs
kubeclaw-main/tests/verification/behavior/areas/telemetry-schema.mjs
```

## Per-file map

### `skills/common/discord-purge.js`

Role: Standalone Discord channel bulk purge CLI/library.

Imports/dependencies: Node `url.fileURLToPath`, `fs`, global `fetch`, Discord REST API v10.

Exports/public surface: default async `deepPurge(channelId, botToken)`.

Defines: Discord auth header normalization, 13.9-day bulk-delete cutoff, fetch/delete loop, symlink-aware CLI entrypoint.

Important variables/state: Per-run `totalDeleted`; no persistent state.

Calls out to: Discord channel messages list, single message DELETE, bulk-delete POST; stderr/stdout CLI JSON.

Called by / expected callers: Operators/automation invoking common helper directly.

Environment variables / CLI inputs / config fields: CLI positional channel id; `DISCORD_CHANNEL` fallback; `DISCORD_TOKEN` required.

Paths built/read/written: No data paths; executable-path comparison only.

Authority behavior: Deletes Discord messages in the supplied channel with bot token authority.

Error/retry/terminal behavior: Message fetch non-OK throws. Bulk and single delete 429 responses sleep `retry_after` seconds and retry. Bulk delete non-OK throws. Old messages stop the loop. Single-delete non-429/non-OK neither throws nor advances; tracked as `C00a-ISSUE-001`.

Verification coverage: No dedicated Discord purge test found in adjacent grep.

Findings: `C00a-ISSUE-001`.

### `skills/common/pipeline/cli-args.js`

Role: Shared strict CLI flag parser.

Imports/dependencies: None.

Exports/public surface: `parseCliArgs(argv, schema)`, `parseCliFlagValues(argv, schema)`.

Defines: Flag schema with types/defaults/required, optional positional handling, min/max positional validation.

Important variables/state: Stateless.

Calls out to: None.

Called by / expected callers: Nova/Buster tools that need strict flag parsing.

Environment variables / CLI inputs / config fields: Parses caller-supplied argv; supports boolean flags and string/value flags with `--name value` or `--name=value`.

Paths built/read/written: None.

Authority behavior: Shared parser rejects unknown flags and unexpected positionals unless explicitly allowed.

Error/retry/terminal behavior: Throws on unexpected positional, unknown flag, bad boolean value, missing value, missing required flag, too few/many positionals.

Verification coverage: `check-strict-cli-args-surface.mjs` asserts consumers use this parser.

Findings: None.

### `skills/common/pipeline/git-primitives.js`

Role: Shared synchronous Git primitives and cached repo/head helpers.

Imports/dependencies: Node `child_process.execFileSync`, `path`, system `git`.

Exports/public surface: `getRepoRoot`, `gitExec`, `getCurrentBranch`, `setRepoRoot`, `headHash`, `invalidateHeadHash`.

Defines: Git timeout/max-buffer defaults, repo root cache, head hash cache, default repo root resolver.

Important variables/state: Module caches `repoRootCache`, `headHashCache`, `defaultRepoRoot`.

Calls out to: Git CLI with argv-safe `execFileSync`.

Called by / expected callers: Common/Nova/Buster helpers through compatibility facades.

Environment variables / CLI inputs / config fields: No direct env reads; uses cwd when no repo root supplied.

Paths built/read/written: Resolves repo root from cwd/config; no writes.

Authority behavior: Provides shared Git read/exec utility but no staging/commit authority.

Error/retry/terminal behavior: Git command failures throw except `getCurrentBranch` and `headHash`, which fall back to `main`/empty string. No retry.

Verification coverage: Import-surface and shell-boundary contracts cover common helper usage patterns.

Findings: None.

### `skills/common/pipeline/lifecycle-state.js`

Role: Shared mutable module lifecycle status helper with pending lifecycle-mutation metadata.

Imports/dependencies: None.

Exports/public surface: pending mutation helpers, `transitionModuleStatus`, `normalizeLifecycleStatus`, `startModulePhase`, `finalizeTerminalModuleState`, `markModuleBlocked`, `getRetryStatusForPhase`, active-agent helpers, `markModuleLifecycleIntent`.

Defines: Status/phase maps, statuses that clear completion/completed timestamps, non-enumerable pending mutation symbol, lifecycle event type derivation.

Important variables/state: Mutates caller-supplied status objects; pending mutation stored under `Symbol.for('kubeclaw.pipeline.pendingLifecycleMutation')` and omitted from JSON enumeration.

Calls out to: None.

Called by / expected callers: Nova/Buster lifecycle/status stores and compatibility facades.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Shared transition semantics for legacy status objects; canonical persistence remains in caller stores.

Error/retry/terminal behavior: Throws when status object missing or unsupported phase. No retry.

Verification coverage: lifecycle-state behavior and status-store contracts cover this surface through higher-level helpers.

Findings: None.

### `skills/common/pipeline/noncritical-reporting.js`

Role: Shared once-per-incident non-blocking error reporter with secret-aware detail sanitizer.

Imports/dependencies: Node `crypto`.

Exports/public surface: `sanitizeNonBlockingErrorDetail`, `buildNonBlockingIncidentKey`, `normalizeNonBlockingErrorDetail`, `reportClassifiedNonBlockingError`.

Defines: Secret regex patterns, fingerprinted redaction marker, module-local reported incident set.

Important variables/state: `_reportedNonBlockingIncidents` suppresses duplicate incident keys per process.

Calls out to: Optional logger/fallback or `process.stderr`.

Called by / expected callers: Telemetry/redaction/observability surfaces.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns common noncritical incident de-duplication and redacted detail formatting.

Error/retry/terminal behavior: Returns false on empty/duplicate incident or stderr write failure. Never throws intentionally.

Verification coverage: Redaction/telemetry behavior tests exercise sanitizer and incident reporting through callers.

Findings: None.

### `skills/common/pipeline/redaction.js`

Role: Shared secret/content redaction, telemetry sanitization, Discord sanitization, redacted prompt artifact writer, and redacted transcript copy helper.

Imports/dependencies: Node `crypto`, `fs`; noncritical reporter.

Exports/public surface: `shortHash`, `redactSecrets`, `buildRedactionMarker`, `summarizeStructuredValue`, `formatSummaryForDiscord`, `sanitizeTelemetryPayload`, `sanitizeDiscordMessage`, `summarizePayloadForDiscord`, `writeRedactedPromptArtifact`, `copyRedactedTranscriptArtifact`.

Defines: Secret patterns, sensitive content key regex, secret key regex, safe identifier allowlist, transcript head/tail caps.

Important variables/state: Stateless except filesystem writes.

Calls out to: Filesystem read/write for redacted prompt/transcript artifacts; noncritical incident reporter for transcript parse failures.

Called by / expected callers: Nova/Buster telemetry, Discord, prompt, transcript, and Redis logging surfaces.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: Writes redacted prompt artifact to caller path; reads source transcript and writes redacted transcript destination.

Authority behavior: Owns common redaction policy for telemetry/Discord/prompts/transcripts.

Error/retry/terminal behavior: Redaction helpers generally return redacted values. Transcript event JSON parse failures report one noncritical incident and fall back to raw line metadata. Filesystem failures throw to caller.

Verification coverage: `redaction-surface.mjs`, telemetry schema, and Discord/operator tests cover major redaction behavior.

Findings: None.

### `skills/common/pipeline/security.js`

Role: Shared path-scope validation, allowed-prefix path validation, and direct-command tokenizer.

Imports/dependencies: Node `path`.

Exports/public surface: `isPathInside`, `resolveScopedPath`, `validateAllowedPath`, `tokenizeCommandString`.

Defines: Default allowed prefixes, shell metacharacter regex, quote/escape-aware tokenizer.

Important variables/state: Stateless.

Calls out to: None.

Called by / expected callers: Nova/Buster suite/tool surfaces and shell-boundary guards.

Environment variables / CLI inputs / config fields: Caller-provided paths/commands/options.

Paths built/read/written: Resolves candidate/base/scope paths; no writes.

Authority behavior: Owns shared path escape and command-string metacharacter rejection policy.

Error/retry/terminal behavior: Throws on null byte, path escape, disallowed prefix, empty command, newline/null byte, shell metacharacters, trailing escape, unterminated quote, or empty tokenization.

Verification coverage: `shell-boundary.mjs` covers scoped path and command safety behavior.

Findings: None.

### `skills/common/pipeline/telemetry.js`

Role: Shared telemetry key constants and Redis constructor loader.

Imports/dependencies: Node `module.createRequire`; npm `ioredis` loaded dynamically.

Exports/public surface: `TELEMETRY_STREAM_PREFIX`, `TELEMETRY_SEQ_PREFIX`, `TELEMETRY_SEQ_TTL_SECONDS`, `TELEMETRY_STREAM_MAXLEN`, `loadRedisCtor`, `getTelemetryStreamKey`, `getTelemetrySeqKey`.

Defines: Canonical stream prefix `pipeline:telemetry`, sequence prefix, 7-day sequence TTL, 10000 stream maxlen.

Important variables/state: None.

Calls out to: CommonJS `require('ioredis')`.

Called by / expected callers: Nova/Buster telemetry transports.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns shared telemetry stream naming constants.

Error/retry/terminal behavior: Missing `ioredis` throws wrapped error with cause.

Verification coverage: `check-telemetry-contract.mjs` asserts shared stream names/maxlen behavior through Nova/Buster transports.

Findings: None.

### `skills/common/pipeline/timing.js`

Role: Shared sleep helper.

Imports/dependencies: None.

Exports/public surface: `sleep(ms)`.

Defines: Promise wrapper around `setTimeout`.

Important variables/state: Stateless.

Calls out to: Timer API.

Called by / expected callers: Polling, retry, rate-limit, and wait loops.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: No runtime authority.

Error/retry/terminal behavior: None.

Verification coverage: Indirect through behavior tests that use sleep/retry loops.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `redaction.js` | `noncritical-reporting.js` | `buildNonBlockingIncidentKey`, `reportClassifiedNonBlockingError` | Transcript parse failures are reported non-blockingly. |
| Nova/Buster telemetry transports | `telemetry.js` | constants, key builders, `loadRedisCtor` | Shared Redis stream identity and dependency loader. |
| Nova/Buster CLI tools | `cli-args.js` | `parseCliArgs`, `parseCliFlagValues` | Shared strict flag parsing. |
| Nova/Buster Git facades | `git-primitives.js` | Git read/exec helpers | Shared argv-safe Git primitive surface. |
| Nova/Buster path/command callers | `security.js` | path validators and tokenizer | Shared path/shell boundary checks. |
| Nova/Buster lifecycle facades | `lifecycle-state.js` | transition/status helpers | Shared legacy status mutation semantics. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `discord-purge.js deepPurge` | No messages or only old messages | Discord message list/timestamps | Break purge loop | Discord bulk delete cannot delete >14-day messages. |
| `discord-purge.js deepPurge` | One eligible message vs many | Eligible ids count | Single DELETE or bulk-delete POST | Discord bulk API behavior differs for single message. |
| `cli-args.js parseCliArgs` | Token starts with `--` | argv token | Parse flag; otherwise reject/store positional | Strict CLI surface. |
| `git-primitives.js getCurrentBranch` | Detached HEAD or Git failure | `rev-parse` result | Try origin refs, fallback `main` | Keeps callers from crashing on branch display. |
| `lifecycle-state.js transitionModuleStatus` | New status and phase opts | status/newStatus/options | Mutates phase, timestamps, summary, pending lifecycle mutation | Shared status transition semantics. |
| `redaction.js sanitizeTelemetryPayload` | Key matches secret/content patterns | Object key/value type | Secret marker, structured summary, or recursive sanitization | Prevents raw secrets/prompts/transcripts in telemetry. |
| `security.js tokenizeCommandString` | Shell metacharacter/newline/null/quote errors | Command string | Throws before tokenization or during tokenizer | Prevents shell-string execution hazards. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `git-primitives.js` | Repo/head caches | start dirs/repo roots | Cache repo roots by resolved start dir; head hashes by resolved repo root; invalidation clears targeted/all | Reduces repeated Git calls. |
| `lifecycle-state.js setPendingLifecycleMutation` | Non-enumerable symbol on status | Mutation object/null | Define configurable/writable non-enumerable symbol; delete on null/consume | Mutation metadata does not serialize into status JSON. |
| `lifecycle-state.js setModuleActiveAgent` | `status.active_agent` | active agent, `merge` option | Merge previous agent by default, replace when `merge:false` | Active-agent updates preserve existing fields unless told otherwise. |
| `noncritical-reporting.js reportClassifiedNonBlockingError` | Incident de-dupe set | resolved incident key | First report logs; duplicate returns false | Avoids repeated noncritical noise. |
| `redaction.js copyRedactedTranscriptArtifact` | Redacted transcript artifact | source transcript lines | Keep first 80 and last 40 unique event indexes; emit summary then event metadata | Large transcripts are bounded and content-redacted. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `discord-purge.js deepPurge` | `while (true)` fetching 100 messages | 1500 ms between batches; rate-limit sleep from `retry_after` | Two-week cutoff uses 13.9 days | No messages, old messages, or thrown error. Single-delete non-429 gap tracked. |
| `cli-args.js parseCliArgs` | Iterate argv tokens | None | None | End of argv then required/positional validation. |
| `redaction.js copyRedactedTranscriptArtifact` | Head/tail index loops | None | Head 80, tail 40 events | Writes bounded JSONL summary. |
| `timing.js sleep` | Timer | Caller-provided ms | `setTimeout(ms)` | Promise resolves once timer fires. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `DISCORD_CHANNEL` | Env var | `skills/common/discord-purge.js` | CLI positional channel takes precedence | Discord purge target channel. |
| `DISCORD_TOKEN` | Env var | `skills/common/discord-purge.js` | Required | Bot token; `Bot ` prefix added when missing. |
| `parseCliArgs` schema | Runtime input | `skills/common/pipeline/cli-args.js` | `{flags:{}, allowPositionals:false}` | Defines allowed flags, defaults, required flags, positional limits. |
| Git repo root input | Runtime input | `skills/common/pipeline/git-primitives.js` | cwd or `setRepoRoot` default | Accepts string or config object with repo fields. |
| Redaction helper paths | Runtime input | `skills/common/pipeline/redaction.js` | Caller-provided | Redacted prompt/transcript artifact source/destination paths. |
| Security path/command options | Runtime input | `skills/common/pipeline/security.js` | Allowed prefixes `/app,/opt,/home,/sandbox,/tmp`; cwd base/scope | Shared path and argv tokenization guards. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Git repo root | `git-primitives.js getRepoRoot` | Git helper callers | None | Cached by resolved start directory. |
| Redacted prompt artifact | `redaction.js writeRedactedPromptArtifact` | Operators/replay | `redaction.js` | Stores metadata/hash only, not prompt content. |
| Redacted transcript artifact | `redaction.js copyRedactedTranscriptArtifact` | Operators/replay | `redaction.js` | Head/tail metadata only, raw text omitted. |
| Scoped path result | `security.js resolveScopedPath` | Caller | None | Rejects null bytes and scope escapes. |
| Telemetry Redis keys | `telemetry.js getTelemetryStreamKey/getTelemetrySeqKey` | Nova/Buster telemetry | Nova/Buster telemetry transports | Prefix authority for canonical telemetry stream/sequence. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Discord purge deletion action | `skills/common/discord-purge.js` | Discord channel state/operators | Single-delete non-429 handling tracked as `C00a-ISSUE-001`. |
| CLI parsing policy | `skills/common/pipeline/cli-args.js` | Nova/Buster tools | None. |
| Common legacy lifecycle mutation semantics | `skills/common/pipeline/lifecycle-state.js` | Nova/Buster status facades/stores | Canonical persistence remains in caller stores. |
| Noncritical incident de-dupe | `skills/common/pipeline/noncritical-reporting.js` | Telemetry/redaction/observability callers | Process-local only by design. |
| Common redaction policy | `skills/common/pipeline/redaction.js` | Telemetry, Discord, prompt/transcript artifacts | None. |
| Common path/command safety policy | `skills/common/pipeline/security.js` | Nova/Buster shell/path boundaries | None. |
| Telemetry key constants | `skills/common/pipeline/telemetry.js` | Nova/Buster telemetry transports | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Discord purge CLI success/error | `discord-purge.js` | Success `{status:'success', deleted_count:number}`; error `{status:'error', error:string}` | CLI wrapper only | Operators/automation. |
| CLI parse result | `cli-args.js` | `{values:object, positionals:string[]}` | Schema flags/defaults/required/min/max checks | Tool CLIs. |
| Pending lifecycle mutation | `lifecycle-state.js` | Lifecycle event mutation fields or `{lifecycleIntent, oldStatus, newStatus, previousPhase, phase, now, note}` | Local transition helpers; non-enumerable symbol | Status-store callers consuming mutation. |
| History entry | `lifecycle-state.js appendHistory` | `{timestamp, from, to, agent, note}` | `ensureHistory` | Legacy status history readers. |
| Nonblocking incident line | `noncritical-reporting.js` | Text line with reporter, message, classification, optional sanitized detail | Secret sanitizer and incident-key de-dupe | stderr/logger/fallback consumers. |
| Telemetry sanitized payload | `redaction.js sanitizeTelemetryPayload` | Recursively sanitized clone; sensitive content summarized, secrets redacted | Key regexes, redaction markers, hashes | Telemetry transports. |
| Discord sanitized message | `redaction.js sanitizeDiscordMessage` | `{content?, embeds?, files:[]}` with sanitized embed fields | Secret/content sanitizers and field cap | Discord webhook callers. |
| Redacted transcript artifact | `redaction.js copyRedactedTranscriptArtifact` | First line `{type:'transcript.summary', redacted:true, total_events, stored_events, truncated, sha256}` then event metadata lines | JSON parse best-effort; head/tail caps | Operators/replay. |
| Telemetry key strings | `telemetry.js` | stream `pipeline:telemetry:<project\|unknown>:<runId\|unknown>`; seq `pipeline:telemetry:seq:<project\|unknown>:<runId\|unknown>` | Key builder defaults | Nova/Buster telemetry transports. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Redacted prompt artifact helper | `redaction.js writeRedactedPromptArtifact` | Caller-provided file path | Prompt content omitted; metadata table records chars/lines/sha256 and sanitized meta | None found in scoped files | Markdown artifact with redacted=true metadata. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `discord-purge.js deepPurge` | Discord fetch/delete failures and rate limits | 429 only | `retry_after` seconds for delete 429; 1500 ms batch delay | Fetch/bulk non-OK terminal; single-delete non-429 gap tracked | Error text returned raw in CLI JSON. |
| `cli-args.js parseCliArgs` | Unknown/bad/missing flags/positionals | No | None | Throws to caller | None. |
| `git-primitives.js` | Git command failures | No | 30000 ms timeout, 50 MiB max buffer | Most commands throw; current branch/head hash fall back | None. |
| `lifecycle-state.js` | Missing status object, unsupported phase | No | None | Throws | None. |
| `noncritical-reporting.js` | Duplicate incidents or stderr failure | No | None | Returns false, does not throw | Secret detail sanitizer with hashed markers. |
| `redaction.js` | Transcript parse failure or filesystem failure | Parse no; fs no | None | Parse reports noncritical and continues; fs read/write throws | Secret/content redaction policy. |
| `security.js` | Unsafe path/command | No | None | Throws | Error includes raw path/command fragment. |
| `telemetry.js loadRedisCtor` | Missing `ioredis` | No | None | Throws wrapped error with cause | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `discord-purge.js deepPurge` | Discord fetch/delete failures | Partial | stderr progress and CLI JSON | `{status:'error', error}` | CLI wrapper | No pipeline telemetry; operator tool. Single-delete gap tracked. |
| `cli-args.js parseCliArgs` | Parse failures | None | Caller decides | none | none | Parser intentionally throws only. |
| `git-primitives.js` | Git failures | None/partial | Caller decides; some fallbacks silent | none | none | Shared primitive intentionally does not report. |
| `lifecycle-state.js` | Invalid status/phase | None | Caller decides | none | none | Pure helper. |
| `noncritical-reporting.js` | Nonblocking incidents | Yes | logger/fallback/stderr | `[reporter] message (classification=...)` | `reportClassifiedNonBlockingError` | De-duped by incident key. |
| `redaction.js` | Transcript parse failure | Yes | noncritical reporter stderr/fallback | `transcript_event_parse_failed` | `reportClassifiedNonBlockingError` | Filesystem failures are caller-owned. |
| `security.js` | Unsafe path/command | None | Caller decides | none | none | Pure guard throws. |
| `telemetry.js loadRedisCtor` | Missing `ioredis` | None | Caller decides | none | none | Transport callers report/degrade. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Discord REST API v10 | External HTTPS API | v10 | `discord-purge.js` | Channel message list/delete/bulk-delete | Delete 429 handled; fetch/single non-429 gaps noted. |
| Git CLI | System binary | runtime installed | `git-primitives.js` | Repo root, branch, head hash, generic git exec | Timeout 30s; max buffer 50 MiB. |
| `ioredis` | npm package | runtime installed | `telemetry.js` | Shared Redis constructor | Missing package throws wrapped error. |
| Node `crypto` | Runtime built-in | Node runtime | `redaction.js`, `noncritical-reporting.js` | Hashes/fingerprints | None. |
| Node `fs` | Runtime built-in | Node runtime | `discord-purge.js`, `redaction.js` | Entry detection and artifact IO | FS errors throw except entry check path. |
| Node `path` | Runtime built-in | Node runtime | `git-primitives.js`, `security.js` | Path resolution and scope checks | None. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Discord purge loop | Batch size 100, eligible bulk delete ids per fetch | Hard-coded Discord API limit | 429 sleeps `retry_after`; old messages stop | stderr progress and CLI JSON | Single-delete non-429 can stall; tracked. |
| Git primitive calls | Synchronous command execution | 30s timeout, 50 MiB max buffer | Throws or fallback depending helper | Caller-owned | None. |
| Noncritical incident reporting | Process-local de-dupe set | One line per incident key | Duplicate reports suppressed | stderr/logger/fallback | None. |
| Redacted transcript copies | Head/tail cap | 80 head, 40 tail events | Middle omitted with summary `truncated:true` | Redacted transcript artifact | None. |
| Telemetry stream constants | Redis stream cap/seq TTL | maxlen 10000, seq TTL 7 days | Transport callers enforce cap/TTL | Telemetry contract tests | None. |
| `sleep(ms)` | One timer per call | Caller-provided | No cancellation | Caller-owned | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| C00a scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Common helper import compatibility | `check-common-helper-import-surface.mjs` | Good surface coverage | Does not execute every helper branch. |
| Strict CLI parser consumer adoption | `check-strict-cli-args-surface.mjs` | Good surface coverage | `discord-purge.js` is not a strict-parser consumer. |
| Redaction behavior | `redaction-surface.mjs`, telemetry schema tests | Good for key telemetry/secret surfaces | Does not cover every transcript parse branch. |
| Shell/path boundary helpers | `shell-boundary.mjs` | Good | None. |
| Discord purge behavior | None found in scoped-adjacent tests | Gap | Add focused tests for single delete error and fetch 429 handling if keeping tool. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `C00a-ISSUE-001` — Discord purge can stall on single-message non-rate-limit delete failures.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
