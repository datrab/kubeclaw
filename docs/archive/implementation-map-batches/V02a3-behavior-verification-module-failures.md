# Batch V02a3 — Behavior verification module failures

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

Split note: V02a3 is the module failure split from the original oversized V02a lifecycle-and-gates batch.

```text
tests/verification/behavior/areas/module-failures.mjs
```

Scope expansion verified live: 1 file, under the 10-file maximum. The scoped file was read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/behavior/areas/module-failures.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/behavior/verify.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/fix-cycles.mjs
kubeclaw-main/tests/verification/lib/lifecycle-audit-lib.mjs
kubeclaw-main/tests/verification/lib/fake-redis-lib.mjs
kubeclaw-main/skills/nova/pipeline/agents/module-workers.js
kubeclaw-main/skills/nova/pipeline/runners/module-runner-buster-worker.js
kubeclaw-main/skills/nova/pipeline/services/status-store.js
```

## Per-file map

### `tests/verification/behavior/areas/module-failures.mjs`

Role: Behavior area covering module-runner worker stage-owner dispatch, worker contract fail-closed behavior, ACP no-change/no-output detail, terminal module failure telemetry, preserved dispatch/session correlation across blocked/resumed/blueprint/git/pre-test/rate-limit paths, failure extraction, retry exhaustion, and shared rate-limit pause/resume ownership.

Imports/dependencies: No static imports; uses injected behavior deps including fake Redis helpers, runtime materialization/import helpers, filesystem/path/os/assert helpers, lifecycle/status modules, and source reader.

Exports/public surface: `registerModuleFailuresArea(deps)`.

Defines: Local `getFieldValue(fields, name)`, `buildBuiltInRegistry(runtimeRoot)`, `seedCanonicalReadyForTestingStatus(statusStoreMod, config, dir, overrides)`, and 24 behavior records.

Important variables/state: Fake Redis globals; temp module/status/log trees; mutable module statuses; fake plugin registries; captured Discord JSONL/calls; active agent/session correlation fields; seeded READY_FOR_TESTING lifecycle fixtures; rate-limit pause/resume status history.

Calls out to: Runtime `module-runner.js`, `core/registry.js`, `core/runtime.js`, `services/status-store.js`, `services/failures.js`, `services/rate-limit.js`, lifecycle-state helpers, and source `module-runner-forge.js` text.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `module-failures` area is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture configs use `project`, `repo_root`, `paths.modules_dir`, `telemetry.enabled`, `_pluginRegistry`, `_logDir`, `_runLogDir`, `_runId`/`run_id`, `_runStats`, `default_timeout_minutes`, `default_max_fails`, `_disable_discord_webhooks`, `rate_limit.max_pauses_per_module`, `rate_limit.cooldown_hours`, and `_testOverrides.moduleRunner` hooks.

Paths built/read/written: Temp `modules/01-scaffold/status.json`; run-scoped `discord.jsonl`; `.swarm/logs`; fake Redis streams `pipeline:telemetry:<project>:<runId>`; source text `skills/nova/pipeline/runners/module-runner-forge.js`.

Authority behavior: Verifies typed worker control results and lifecycle/status helpers are authority for module outcomes; active-agent, Redis, and status cache fields preserve correlation evidence across failure and retry boundaries.

Error/retry/terminal behavior: Invalid Forge/Buster worker contracts return exit 1 with contract diagnostics and FAIL telemetry. Dependency/status/prompt/spawn/git/validation/pre-test/no-change/rate-limit failures produce asserted terminal payloads, module status telemetry, retry scheduled/exhausted telemetry, and Discord evidence where applicable. Rate-limit shared owner records pause and resume module status before returning to active phase.

Verification coverage: Direct behavior assertions for module failure paths; no live ACP/Redis/Discord calls.

Findings: Existing open issue P07-ISSUE-001 reproduced during validation as a guarded `phase_started_at` save failure on Buster crash exhaustion. It was resolved in this batch by reloading raw Buster status snapshots before active-agent finalization saves in adjacent runtime files; focused `module-failures` verification now passes.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `verify.mjs` | `module-failures.mjs` | `registerModuleFailuresArea(sharedAreaDeps)` | Selected behavior area registration. |
| `module-failures.mjs` | module runner | `runModule` | Worker dispatch and terminal module failure matrix. |
| `module-failures.mjs` | registry runtime | `buildPluginRegistry`, fake `stageOwners['worker.execute']` | Forge/Buster worker owner dispatch and invalid contract fixtures. |
| `module-failures.mjs` | status/lifecycle services | `initStatus`, `saveStatus`, `loadStatus`, lifecycle transitions | Seeding READY_FOR_TESTING, active phase, FAIL/BLOCKED fixtures. |
| `module-failures.mjs` | failures service | `extractAgentFailReason`, `handleFail` | Phase-owned detail and retry-exhausted BLOCKED behavior. |
| `module-failures.mjs` | rate-limit service | `withRateLimitRecovery`, `handleRateLimit` | Shared pause/resume owner behavior. |
| `module-failures.mjs` | fake Redis/Discord logs | `xaddEvents`, `flushAsync`, JSONL reads | Telemetry/operator correlation assertions. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `module-failures.mjs` worker stage route | Forge/Buster worker owner returns pass or invalid `ship_it` | typed worker result | pass continues; invalid returns exit 1 with contract diagnostic | Worker plugin boundary authority. |
| `module-failures.mjs` Forge no-change route | transcript active vs stale plus terminal detail | poll result transcript/detail | Different operator reason wording while preserving terminal detail | ACP no-output diagnosis. |
| `module-failures.mjs` terminal stop route | BLOCKED, blueprint, validation, git, prompt, spawn, unexpected status | loaded status/override errors | Terminal stop payload with preserved session/gateway/dispatch correlation | Operator/debug continuity. |
| `module-failures.mjs` pre-test route | infra/code/repeated pre-test outcomes | classifier/failed suite/history | infra stop, repeated stop, or code-side retry | Buster pre-test failure semantics. |
| `module-failures.mjs` retry exhaustion route | fail counts and max retry/crash budgets | status/fail summaries/config | FAIL then BLOCKED plus retry.exhausted | Retry terminal authority. |
| `module-failures.mjs` rate-limit route | Forge/Buster exhausted or pause/resume | rate-limit result/status/active agent | exit 40 with retry.exhausted or pause/resume back to phase | Rate-limit ownership/correlation. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `seedCanonicalReadyForTestingStatus` | module `status.json` | overrides plus canonical lifecycle transitions | Start Forge, transition READY_FOR_TESTING, then assign remaining overrides | READY_FOR_TESTING fixtures use lifecycle helpers. |
| Fake Redis globals | `globalThis.__fakeRedisCalls` / counters | per-record reset | Clear before telemetry assertions | Event assertions isolated. |
| Mutable module statuses | `currentStatus`, seeded status files | fake load/save hooks | Deep clone or assignment per fixture | Terminal results mirror runtime status transitions. |
| Active agent/session metadata | status `active_agent`, Redis entries, poll results | fixture-specific correlation fields | Runtime should copy cached/tracked fields into result/telemetry/Discord | Dispatch/session correlation survives cleanup. |
| Rate-limit status history | module `status.json.history` | rate-limit service pause/resume | Append RATE_LIMITED then resumed active status | Pause/resume lifecycle visible. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| Early EXIT_ERROR scenario loop | `for (const scenario of scenarios)` | None | None | Each early failure must emit FAIL telemetry. |
| Rate-limit exhaustion scenario loop | Forge and Buster scenarios | None in area | max pause budget from fixture/status | exit 40 and retry.exhausted. |
| Shared rate-limit recovery loop | Forge/Buster `withRateLimitRecovery` scenarios | cooldown hours 0; fake no real wait | max pauses per module | First poll rate-limited, second poll ok. |
| Direct `handleRateLimit` compatibility path | single pause/resume helper path | cooldown hours 0 | explicit pause 1/3 | Returns to IN_PROGRESS/forge. |
| V02a3 area execution | Sequential records | None at area level | None | First failed assertion aborts selected area through harness. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| Module progress definitions | Progress fixture | `module-failures.mjs` through module runner | per-record | Module `dir`, `stages`, `test_suites`, retry thresholds. |
| `_pluginRegistry.stageOwners['worker.execute']` | Runtime registry fixture | module runner | built-in plus overrides | Controls typed Forge/Buster worker dispatch. |
| `_testOverrides.moduleRunner` | Test override object | module runner fixtures | per-record fake hooks | Simulates dependencies, prompts, spawn, polling, Redis completion, validation, Discord. |
| `default_timeout_minutes`, `default_max_fails`, module retry fields | Runtime config/progress | module/failure runtime | per-record | Retry/block/terminal thresholds. |
| `rate_limit.max_pauses_per_module`, `cooldown_hours` | Runtime config | rate-limit fixtures | per-record | Pause/exhaustion budgets. |
| `_disable_discord_webhooks` | Runtime config | Discord alert fixtures | true in alert records | Produces audit artifacts without live webhooks. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `modules/01-scaffold/status.json` | status-store/test fixtures | module runner, failure service, rate-limit service, tests | status-store/tests | Canonical module lifecycle/read model. |
| run-scoped `discord.jsonl` | Discord audit runtime | `module-failures.mjs` | runtime under test | Operator evidence for retries, blocked states, pre-test and rate-limit alerts. |
| `pipeline:telemetry:<project>:<runId>` | telemetry runtime/fake Redis | `module-failures.mjs` assertions | runtime under test | Module status, retry, and rate-limit telemetry. |
| `skills/nova/pipeline/runners/module-runner-forge.js` | source authors | `module-failures.mjs` source marker record | source authors | Ensures poll-owned transcript state is reused. |
| temp module/log roots | test fixtures | runtime modules/tests | tests/runtime | Isolated module failure fixtures. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Module lifecycle status | status-store/lifecycle-state runtime | module runner, failure service, rate-limit service | None. |
| Worker control results | typed worker stage owner + module runner validator | module runner result/telemetry | None. |
| Module failure telemetry | module runner/failure/rate-limit services | fake Redis/operators | None. |
| Module operator Discord alerts | module runner/failure/rate-limit services and Discord audit | operators/replay/tests | Audit artifact only; not lifecycle authority. |
| Active agent/session correlation | module runner/status/Redis result caches | terminal payloads, telemetry, Discord | None. |
| Rate-limit pause/resume ownership | shared rate-limit service | module runner and direct compatibility path | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Typed worker control result | worker stage owner/runtime validator | `schemaVersion`, `producerKind:'worker'`, `producerType`, `nextAction`, `diagnostics.summary/metadata` | module runner validator | Module runner. |
| Plugin contract diagnostic | module runner validator | `diagnosticType:'plugin_contract_invalid'`, `stageId`, `validationErrors[]` | runtime contract validator | Error result/telemetry. |
| Module status JSON | status-store/lifecycle helpers | `module_id`, `title`, `status`, `current_phase`, `fail_count`, `history`, timestamps, optional `active_agent`/correlation fields | status-store/lifecycle-state | Module runner/failure/rate-limit services. |
| Module step/stop result | module runner/failure service | `exit`, `reason`, `module`, `module_dir`, `phase`, `attempt`, `dispatch_id`, `gateway_label`, `session_key`, `rate_limit_status?` | runtime builders | Pipeline scheduler/operators. |
| Module telemetry events | telemetry runtime | `module.status_changed`, `retry.scheduled`, `retry.exhausted`, `rate_limit.detected` with module/phase/status/reason/correlation fields | telemetry runtime | Redis stream/operators. |
| Discord module alert entry | Discord audit runtime | JSONL/field objects with run/module/phase/dispatch/gateway/session fields | Discord helper/runtime | Operators/replay/tests. |
| Rate-limit status | rate-limit service/module runner | `attempt`, `session_key`, `gateway_label`, `dispatch_id`, `max_rate_limit_pauses`, `run_id` | rate-limit/module runner | Exit 40 results, telemetry, Discord. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Forge module prompt fixture | `module-failures.mjs` moduleRunner overrides | prompt save path faked | fake prompt text or prompt-build error | fake spawn/poll hooks only | Worker/stage result or terminal failure payload. |
| Buster module prompt fixture | `module-failures.mjs` moduleRunner overrides | prompt save path faked | fake prompt text or prompt-build error | fake Buster spawn/Redis/poll hooks only | Worker/stage result, Redis completion, or terminal failure payload. |
| Worker stage-owner fixtures | `module-failures.mjs` fake registry owners | none | no real prompt; direct typed worker result | plugin context `workerRuntime.dispatch` asserted | Typed worker control result contract. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| V02a3 area records | Assertion/runtime failure | No wrapper retry | None | Harness record fails selected area | No area redaction. |
| `module-failures.mjs` invalid worker contracts | invalid `nextAction` from Forge/Buster worker | No | None | exit 1 with contract diagnostic and FAIL telemetry | Raw diagnostic validation only. |
| `module-failures.mjs` early terminal module failures | dependency, corrupt status, prompt build, spawn, git sync, unexpected status | No area retry | None | exit 1 or stop payload plus FAIL telemetry | Runtime redaction only; area none. |
| `module-failures.mjs` no-change/no-output ACP detail | session ended with no changes and transcript active/stale | No | poll result supplied by fixture | failure reason preserves terminal detail and transcript state; Discord alert emitted | Transcript field may be redacted by runtime. |
| `module-failures.mjs` Buster pre-test/retry/crash failures | infra/code/repeated pre-test, Buster crash, blocked retry exhaustion | Runtime retry logic | retry thresholds and fake poll loops | retry.scheduled, FAIL/BLOCKED, or NEEDS_NOVA/exit 20/10 | Runtime redaction only. |
| `module-failures.mjs` rate-limit exhaustion | Forge/Buster max pauses exceeded | No after exhaustion | max pauses from status/result/config | exit 40 and retry.exhausted before return | Runtime redaction only. |
| `module-failures.mjs` rate-limit pause/resume | transient rate limit | Yes | cooldown hours 0 in fixtures | RATE_LIMITED then resumed active status; Discord pause/resume | Runtime redaction only. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| V02a3 area records | Assertion/runtime failure | Yes/partial | behavior harness stderr/buffered logs | `[behavior] FAILED: <record>` | `verify.mjs record` | Area relies on harness observability. |
| `module-failures.mjs` invalid worker contracts | invalid Forge/Buster worker result | Yes | fake Redis stream | `module.status_changed` FAIL plus contract diagnostic | module runner/telemetry runtime | Fail-closed telemetry asserted. |
| `module-failures.mjs` early terminal failures | dependency/status/prompt/spawn/git/unexpected | Yes | fake Redis stream | `module.status_changed` FAIL | module runner/telemetry runtime | Correlation fields asserted when present. |
| `module-failures.mjs` no-change/no-output detail | ACP no changes/no output | Yes/partial | Discord call capture/result payload | `Module 01 — Forge no changes` alert | module runner Discord path | Telemetry disabled in this fixture; operator alert asserted. |
| `module-failures.mjs` retry/crash/pre-test failures | retry/block/pre-test terminal paths | Yes | fake Redis and run `discord.jsonl` | `retry.scheduled`, `retry.exhausted`, FAIL/BLOCKED, module alert titles | module runner/failure service | Dispatch/session correlation asserted. |
| `module-failures.mjs` rate-limit exhaustion | max pauses exceeded | Yes | fake Redis and Discord calls | `retry.exhausted`, RATE LIMITED Discord titles | module runner/rate-limit service | Event emitted before exit 40 return. |
| `module-failures.mjs` rate-limit pause/resume | transient rate limit | Yes | fake Redis and run `discord.jsonl` | `rate_limit.detected`, `module.status_changed`, pause/resume alerts | shared rate-limit service | Shared owner path asserted. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | `module-failures.mjs` | Behavior execution/runtime imports | Required by harness. |
| Fake Redis lib | repo verification library | local source | `module-failures.mjs` | Telemetry stream capture | Fake globals reset per record. |
| Materialized runtime tree | verification fixture | general runtime copy | `module-failures.mjs` | Runtime module behavior under packaged paths | Import/materialization failures fail records. |
| Plugin registry runtime | Nova runtime | materialized source | `module-failures.mjs` | Worker stage-owner dispatch fixtures | Registry build errors fail records. |
| Filesystem temp dirs | Node `fs`/`os`/`path` | built-ins | `module-failures.mjs` | status/log/Discord fixtures | Corrupt status and status history cases intentionally tested. |
| Discord audit runtime | runtime module under test | materialized source | `module-failures.mjs` | Operator alert JSONL/call capture | Webhooks disabled/faked; audit read from disk. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| V02a3 area execution | Sequential records | harness-selected `module-failures` area | First failed record aborts | harness failure output | None. |
| Early terminal scenario loop | Sequential scenarios | seven early failure scenarios | Each scenario isolated | per-scenario FAIL telemetry | None. |
| Rate-limit exhaustion loop | Sequential Forge/Buster scenarios | max pauses from fixture status/result | exit 40 after exhausted budget | retry.exhausted and Discord | None. |
| Shared rate-limit recovery loop | Sequential Forge/Buster pause/resume | cooldown 0; max pauses 2 | first poll pauses, second succeeds | rate_limit/status/Discord events | None. |
| Fake Redis telemetry | Async fake flush | explicit `flushAsync()` | Assertions wait for emitted events | fake Redis arrays | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Forge module session correlation | tracked agent/poll result with `sessionKey`, `gatewayLabel`, transcript/detail | fake module runner hooks | module runner/failure path | Runtime polling under test | no-change alert and terminal payload fields. |
| Buster module session correlation | spawn result, Redis entry, active_agent, poll status fields | fake Buster hooks/status fixtures | module runner/failure/rate-limit services | Runtime polling/retry under test | FAIL/BLOCKED/retry/rate-limit telemetry and Discord. |
| Worker stage-owner refs | worker input `ids`, `refs.moduleAttemptRef`, `refs.workerDispatchRef` | module runner | fake worker owners/tests | One call per worker run | Stage-owner input assertions. |
| Rate-limit ACP pause/resume | rate-limited status with attempt/session/gateway/dispatch | fake poll/handleRateLimit inputs | shared rate-limit service | cooldown 0 in fixtures | RATE_LIMITED/resumed status events and Discord alerts. |
| V02a3 scoped file | Live ACP gateway calls | None found in scoped file | None found in scoped file | None found in scoped file | ACP/session behavior is simulated by hooks/status objects. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Module worker stage-owner contracts | `module-failures.mjs` | Good Forge/Buster pass and invalid coverage | Fake owners, not live plugins. |
| Module terminal failure telemetry | `module-failures.mjs` | Broad early/terminal path coverage | Representative scenarios only. |
| Dispatch/session correlation preservation | `module-failures.mjs` | Broad status/Redis/active-agent coverage | Fake ACP sessions. |
| Rate-limit pause/exhaustion ownership | `module-failures.mjs` | Good shared service and compatibility path coverage | Fake cooldown/no live provider. |
| Operator Discord module alerts | `module-failures.mjs` | Good JSONL/call assertion coverage | No live Discord delivery. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- P07-ISSUE-001 marked resolved after the V02a3 validation fix.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
