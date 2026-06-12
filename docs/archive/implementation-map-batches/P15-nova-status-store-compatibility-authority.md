# Batch P15 — Nova status-store compatibility authority

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/services/status-store-compat.js
skills/nova/pipeline/services/status-store-compat/*.js
skills/nova/pipeline/services/compatibility-authority.js
skills/nova/pipeline/services/session-authority.js
skills/nova/pipeline/services/truth-drift.js
```

Scope expansion verified live: 7 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/services/compatibility-authority.js
kubeclaw-main/skills/nova/pipeline/services/session-authority.js
kubeclaw-main/skills/nova/pipeline/services/status-store-compat.js
kubeclaw-main/skills/nova/pipeline/services/status-store-compat/common.js
kubeclaw-main/skills/nova/pipeline/services/status-store-compat/gate-projection.js
kubeclaw-main/skills/nova/pipeline/services/status-store-compat/module-projection.js
kubeclaw-main/skills/nova/pipeline/services/truth-drift.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-status-store-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-session-authority-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/foundations.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/restart-recovery.mjs
kubeclaw-main/tests/verification/behavior/areas/pipeline.mjs
```

## Per-file map

### `skills/nova/pipeline/services/compatibility-authority.js`

Role: Scanner/stripper for legacy compatibility authority keys.

Imports/dependencies: None.

Exports/public surface: `COMPATIBILITY_AUTHORITY_KEY_NAMES`, `isCompatibilityAuthorityKey`, `findCompatibilityAuthorityKeys`, `stripCompatibilityAuthority`.

Defines: Recursive compatibility key finder and clone-with-authority-keys-removed helper.

Important variables/state: Frozen compatibility key-name set only.

Calls out to: None.

Called by / expected callers: Contract result validators and pipeline-step projection code.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Prevents fields such as `exitCode`, `status`, `reason`, `next`, and legacy authority aliases from becoming typed result authority.

Error/retry/terminal behavior: Handles objects/arrays recursively with cycle detection. No throw path in scoped source.

Verification coverage: Contract result tests and pipeline/gate behavior coverage.

Findings: None.

### `skills/nova/pipeline/services/session-authority.js`

Role: Active-session identity confirmation and authority-policy builder.

Imports/dependencies: None.

Exports/public surface: identity field constants, evidence role constants, `normalizeActiveSessionIdentity`, `getMissingActiveSessionIdentityFields`, `hasStrongActiveSessionIdentity`, `buildActiveSessionConfirmation`, `buildActiveSessionAuthorityPolicy`.

Defines: Required strong identity fields, optional gateway label matching, monitor-confirmation gate, status-active-agent evidence roles.

Important variables/state: Constants only.

Calls out to: None.

Called by / expected callers: Status-store compatibility module projection and session authority tests.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: `status.active_agent` is never standalone authority; active dispatch lease with strong identity is required, optionally with monitor confirmation.

Error/retry/terminal behavior: Missing/weak/mismatched identities return explicit policy codes instead of throwing.

Verification coverage: `check-session-authority-slice-surface.mjs`.

Findings: None.

### `skills/nova/pipeline/services/status-store-compat.js`

Role: Facade for legacy evidence projection constants and module/gate scheduler projection helpers.

Imports/dependencies: `status-store-compat/common.js`, `module-projection.js`, `gate-projection.js`.

Exports/public surface: common evidence constants/source helpers, module projection helpers, gate projection helpers.

Defines: Stable public import surface only.

Important variables/state: None.

Calls out to: Re-exports only.

Called by / expected callers: `status-store.js`, pipeline runner shared code, dependency checks, truth drift reports, tests.

Environment variables / CLI inputs / config fields: Delegated.

Paths built/read/written: Delegated.

Authority behavior: Public boundary separating scheduler authority from legacy diagnostic evidence.

Error/retry/terminal behavior: Delegated; no local catch.

Verification coverage: `check-status-store-slice-surface.mjs`.

Findings: None.

### `skills/nova/pipeline/services/status-store-compat/common.js`

Role: Shared evidence source constants and projection-source field builder.

Imports/dependencies: None.

Exports/public surface: `GATE_OUTPUT_EVIDENCE_SOURCE`, `LEGACY_GATE_STATUS_EVIDENCE_SOURCE`, `LEGACY_STATUS_EVIDENCE_SOURCE`, `READ_MODEL_SOURCE_CANONICAL_EVENTS`, `READ_MODEL_SOURCE_PENDING`, `buildProjectionSourceFields`.

Defines: Canonical string constants and a small source metadata builder.

Important variables/state: Constants only.

Calls out to: None.

Called by / expected callers: Module/gate projection helpers.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Source metadata helper consistently labels canonical read models vs legacy evidence.

Error/retry/terminal behavior: No throw path.

Verification coverage: Status-store slice tests indirectly assert projection source behavior.

Findings: None.

### `skills/nova/pipeline/services/status-store-compat/module-projection.js`

Role: Module status/read-model compatibility policy, legacy projection, scheduler state, and snapshot-authority adjudication.

Imports/dependencies: Node `fs`/`path`; lifecycle read-model helper; path helpers; session authority; common source helpers.

Exports/public surface: projection modes/purposes/roles constants, `resolveLegacyModuleStatusProjectionPolicy`, `getAuthoritativeModuleState`, `projectModuleLegacyStatusIntoReadModel`, `readModuleStatusJson`, `resolveModuleStatusSnapshotAuthority`, `projectModuleSchedulerState`.

Defines: Bootstrap/diagnostic policy resolver, stale legacy drift detection, active-session confirmation integration, module scheduler projection.

Important variables/state: Reads lifecycle read models and module `status.json`; no writes.

Calls out to: `loadLifecycleReadModels`, `moduleLogDir`, `statusPath`, `buildActiveSessionAuthorityPolicy`.

Called by / expected callers: `status-store.js`, dependency/pipeline checks, truth drift, tests.

Environment variables / CLI inputs / config fields: Reads `config._lifecycle_projection_bootstrap`, `_lifecycle_projection_purpose`, `_lifecycle_projection_mode`, lifecycle read-model config/log paths.

Paths built/read/written: Reads module `status.json`; reports `legacy_status_path`.

Authority behavior: Canonical lifecycle read model wins. Legacy `status.json` is allowed as bootstrap authority only when lifecycle state is absent and policy mode/purpose allow it. `status.active_agent` only confirms restart evidence when matched to active dispatch lease.

Error/retry/terminal behavior: Missing status is non-error. Corrupt status JSON returns parse-error projection data. Filesystem/JSON errors are captured into parse-error read results.

Verification coverage: `check-status-store-slice-surface.mjs`, `check-session-authority-slice-surface.mjs`, behavior `foundations`, `pipeline`, `restart-recovery`.

Findings: None.

### `skills/nova/pipeline/services/status-store-compat/gate-projection.js`

Role: Gate output/status compatibility policy, approval wait synchronization, Buster completion evidence, and generic gate scheduler projection.

Imports/dependencies: Node `fs`/`path`; lifecycle read-model/appenders; path helpers; gate output contract validator; common source helpers.

Exports/public surface: `GATE_STATUS_AUTHORITY_ROLES`, `buildGateStatusAuthorityPolicy`, `projectGateLegacyEvidenceIntoReadModel`, `syncApprovalWaitState`, `readGateOutput`, `gateOutputExists`, `readGateStatusJson`, `projectGateCompletionState`, `readBusterGateCompletion`, `readGateCompletionEvidence`, `projectGateSchedulerState`.

Defines: Gate-status authority policy, gate read-model projection from canonical/legacy evidence, approval wait lifecycle sync, output-file contract reader, completion-state projection.

Important variables/state: Reads lifecycle read models, gate output files, and `gate-status.json`; writes approval wait lifecycle events via `syncApprovalWaitState`.

Calls out to: `loadLifecycleReadModels`, `appendWaitLifecycleEvent`, `appendResumeSignalLifecycleEvent`, `gateStatusPath`, `swarmRoot`, `validateGateOutputContract`.

Called by / expected callers: Gate runners, approval gate, dependency checks, truth drift, tests.

Environment variables / CLI inputs / config fields: Reads gate `type`, `output_file`, run/log config for lifecycle read models and swarm root.

Paths built/read/written: Reads gate `output_file`, gate-status JSON; writes lifecycle wait/signal events through appenders.

Authority behavior: Gate `output_file` is canonical completion evidence for Buster/generic completion. Legacy `gate-status.json` is diagnostic except approval gate status and active-dispatch rate-limit confirmation.

Error/retry/terminal behavior: Missing output/status returns pending/non-error projections. Invalid output contract becomes terminal invalid output in completion projection. Parse errors return non-terminal parse diagnostics except output invalid contract terminal. Approval sync swallows duplicate/illegal lifecycle append errors when read model already matches the requested terminal/pending state.

Verification coverage: `check-status-store-slice-surface.mjs`, behavior `foundations`, `gates`, `pipeline`.

Findings: None.

### `skills/nova/pipeline/services/truth-drift.js`

Role: Explicit module/gate scheduler truth-drift report builder combining scheduler projections and Redis completion adjudication.

Imports/dependencies: Status-store compatibility projections and completion adjudicator.

Exports/public surface: `projectModuleTruthDrift`, `projectGateTruthDrift`.

Defines: Drift source tagging and artifact reference collectors.

Important variables/state: None.

Calls out to: `projectModuleSchedulerState`, `projectGateSchedulerState`, `adjudicateCompletionEvidence`.

Called by / expected callers: Status-store facade, diagnostics/tests/operators.

Environment variables / CLI inputs / config fields: Delegated to projection helpers.

Paths built/read/written: Reports artifact refs for module status path, gate output path, and gate-status path; does not write.

Authority behavior: Does not create authority; reports drift between scheduler projection and completion adjudication.

Error/retry/terminal behavior: No local catch; dependencies may throw. Missing gate Redis entry skips completion adjudication.

Verification coverage: `check-status-store-slice-surface.mjs` asserts truth-drift surface.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `status-store-compat.js` | `common.js` | constants and `buildProjectionSourceFields` | Public re-export. |
| `status-store-compat.js` | `module-projection.js` | module compatibility helpers | Public re-export. |
| `status-store-compat.js` | `gate-projection.js` | gate compatibility helpers | Public re-export. |
| `module-projection.js` | `session-authority.js` | `buildActiveSessionAuthorityPolicy` | `status.active_agent` confirmation policy. |
| `module-projection.js` | lifecycle read models | `loadLifecycleReadModels` | Canonical module scheduler authority. |
| `gate-projection.js` | lifecycle read models/appenders | `loadLifecycleReadModels`, wait/signal appenders | Canonical gate/wait authority. |
| `gate-projection.js` | gate output contract | `validateGateOutputContract` | Canonical output validation. |
| `truth-drift.js` | status-store compat helpers | module/gate scheduler projection | Drift source one. |
| `truth-drift.js` | completion adjudicator | `adjudicateCompletionEvidence` | Drift source two. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `findCompatibilityAuthorityKeys` | Object/array contains authority key names | Recursive keys | Findings with paths/keys | Contract layers reject legacy authority fields. |
| `stripCompatibilityAuthority` | Object/array contains authority key names | Recursive keys with WeakMap cycle guard | Clone without authority keys | Edge compatibility projection safety. |
| `buildActiveSessionAuthorityPolicy` | Missing/weak/mismatched/monitor-required identities | Active dispatch, status active agent, monitor evidence | Explicit policy code/role/confirmed flags | Prevents `status.active_agent` from becoming authority. |
| `resolveLegacyModuleStatusProjectionPolicy` | Purpose/mode/bootstrap flags | Config overrides | `bootstrap_authority`, `diagnostic_only`, or `disabled` | Legacy status migration policy. |
| `getAuthoritativeModuleState` | Canonical read model present vs legacy status | Read model and legacy status | Canonical state, bootstrap legacy projection, pending, or parse error | Module scheduler truth selection. |
| `resolveModuleStatusSnapshotAuthority` | Stale/corrupt/active-session status | Canonical read model, legacy status, active dispatch | Authority role plus drift diagnostics | Snapshot authority policy. |
| `projectGateLegacyEvidenceIntoReadModel` | Gate type and completion/output/status state | Gate config, read model, output/status/completion | Approval/canonical/output/pending projection | Gate scheduler truth selection. |
| `projectGateCompletionState` | Output invalid/fail/pass/missing vs gate-status status | Gate output and gate-status | Terminal completion or pending diagnostic outcome | Completion polling semantics. |
| `readBusterGateCompletion` | Output PASS vs all other states | Canonical output file | PASS only from output file | Buster resume authority. |
| `project*TruthDrift` | Drift lists from scheduler/adjudicator | Projection/adjudication output | Tagged drift report | Operator diagnostics. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `buildActiveSessionConfirmation` | Confirmation object | Expected/observed identity | Required fields missing/mismatched first; optional gateway mismatch separate | Strong identity requires run/attempt/dispatch/session. |
| `projectModuleLegacyStatusIntoReadModel` | Projection object | Legacy status | Copy status/phase/fail/correlation with projection source fields | Legacy-shaped module read model. |
| `getAuthoritativeModuleState` | Projection object | Canonical read model and legacy status | Canonical lifecycle read model wins; legacy only bootstrap/pending/error | Scheduler never trusts stale legacy status over canonical. |
| `projectGateLegacyEvidenceIntoReadModel` | Gate projection object | Read model/output/status/completion/approval state | Approval state special-case; canonical read model then output/completion diagnostics | Gate source/authority roles explicit. |
| `syncApprovalWaitState` | Lifecycle wait/signal event log | Approval state/status | Pending opens wait; approved/rejected/cancelled/timed out closes wait and appends signal | Approval state projected to lifecycle. |
| `projectModuleTruthDrift` / `projectGateTruthDrift` | Drift report object | Scheduler projection and Redis adjudication | Concatenate tagged drift arrays, include artifact refs | Report-only, no authority mutation. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| P15 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | Compatibility helpers are synchronous projection/adjudication helpers. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config._lifecycle_projection_bootstrap` | Config/test flag | `resolveLegacyModuleStatusProjectionPolicy` | false | Allows legacy status bootstrap authority when no canonical state exists. |
| `config._lifecycle_projection_purpose` | Config/test flag | `resolveLegacyModuleStatusProjectionPolicy` | scheduler | Distinguishes scheduler vs operator projection purpose. |
| `config._lifecycle_projection_mode` | Config/test flag | `resolveLegacyModuleStatusProjectionPolicy` | null | Explicit projection mode override. |
| `config._runId`, `config.run_id` | Runtime id | Read-model/projection helpers indirectly | Runtime helper | Run identity/correlation. |
| `config._progress` and active lifecycle read models | Runtime state | Module/gate projections | Lifecycle read model files/cache | Canonical scheduler source. |
| `gate.type`, `gate.output_file` | Gate config | Gate projection/output readers | Type-specific behavior | Approval and Buster authority branches. |
| `activeDispatch`, `statusActiveAgent`, `monitorEvidence` | Runtime evidence inputs | `buildActiveSessionAuthorityPolicy`, module snapshot authority | Caller-provided | Active-session authority confirmation. |
| `redisEntry`, `expectedIdentity`, `expectedStatuses` | Runtime evidence inputs | `truth-drift.js` | Caller-provided | Completion-adjudicator drift source. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Module `status.json` | `statusPath`/`moduleLogDir` | `readModuleStatusJson`, module projection | Written by P14 status store | Legacy/diagnostic or bootstrap evidence. |
| Gate output file | `path.join(swarmRoot(config), gate.output_file)` | `readGateOutput`, `gateOutputExists` | Gate runners | Canonical gate completion evidence. |
| Gate `gate-status.json` | `gateStatusPath(config, gateId)` | `readGateStatusJson`, gate projection | Gate runners/approval state | Diagnostic except approval and confirmed rate-limit branches. |
| Lifecycle read models | P14 lifecycle storage | Module/gate projections | P14 lifecycle appenders | Canonical scheduler authority. |
| Drift artifact refs | `truth-drift.js` collectors | Operators/tests | Report only | Paths point to source evidence; no writes. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Compatibility authority key list | `compatibility-authority.js` | Contract validators/pipeline-step builder | None. |
| Active-session authority policy | `session-authority.js` | Module status snapshot authority | None. |
| Module scheduler state projection | `module-projection.js` | Pipeline/dependency/truth-drift/status readers | None. |
| Gate scheduler state projection | `gate-projection.js` | Gate runners/dependency/truth-drift/status readers | None. |
| Buster gate completion evidence | `readBusterGateCompletion` | Buster gate runner/resume/dependency checks | None. |
| Truth drift report | `truth-drift.js` | Operators/tests | Diagnostic only; not scheduler authority. |
| Legacy status/gate-status artifacts | Status/gate writers | Compatibility projections | Explicitly downgraded to diagnostic/bootstrap roles. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Compatibility authority finding | `findCompatibilityAuthorityKeys` | `path`, `key` | Key-name set | Contract diagnostics. |
| Active-session authority policy | `buildActiveSessionAuthorityPolicy` | `code`, `confirmed`, `identity_confirmed`, `monitor_confirmed`, `active_session_authority_source`, `allow_status_active_agent_authority`, `status_active_agent_role`, `identity_confirmation` | Identity normalizers/confirmation builder | Module projection/restart recovery. |
| Module scheduler projection | `getAuthoritativeModuleState` / `projectModuleSchedulerState` | module identity/status/phase, projection source fields, `authority_role`, `scheduler_drift`, legacy path/parse fields | Policy resolver/read-model projection | Scheduler/dependency/truth drift. |
| Module status snapshot authority | `resolveModuleStatusSnapshotAuthority` | role/code, canonical status, legacy status, drift, active-session policy | Session authority policy and drift checks | Status-store `loadStatus` overlay/diagnostics. |
| Gate scheduler projection | `projectGateLegacyEvidenceIntoReadModel` / `projectGateSchedulerState` | gate identity/type/status, wait/completion fields, authority role, source fields, output/gateStatus evidence, `scheduler_drift` | Output contract validation and authority policy | Gate runners/dependency/truth drift. |
| Gate completion state | `projectGateCompletionState` | `done`, `ok`, `outcome`, `source`, `status`, `data`, `output`, `gateStatus`, `gateStatusAuthority`, optional `logMsg` | `validateGateOutputContract`, gate-status policy | Gate polling/runner. |
| Gate output read result | `readGateOutput` | `exists`, `data`, `status`, `isPass`, `parse_error`, `invalid_contract`, `invalid_reason`, `path`, `error` | `validateGateOutputContract` | Gate completion projection. |
| Truth drift report | `projectModuleTruthDrift`, `projectGateTruthDrift` | `entity_kind`, `entity_id`, `drift_detected`, tagged `drift`, `scheduler_projection`, `completion_adjudication`, `artifacts` | Completion adjudicator/projection helpers | Operators/tests. |

## Prompt and agent behavior updates

None found in scoped files.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `findCompatibilityAuthorityKeys` / `stripCompatibilityAuthority` | Cyclic objects | Not error | No retry | WeakMap/seen guards prevent recursion loops | None. |
| `buildActiveSessionAuthorityPolicy` | Missing/weak/mismatched identity | No | No retry | Returns explicit unconfirmed policy code | None. |
| `buildActiveSessionAuthorityPolicy` | Monitor confirmation required but absent | No | No retry | Returns unconfirmed policy requiring monitor | None. |
| `readModuleStatusJson` | Missing status file | Not error | No retry | Returns missing read result | None. |
| `readModuleStatusJson` | Corrupt status JSON/read failure | No local retry | No retry | Returns parse/read error result | Preview not included here. |
| `getAuthoritativeModuleState` | No canonical or acceptable legacy state | Not error | No retry | Returns pending projection | None. |
| `resolveModuleStatusSnapshotAuthority` | Legacy/canonical drift | No | No retry | Returns drift diagnostics and diagnostic/bootstrap role | None. |
| `readGateOutput` | Missing output file | Not error | No retry | Returns missing output result | None. |
| `readGateOutput` | Parse/contract invalid output | No local retry | No retry | Returns parse/invalid contract result | None. |
| `readGateStatusJson` | Missing gate-status file | Not error | No retry | Returns missing status result | None. |
| `readGateStatusJson` | Parse error | No local retry | No retry | Returns parse-error diagnostic | None. |
| `projectGateCompletionState` | Invalid output contract/unknown output status | No | No retry | Terminal invalid output projection | None. |
| `projectGateCompletionState` | Legacy gate-status terminal fail/pass without canonical output | Retry by caller polling | No local sleep | Returns non-terminal candidate/pending outcome | None. |
| `syncApprovalWaitState` | Duplicate/illegal lifecycle append while model already matches | Soft/idempotent | No retry | Swallows only when read model already matches requested state | None. |
| `truth-drift.js` | Missing gate Redis entry | Not error | No retry | Skips completion adjudication | None. |
| `truth-drift.js` | Projection/adjudication dependency throws | No local retry | No retry | Propagates to caller | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| Compatibility authority helpers | Cyclic objects | No | none | none | WeakMap/seen guard | Helper returns findings/clone only. |
| `buildActiveSessionAuthorityPolicy` | Missing/weak/mismatched identity | Yes as data | Returned policy object | `active_session_authority_source`, role/code fields | Policy builder | Caller may log/use in projection. |
| `buildActiveSessionAuthorityPolicy` | Monitor required absent | Yes as data | Returned policy object | `status_active_agent_requires_monitor_confirmation` | Policy builder | No direct log. |
| `readModuleStatusJson` | Missing file | Yes as data | Read result/projection | `exists:false` | Reader/projection | Expected absent evidence. |
| `readModuleStatusJson` | Parse/read error | Yes as data | Read result/projection | `parse_error`, `error`, `path` | Reader/projection | No direct log. |
| `getAuthoritativeModuleState` | Pending/no state | Yes as data | Scheduler projection | `read_model_source:read_model:pending` | Projection helper | No direct log. |
| `resolveModuleStatusSnapshotAuthority` | Drift | Yes as data | Snapshot authority/projection/truth-drift report | `drift`, `authority_role` | Authority resolver | No direct log. |
| `readGateOutput` | Missing output | Yes as data | Output result/projection | `exists:false`, `path` | Reader/projection | Expected absent evidence. |
| `readGateOutput` | Parse/contract invalid | Yes as data | Output result/completion projection | `parse_error` / `invalid_contract` | Reader/projection | Terminal invalid projection includes reason. |
| `readGateStatusJson` | Missing gate-status | Yes as data | Status result/projection | `exists:false`, `path` | Reader/projection | Expected absent diagnostic. |
| `readGateStatusJson` | Parse error | Yes as data | Status result/projection | `parse_error`, `error`, `path` | Reader/projection | No direct log. |
| `projectGateCompletionState` | Invalid output | Yes as data | Completion projection | `outcome:invalid_contract`, status `INVALID_OUTPUT` | Projection helper | Gate runner telemetry downstream. |
| `projectGateCompletionState` | Legacy gate-status terminal without canonical output | Yes as data | Completion projection | `candidate_gate_failure`, `pending_canonical_output` | Projection helper | Caller polling logs/telemetry downstream. |
| `syncApprovalWaitState` | Duplicate/illegal already-matched append | Yes by existing artifact | Lifecycle read model already has target state | existing wait/signal read model | Lifecycle append/read-model | Swallow condition checks read model. |
| `truth-drift.js` | Missing Redis entry | Yes as data | Truth drift report | `completion_adjudication:null` | Truth drift helper | Not an error. |
| `truth-drift.js` | Dependency throws | No local telemetry | none | thrown error | Caller | Caller owns error reporting. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | All P15 JS modules | ESM and sync fs/path | No package pin in scoped files. |
| Node `fs`/`path` built-ins | Runtime built-ins | Node major 24 observed | Module/gate evidence readers | Read status/output files | Read/parse failures become diagnostic result objects. |
| Lifecycle read-model service | Internal source | Internal | Module/gate projections | Canonical scheduler state | Missing canonical state may allow bootstrap/pending paths. |
| Lifecycle appenders | Internal source | Internal | `syncApprovalWaitState` | Project approval state to wait/signal events | Duplicate/illegal already-matched states swallowed. |
| Gate output contract validator | Internal source | Internal | `readGateOutput` | Validate gate output file schema | Invalid contract becomes terminal invalid output projection. |
| Session authority helper | Internal source | Internal | Module projection | Active dispatch/status active-agent confirmation | Status active agent never standalone authority. |
| Completion adjudicator | Internal source | Internal | Truth drift helpers | Redis/completion drift source | Missing gate Redis entry skipped. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Module/gate projection reads | Synchronous per call | No queue/retry | Filesystem/JSON parse errors become diagnostics where caught | Projection result paths/errors | None. |
| Approval wait sync | Synchronous lifecycle append | Lifecycle append idempotency/legality | Already-matched duplicate terminal/pending state swallowed | Lifecycle read model/events | None. |
| Gate completion projection | Caller polling owns loop | No local sleep | Legacy gate-status terminal evidence stays non-terminal until canonical output | Projection outcome/logMsg | None. |
| Truth drift report | Synchronous projection/adjudication | No retry | Dependency errors propagate | Returned drift report or thrown error | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Active-session identity authority | Required `run_id`, `attempt`, `dispatch_id`, `session_key`; optional `gateway_label` | Active dispatch lease/session monitor/status evidence | Module snapshot authority/recovery | No ACP transport here; policy is synchronous | Policy object in projection. |
| Gate/module correlation projection | dispatch/gateway/session fields in legacy/canonical projections | Status/gate output/read models | Scheduler/truth drift/recovery | Synchronous read/projection | Projection objects and truth-drift reports. |
| Completion adjudication drift | Redis entry plus expected identity/statuses | Completion adjudicator via `truth-drift.js` | Operator diagnostics | No local polling | Truth drift report. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Status-store compat facade and module/gate projections | `tests/verification/contracts/check-status-store-slice-surface.mjs` | Strong source/runtime coverage | None. |
| Active-session authority policy | `tests/verification/contracts/check-session-authority-slice-surface.mjs` | Strong identity/monitor/status-active-agent coverage | None. |
| Pipeline runner projection delegation | `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs` | Source-level delegation coverage | None. |
| Gate compatibility authority behavior | `tests/verification/behavior/areas/gates.mjs` | Good behavior coverage | None. |
| Buster completion/read-model behavior | `tests/verification/behavior/areas/foundations.mjs` | Good behavior coverage | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
