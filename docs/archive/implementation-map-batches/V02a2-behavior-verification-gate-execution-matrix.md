# Batch V02a2 — Behavior verification gate execution matrix

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

Split note: V02a2 is the gate execution matrix split from the original oversized V02a lifecycle-and-gates batch.

```text
tests/verification/behavior/areas/gates.mjs
```

Scope expansion verified live: 1 file, under the 10-file maximum. The scoped file was read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/behavior/verify.mjs
kubeclaw-main/tests/verification/behavior/areas/approvals.mjs
kubeclaw-main/tests/verification/behavior/areas/fix-cycles.mjs
kubeclaw-main/tests/verification/lib/lifecycle-audit-lib.mjs
kubeclaw-main/tests/verification/lib/fake-redis-lib.mjs
```

## Per-file map

### `tests/verification/behavior/areas/gates.mjs`

Role: Behavior area for the gate execution matrix across review and Buster gates, including stage-owner dispatch, plugin contract fail-closed behavior, output contract projection, setup/dispatch/post-start failure telemetry and Discord alerts, malformed/no-output review behavior, rate-limit pause/exhaustion correlation, and Buster gate dependency authority.

Imports/dependencies: Node `fs`/`os`/`path`/`assert`; lifecycle audit `materializeRuntimeTree` and `importRuntimeModule`; fake Redis helpers supplied by harness.

Exports/public surface: `registerGatesArea(deps)`.

Defines: `getFieldValue(fields, name)`, `readJsonl(filePath)`, `buildBuiltInRegistry(runtimeRoot)`, and 34 behavior records.

Important variables/state: Fake Redis globals reset per record; temp `.swarm` and log trees; fake stage-owner registries; captured Discord JSONL/call arrays; fake gate output/status files; Date.now override in rate-limit correlation fixtures with `finally` restore.

Calls out to: Runtime `gate-runner.js`, `review-gate-runner.js`, `buster-gate-runner.js`, `pipeline-runner.js`, `core/runtime.js`, `core/registry.js`, `services/status-store.js`, `services/dependencies.js`.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `gates` area is selected.

Environment variables / CLI inputs / config fields: No direct env reads. Fixture configs use `project`, `repo_root`, `paths.swarm_dir`, `paths.modules_dir`, `telemetry.enabled`, `_pluginRegistry`, `_logDir`, `_runLogDir`, `_runId`/`run_id`, `_runStats`, `default_timeout_minutes`, `default_max_fails`, `poll_interval_seconds`, `rate_limit.max_pauses_per_module`, `_disable_discord_webhooks`, `discord_webhook_url`, and `_testOverrides.reviewGate`/`busterGate`/`gateRunner`.

Paths built/read/written: Temp `.swarm` roots; review and Buster gate output files; `gate:<id>-gate-status.json`; run-scoped `discord.jsonl`; active-session path under `.swarm/logs/gates/<gate>/active-session.json`; fake Redis stream `pipeline:telemetry:<project>:<runId>`.

Authority behavior: Verifies typed stage-owner gate control results and canonical output files are authority, while compatibility-shaped plugin results, stale gate-status pass files, non-JSON outputs, and missing registry entries fail closed with telemetry/operator evidence.

Error/retry/terminal behavior: Missing registry/gate/type, setup failures, invalid plugin contracts, invalid output contracts, malformed review output, no-output sessions, unexpected Buster loop exit, and rate-limit exhaustion all fail terminally with asserted `gate.verdict` and/or Discord evidence. Rate-limit pause fixtures recover through subsequent pass paths. No test-level retry; runtime under test owns polling/fix/rate-limit loops.

Verification coverage: Direct behavior assertions over gate execution matrix; no live ACP/Discord/Redis calls.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `verify.mjs` | `gates.mjs` | `registerGatesArea(sharedAreaDeps)` | Selected behavior area registration. |
| `gates.mjs` | registry/runtime helpers | `buildPluginRegistry`, fake `stageOwners['gate.execute']` | Stage-owner dispatch and contract validation fixtures. |
| `gates.mjs` | gate runners | `runGate`, `runReviewGate`, `runBusterGate` | Review/Buster gate execution and failure matrix. |
| `gates.mjs` | status/dependency services | `readGateOutput`, `projectGateSchedulerState`, `projectGateCompletionState`, `checkDependencies` | Gate output projection and dependency authority checks. |
| `gates.mjs` | fake Redis and Discord JSONL | `xaddEvents`, `flushAsync`, `readJsonl` | Telemetry and operator alert assertions. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `gates.mjs` stage-owner pass/block route | typed gate control result | `nextAction`, typed gate status/outcome | pass => continue/exit 0; block => halt/exit 10 with correlation fields | Core gate contract semantics. |
| `gates.mjs` missing owner/registry/dispatch route | absent registry/gate/type/owner | progress/registry | exit 1 and `gate.verdict` NO-GO plus Discord in alert records | Dispatch fails closed. |
| `gates.mjs` plugin contract route | legacy/contradictory/missing diagnostics/compatibility authority | fake raw result | exit 1, `contract_invalid`, gate verdict reason | Prevents compatibility outputs from becoming authority. |
| `gates.mjs` output contract route | non-JSON, missing status, unknown status, stale gate-status PASS | gate output/status files | invalid output or dependency not met | Canonical output file authority. |
| `gates.mjs` review runtime route | setup failure, post-start error, malformed output, no output | reviewer fixtures | gate verdict/Discord/no-output detail | Review gate fail-closed behavior. |
| `gates.mjs` Buster runtime route | setup failure, unexpected loop, invalid output, rate-limit exhaustion/pause | Buster fixtures | gate verdict/Discord/retry exhaustion or pass after pause | Buster gate fail-closed/recovery behavior. |
| `gates.mjs` rate-limit route | Redis-owned, gate-status, or reviewer rate-limit signals | fixture result/status/tracked agent | pause/resume alerts, `rate_limit.detected`, exit 40 on exhaustion | Canonical rate-limit correlation. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| Fake Redis globals | `globalThis.__fakeRedisCalls` / counters | per-record reset | Clear before each telemetry fixture | Event assertions remain isolated. |
| Fake plugin registries | `stageOwners['gate.execute']` | built-in registry plus test owner overrides/deletions | Shallow merge built-ins and replace targeted stage owner | Stage-owner dispatch is fixture-controlled. |
| Gate output/status files | temp `.swarm` files | record-specific writes | Output file and gate-status file intentionally disagree in some fixtures | Source-of-truth precedence is asserted. |
| Discord run log JSONL | run-scoped `discord.jsonl` | runtime Discord calls | Records appended then read with `readJsonl` | Alerts carry run/gate/type/attempt/session fields. |
| Date.now override | global `Date.now` | Buster rate-limit fixtures | Override to stable timestamp, restore in `finally` | Deterministic dispatch IDs. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `gates.mjs` plugin contract cases | `for (const contractCase of ...)` | None | None | Each invalid case must emit contract error. |
| `gates.mjs` review malformed output cases | `for (const reviewCase of ...)` | None | None | Each malformed output must fail closed. |
| `gates.mjs` review no-output transcript cases | `for (const transcriptCase of ...)` | None | None | Active/stale transcript state must appear in alert. |
| Rate-limit pause fixtures | Runtime gate polling loop under test | fake sleep/runtime no-op | max pauses fixture; Date.now deterministic | First rate-limit pauses, later pass or exhaustion. |
| V02a2 area execution | Sequential records | None at area level | None | First failed assertion aborts selected area through harness. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| Gate progress definitions | Progress fixture | `gates.mjs` through runners | per-record | Gate `type`, `title`, `output_file`, reviewer/Buster fields. |
| `_pluginRegistry.stageOwners['gate.execute']` | Runtime registry fixture | `gates.mjs` through gate runner | built-in plus overrides | Controls typed stage-owner dispatch. |
| `_testOverrides.gateRunner/reviewGate/busterGate` | Test override objects | `gates.mjs` through runtimes | per-record fake hooks | Simulate Discord, instructions, policy, spawn/poll, Redis completion, output files. |
| `rate_limit.max_pauses_per_module`, `cooldown_hours` | Runtime config | rate-limit gate fixtures | per-record | Pause/exhaustion budget. |
| `_disable_discord_webhooks`, `discord_webhook_url` | Runtime config | Discord alert fixtures | disabled fake URL | Ensures audit artifacts without live webhook delivery. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| gate output files | test fixtures / runtime | status-store, gate runners, assertions | fixtures/runtime | Canonical completion authority for Buster dependencies. |
| `gate:<id>-gate-status.json` | test fixtures/runtime | Buster runner/status projection | fixtures/runtime | Useful fallback/status evidence, not sufficient dependency authority. |
| run-scoped `discord.jsonl` | Discord runtime | `gates.mjs readJsonl` | runtime Discord audit | Operator alert evidence. |
| `pipeline:telemetry:<project>:<runId>` | telemetry runtime/fake Redis | `gates.mjs` assertions | runtime under test | Canonical gate/rate-limit telemetry stream. |
| `.swarm/logs/gates/<gate>/active-session.json` | Buster gate runtime | `gates.mjs` assertion | runtime under test | Cleared after gate-status rate-limit recovery. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Typed gate control result | gate stage owner + gate runner validator | gate result/telemetry callers | None. |
| Gate failure telemetry | gate/review/Buster runners | fake Redis/operators | None. |
| Gate operator Discord alerts | gate/review/Buster runners and Discord audit service | operators/replay/tests | Audit artifact only; not lifecycle authority. |
| Gate output contract projection | status-store/runtime gate output readers | scheduler/dependencies/tests | None. |
| Rate-limit pause/exhaustion correlation | review/Buster gate runners | telemetry/Discord/tests | None. |
| Buster gate dependency completion | canonical `output_file` | dependency checker/tests | Gate-status PASS alone intentionally insufficient. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Typed gate control result | stage owner fixture/runtime validator | `schemaVersion`, `producerKind:'gate'`, `producerType`, `nextAction`, `issueType?`, `diagnostics.summary/findings/metadata/typed.gate`, optional remediation | gate runner validator | Gate runner. |
| Pipeline step result | gate runner | `kind:'pipeline_step_result'`, `nextAction`, `outcome`, `exit`, `status`, `reason`, gate identity/correlation fields | gate runner | Pipeline scheduler/operators. |
| Contract invalid diagnostic | gate runner validator | `diagnosticType:'plugin_contract_invalid'`, `stageId`, `validationErrors[]`, `rawResultPreview` | runtime contract validator | Error results/telemetry. |
| Gate output projection | status-store | `exists`, `isPass`, `invalid_contract`, `parse_error`, `invalid_reason`, completion `done/ok/outcome/data` | status-store | Scheduler/dependencies. |
| Gate telemetry events | telemetry runtime | `gate.started`, `gate.verdict`, `rate_limit.detected`, `retry.exhausted` with gate/type/verdict/reason/correlation fields | telemetry runtime | Redis stream/operators. |
| Discord alert entry | Discord audit service | JSONL entry with `title`, `description`, `fields[]` name/value pairs | Discord service | Operators/replay/tests. |
| Rate-limit result/status | review/Buster fixtures/runtime | `attempt`, `dispatch_id`, `gateway_label`, `session_key`, `max_rate_limit_pauses`, `rate_limit_status` | gate runners | Telemetry/Discord/result assertions. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Review gate prompt fixture | `gates.mjs` review test overrides | temporary gate output path | fake `buildReviewerPrompt` returns minimal prompt text like `Return strict JSON` | fake reviewer/poll hooks only | Runtime must parse strict output contract and fail closed on malformed output. |
| Buster gate instruction fixture | `gates.mjs` Buster test overrides | temp gate instructions/output files | fake `readGateInstructions` returns gate instructions or throws | fake Buster spawn/Redis/status hooks only | Runtime must emit canonical gate result/telemetry. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| V02a2 area records | Assertion/runtime failure | No wrapper retry | None | Harness record fails selected area | No area redaction. |
| `gates.mjs` missing registry/gate/type/stage owner | Dispatch setup errors | No | None | exit 1 with `gate.verdict`; Discord alert in paired records | Runtime Discord redaction only. |
| `gates.mjs` invalid plugin contracts | legacy shape, contradiction, missing diagnostics, compatibility authority, missing remediation | No | None | exit 1 with contract diagnostic and telemetry | Raw preview format `json`; area no redaction. |
| `gates.mjs` invalid output contracts | non-JSON, missing status, unknown status | No | None | output projection invalid; gate fails closed without fix loop | None. |
| `gates.mjs` review/Buster setup/post-start/no-output failures | missing reviewers/instructions, transport error, no output, malformed output, unexpected Buster loop | No area retry | Runtime polling/loop under test | terminal NO-GO/error and telemetry/Discord | Transcript field redacted in Discord alert assertion. |
| `gates.mjs` rate-limit pause/exhaustion | reviewer/Buster Redis or gate-status rate-limit | Pause recovery tested | Runtime max pauses and fake sleep/polling | pause/resume then PASS, or exit 40 with retry exhausted | Runtime redaction only. |
| `gates.mjs` dependency authority check | gate-status PASS but canonical output missing/failing | No | None | dependency remains unmet | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| V02a2 area records | Assertion/runtime failure | Yes/partial | behavior harness stderr/buffered logs | `[behavior] FAILED: <record>` | `verify.mjs record` | Area relies on harness observability. |
| `gates.mjs` dispatch/setup errors | Missing registry/gate/type/stage owner | Yes | fake Redis and/or run `discord.jsonl` | `gate.started`, `gate.verdict`, `Gate Dispatch Failed...` | gate runner/Discord runtime | Paired telemetry and Discord records. |
| `gates.mjs` plugin/output contract failures | Invalid plugin or gate output contract | Yes | fake Redis stream/status projection | `gate.verdict`, contract diagnostics, invalid projection fields | gate runner/status-store | Fail-closed telemetry asserted. |
| `gates.mjs` review/Buster runtime failures | malformed/no-output/setup/post-start/unexpected loop | Yes | fake Redis and Discord JSONL | `gate.verdict`, review/Buster failure alert titles | review/Buster runners | Transcript alert content redacted. |
| `gates.mjs` rate-limit failures/recovery | pause/resume/exhaustion | Yes | fake Redis and Discord JSONL | `rate_limit.detected`, `retry.exhausted`, pause/resume alerts | review/Buster gate runners | Canonical correlation asserted. |
| `gates.mjs` dependency authority check | gate-status PASS but output missing/failing | Partial | returned dependency result only | unmet dependency reason | dependency checker | No telemetry in dependency helper; verifier result is evidence. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | `gates.mjs` | Behavior execution/runtime imports | Required by harness. |
| Fake Redis lib | repo verification library | local source | `gates.mjs` | Telemetry stream capture | Fake globals reset per record. |
| Materialized runtime tree | verification fixture | general runtime copy | `gates.mjs` | Runtime module behavior under packaged paths | Import/materialization failures fail record. |
| Plugin registry runtime | Nova runtime | materialized source | `gates.mjs` | Stage-owner dispatch/validation fixtures | Built-in registry errors fail records. |
| Filesystem temp dirs | Node `fs`/`os`/`path` | built-ins | `gates.mjs` | Gate output/status/log/Discord fixtures | Non-JSON/missing output cases intentionally tested. |
| Discord audit runtime | runtime module under test | materialized source | `gates.mjs` | Operator alert JSONL | Webhooks disabled/faked; audit read from disk. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| V02a2 area execution | Sequential records | harness-selected `gates` area | First failed record aborts | harness failure output | None. |
| Plugin contract case loop | Sequential cases | four invalid cases | Each case creates isolated runtime/fake Redis fixture | per-case telemetry | None. |
| Review malformed/no-output loops | Sequential cases | two malformed, two transcript states | Each case isolated | telemetry/Discord assertions | None. |
| Rate-limit pause loops | Runtime gate loops | max pauses 1 or 2, fake cooldown | Pause/resume or exit 40 | Discord and telemetry | None. |
| Fake Redis telemetry | Async fake flush | explicit `flushAsync()` | Assertions wait for emitted events | fake Redis arrays | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Review gate session correlation | reviewer status `{session_key,gateway_label,dispatch_id?,detail?,transcript?}` | fake reviewer poll/run results | review gate runtime/telemetry/Discord | Runtime owns polling | `gate.verdict`, no-output alert, rate-limit events. |
| Buster gate session correlation | tracked agent and Redis/gate-status completion fields | fake Buster hooks | Buster gate runtime/telemetry/Discord | Runtime owns Redis/poll loop | pause/resume and exhaustion events. |
| Gate stage-owner refs | `refs.gateEvaluationRef`, `ids.stageId/gateId/gateType` | gate runner stage owner input | fake stage owners/tests | One call per gate run | Stage-owner input assertions. |
| V02a2 scoped file | Live ACP gateway calls | None found in scoped file | None found in scoped file | None found in scoped file | ACP/session behavior is simulated by hooks/status objects. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Gate stage-owner contract dispatch | `gates.mjs` | Broad review/Buster pass/block/invalid coverage | Fake owners, not live plugins. |
| Gate output projection/dependency authority | `gates.mjs` | Good source-backed behavior coverage | Only representative invalid statuses. |
| Gate telemetry and Discord failures | `gates.mjs` | Broad telemetry/operator coverage | Fake Redis/Discord, not live services. |
| Review no-output/malformed output behavior | `gates.mjs` | Good fail-closed coverage | Fake reviewer session. |
| Buster rate-limit correlation | `gates.mjs` | Good Redis/gate-status/tracked fallback coverage | Fake Buster completions. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
