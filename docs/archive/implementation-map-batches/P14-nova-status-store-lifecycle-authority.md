# Batch P14 — Nova status-store lifecycle authority

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/status-store.js
skills/nova/pipeline/services/status-store-lifecycle.js
skills/nova/pipeline/services/status-store-lifecycle/*.js
```

Scope expansion verified live: 9 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/status-store.js
kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle.js
kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/appenders.js
kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/idempotency.js
kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/legality.js
kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/projections.js
kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/read-models.js
kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/refs.js
kubeclaw-main/skills/nova/pipeline/services/status-store-lifecycle/storage.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-status-store-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-telemetry-contract.mjs
kubeclaw-main/tests/verification/behavior/areas/lifecycle-state-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/restart-recovery.mjs
kubeclaw-main/tests/verification/behavior/areas/resume-idempotence.mjs
kubeclaw-main/tests/verification/behavior/areas/seq-restart.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
```

## Per-file map

### `skills/nova/pipeline/services/status-store.js`

Role: File-backed status facade for module `status.json`, prompt/transcript artifacts, gate-output archival, and canonical lifecycle/status compatibility exports.

Imports/dependencies: Node `fs`/`path`; core path/logger helpers; redaction artifact helpers; artifact bundle latest pointer; pending lifecycle mutation helpers; lifecycle append/reset; status compatibility resolver.

Exports/public surface: `initLogDir`, `loadStatus`, `saveStatus`, `initStatus`, `savePrompt`, `saveStreamLog`, `gateArchiveDir`, `archiveGateOutputIfPresent`, guarded status helpers, plus re-exported lifecycle, compat, and truth-drift surfaces.

Defines: Log directory bootstrap, lifecycle store reset on run init, guarded status field set, guarded save enforcement, module status initializer, redacted prompt/transcript saves, gate archive helpers.

Important variables/state: Mutates `config._logDir`, `_runLogDir`, `_pipelineLogFd`, `_runPipelineLogFd`; writes status files; consumes pending lifecycle mutations attached to status objects.

Calls out to: `resetLifecycleStore`, `appendModuleLifecycleEvent`, `resolveModuleStatusSnapshotAuthority`, redaction helpers, path helpers, logger.

Called by / expected callers: Pipeline runner init, module runner phases, prompt/transcript persistence, gate runners, status compatibility consumers, tests.

Environment variables / CLI inputs / config fields: Reads `config.paths.swarm_dir`, `paths.modules_dir` through path helpers, `_runId`/`run_id` indirectly via lifecycle reset/read models, `_logDir`, `_runLogDir`.

Paths built/read/written: `.swarm/logs/pipeline`, `.swarm/logs/modules`, `.swarm/logs/gates`, run log dir, `pipeline/latest.json`, module `status.json`, module prompt/transcript artifact paths, gate archive paths.

Authority behavior: Module lifecycle fields in `status.json` are guarded; changes to status/current phase/fail/completion fields must carry a pending lifecycle mutation so canonical lifecycle events/read models remain authority. `loadStatus(raw:false)` overlays lifecycle read-model authority over stale `status.json`.

Error/retry/terminal behavior: Corrupt status JSON logs WARN and returns null. Guard violations throw `STATUS_LIFECYCLE_GUARD_VIOLATION`. Prompt/transcript saves are non-critical and log DEBUG/OK. Gate archive copies throw to caller if filesystem fails.

Verification coverage: `check-status-store-slice-surface.mjs`, telemetry contract tests, lifecycle/restart/resume/pipeline behavior tests. `P07-ISSUE-001` later resolved the observed caller path that tripped the guarded save.

Findings: `P07-ISSUE-001` was later resolved; no new P14-specific issue.

### `skills/nova/pipeline/services/status-store-lifecycle.js`

Role: Facade/re-export layer for canonical lifecycle event log helpers, read models, refs, and approval resolution projection.

Imports/dependencies: Lifecycle read-model, appender, refs, projection modules; serialization clone helper.

Exports/public surface: `loadLifecycleReadModels`, `saveLifecycleReadModels`, `readLifecycleEvents`, `recomputeProgression`, `cloneSerializable`, append helpers, state getters, reset helper, ref builders, `deriveApprovalResolutionFromState`.

Defines: Thin wrapper functions that preserve the public import surface after module extraction.

Important variables/state: None beyond delegating to underlying modules.

Calls out to: `read-models.js`, `appenders.js`, `refs.js`, `projections.js`, serialization.

Called by / expected callers: `status-store.js`, approval/rate-limit/recovery/module/pipeline lifecycle callers, tests.

Environment variables / CLI inputs / config fields: Delegated.

Paths built/read/written: Delegated.

Authority behavior: Public API surface; authority lives in appenders/projections/read models.

Error/retry/terminal behavior: Delegated; no local catch.

Verification coverage: `check-status-store-slice-surface.mjs` asserts exported facade functions.

Findings: None.

### `skills/nova/pipeline/services/status-store-lifecycle/appenders.js`

Role: Canonical lifecycle event construction, idempotent append, legal transition guard invocation, read-model update, and typed convenience appenders.

Imports/dependencies: Node `path`; runtime opaque ids; JSONL storage; idempotency; ref builders; read models; projections; legality; correlation; failure semantics; serialization clone.

Exports/public surface: `appendLifecycleEvent`, `appendPipelineLifecycleEvent`, `appendWaitLifecycleEvent`, `appendCooldownLifecycleEvent`, `getLifecycleGateState`, `getLifecycleModuleState`, `appendStaleRecoveryLifecycleEvent`, `getLifecycleCooldown`, `appendModuleLifecycleEvent`, `resetLifecycleStore`.

Defines: Pipeline start/completed/halted data builders, wait/cooldown/stale recovery/module lifecycle event builders, module lifecycle data mapping from pending status mutations.

Important variables/state: Appends to `config._lifecycleEventsCache`, writes lifecycle JSONL, writes read-model cache/files.

Calls out to: `lifecycleEventsPath`, `appendJsonLine`, `buildLifecycleIdempotencyKey`, ref builders, `loadLifecycleReadModels`, `readLifecycleEvents`, `saveLifecycleReadModels`, `applyLifecycleEventToReadModels`, `ensureLifecycleEventLegal`, `normalizeFailureClass`.

Called by / expected callers: `status-store.js saveStatus`, pipeline runner lifecycle hooks, approval/rate-limit/recovery callers, tests.

Environment variables / CLI inputs / config fields: Reads `config.fallback_model`, `progress.defaults.models`, `_runLogDir`, `_logDir`, `_progress`, run id fields, active progress, module/gate progress config, `opts.novaPrompt` presence.

Paths built/read/written: Lifecycle events/read-model paths delegated to storage; summary/latest paths embedded in pipeline completion data.

Authority behavior: Owns append sequence: dedupe by idempotency key before legality check; legal event is appended then projected into read models. Does not append duplicate event records.

Error/retry/terminal behavior: Missing type or primary ref throws. Unsupported typed lifecycle events throw. Illegal transitions throw. Existing idempotency key returns existing event with `deduped:true`. Storage write/JSON parse errors propagate.

Verification coverage: `check-status-store-slice-surface.mjs`, telemetry contract lifecycle assertions, lifecycle behavior areas.

Findings: None.

### `skills/nova/pipeline/services/status-store-lifecycle/idempotency.js`

Role: Stable lifecycle event idempotency key generator.

Imports/dependencies: Node `crypto`.

Exports/public surface: `buildLifecycleIdempotencyKey`.

Defines: Stable object stringify, SHA1 12-char hash helper, slug helper, per-event key templates.

Important variables/state: None.

Calls out to: `createHash('sha1')`.

Called by / expected callers: `appendLifecycleEvent`.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Owns dedupe identity per lifecycle event type. Failure events include a hash of reason/summary/validator/suites to avoid collapsing different failures.

Error/retry/terminal behavior: No explicit throw path beyond `crypto` availability. Unknown event types fall back to `type|primaryRef|hash:data`.

Verification coverage: Covered indirectly by lifecycle idempotence/resume tests.

Findings: None.

### `skills/nova/pipeline/services/status-store-lifecycle/legality.js`

Role: Canonical lifecycle transition legality guard.

Imports/dependencies: None.

Exports/public surface: `ensureLifecycleEventLegal`.

Defines: Approval signal kind set and legality checks for pipeline, wait, resume signal, cooldown, stale recovery, and module-attempt transitions.

Important variables/state: None; reads supplied read models only.

Calls out to: None.

Called by / expected callers: `appendLifecycleEvent`.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Prevents duplicate pipeline start, terminal pipeline re-append, wait open/close misuse, unsupported approval signals, cooldown close/open mismatches, stale recovery missing target/action/reason, and module-attempt mismatches except explicit retry-gap bridge.

Error/retry/terminal behavior: Illegal transition throws `Error` with `Illegal lifecycle append: ...`. No telemetry locally.

Verification coverage: `check-status-store-slice-surface.mjs` and lifecycle behavior tests.

Findings: None.

### `skills/nova/pipeline/services/status-store-lifecycle/projections.js`

Role: Applies canonical lifecycle events to read models and derives approval resolution state.

Imports/dependencies: Serialization clone helper, default read-model creator, progression recompute helper.

Exports/public surface: `deriveApprovalResolutionFromState`, `applyLifecycleEventToReadModels`.

Defines: Approval signal/status derivation, gate read-model ensure helper, wait/resume signal/cooldown/recovery/module/pipeline projection algorithms.

Important variables/state: Mutates a cloned read-model object and returns it; no file IO.

Calls out to: `cloneSerializable`, `createDefaultLifecycleReadModels`, `recomputeProgression`.

Called by / expected callers: `appendLifecycleEvent`.

Environment variables / CLI inputs / config fields: None direct; event data/refs drive projection.

Paths built/read/written: None.

Authority behavior: Owns canonical read-model merge semantics. Later event fields update existing read-model entries while preserving prior identity/provenance fields where event refs/data are absent.

Error/retry/terminal behavior: Unknown event types are mostly ignored except shared event_count/last fields. Missing refs in helpers no-op for that projection. No local telemetry.

Verification coverage: `check-status-store-slice-surface.mjs`, lifecycle and approval behavior tests.

Findings: None.

### `skills/nova/pipeline/services/status-store-lifecycle/read-models.js`

Role: Lifecycle read-model schema defaults, load/save helpers, lifecycle event reader, and progression recomputation.

Imports/dependencies: Runtime run id, serialization clone helper, storage path/JSON helpers.

Exports/public surface: `createDefaultLifecycleReadModels`, `loadLifecycleReadModels`, `saveLifecycleReadModels`, `readLifecycleEvents`, `recomputeProgression`.

Defines: Read-model v1 root shape and module progression count algorithm.

Important variables/state: Uses `config._lifecycleReadModelsCache` and `_lifecycleEventsCache` as in-memory fallback/cache when file paths are unavailable.

Calls out to: `lifecycleReadModelsPath`, `lifecycleEventsPath`, `readJsonIfPresent`, `readJsonLines`, `writeJsonAtomic`, `cloneSerializable`, `getRunId`.

Called by / expected callers: Facade, appenders, tests.

Environment variables / CLI inputs / config fields: Reads `_runId`, `run_id`; storage reads `_runLogDir`, `_logDir` indirectly.

Paths built/read/written: Lifecycle read-model JSON and canonical-events JSONL via storage helpers.

Authority behavior: Defines canonical read-model schema with pipeline, progression, modules, gates, waits, signals, active sessions, and cooldowns.

Error/retry/terminal behavior: Missing path falls back to in-memory cache/default. JSON parse/write errors from storage propagate. No local telemetry.

Verification coverage: `check-status-store-slice-surface.mjs` and lifecycle behavior tests.

Findings: None.

### `skills/nova/pipeline/services/status-store-lifecycle/refs.js`

Role: Canonical lifecycle reference builders for runs, module attempts, gates, waits, resume signals, and cooldowns.

Imports/dependencies: Active logger context, runtime run id, correlation resolvers.

Exports/public surface: `getActiveProgress`, `resolveModuleConfig`, `resolveModuleAttempt`, `resolveModuleCommit`, `buildPipelineRefs`, `buildModuleAttemptRefs`, `buildGateEvaluationRefs`, `buildWaitRefs`, `buildResumeSignalRefs`, `buildCooldownRefs`.

Defines: Attempt inference from mutation/status/read-model, commit resolution precedence, canonical ref string formats.

Important variables/state: Reads active context progress or `config._progress`; no mutation except returned objects.

Calls out to: `getActiveContext`, `getRunId`, `resolveStatusSessionKey`, `resolveStatusDispatchId`, `resolveStatusGatewayLabel`.

Called by / expected callers: Appenders and facade consumers.

Environment variables / CLI inputs / config fields: Reads `config._progress`, `_runId`, `run_id`, active context progress.

Paths built/read/written: None.

Authority behavior: Owns canonical ref shapes: `run:<runId>`, `module:<moduleId>`, `module_attempt:<runId>:<moduleId>:<attempt>`, `gate:<gateId>`, `gate_evaluation:<runId>:<gateId>:<attempt>`, `wait:<runId>:gate:<gateId>:<kind>`, `resume_signal:<runId>:gate:<gateId>:<kind>:<signal>`. Tracked correlation values from status are propagated as refs.

Error/retry/terminal behavior: `buildCooldownRefs` throws if neither `moduleId` nor `gateId` is supplied. Other helpers return null refs if run/gate/module identity is missing.

Verification coverage: Covered indirectly by status-store contract and lifecycle behavior tests.

Findings: None.

### `skills/nova/pipeline/services/status-store-lifecycle/storage.js`

Role: Lifecycle filesystem path and JSON/JSONL storage helpers.

Imports/dependencies: Node `fs`/`path`; `pipelineRunLogDir` path helper.

Exports/public surface: `ensureRunLogDir`, `lifecycleDir`, `lifecycleEventsPath`, `lifecycleReadModelsPath`, `readJsonIfPresent`, `writeJsonAtomic`, `appendJsonLine`, `readJsonLines`.

Defines: Run log lifecycle directory construction and atomic/read/append primitives.

Important variables/state: May set `config._runLogDir` when `_logDir` exists and `_runLogDir` is missing.

Calls out to: `pipelineRunLogDir`, Node filesystem.

Called by / expected callers: Read-model and appender modules.

Environment variables / CLI inputs / config fields: Reads `config._runLogDir`, `_logDir`, and path/run id fields through `pipelineRunLogDir`.

Paths built/read/written: `<pipelineRunLogDir>/lifecycle`, `canonical-events.jsonl`, `read-models.json`.

Authority behavior: Owns durable lifecycle storage locations and atomic JSON write pattern. If no log dir exists, lifecycle storage paths are null and read models/events use in-memory cache behavior.

Error/retry/terminal behavior: Missing `_logDir` returns null paths. JSON read/parse and filesystem write/rename/append errors propagate. No local telemetry.

Verification coverage: `check-status-store-slice-surface.mjs` exercises temp lifecycle storage.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `status-store.js` | `status-store-lifecycle.js` | lifecycle append/read/get/reset exports | Public facade and guarded save integration. |
| `status-store.js` | `status-store-compat.js` | `resolveModuleStatusSnapshotAuthority` and compat exports | P15 owns compat internals; P14 observes facade use. |
| `status-store.js` | `redaction.js` | prompt/transcript artifact writers | Redacted metadata persistence. |
| `status-store-lifecycle.js` | lifecycle submodules | wrapper imports/exports | Stable public surface. |
| `appenders.js` | `storage.js` | lifecycle path/read/write helpers | Durable event/read-model storage. |
| `appenders.js` | `idempotency.js` | `buildLifecycleIdempotencyKey` | Dedupe before legality. |
| `appenders.js` | `legality.js` | `ensureLifecycleEventLegal` | Transition legality guard. |
| `appenders.js` | `projections.js` | `applyLifecycleEventToReadModels` | Event-to-read-model projection. |
| `appenders.js` | `refs.js` | ref builders and resolvers | Canonical event refs. |
| `read-models.js` | `storage.js` | JSON/JSONL helpers | Read-model/event persistence. |
| `projections.js` | `read-models.js` | default model/progression helpers | Projection root and progression recompute. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `loadStatus` | Missing/corrupt status JSON/raw flag | status file existence/parse/raw | null, raw status, or lifecycle-authority overlay | Keeps `status.json` diagnostic unless raw requested. |
| `assertLifecycleGuardAllowsSave` | Pending lifecycle mutation absent and guarded fields changed | Previous vs next guarded fields | Throw `STATUS_LIFECYCLE_GUARD_VIOLATION` | Forces lifecycle transition helpers for authority fields. |
| `appendLifecycleEvent` | Existing idempotency key | Events JSONL/cache | Return existing event `deduped:true` | Prevents duplicate canonical events. |
| `ensureLifecycleEventLegal` | Pipeline start/completion/halt state | Pipeline read model | Allow or throw duplicate/unstarted/terminal errors | Pipeline lifecycle legality. |
| `ensureLifecycleEventLegal` | Wait/signal/cooldown/recovery/module state | Refs/data/read models | Allow or throw illegal transition | Canonical state machine guard. |
| `mapGate/wait/resume/cooldown projections` | Event type | Event type/refs/data | Update gates/waits/signals/cooldowns | Event-specific read-model routing. |
| `applyLifecycleEventToReadModels` | Module event type | `module_attempt.*` | Set status/current phase/completion/fail fields | Module scheduler authority projection. |
| `buildLifecycleIdempotencyKey` | Known event type vs default | Event type/refs/data | Stable explicit key or hash fallback | Dedupe semantics. |
| `buildCooldownRefs` | Module vs gate vs missing target | Input target ids | Module refs, gate refs, or throw | Cooldown event identity. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `initLogDir` | Log dir fields and lifecycle store | Config/context | Create global/run dirs; set config/context streams; reset lifecycle store | Fresh run starts with empty read models. |
| `saveStatus` | Module `status.json` and lifecycle event log | Status with pending mutation | Peek guard, consume mutation, append lifecycle, write tmp+rename | Guarded fields only change with lifecycle event. |
| `appendLifecycleEvent` | Events cache/JSONL and read models | Proposal refs/data | Dedupe first, legality check, clone event, append, project, save | Event log and read model advance together. |
| `saveLifecycleReadModels` | Read-model cache/file | Read models | Add new `generated_at`, clone cache, atomic JSON write | Durable v1 read model. |
| `applyWaitEventToReadModels` | waits/gates maps | wait event and existing entries | Existing identity preserved, event data fills current state; close updates terminal fields | Gate wait projection mirrors wait lifecycle. |
| `applyResumeSignalToReadModels` | signals/waits/gates maps | signal event | Signal record written, wait latest signal updated, gate derived status updated | Signal can resolve approval semantics. |
| `applyCooldownEventToReadModels` | cooldown maps | cooldown event | Started opens entry; completed preserves prior identity and closes | Cooldown state is explicit open/closed. |
| `applyLifecycleEventToReadModels` | module map/progression | module event | Existing module entry merged; event type owns status/phase/timestamps | Progression counts recomputed after every event. |
| `readJsonIfPresent`/`writeJsonAtomic` | JSON files | File path/value | Missing returns fallback; write tmp then rename | Simple atomic persistence. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| P14 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | Lifecycle helpers are synchronous append/read/project helpers. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config.paths.swarm_dir` | Config path | `initLogDir`, path helpers | Required | Root for `.swarm/logs`. |
| `config.paths.modules_dir` | Config path | status path helper through `status-store.js` | Required for module status | Module `status.json` location. |
| `config._logDir` | Runtime config field | status store/storage/artifact saves | Set by `initLogDir` | Enables run log dir and artifacts. |
| `config._runLogDir` | Runtime config field | lifecycle storage and pipeline completion data | Set by `initLogDir` or `ensureRunLogDir` | Root for run-scoped lifecycle storage. |
| `config._pipelineLogFd`, `config._runPipelineLogFd` | Runtime streams | Logger context | Set by `initLogDir` | JSONL log streams. |
| `config._runId`, `config.run_id`, `getRunId(config)` | Runtime id | refs/read models/pipeline refs | Runtime fallback | Canonical run identity. |
| `config._progress`, active context progress | Runtime/progress | ref/data builders | Active logger context first | Module/gate metadata for lifecycle events. |
| `config.fallback_model`, `progress.defaults.models` | Config/progress fields | `buildPipelineStartData` | null | Captured in pipeline start event data. |
| Pending lifecycle mutation on status | Runtime status marker | `saveStatus` | Created by lifecycle-state helpers | Required for guarded field saves. |
| `mutation.*` fields | Runtime mutation object | `buildModuleLifecycleData`, refs/idempotency | Caller-provided | Event type, attempts, previous status/phase, notes, timestamps. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `.swarm/logs/pipeline/pipeline.jsonl` | `initLogDir` | Logger/operators | Pipeline log stream | Global pipeline log. |
| `<pipelineRunLogDir>/pipeline.jsonl` | `initLogDir` | Logger/operators | Run pipeline log stream | Run-scoped pipeline log. |
| `.swarm/logs/pipeline/latest.json` | `initLogDir` | Operators/artifact bundle | `buildLatestPointer` output | Latest pointer, not lifecycle authority. |
| `<pipelineRunLogDir>/lifecycle/canonical-events.jsonl` | `lifecycleEventsPath` | `readLifecycleEvents` | `appendLifecycleEvent` | Canonical lifecycle event log. |
| `<pipelineRunLogDir>/lifecycle/read-models.json` | `lifecycleReadModelsPath` | `loadLifecycleReadModels` | `saveLifecycleReadModels` | Canonical lifecycle read models. |
| Module `status.json` | `statusPath` | `loadStatus`, scheduler/diagnostics | `saveStatus` | Guarded legacy/operator snapshot; lifecycle read model overlays authority. |
| Module prompt artifact | `savePrompt` via `moduleLogDir` | Operators/debugging | Redacted prompt writer | Non-critical redacted artifact. |
| Module transcript artifact | `saveStreamLog` via `moduleLogDir` | Operators/debugging | Redacted transcript copy | Non-critical redacted artifact. |
| Gate archive dir | `gateArchiveDir` | Gate runners/operators | `archiveGateOutputIfPresent` | Archives stale gate outputs/status evidence. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Canonical lifecycle event log | `appendLifecycleEvent` | Read-model projector, tests/operators | None. |
| Lifecycle read models | `applyLifecycleEventToReadModels` + `saveLifecycleReadModels` | Scheduler/status compatibility/gate and module readers | P15 covers compatibility overlays. |
| Module guarded lifecycle fields | `saveStatus` only with pending lifecycle mutation and `appendModuleLifecycleEvent` | Module status readers/scheduler | Existing P07 issue covers caller save violation. |
| Lifecycle transition legality | `ensureLifecycleEventLegal` | All appenders through `appendLifecycleEvent` | None. |
| Lifecycle idempotency | `buildLifecycleIdempotencyKey` | `appendLifecycleEvent` | None. |
| Lifecycle refs | `refs.js` builders | Events, read models, correlation consumers | None. |
| Prompt/transcript artifacts | `savePrompt`, `saveStreamLog` | Operators/debugging | Non-authoritative artifacts. |
| Legacy `status.json` snapshot | `saveStatus` | `loadStatus`, compat overlays | Operator/evidence snapshot; not lifecycle authority. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Lifecycle event record | `appendLifecycleEvent` | `schemaVersion:'v1'`, `event_id`, `type`, `occurred_at`, `recorded_at`, `idempotency_key`, `refs`, `data` | `ensureLifecycleEventLegal`, idempotency key builder | Read-model projector/operators. |
| Lifecycle refs | `refs.js` builders | `primary_ref:{kind,id}`, run/module/gate/wait/resume/cooldown ids, attempt, dispatch/gateway/session correlation | Ref builders | Events/read models/correlation. |
| Lifecycle read-model root | `createDefaultLifecycleReadModels` | `schemaVersion:'v1'`, `run_id`, `generated_at`, `last_event_id`, `last_event_type`, `event_count`, `pipeline`, `progression`, `modules`, `gates`, `waits.by_ref`, `signals.by_ref`, `active_sessions`, `cooldowns` | Read-model creator/projector | Status compat/scheduler/operators. |
| Pipeline read-model entry | `applyLifecycleEventToReadModels` | `run_id`, `run_ref`, `status`, `run_mode`, `resume`, `requested_module_id`, timestamps, exit/halt fields | Pipeline event routes | Pipeline status/operators. |
| Module read-model entry | `applyLifecycleEventToReadModels` | `module_id`, `title`, `module_dir`, `current_attempt`, `module_attempt_ref`, `status`, `current_phase`, timestamps, fail/block/correlation fields, `projection_source`, latest event fields | Module event routes and legality | Scheduler/status compat. |
| Gate wait read-models | Wait/signal projection helpers | Gate entries with wait status/resolution fields; waits by ref; signals by ref | Wait/signal legality and projection | Approval gate/waitable engine/status compat. |
| Cooldown read-model entry | `applyCooldownEventToReadModels` | `scope`, target ids, run/attempt, pause/max/resume/detail, agent/correlation, `open`, timestamps | Cooldown legality | Rate-limit recovery/status. |
| Stale recovery event data | `appendStaleRecoveryLifecycleEvent` | `recovery_target_status`, `recovery_action`, `reason`, correlation, `stale_evidence` | Legality requires target/action/reason | Restart recovery/read models. |
| Module status snapshot | `initStatus`/`saveStatus` | Module id/title/status/current_phase/fail fields/history/timestamps/cost/validation/commit fields | Guarded field comparison plus pending mutation | Legacy/operator status readers; lifecycle overlay owns authority. |

## Prompt and agent behavior updates

None found in scoped files.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `loadStatus` | Missing module `status.json` | Not error | No retry | Returns null | None. |
| `loadStatus` | Corrupt module `status.json` | No local retry | No retry | WARN log and returns null | Preview limited to first 200 chars. |
| `assertLifecycleGuardAllowsSave` | Guarded lifecycle field changed without pending mutation | No | No retry | Throws `STATUS_LIFECYCLE_GUARD_VIOLATION` | None. |
| `saveStatus` | Filesystem mkdir/write/rename failure | No local retry | Atomic tmp+rename | Throws | None. |
| `savePrompt` | Missing log dir/dir/prompt | Not error | No retry | DEBUG log and skip | Prompt not written. |
| `savePrompt` | Prompt artifact write failure | Soft | No retry | DEBUG log and continue | Redaction used when write succeeds. |
| `saveStreamLog` | Missing stream path/file | Not error | No retry | Return or DEBUG log | None. |
| `saveStreamLog` | Transcript copy failure | Soft | No retry | DEBUG log and continue | Redaction used when copy succeeds. |
| `archiveGateOutputIfPresent` | Missing source path | Not error | No retry | Returns null | None. |
| `archiveGateOutputIfPresent` | Archive mkdir/copy failure | No local retry | No retry | Throws to caller | None. |
| `appendLifecycleEvent` | Missing type or `refs.primary_ref.id` | No | No retry | Throws | None. |
| `appendLifecycleEvent` | Duplicate idempotency key | Not error | No retry | Returns existing record with `deduped:true` | None. |
| `appendLifecycleEvent` | Illegal lifecycle transition | No | No retry | Throws `Illegal lifecycle append: ...` | None. |
| Typed appenders | Unsupported lifecycle event type | No | No retry | Throws | None. |
| `buildCooldownRefs` | Missing module/gate target | No | No retry | Throws | None. |
| Storage helpers | Missing `_logDir` / no lifecycle path | Not error | No retry | Null path, in-memory cache fallback for read models/events | None. |
| Storage helpers | JSON parse or write/append failure | No local retry | No retry | Throws | None. |
| Projection helpers | Missing refs for wait/signal/cooldown | Not error | No retry | No-op for that projection route | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `loadStatus` | Missing status file | No | none | none | Return null | Expected absent state. |
| `loadStatus` | Corrupt status JSON | Yes | Core log | WARN parse failed | `log` | Preview included. |
| `assertLifecycleGuardAllowsSave` | Guard violation | Indirect/none locally | Caller error handling; existing failing regression documents one path | `STATUS_LIFECYCLE_GUARD_VIOLATION` thrown | Caller | `P07-ISSUE-001` resolved the observed caller path in V02a3. |
| `saveStatus` | Filesystem failure | No local telemetry | none | thrown fs error | Caller | Caller owns handling. |
| `savePrompt` | Missing inputs | Yes | Core log | DEBUG prompt save skipped | `log` | Non-critical. |
| `savePrompt` | Write failure | Yes | Core log | DEBUG prompt save failed | `log` | Non-critical. |
| `saveStreamLog` | Missing stream path/file | Partial | Core log for missing file | DEBUG stream log not found | `log` | No log for null path. |
| `saveStreamLog` | Copy failure | Yes | Core log | DEBUG stream log save failed | `log` | Non-critical. |
| `archiveGateOutputIfPresent` | Missing source | No | none | none | Return null | Expected absent state. |
| `archiveGateOutputIfPresent` | Copy failure | No local telemetry | none | thrown fs error | Caller | Gate runners own handling. |
| `appendLifecycleEvent` | Missing type/ref | No local telemetry | none | thrown Error | Caller | Programming/config error. |
| `appendLifecycleEvent` | Duplicate idempotency key | Yes as existing artifact | Lifecycle event log/read-model remains unchanged | existing lifecycle event | `appendLifecycleEvent` | Returns existing record. |
| `appendLifecycleEvent` | Illegal lifecycle transition | No local telemetry | none | thrown Error | Caller | Contract tests assert fail-closed behavior. |
| Typed appenders | Unsupported event type | No local telemetry | none | thrown Error | Caller | Programming error. |
| `buildCooldownRefs` | Missing target | No local telemetry | none | thrown Error | Caller | Programming/config error. |
| Storage helpers | Missing lifecycle path | Yes by in-memory state only | `config._lifecycleReadModelsCache` / `_lifecycleEventsCache` | cache fallback | Read-model helpers | No durable artifact without `_logDir`. |
| Storage helpers | JSON parse/write failure | No local telemetry | none | thrown Error | Caller | Caller owns handling. |
| Projection helpers | Missing refs route | No | none | no-op | Projection helper | No-op by design. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P14 JS modules | ESM, sync fs/path, crypto hashing | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | status store/storage/archive/artifact paths | Status, logs, lifecycle JSON/JSONL, archives | Sync IO; write failures mostly propagate. |
| Node `crypto` built-in | Runtime built-in | Node major 24 observed | `idempotency.js` | SHA1 idempotency fingerprint | Required for dedupe keys. |
| Logger/context service | Internal source | Internal | status store/refs | Core logs and active progress lookup | Missing active context falls back to config. |
| Runtime id service | Internal source | Internal | refs/read models/appenders | Run ids and opaque event ids | Missing run id yields null refs for some surfaces. |
| Status compatibility service | Internal source | Internal | `status-store.js` facade/load overlay | Lifecycle authority overlay and scheduler projections | Internals reviewed P15. |
| Redaction helpers | Internal source | Internal | prompt/transcript saves | Redacted debug artifacts | Artifact failures non-critical. |
| Lifecycle-state pending mutation helpers | Internal source | Internal | `saveStatus` | Guarded status mutation authorization | Caller must attach/consume pending mutations. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Lifecycle event append | Synchronous append per event | No queue/lock | Duplicate idempotency key dedupes; concurrent process writes not locked | Event log/read-model file | No cross-process file lock in scoped files. |
| Lifecycle read-model write | Atomic tmp+rename | No retry | Write failure throws; stale read model possible if event append succeeds but read-model write fails | JSON artifacts | None. |
| In-memory fallback | Config-local arrays/cache | Used when `_logDir`/run path absent | Not durable across process restart | `_lifecycleEventsCache`, `_lifecycleReadModelsCache` | None. |
| Module status save | Synchronous tmp+rename | Pending lifecycle mutation required for guarded fields | Guard violation throws | Error object/caller telemetry | Existing P07 caller issue. |
| Prompt/transcript saves | Synchronous best-effort artifacts | No retry | Failure logged DEBUG and ignored | Debug logs | None. |
| Lifecycle progression recompute | Full scan of modules map every event | No explicit cap | O(number of modules) per event | read-model progression | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Lifecycle correlation refs | `dispatch_id`, `gateway_label`, `session_key` on module/gate/cooldown refs/read models | `refs.js` and appenders | Status compatibility, telemetry, recovery | Synchronous event projection | Lifecycle event/read-model artifacts. |
| Active-session read-model placeholders | `active_sessions.modules`, `active_sessions.gates` maps in read-model root | Default read-model/projection cleanup | Recovery/session authority services | No direct ACP polling here | Cleared on stale recovery projection. |
| Module/gate lifecycle event identity | `module_attempt_ref`, `gate_evaluation_ref`, wait/resume refs | Ref builders | ACP/session correlation consumers | No ACP transport in P14 | Canonical events/read models. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Status-store facade exports and extracted helper boundaries | `tests/verification/contracts/check-status-store-slice-surface.mjs` | Strong source and runtime coverage | P15 covers compat internals. |
| Guarded `saveStatus` lifecycle field enforcement | `check-status-store-slice-surface.mjs`; `module-failures.mjs` resolved in V02a3 for P07 | Good guard assertion; caller regression resolved in V02a3 | `P07-ISSUE-001`. |
| Lifecycle event/read-model projection | `check-status-store-slice-surface.mjs`, telemetry contract tests | Strong targeted projections | None. |
| Restart/recovery/resume behavior | `restart-recovery.mjs`, `resume-idempotence.mjs`, `seq-restart.mjs`, `pipeline.mjs` | Good behavior coverage | None. |
| Lifecycle event telemetry contract | `check-telemetry-contract.mjs` | Strong lifecycle event coverage | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P07-ISSUE-001` was resolved for the observed guarded lifecycle save caller path; no new P14 issue.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
