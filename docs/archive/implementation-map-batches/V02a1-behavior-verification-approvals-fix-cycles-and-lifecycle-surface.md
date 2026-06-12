# Batch V02a1 — Behavior verification approvals, fix cycles, and lifecycle surface

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

Split note: the original V02a scope was 6 files and ~7.8k lines. Per user approval, V02a is split into V02a1/V02a2/V02a3 so each review remains tractable while preserving exact scoped files.

```text
tests/verification/behavior/areas/approvals.mjs
tests/verification/behavior/areas/fix-cycles.mjs
tests/verification/behavior/areas/gate-session-persistence.mjs
tests/verification/behavior/areas/lifecycle-state-surface.mjs
```

Scope expansion verified live: 4 files, under the 10-file maximum. All scoped files were read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/behavior/areas/approvals.mjs
kubeclaw-main/tests/verification/behavior/areas/fix-cycles.mjs
kubeclaw-main/tests/verification/behavior/areas/gate-session-persistence.mjs
kubeclaw-main/tests/verification/behavior/areas/lifecycle-state-surface.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/behavior/verify.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/module-failures.mjs
kubeclaw-main/tests/verification/lib/lifecycle-audit-lib.mjs
kubeclaw-main/tests/verification/lib/fake-redis-lib.mjs
```

## Per-file map

### `tests/verification/behavior/areas/approvals.mjs`

Role: Behavior area for approval gate stage-owner execution, generic wait control, deadline reload, stage contract validation, scheduler lifecycle consumption, canonical approval telemetry, corrupted/unknown persisted state fail-closed handling, and approval dependency read-model semantics.

Imports/dependencies: No static imports; uses injected behavior dependencies including fake Redis helpers, runtime materialization/import helpers, filesystem/path/os/assert, runtime modules, `pathsMod`, and `flushAsync`.

Exports/public surface: `registerApprovalsArea(deps)`.

Defines: Local `buildBuiltInRegistry(runtimeRoot)` and fourteen approval behavior records.

Important variables/state: Fake Redis globals reset per telemetry check; temp `.swarm` trees; mutable fake gate state; saved state/decision/transition arrays; fake Discord calls.

Calls out to: Runtime `gate-runner.js`, `approval-gate-runner.js`, `pipeline-runner.js`, `core/runtime.js`, `services/status-store.js`, `services/dependencies.js`, `services/telemetry.js`, plugin registry.

Called by / expected callers: `tests/verification/behavior/verify.mjs` when `approvals` area is selected.

Environment variables / CLI inputs / config fields: Inherited harness deps only. Fixture configs set `project`, `telemetry.enabled`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `_approvalPollIntervalMs`, `_testOverrides.approvalGate`, `paths.swarm_dir`, `paths.modules_dir`. Progress gates use approval `type`, `title`, `timeout_minutes`, `on_timeout`, optional `output_file`.

Paths built/read/written: Temp `.swarm` roots; `pathsMod.gateStatusPath(config, gateId)` status files; `.swarm/logs/gates/<gate>/approval-request.json`; `.swarm/logs/pipeline` artifacts through runtime; dependency gate output path only as config fixture.

Authority behavior: Verifies canonical approval lifecycle/read-model state and stage-owner contract results are authority for scheduler/dependencies/telemetry, not legacy gate output files or reopened waits.

Error/retry/terminal behavior: Stage-owner invalid control result and missing typed wait payload fail closed with `gate.verdict` telemetry. Corrupted or unknown persisted gate status fails closed, sends critical Discord, preserves original bad state, and does not reopen a fresh wait. Deadline reload avoids stale timeout decisions after persisted extension.

Verification coverage: Direct behavior assertions for approval happy, timeout, rejection, fail-closed, dependency, and telemetry paths.

Findings: None.

### `tests/verification/behavior/areas/fix-cycles.mjs`

Role: Behavior area for review and Buster gate fix-cycle interruption telemetry, Discord correlation, and authoritative retry exhaustion events.

Imports/dependencies: Node `fs`/`os`/`path`/`assert`; lifecycle audit runtime materialization/import helpers; fake Redis helpers supplied by harness.

Exports/public surface: `registerFixCyclesArea(deps)`.

Defines: `getFieldValue(fields, name)`, local built-in registry helper, and three records covering review interruption scenarios, review fix-and-rereview GO path, and Buster interruption scenarios.

Important variables/state: Scenario arrays for spawn/health/no-output/rate-limit/rereview failures; fake Redis globals; captured Discord calls; consumed review result queues.

Calls out to: Runtime `review-gate-runner.js`, `buster-gate-runner.js`, `core/runtime.js`, plugin registry.

Called by / expected callers: `verify.mjs` when `fix-cycles` area is selected.

Environment variables / CLI inputs / config fields: Fixture configs set `project`, `repo_root`, `paths.swarm_dir`, `telemetry.enabled`, `_runId`/`run_id`, `_runStats`, `_pluginRegistry`, `default_timeout_minutes`, `default_max_fails`, and `_testOverrides.reviewGate` / `_testOverrides.busterGate` hooks. Gate progress fields include review `review_name`, `reviewers`, `max_fix_cycles`, Buster `on_fail`, `max_fix_cycles`.

Paths built/read/written: Mostly temp/virtual `/tmp/<project>/swarm` config paths; fake Redis stream `pipeline:telemetry:<project>:<runId>`.

Authority behavior: Verifies failed fix-cycle paths emit canonical gate verdict and retry exhaustion telemetry with gate/session/dispatch/rate-limit correlation.

Error/retry/terminal behavior: Scenarios simulate spawn failure, health check failure, no usable output, rate-limit exhaustion, and re-review error. Expected exits are 10 for NO-GO exhaustion and 40 for rate-limit exhaustion. No area retry/backoff; runtime under test owns fix-cycle logic.

Verification coverage: Direct behavior assertions for review and Buster gate fix cycles.

Findings: None.

### `tests/verification/behavior/areas/gate-session-persistence.mjs`

Role: Behavior area asserting gate fix-cycle source contains restart-recovery active-session markers and retry correlation fields.

Imports/dependencies: No static imports; uses injected source reader and assert helpers.

Exports/public surface: `registerGateSessionPersistenceArea(deps)`.

Defines: Two source-text records for Buster active-session persistence and review/Buster retry correlation markers.

Important variables/state: None beyond loaded source text.

Calls out to: Reads `skills/nova/pipeline/services/gate-active-session.js`, `gate-fix-scaffold.js`, `review-gate-runner.js`, `review-gate-fix-cycle.js`, `buster-gate-runner.js`, `buster-gate-fix-cycle.js`.

Called by / expected callers: `verify.mjs` when `gate-session-persistence` area is selected.

Environment variables / CLI inputs / config fields: None directly.

Paths built/read/written: Reads source-relative runtime files only; no writes.

Authority behavior: Verifies gate restart recovery and stale recovery correlation remain present in source.

Error/retry/terminal behavior: Missing expected source markers fail the record. No retry/backoff.

Verification coverage: Source-surface behavior assertions.

Findings: None.

### `tests/verification/behavior/areas/lifecycle-state-surface.mjs`

Role: Behavior area verifying prompts and lifecycle helper public surfaces stay behavior-led and status mutation details remain runtime-owned.

Imports/dependencies: No static imports; uses injected filesystem/path/os/assert helpers, runtime import helper, `runtimeRoot`, `pipelineIndexMod`, and `lifecycleStateMod`.

Exports/public surface: `registerLifecycleStateSurfaceArea(deps)`.

Defines: One record covering Forge/Buster prompt content, removal of status JSON mutation helper surfaces, lifecycle transition cleanup semantics, and failure reason extraction fallback.

Important variables/state: Temp project `.swarm/modules/01` tree; representative status objects mutated by lifecycle helpers.

Calls out to: Runtime prompt modules `forge.js`, `buster-module.js`, `shared.js`; `services/status-store.js`; `services/failures.js`; shared lifecycle-state helpers.

Called by / expected callers: `verify.mjs` when `lifecycle-state-surface` area is selected.

Environment variables / CLI inputs / config fields: Fixture config sets `project`, `repo_root`, `paths.swarm_dir`, `paths.modules_dir`, `agents.forge.cwd`; prompt context includes module status, run id, attempt, dispatch id.

Paths built/read/written: Temp `Projects/<project>/src/.swarm/modules/01/FORGE.md`, `BUSTER.md`, `status.json`, and `index.js`.

Authority behavior: Verifies prompts instruct agents to write completion/result artifacts and not mutate `status.json`; lifecycle state helpers own active/terminal status cleanup semantics.

Error/retry/terminal behavior: Assertion failures fail the record. No retry/backoff.

Verification coverage: Direct behavior assertions for prompt and lifecycle helper surface.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `verify.mjs` | V02a1 area modules | `registerApprovalsArea`, `registerFixCyclesArea`, `registerGateSessionPersistenceArea`, `registerLifecycleStateSurfaceArea` | Selected behavior area registration. |
| `approvals.mjs` | approval/gate/status/dependency runtime modules | `runGate`, `runApprovalGate`, `waitForApprovalGateSignal`, `syncApprovalWaitState`, `checkDependencies` | Approval lifecycle and dependency authority checks. |
| `fix-cycles.mjs` | review/Buster gate runners | `runReviewGate`, `runBusterGate` | Fix-cycle interruption and retry exhaustion telemetry. |
| `gate-session-persistence.mjs` | source runtime files | `readOverlayText` marker checks | Restart-recovery and retry correlation source assertions. |
| `lifecycle-state-surface.mjs` | prompt/lifecycle/status/failure modules | prompt builders, lifecycle transitions, failure reason extraction | Prompt authority and lifecycle cleanup semantics. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `approvals.mjs` stage-owner route | Approval owner returns `pass`, `block`, invalid `retry`, or `wait` without typed payload | typed control result | PASS timeout-continue, rejection exit 10, fail-closed error exit 1 | Validates approval stage contract. |
| `approvals.mjs` persisted state route | State approved/rejected/timed-out/corrupt/unknown | persisted gate status file/load hook | Continue, block, or critical fail-closed without reopening wait | Restart safety. |
| `approvals.mjs` timeout policy route | `on_timeout` block/continue and lowercase helper input | gate config/helper arg | Canonical uppercase `BLOCK`/`CONTINUE` in state/telemetry | Stable telemetry/schema. |
| `fix-cycles.mjs` scenario route | spawn/health/no-output/rate-limit/rereview failures | test override behavior | Gate NO-GO/retry exhausted or exit 40 rate-limit exhausted | Fix-cycle interruption semantics. |
| `gate-session-persistence.mjs` source marker route | marker text present/missing | runtime source text | Record passes/fails | Guards restart correlation fields. |
| `lifecycle-state-surface.mjs` prompt checks | prompt includes forbidden status mutation text or omits artifact command | prompt strings | Record fails | Agents must not own status mutation. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `approvals.mjs` fake gate state | `gateState` object and saved arrays | fake save/load hooks | Deep clone state on save/load; scenario-specific mutation on poll | Assertions observe exact persisted lifecycle states. |
| `approvals.mjs` fake Redis globals | `globalThis.__fakeRedisCalls` / counters | per-record reset | Clear before each telemetry fixture | Stream assertions isolate events. |
| `fix-cycles.mjs` review result queue | `reviewResults` array | `shift()` per review pass | NO-GO, NO-GO, then GO | Verifies fix-and-rereview sequence. |
| `lifecycle-state-surface.mjs` status objects | representative module statuses | lifecycle helper calls | Active phases clear completion fields; terminal transition clears phase and sets completion summary | Lifecycle helper owns status cleanup semantics. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `approvals.mjs wait fixtures` | Approval polling hooks | fake sleep no-op or recorded `sleeps[]` | `timeout_minutes` and persisted `deadline` | Approved/rejected/timed-out/corrupt/invalid state. |
| `fix-cycles.mjs scenario loops` | `for (const scenario of scenarios)` | None in area | Runtime under test owns fix-cycle counts | Each scenario validates result/events. |
| `fix-cycles.mjs review cycle` | Runtime review fix cycle | No-op fake agent operations | `max_fix_cycles` fixture value | Final GO or retry exhausted. |
| V02a1 source/prompt checks | Sequential record assertions | None | None | First failed assertion aborts selected area through harness. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| Approval gate config fields | Progress/config fixtures | `approvals.mjs` through runtime | per-record fixture | `timeout_minutes`, `on_timeout`, `type`, `title`, `output_file`. |
| `_testOverrides.approvalGate` | Test override object | approval runtime fixtures | per-record fake hooks | Overrides Discord, state IO, sleep, transition/request/decision writers. |
| `_testOverrides.reviewGate`, `_testOverrides.busterGate` | Test override objects | fix-cycle runtime fixtures | per-scenario fake hooks | Simulate spawn, health, polling, rate-limit, Discord. |
| `default_timeout_minutes`, `default_max_fails`, `max_fix_cycles` | Runtime config/progress | `fix-cycles.mjs` through runners | scenario values | Fix-cycle terminal counts and timeout behavior. |
| Prompt fixture config | Runtime config object | `lifecycle-state-surface.mjs` prompt builders | temp project paths | `project`, `repo_root`, `.swarm` paths, agent cwd. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| approval gate status path | `pathsMod.gateStatusPath(config, gateId)` | approval/dependency runtime and tests | approval runtime / tests | Persisted approval read model used for restart/dependency authority. |
| `.swarm/logs/gates/<gate>/approval-request.json` | approval runtime | `approvals.mjs` assertions | approval runtime | Must not be recreated on corrupt/invalid persisted state. |
| `pipeline:telemetry:<project>:<runId>` | telemetry runtime/fake Redis | approvals/fix-cycles assertions | runtime under test | Canonical telemetry stream for approval and fix-cycle events. |
| temp module instruction files | `lifecycle-state-surface.mjs` | prompt builders | test fixture | Prompt builders consume task artifacts but not status mutation authority. |
| runtime source files for gate restart | `readOverlayText` | `gate-session-persistence.mjs` | source authors | Marker-based restart/retry correlation assertions. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Approval gate lifecycle/read model | approval runner/status-store runtime | scheduler, dependency checks, telemetry, V02a1 tests | None. |
| Approval stage control result contract | gate stage owner + gate runner validator | telemetry/result callers | None. |
| Review/Buster fix-cycle telemetry | review/Buster gate runners | operator telemetry, V02a1 tests | None. |
| Gate active-session restart markers | gate fix scaffold/runners | restart recovery behavior | Source-marker tests only; deeper runtime coverage in other areas. |
| Module status mutation authority | lifecycle-state/status runtime helpers | prompts and agent outputs | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Approval stage control result | fake stage owner/runtime validator | `schemaVersion`, `producerKind:'gate'`, `producerType:'approval'`, `nextAction`, `issueType`, `diagnostics.metadata`, `diagnostics.typed.gate`, optional `diagnostics.typed.wait` | gate runner control validator | Approval gate runner. |
| Approval wait state | approval runner/status-store | `gate_id`, `gate_type`, `status`, `run_id`, `project`, `requested_at`, `deadline`, `resolved_at?`, `timeout_minutes`, `timeout_policy`, `decision_via?`, `continued?`, `reason?` | approval runtime/status-store | Scheduler/dependencies/summary/telemetry. |
| Approval telemetry sequence | approval/telemetry runtime | `gate.started`, `approval.requested`, `approval.resolved`, `gate.verdict` with seq/gate/type/status/verdict/reason fields | telemetry runtime | Fake Redis assertions/operators. |
| Fix-cycle telemetry | review/Buster gate runners | `gate.started`, `gate.verdict`, `retry.exhausted` with `fix_cycle`, issue counts, session/gateway/dispatch/attempt/rate-limit fields | runner telemetry builders | Fake Redis assertions/operators. |
| Discord fix-cycle fields | review/Buster gate runners | field objects with `name`/`value`, including Attempt/Dispatch/Session | Discord helper/runtime | Operator alert assertions. |
| Prompt result | Forge/Buster prompt builders | `{prompt:string, metadata:{phase, stageId?, workerType?}}` | prompt builder | Lifecycle-state surface assertions. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Forge module prompt | `lifecycle-state-surface.mjs` via runtime `prompts/forge.js` | none; consumes temp `FORGE.md` | Includes shared Forge completion artifact command; forbids editing `status.json` | Agent writes completion artifact, not status JSON | Prompt metadata `phase:'forge'`. |
| Buster module prompt | `lifecycle-state-surface.mjs` via runtime `prompts/buster-module.js` | none; consumes temp `BUSTER.md` | Includes Buster conventions/result artifact instructions; forbids Redis completion/status mutation | Agent writes result artifact then stops | Prompt metadata `phase:'buster'`, `stageId:'worker:module_buster'`, `workerType:'module_buster'`. |
| Fix-cycle fake agents | `fix-cycles.mjs` test overrides | none | Simulated spawn/poll/health behavior only | No real agent invocation | Runtime must emit canonical gate/fix-cycle results. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| V02a1 area records | Assertion/runtime failure | No wrapper retry | None | Harness record fails selected area | No area redaction. |
| `approvals.mjs` invalid stage contract | invalid `nextAction` or missing typed wait payload | No | None | Gate returns exit 1 and emits failure `gate.verdict` | None. |
| `approvals.mjs` persisted approval state failures | Corrupt JSON or unknown status | No | None | Fails closed with exit 10/status `CORRUPTED_STATE` or `INVALID_STATE`, sends critical Discord, preserves bad state | Discord/runtime may sanitize; area none. |
| `approvals.mjs` stale deadline | Persisted deadline changes during polling | Poll loop in runtime | fake sleep records one sleep | Reloaded deadline prevents premature timeout; later approval passes | None. |
| `fix-cycles.mjs` fix interruption failures | spawn failed, health failed, no output, rate limit exhausted, re-review error | Runtime fix loop only | `max_fix_cycles` controls terminal exhaustion | NO-GO/retry exhausted or exit 40 rate-limit exhausted | Runtime redaction only; area none. |
| `gate-session-persistence.mjs` missing markers | Source text drift | No | None | Assertion failure | None. |
| `lifecycle-state-surface.mjs` prompt/status surface drift | Prompt includes forbidden mutation or helper surface reappears | No | None | Assertion failure | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| V02a1 area records | Assertion/runtime failure | Yes/partial | behavior harness stderr/buffered logs | `[behavior] FAILED: <record>` | `verify.mjs record` | Area modules rely on harness observability. |
| `approvals.mjs` invalid stage contract | Invalid control result / missing wait payload | Yes | fake Redis stream | `gate.started`, `gate.verdict` with error reason | gate/telemetry runtime | Source-backed fail-closed telemetry. |
| `approvals.mjs` corrupt/unknown persisted state | Restart persisted state invalid | Partial | critical Discord call capture and preserved status file | Discord severity `CRITICAL`; status `CORRUPTED_STATE`/`INVALID_STATE` | approval runtime | No fake Redis assertion in those two records. |
| `approvals.mjs` approval timeout/approval/rejection | Normal and timeout decisions | Yes | fake Redis stream and gate state | `approval.requested`, `approval.resolved`, `gate.verdict` | approval/telemetry runtime | Canonical sequence asserted. |
| `fix-cycles.mjs` interruption/rate-limit failures | Fix-cycle failures | Yes | fake Redis stream and Discord call capture | `gate.verdict`, `retry.exhausted`, fix-cycle Discord titles/fields | review/Buster gate runners | Correlation asserted. |
| `gate-session-persistence.mjs` marker drift | Missing source markers | Yes/partial | harness failure output | record name | `record` wrapper | Source assertion only. |
| `lifecycle-state-surface.mjs` prompt/status surface drift | Prompt/helper drift | Yes/partial | harness failure output | record name | `record` wrapper | No runtime telemetry; verification output is evidence. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V02a1 area modules | Behavior area execution/runtime imports | Required by harness. |
| Fake Redis lib | repo verification library | local source | approvals/fix-cycles | Telemetry stream capture | Fake global state reset per record. |
| Materialized runtime tree | verification fixture | general runtime copy | approvals/fix-cycles/lifecycle-state | Runtime module behavior under packaged paths | Materialization/import failures fail records. |
| Filesystem temp dirs | Node `fs`/`os`/`path` | built-ins | all V02a1 areas | `.swarm`, prompt, gate-state fixtures | Corrupt/path cases intentionally tested. |
| Plugin registry runtime | Nova pipeline runtime | materialized source | approvals/fix-cycles | Stage-owner lookup and runner registry | Registry build errors fail records. |
| Discord runtime hooks | test overrides/runtime | local fake functions | approvals/fix-cycles | Critical/fix-cycle operator alert capture | No live Discord. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| V02a1 area execution | Sequential records | harness-selected areas | First failed record aborts | harness failure output | None. |
| Approval polling | Runtime wait loop with fake sleep | `_approvalPollIntervalMs:0`; `timeout_minutes` fixtures | Deadline reload can extend before timeout; timeout block/continue terminal | saved states, sleeps, telemetry | None. |
| Review/Buster fix cycles | Max fix cycles | `max_fix_cycles` and `default_max_fails` fixtures | Emits intermediate NO-GO and terminal retry exhausted | fake Redis events | None. |
| Fake Redis telemetry | Async fake flush | explicit `flushAsync()` | Assertions wait for emitted events | fake Redis arrays | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Review fix-cycle session correlation | `session_key`, `gateway_label`, `dispatch_id`, `attempt`, `rate_limit_status` | review gate runtime/fake poll results | telemetry/Discord assertions | Runtime fix loop owns polling | `gate.verdict`, `retry.exhausted`, Discord fields. |
| Buster gate fix-cycle session correlation | gate initial and fix-cycle session keys plus dispatch/attempt | Buster gate runtime/fake poll results | telemetry/Discord assertions | Runtime fix loop owns polling | `gate.verdict`, `retry.exhausted`, Discord fields. |
| Gate active-session restart markers | persisted active-session helper calls and correlation fields in source | gate fix scaffold/runners | stale recovery behavior | None in source assertion | Source marker assertions. |
| V02a1 scoped files | Live ACP gateway calls | None found in scoped files | None found in scoped files | None found in scoped files | All agent/session behavior is simulated by test overrides/source assertions. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Approval stage-owner/wait/lifecycle telemetry | `approvals.mjs` | Broad behavior coverage | Uses fake approval hooks, not live operator input. |
| Approval corrupt/invalid restart state | `approvals.mjs` | Good fail-closed coverage | Critical Discord is captured through fake hook. |
| Review/Buster fix-cycle interruptions | `fix-cycles.mjs` | Broad simulated interruption coverage | Fake agents, not live ACP sessions. |
| Gate active-session restart markers | `gate-session-persistence.mjs` | Source-marker coverage | Not full runtime restart recovery fixture. |
| Prompt/lifecycle surface | `lifecycle-state-surface.mjs` | Focused prompt/helper behavior coverage | Single module fixture. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
