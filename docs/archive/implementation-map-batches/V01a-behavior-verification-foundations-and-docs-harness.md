# Batch V01a — Behavior verification foundations and docs harness

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/behavior/README.md
tests/verification/behavior/areas/README.md
tests/verification/behavior/verify.mjs
tests/verification/behavior/areas/docs-surface.mjs
tests/verification/behavior/areas/foundations.mjs
tests/verification/behavior/areas/repo-docs.mjs
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/behavior/README.md
kubeclaw-main/tests/verification/behavior/areas/README.md
kubeclaw-main/tests/verification/behavior/verify.mjs
kubeclaw-main/tests/verification/behavior/areas/docs-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
kubeclaw-main/tests/verification/behavior/areas/repo-docs.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/lib/lifecycle-audit-lib.mjs
kubeclaw-main/tests/verification/lib/fake-redis-lib.mjs
kubeclaw-main/tests/verification/behavior-verification.md
kubeclaw-main/tests/verification/README.md
```

## Per-file map

### `tests/verification/behavior/README.md`

Role: Short behavior-harness operator README.

Imports/dependencies: Markdown-only documentation.

Exports/public surface: Canonical behavior entrypoint, focused rerun examples, logging policy, python prerequisite, area directory pointer.

Defines: Commands for `--list-areas`, `--areas`, `--area`; quiet-by-default log behavior and `VERIFICATION_VERBOSE=1`/`--verbose` switch.

Important variables/state: None.

Calls out to: `tests/verification/behavior/verify.mjs`.

Called by / expected callers: Maintainers and CI operators running behavior checks.

Environment variables / CLI inputs / config fields: Documents `VERIFICATION_VERBOSE=1`, `--verbose`, `--list-areas`, `--areas`, `--area`.

Paths built/read/written: None directly; documents behavior area directory.

Authority behavior: Documentation points to `verify.mjs` as canonical behavior harness.

Error/retry/terminal behavior: Documents `python` prerequisite; no executable behavior.

Verification coverage: `repo-docs.mjs` asserts behavior-verification docs align with live workflow.

Findings: None.

### `tests/verification/behavior/areas/README.md`

Role: Behavior-area inventory and split status note.

Imports/dependencies: Markdown-only documentation.

Exports/public surface: Area file list and statement that `verify.mjs` is fully area-split.

Defines: Current behavior area names and no remaining follow-on areas.

Important variables/state: None.

Calls out to: Area modules listed in the same directory.

Called by / expected callers: Maintainers adding/rerunning behavior areas.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Documentation inventory only; live authority is `AREA_ORDER` and imports in `verify.mjs`.

Error/retry/terminal behavior: None found in scoped files.

Verification coverage: `verify.mjs --list-areas` provides live area inventory; no direct README/list parity test found in scope.

Findings: None.

### `tests/verification/behavior/verify.mjs`

Role: Canonical behavior verification harness entrypoint and area orchestrator.

Imports/dependencies: Node `fs`, `os`, `path`, `http`, `assert`, `child_process.execFileSync`; lifecycle audit library; fake Redis library; all behavior area registrar modules.

Exports/public surface: CLI executable; no module exports.

Defines: `AREA_ORDER`, usage output, selected-area resolver, python prerequisite, generated `.swarm` cleanup, runtime tree materialization, fake gateway server helper, quiet/verbose `record()` wrapper, shared dependency injection object, area registrar table, final JSON summary.

Important variables/state: Parsed `args`; `sourceRoot`, `overlayRoot`, `contractPath`; `selectedAreas`; `verboseLogs`; `checks[]`; generated runtime roots; process env mutation `KUBECLAW_DISABLE_DISCORD_WEBHOOKS=1`.

Calls out to: Runtime materialization/import helpers, fake Redis, HTTP server, filesystem cleanup, all selected area modules, Node process stdout/stderr.

Called by / expected callers: V00 wrappers, docs, maintainers, CI-like local verification.

Environment variables / CLI inputs / config fields: CLI `--source-root`, `--overlay-root`, `--contract`, `--areas`, `--area`, `--verbose`, `--list-areas`, `--help`; env `VERIFICATION_VERBOSE=1`; sets env `KUBECLAW_DISABLE_DISCORD_WEBHOOKS=1`.

Paths built/read/written: Resolves source/overlay roots, telemetry contract path, materialized general/sandbox runtime trees, removes `.swarm` under `process.cwd()` and `sourceRoot` before/after run.

Authority behavior: Owns behavior area selection, shared fixture dependency injection, quiet log buffering policy, and final behavior summary shape.

Error/retry/terminal behavior: Unknown areas throw with supported-area list. Missing python throws before runtime materialization. `record()` buffers console/stdout/stderr and prints buffered logs only on check failure unless verbose. Fake gateway returns HTTP 500 JSON `{error}` on handler exception. `finally` cleanup removes generated `.swarm` artifacts. No retry/backoff.

Verification coverage: Self-validating through selected area runs; V01a validation executed `foundations,docs-surface,repo-docs`.

Findings: None.

### `tests/verification/behavior/areas/docs-surface.mjs`

Role: Behavior area that verifies docs/operator surfaces for pipeline README, observability references, trust boundaries, semgrep docs, and live `latest.json`/summary artifact pointer behavior.

Imports/dependencies: No static imports; uses injected `record`, filesystem/path/os/assert helpers, `importRuntimeModule`, runtime roots, status-store and summary modules.

Exports/public surface: `registerDocsSurfaceArea(deps)`.

Defines: Six behavior records covering canonical docs links, latest pointer docs, trust boundaries, semgrep discovery text, `initLogDir()` latest pointer output, and `writeSummary()` artifact pointer parity.

Important variables/state: Temporary directories per runtime check; opened pipeline log streams closed explicitly when present.

Calls out to: Runtime status-store `initLogDir`; runtime summary `writeSummary`; filesystem reads/writes; assertions over docs and generated artifacts.

Called by / expected callers: `verify.mjs` when `docs-surface` is selected.

Environment variables / CLI inputs / config fields: Inherited deps only; no direct env/CLI reads.

Paths built/read/written: Reads docs and Helm template; creates temp `.swarm/logs/pipeline/latest.json`, run `summary.json`, run-scoped artifact paths.

Authority behavior: Verifies docs and generated artifact pointer authority, especially latest pointer is operator pointer only and not lifecycle/session authority.

Error/retry/terminal behavior: Assertion failure fails the record; `record()` in harness controls buffered diagnostics.

Verification coverage: Direct behavior assertions.

Findings: None.

### `tests/verification/behavior/areas/foundations.mjs`

Role: Large foundational behavior area covering temp lifecycle, packaged helper ownership, runtime/index surface narrowing, correlation provenance, failure semantics, plugin registry/context contracts, lifecycle/read-model authority, cooldown replay, Buster monitor/queue basics, and public surface removals.

Imports/dependencies: No static imports; uses injected runtime modules, filesystem/path/os/assert helpers, fake Redis helpers, materialized runtime roots, and Buster sandbox runtime module.

Exports/public surface: `registerFoundationsArea(deps)`.

Defines: `anyPluginConfigSchema()`, `captureThrows()`, and 28 behavior records.

Important variables/state: Temporary repos/swarms, fake registries/plugins, lifecycle event logs, status/read model artifacts, pipeline lock files, fake Buster task entries, and in-memory call arrays.

Calls out to: Runtime modules for temp, registry, context, pipeline runner, orchestration, lifecycle-state, status-store, failures, failure-semantics, rate-limit, artifact-bundle, correlation, common monitor, telemetry, and Buster pipeline.

Called by / expected callers: `verify.mjs` when `foundations` is selected; default behavior harness includes it.

Environment variables / CLI inputs / config fields: Inherited deps only; constructs representative config/progress objects including plugin configs, feature flags, telemetry disabled, lifecycle paths, run ids, and Buster session options.

Paths built/read/written: Temp manager scratch dirs; materialized `/app/skills` runtime trees; temp repo `.swarm/logs/**`; modules/gates/status JSON files; active run lock path `.swarm/logs/pipeline/active-run.lock.json`; generated plugin artifact bundle paths.

Authority behavior: Verifies foundational authority boundaries: common helper ownership, narrow public index, canonical lifecycle events over compatibility status projections, gate output over diagnostic gate status fallback, plugin registry/type authority, capability-scoped plugin context, cooldown replay authority, and serialized pipeline run lock authority.

Error/retry/terminal behavior: Assertions intentionally cover thrown errors for invalid registries/configs, rejected legacy worker results, status guard violations, malformed locks, missing canonical attempts, invalid generator payloads, and Buster timeout kill confirmation. Harness record wrapper handles diagnostics.

Verification coverage: Direct behavior assertions; this area is itself coverage for many implementation batches.

Findings: None.

### `tests/verification/behavior/areas/repo-docs.mjs`

Role: Behavior area that verifies repository docs and hardening trackers point at current verification/runtime authority rather than stale paths or host-specific evidence.

Imports/dependencies: No static imports; uses injected filesystem/path/assert helpers.

Exports/public surface: `registerRepoDocsArea(deps)`.

Defines: Nine behavior records for behavior verification docs, hardening tracker entrypoints, packaging docs, suite/default authority, project summary fallback path, visual-reg docs, semgrep docs, and platform config discovery.

Important variables/state: None beyond loaded document text.

Calls out to: Filesystem reads of docs, scripts, charts, and source files.

Called by / expected callers: `verify.mjs` when `repo-docs` is selected.

Environment variables / CLI inputs / config fields: No direct env/CLI reads; asserts docs mention config/env semantics such as `SWARM_CONFIG` fallback and OpenClaw home semgrep defaults.

Paths built/read/written: Reads repository docs and scripts; no writes.

Authority behavior: Verifies documentation authority points to tests-owned verification entrypoints and source-relative runtime paths.

Error/retry/terminal behavior: Assertion failure fails the record through the harness.

Verification coverage: Direct behavior assertions.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| V00 wrappers/docs | `behavior/verify.mjs` | CLI options and final JSON summary | Canonical behavior harness entrypoint. |
| `verify.mjs` | lifecycle audit lib | `parseArgs`, root/contract resolution, runtime materialization/import helpers | Shared verification fixture setup. |
| `verify.mjs` | fake Redis lib | `installFakeRedis`, `xaddEvents`, `flushAsync` | Injected into areas that need Redis behavior. |
| `verify.mjs` | `docs-surface.mjs` | `registerDocsSurfaceArea(sharedAreaDeps)` | Docs/artifact pointer verification. |
| `verify.mjs` | `foundations.mjs` | `registerFoundationsArea(sharedAreaDeps)` | Foundational runtime behavior verification. |
| `verify.mjs` | `repo-docs.mjs` | `registerRepoDocsArea(sharedAreaDeps)` | Repo docs verification. |
| area modules | runtime modules | injected `importRuntimeModule` and pre-imported modules | Behavior records assert materialized runtime behavior. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `verify.mjs resolveSelectedAreas` | no area selected | CLI args | Run all `AREA_ORDER` areas | Default behavior coverage. |
| `verify.mjs resolveSelectedAreas` | unknown area selected | requested names | Throw with supported-area list | Prevents silent skipped verification. |
| `verify.mjs` | `--help` or `--list-areas` | CLI args | Print usage or JSON `{areas}` and exit 0 | Operator discovery. |
| `verify.mjs record` | verbose off | CLI/env | Buffer console/stdout/stderr and print only on failure | Quiet passing runs. |
| `verify.mjs record` | verbose on | CLI/env | Stream logs and include passed check names in summary | Debug mode. |
| `docs-surface.mjs` | Docs or generated latest pointer lacks required field/text | assert checks | Record fails | Keeps docs and artifact pointers aligned. |
| `foundations.mjs` | Invalid plugin/status/lock/worker/generator cases | constructed fixtures | Assertions expect specific throws or result fields | Pins foundational failure boundaries. |
| `repo-docs.mjs` | Docs include stale paths or omit canonical wording | doc text checks | Record fails | Prevents documentation drift. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `verify.mjs cleanupGeneratedVerificationSwarmArtifacts` | `.swarm` dirs under cwd/source root | process cwd and sourceRoot | De-dupe resolved roots, `rm -rf` each `.swarm` | Behavior harness starts/ends without generated swarm artifacts. |
| `verify.mjs record` | console/stdout/stderr functions | check execution | Save originals, replace with buffer writers, restore in catch/finally | Output restored even on failure. |
| `verify.mjs` | `process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS` | static assignment | Force value `1` before areas run | Generic behavior runs never hit live Discord webhooks. |
| `docs-surface.mjs` | temp latest/summary artifacts | runtime status/summary calls | `initLogDir` and `writeSummary` write current run pointer/artifacts | Latest pointer and summary paths stay run-aligned. |
| `foundations.mjs` | temp lifecycle/status/plugin/lock artifacts | representative configs | Runtime modules mutate canonical artifacts; assertions compare projections | Foundational invariants stay executable. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `verify.mjs areaRegistrars` | each registered area | None | None | Skip areas not selected; await selected registrars sequentially. |
| `verify.mjs startGatewayServer` | HTTP request body chunks | None | Server lifetime caller-owned | Handler success returns 200 JSON; handler error returns 500 JSON. |
| `foundations.mjs` records | Runtime-specific loops under test | Test hooks often stub sleep/now | Buster timeout fixture uses spawnedAt/timeoutSeconds/killGraceMs | Assertions verify runtime terminal behavior. |
| `docs-surface.mjs`, `repo-docs.mjs` | None in area modules | None | None | Sequential records only. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `--source-root` | CLI flag | `verify.mjs` via lifecycle audit lib | cwd | Source tree to verify. |
| `--overlay-root` | CLI flag | `verify.mjs` | optional | Overlay tree layered over source root. |
| `--contract` | CLI flag | `verify.mjs` | resolved telemetry contract path | Contract markdown for telemetry/behavior checks. |
| `--areas`, `--area` | CLI flags | `verify.mjs resolveSelectedAreas` | all areas | Comma list or single area selector. |
| `--verbose`, `VERIFICATION_VERBOSE=1` | CLI/env | `verify.mjs` | false | Stream logs and include check names in summary. |
| `--list-areas`, `--help` | CLI flags | `verify.mjs` | false | Discovery/usage exits. |
| `KUBECLAW_DISABLE_DISCORD_WEBHOOKS` | Env var set | `verify.mjs` | forced `1` | Prevents live Discord webhook delivery during generic behavior runs. |
| `python` on PATH | Runtime prerequisite | `verify.mjs assertBehaviorVerifierPrereqs` | required | Representative fixtures invoke `python`. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Materialized runtime roots | lifecycle audit lib called by `verify.mjs` | area modules/runtime imports | verification helper | General and sandbox runtime trees used for behavior assertions. |
| `.swarm` under cwd/source root | `verify.mjs cleanupGeneratedVerificationSwarmArtifacts` | harness cleanup | harness cleanup deletes | Generated verification artifacts only; cleanup runs before and after areas. |
| `.swarm/logs/pipeline/latest.json` | runtime `initLogDir`/`writeSummary` in docs-surface fixtures | docs-surface assertions | runtime status/summary modules | Latest pointer is operator pointer, not lifecycle/session authority. |
| `.swarm/logs/pipeline/runs/<run_id>/summary.json` | summary runtime in docs-surface fixture | docs-surface assertions | runtime summary module | Run-scoped summary artifact. |
| `.swarm/logs/pipeline/active-run.lock.json` | pipeline runner in foundations fixture | foundations assertions | pipeline runner | Serialized shared-swarm run lock. |
| docs/hardening/source files | repo-docs/docs-surface | area assertions | docs/source authors | Documentation drift verification inputs. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Behavior area inventory and order | `verify.mjs AREA_ORDER` and `areaRegistrars` | `--list-areas`, V00 wrappers, area README | Areas README is manual inventory; no explicit parity assertion found. |
| Behavior check result summary | `verify.mjs` | wrapper/operator logs | None. |
| Generic behavior Discord suppression | `verify.mjs` env assignment | Discord runtime integrations during tests | None. |
| Docs-surface expectations | `docs-surface.mjs` | docs maintainers | None. |
| Foundational runtime behavior coverage | `foundations.mjs` | implementation-map and maintainers | None. |
| Repo-docs expectations | `repo-docs.mjs` | docs maintainers | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| `--list-areas` output | `verify.mjs` | JSON object `{areas:string[]}` | `AREA_ORDER` | Operators/wrappers. |
| Final behavior summary | `verify.mjs` | `{sourceRoot:string, overlayRoot:string\|null, selectedAreas:string[], verboseLogs:boolean, passed:number, failed:0, checks?:string[]}` | Local construction; `checks` only in verbose mode | Maintainers/CI logs. |
| Fake gateway response | `verify.mjs startGatewayServer` | success HTTP 200 JSON handler payload; failure HTTP 500 `{error:string}` | JSON parse/handler catch | Runtime gateway tests. |
| Shared area dependency object | `verify.mjs sharedAreaDeps` | helpers, runtime roots, pre-imported runtime modules, fake Redis helpers, assert/fs/os/path, `record` | Local object construction | Area registrars. |
| Docs latest pointer fixture | `docs-surface.mjs` | `run_id`, `status`, `telemetry_stream_key`, artifact relative paths, `authority` role/allow flags | Runtime status/summary modules and assertions | Operators/replay docs. |
| Foundations plugin registry fixtures | `foundations.mjs` | Plugin manifests with `moduleId`, `contractVersion`, `kind`, `hookFamily`, `stageIds`, `capabilities`, `configSchema`, `sourceType`, `trustTier` | Runtime registry validator | Plugin registry behavior checks. |
| Foundations lifecycle/read-model fixtures | `foundations.mjs` | Lifecycle events, module/gate read models, status JSON, cooldown records, approval wait state | Runtime status-store/lifecycle helpers | Foundational behavior assertions. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| V01a scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `verify.mjs resolveSelectedAreas` | Unknown area name | No | None | Throws terminal CLI error | None. |
| `verify.mjs assertBehaviorVerifierPrereqs` | Missing `python` command | No | None | Throws terminal prerequisite error | None. |
| `verify.mjs record` | Check assertion/runtime failure | No wrapper retry | None | Prints buffered output and rethrows | No redaction; captured output comes from underlying check. |
| `verify.mjs startGatewayServer` | Handler exception or bad request handling | No | None | Returns HTTP 500 JSON `{error}` | Error message raw. |
| `verify.mjs cleanupGeneratedVerificationSwarmArtifacts` | Cleanup target missing | N/A | `force:true` recursive rm | Silent success | None. |
| `docs-surface.mjs` | Docs/artifact assertion failure | No | None | Fails behavior record | None. |
| `foundations.mjs` | Expected invalid runtime cases | No | None in area | Assertions require explicit thrown errors/result fields | Runtime-specific; no area redaction. |
| `repo-docs.mjs` | Docs assertion failure | No | None | Fails behavior record | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `verify.mjs resolveSelectedAreas` | Unknown area | Partial | stderr/CLI failure | thrown error with supported area list | CLI runtime | No pipeline telemetry; verifier CLI. |
| `verify.mjs assertBehaviorVerifierPrereqs` | Missing python | Partial | stderr/CLI failure | prerequisite error text | CLI runtime | No pipeline telemetry; verifier CLI. |
| `verify.mjs record` | Check failure | Yes/partial | stderr plus buffered stdout/stderr/runtime logs | `[behavior] FAILED: <name>`, buffered runtime log output | `record` | Main observability path for failed checks. |
| `verify.mjs startGatewayServer` | Handler exception | Partial | HTTP response body | `{error:string}` | fake server catch | Test-local observability only. |
| `verify.mjs cleanupGeneratedVerificationSwarmArtifacts` | Missing cleanup target | None | none | none | none | Silent forced cleanup. |
| `docs-surface.mjs` | Assertion failure | Yes/partial | harness failure output | record name | `record` wrapper | Area itself emits no telemetry. |
| `foundations.mjs` | Assertion/expected-error mismatch | Yes/partial | harness failure output | record name | `record` wrapper | Area itself emits no telemetry beyond runtime under test. |
| `repo-docs.mjs` | Assertion failure | Yes/partial | harness failure output | record name | `record` wrapper | Area itself emits no telemetry. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | `verify.mjs` and area modules | Behavior harness execution and runtime module imports | Required by shebang. |
| `python` | System binary | runtime installed | `verify.mjs` prerequisite | Representative pipeline fixtures invoked by behavior checks | Missing `python` is terminal in direct harness. |
| Node HTTP server | Runtime built-in `http` | Node runtime | `verify.mjs startGatewayServer` | Fake local gateway for behavior checks | Handler failures return HTTP 500 JSON. |
| Lifecycle audit lib | Repo verification library | local source | `verify.mjs` | Args, roots, runtime materialization/imports, file helpers | Shared verifier dependency. |
| Fake Redis lib | Repo verification library | local source | `verify.mjs`/areas | Fake Redis install and event capture | Injected to areas. |
| Materialized general/sandbox runtime trees | Verification fixture | runtime copy | `verify.mjs`, `foundations.mjs`, `docs-surface.mjs` | Test packaged runtime behavior | Runtime materialization failures are terminal. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Behavior area execution | Sequential | `AREA_ORDER` | First thrown area/check aborts harness | final summary only on success; failure record output on error | None. |
| Check logging | Buffered per check by default | `--verbose` / `VERIFICATION_VERBOSE=1` disables buffering | Large output held in memory until pass/fail | `[behavior] buffered runtime log output` on failure | None. |
| Runtime tree materialization | Two trees per run | general and sandbox | Failures abort harness | thrown error | None. |
| Fake gateway server | One local HTTP server per calling record | caller-owned close | Handler exception becomes 500 JSON | HTTP response `{error}` | None. |
| Foundations runtime fixtures | Sequential records | hard-coded temporary repos | First assertion failure aborts selected area | record name and buffered output | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Behavior fake gateway | POST body parsed as JSON and passed to handler | `verify.mjs startGatewayServer` | ACP/gateway behavior records | One local server; no retry in fake server | HTTP 200 handler payload or 500 `{error}`. |
| Foundations monitor/session checks | Session state/status, transcript, child session, gateway label, dispatch/session keys | Runtime monitor/lifecycle modules under test | `foundations.mjs` assertions | Runtime under test owns polling/throttle | Assertions over parsed monitor state, Buster timeout kill, and session correlation. |
| Behavior area deps | `startGatewayServer`, monitor/lifecycle modules, runtime roots | `verify.mjs` | Area registrars | Areas run sequentially | Shared dependency object. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Behavior area selection and output | `verify.mjs` | Good direct source coverage | No separate contract test for final summary schema. |
| Docs-surface behavior | `docs-surface.mjs` | Good docs/artifact assertions | Only selected docs are covered. |
| Foundational runtime behavior | `foundations.mjs` | Broad behavior coverage | Large area can make pinpointing first failure dependent on record name/logs. |
| Repo docs drift | `repo-docs.mjs` | Good source-text docs coverage | Static text assertions require maintenance as docs evolve. |
| Area README inventory | `areas/README.md` | Manual docs coverage | No explicit parity check against `AREA_ORDER` found in scoped files. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
