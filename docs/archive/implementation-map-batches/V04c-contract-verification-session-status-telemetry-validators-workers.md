# Batch V04c — Contract verification session, status, telemetry, validators, and workers

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/contracts/check-session-authority-slice-surface.mjs
tests/verification/contracts/check-stage-envelope-primitives-surface.mjs
tests/verification/contracts/check-status-store-slice-surface.mjs
tests/verification/contracts/check-telemetry-contract.mjs
tests/verification/contracts/check-validator-control-result-surface.mjs
tests/verification/contracts/check-worker-control-result-surface.mjs
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end before conclusions were written.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/contracts/check-session-authority-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-stage-envelope-primitives-surface.mjs
kubeclaw-main/tests/verification/contracts/check-status-store-slice-surface.mjs
kubeclaw-main/tests/verification/contracts/check-telemetry-contract.mjs
kubeclaw-main/tests/verification/contracts/check-validator-control-result-surface.mjs
kubeclaw-main/tests/verification/contracts/check-worker-control-result-surface.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `tests/verification/contracts/check-session-authority-slice-surface.mjs`

Role: Contract guard for active-session identity authority, status active-agent evidence handling, monitor confirmation requirements, and correlation provenance.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports `session-authority.js`.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 38 }` on success.

Defines: `parseArgs` and source/API assertions for strong identity fields and authority policy states.

Important variables/state: Source text for session authority, correlation, status-store compatibility facade and module projection; active dispatch/status active-agent fixtures.

Calls out to: `hasStrongActiveSessionIdentity`, `buildActiveSessionAuthorityPolicy`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; no runtime config beyond fixture objects.

Paths built/read/written: Reads `services/session-authority.js`, `services/correlation.js`, `services/status-store-compat.js`, and `status-store-compat/module-projection.js`; no writes.

Authority behavior: Strong active-session identity requires `run_id`, `attempt`, `dispatch_id`, and `session_key`. Active dispatch lease is the authority; `status.active_agent` can be confirmed restart evidence or diagnostic evidence but never standalone authority. `status.active_agent.label` stays display-only and cannot become gateway/session authority.

Error/retry/terminal behavior: Missing active dispatch, weak status evidence, mismatched identity, or missing monitor confirmation produce policy codes and failed confirmation in runtime helper assertions; source/API drift fails the script.

Verification coverage: Strong source/API coverage for active-session authority.

Findings: None found.

### `tests/verification/contracts/check-stage-envelope-primitives-surface.mjs`

Role: Contract guard that module/gate/pipeline builder families share stage envelope primitives for refs, plugin invocation, and existing artifact refs.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports stage envelope primitives, module shared, gate runner, and pipeline runner.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 20 }` on success.

Defines: `parseArgs` and source/API assertions.

Important variables/state: Source text for `stage-envelope-primitives.js`, `module-runner-shared.js`, `gate-runner.js`, `pipeline-runner-scheduling.js`, and scheduling snapshots.

Calls out to: `buildStageRefs`, `buildStagePluginInvocation`, `collectExistingArtifactRefs`, and exported runner builder surfaces.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; no runtime config.

Paths built/read/written: Reads runner/source files; no writes.

Authority behavior: Shared primitives own stage ref construction and plugin invocation envelopes; local artifact-ref helper duplicates remain forbidden.

Error/retry/terminal behavior: Source/API drift fails the script.

Verification coverage: Focused source/API guard.

Findings: None found.

### `tests/verification/contracts/check-status-store-slice-surface.mjs`

Role: Contract guard for status-store slice boundaries, lifecycle event/read-model authority, legacy status projection policy, gate status evidence policy, completion adjudication, truth drift, dependency/polling usage, and lifecycle guard behavior.

Imports/dependencies: Quiet runtime console, Node fs/os/path/assert/url, imports status-store, lifecycle, legality, compat, completion adjudicator, truth drift, and polling modules.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 188 }` on success.

Defines: `parseArgs`, source assertions, and a large temp status-store fixture.

Important variables/state: Source text for status-store main/lifecycle/compat/common/gate/module projection, completion adjudicator, truth drift, dependencies, polling, polling-dual, module runner, and Buster phase. Temp config under `/home/node/.openclaw/workspace/status-store-slice-*`, lifecycle events/read models, module status JSON, gate status JSON, Redis completion evidence fixtures.

Calls out to: `appendPipelineLifecycleEvent`, `syncApprovalWaitState`, `saveStatus`, `getAuthoritativeModuleState`, `projectModuleSchedulerState`, `projectModuleLegacyStatusIntoReadModel`, `loadLifecycleReadModels`, `appendModuleLifecycleEvent`, `loadStatus`, `resolveModuleStatusSnapshotAuthority`, `projectModuleTruthDrift`, `projectCompletionState`, `adjudicateCompletionEvidence`, `shouldApplyRedisCompletionToStatus`, `projectGateSchedulerState`, `projectGateTruthDrift`, `projectGateCompletionState`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; fixture config uses `project`, `repo_root`, `_runId`, `_logDir`, `paths.swarm_dir`, `paths.modules_dir`, `_progress`, and `compatibility.legacy_module_status_bootstrap_mode`.

Paths built/read/written: Reads many status/polling/runner sources; writes temp `.swarm`, lifecycle read models/events, module `status.json`, gate status JSON, and module directories.

Authority behavior: Lifecycle read-model is the status authority. Legacy `status.json` is operator snapshot/evidence unless explicit `migration_only` bootstrap is requested. Runtime saves cannot project legacy status into lifecycle read models. Gate status is diagnostic/approval-wait evidence and cannot own completion/scheduler authority without canonical gate output; rate-limit authority requires active dispatch confirmation. Redis completion can update nonterminal local state only when active-dispatch identity confirms it and conflicts fail closed.

Error/retry/terminal behavior: `saveStatus` rejects guarded lifecycle field mutation without transition intent. Unknown legacy projection mode fails closed. Redis/local terminal conflicts are reported as `completion_conflict` and module runner is expected to fail closed with typed `COMPLETION_CONFLICT`. Source/API drift fails the script.

Verification coverage: Very strong source/API/runtime fixture coverage.

Findings: None found.

### `tests/verification/contracts/check-telemetry-contract.mjs`

Role: Canonical telemetry contract guard for event inventory parity, stream identity, schema parity/hotspot authority, Redis sequence semantics, flat envelopes, correlation/joinability fields, Buster/Nova telemetry behavior, failure/rate-limit telemetry, and docs/schema consistency.

Imports/dependencies: Quiet runtime console, Node fs/os/path/assert/url, lifecycle audit lib helpers, fake Redis helpers, materialized runtime trees, Nova/Buster runtime modules.

Exports/public surface: CLI script; supports lifecycle-audit args including source/overlay/contract resolution; prints checked emitter dirs, event inventories, stream key, and shared seqs on success.

Defines: `importFresh`, `buildBuiltInRegistry`, contract/schema/source assertions, fake Redis runtime telemetry scenario, failure/rate-limit scenarios.

Important variables/state: `contractEvents`, `telemetrySchemaEvents`, runtime materializations for sandbox/general, fake Redis stream `pipeline:telemetry:proj:run-1`, shared run stats, built-in registry, telemetry sink plugin fixture, failure/rate-limit temp roots.

Calls out to: `assertTelemetrySchemaHotspotAuthority`, `extractContractEventNames`, `extractTelemetrySchemaEventNames`, `collectEmitEventNames`, `effectiveFiles`, Buster `createTelemetryContext`/`emitEvent`/`closeTelemetry`, Nova telemetry event emitters, sink input/dispatch helpers, failures `handleFail`, status-store lifecycle append/load, module runner `runModule`, rate-limit `handleRateLimit`.

Called by / expected callers: Contract verification wrappers/operators; `tests/verification/contracts/README.md` documents it as canonical contract entrypoint.

Environment variables / CLI inputs / config fields: Lifecycle audit args via `parseArgs`; `--contract` defaults to canonical markdown contract; fixture configs use `project`, `telemetry.enabled`, ignored legacy `telemetry.stream_key`, `gates`, `compatibility.legacy_module_status_bootstrap_mode`, `resume`, `nova_prompt`, `_pluginRegistry`, `_runId`, `run_id`, `_runStats`, paths and module runner overrides.

Paths built/read/written: Reads telemetry contract markdown, `docs/telemetry-event-schema.md`, Nova/Buster/common telemetry sources, all effective emitter JS files, task lifecycle source. Materializes runtime trees and writes temp module `status.json` fixtures.

Authority behavior: `pipeline:telemetry:<project>:<run_id>` is the single canonical live stream; run-scoped `pipeline.jsonl` is durable replay truth; Redis is a capped live/consumer window. Typed runtime context owns join keys; display labels/monitor labels cannot become canonical identities. Contract and telemetry schema inventories must be exact parity. Buster and Nova share stream sequence via Redis, and payloads are flat `v=1` envelopes.

Error/retry/terminal behavior: Schema/contract drift, unknown/stale emitted events, legacy identity fallbacks, stale stream max lengths, or bad telemetry source markers fail fast. Runtime failure scenarios assert module FAIL/BLOCKED, retry exhausted, Buster crash exhaustion, and rate-limit pause/resume telemetry.

Verification coverage: Very strong docs/source/runtime coverage.

Findings: None found.

### `tests/verification/contracts/check-validator-control-result-surface.mjs`

Role: Contract guard for typed validator control results, built-in validator stages, architecture validator validation, module validator helpers, and pre-check lint artifact attempt naming.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports validator control helper, module validators, lint, and scheduling modules.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 72 }` on success.

Defines: `parseArgs`, `buildArchitectureValidatorRegistry`, typed validator fixture assertions, lint fake report fixture, malformed architecture validator scenarios.

Important variables/state: Source text for validator-control-result, module validators, lint, scheduling, registry/builtins, constants. Temp `.tmp-validator-lint-attempt-*` fixture under source root with fake lint report module.

Calls out to: `buildModuleValidatorControlResult`, `validateTypedValidatorControlResult`, `coerceTypedValidatorControlResult`, `runDeliveryLintValidatorStage`, `runPreCheckValidatorStage`, `runFullLintValidatorStage`, `runPreCheck`, `runScheduledValidator`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; fixture configs include `project`, `_runId`, `paths.modules_dir`, `repo_root`, `pre_check.enabled`, `pre_check.lint_report_path`, and validator registry records.

Paths built/read/written: Reads validator/lint/scheduling/registry source. Writes fake lint report script and lint output/trace files in temp fixture; removes temp root in `finally`.

Authority behavior: Typed validator control results own validator decisions. Compatibility-shaped validation outputs and embedded compatibility authority fields are rejected. Built-in validator stage ids remain registered for delivery lint, pre-check, and full lint.

Error/retry/terminal behavior: Execution failure maps to environment block. Malformed architecture validator output fails closed with `contract_invalid` metadata and contract diagnostic. Missing/malformed `fail_count` normalizes to attempt 1 for lint artifact paths.

Verification coverage: Strong source/API/runtime fixture coverage.

Findings: None found.

### `tests/verification/contracts/check-worker-control-result-surface.mjs`

Role: Contract guard for typed worker control results, extracted module worker control-result helpers, orchestration and registry removal of compatibility coercion, module worker default dependencies, and module runner normalization.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/url, imports worker control helper and module workers.

Exports/public surface: CLI script; supports `--source-root`; prints `{ ok: true, checked: 54 }` on success.

Defines: `parseArgs`, source assertions, worker mapper assertions, and a default dependency Forge worker fixture.

Important variables/state: Source text for worker-control-result, orchestration, module-worker-control-results, module-workers, module runner, Buster worker helper, Forge helper, module-runner shared, and registry.

Calls out to: `mapWorkerBackendResultToControl`, `coerceTypedWorkerControlResult`, `project*WorkerCompatibilityResult`, `runModuleForgeWorker`.

Called by / expected callers: Contract verification wrappers/operators.

Environment variables / CLI inputs / config fields: `--source-root`; Forge worker fixture config uses `project`, `_runId`, worker input fields, and dependency overrides.

Paths built/read/written: Reads worker/orchestration/runner/registry sources; no persistent writes.

Authority behavior: Worker backends return typed worker control results directly. Compatibility-shaped backend results cannot be coerced at the worker boundary. Orchestration delegates control-result building/mapping/coercion to extracted helpers and no longer embeds compatibility payloads or opt-in coercion paths. Module runner projects terminal module results through canonical step results.

Error/retry/terminal behavior: Forge timeout maps to retryable environment work; Forge no-change and Buster code pretest failures map to request_fix; Buster infra pretest maps to retry. Compatibility-shaped backend result coercion throws.

Verification coverage: Strong source/API/runtime fixture coverage.

Findings: None found.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `check-session-authority-slice-surface.mjs` | `session-authority.js`, correlation/status compat | active-session authority APIs/source markers | Verifies active dispatch lease authority and status evidence limits. |
| `check-stage-envelope-primitives-surface.mjs` | stage envelope primitives and runner builders | `buildStageRefs`, `buildStagePluginInvocation`, `collectExistingArtifactRefs` | Verifies shared envelope construction. |
| `check-status-store-slice-surface.mjs` | status-store/lifecycle/compat/polling/completion/truth drift | lifecycle, projection, adjudication APIs | Verifies lifecycle read-model authority and completion/gate policies. |
| `check-telemetry-contract.mjs` | telemetry docs/schema/runtime emitters | contract inventory, telemetry emitters, fake Redis | Verifies canonical telemetry contract end to end. |
| `check-validator-control-result-surface.mjs` | validator control/module validators/lint/scheduling | validator builders/normalizers/runners | Verifies typed validator contract and fail-closed diagnostics. |
| `check-worker-control-result-surface.mjs` | worker control/orchestration/module workers/runners | worker builders/mappers/normalizers | Verifies typed worker contract and compatibility rejection. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `session-authority` policy fixture | active dispatch/status/monitor identity present, missing, weak, mismatched, or unconfirmed | `run_id`, `attempt`, `dispatch_id`, `session_key`, optional `gateway_label`, monitor evidence | confirmed, incomplete, mismatch, or requires monitor confirmation policy | Defines active-session authority boundaries. |
| `stage-envelope-primitives` fixture | ref spec has empty parts or raw string | ref specs | omit empty ref, preserve raw ref, build prefixed refs | Centralizes plugin invocation refs. |
| `status-store` legacy policy | bootstrap mode and purpose | compatibility mode/purpose | disabled, migration allowed, or fail-closed unknown | Keeps status.json evidence from becoming runtime authority. |
| `status-store` gate policy | gate status PASS/FAIL/RATE_LIMITED/APPROVED with or without canonical output/active dispatch | gate type, gate status, active dispatch | diagnostic evidence, approval wait sync, rate-limit candidate/confirmed | Prevents legacy gate status from owning scheduler/completion. |
| `completion-adjudicator` | Redis terminal evidence identity/match/conflict | expected identity, Redis entry, local status, `preferRedis` | candidate, confirmed authority, conflict, or no apply | Controls Redis completion authority. |
| `telemetry contract` | event/schema/source/stream drift | contract events, schema events, emitted events, runtime stream keys | assertion failure or canonical shared stream | Keeps telemetry event inventory and join keys canonical. |
| `validator-control` | pass/fail/execution failure/malformed plugin result | validator result facts | pass, request_fix, block, or contract-invalid block | Typed validator decisions. |
| `worker-control` | worker backend reason/failure class | Forge/Buster backend facts | retry, request_fix, pass/block mapping | Typed worker decisions. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `status-store` fixture | lifecycle events/read models and status JSON | lifecycle events plus stale status JSON | lifecycle read-model overlays stale status JSON; legacy retained as evidence | `status_authority_source: lifecycle_read_model`. |
| `status-store` migration bootstrap | lifecycle read models | legacy `status.json` and explicit migration purpose | migration-only bootstrap may seed read model but not active sessions | No runtime projection authority. |
| `telemetry contract` fake Redis | shared telemetry stream | Buster then Nova events | canonical run stream with monotonic Redis seq and flat envelopes | One stream, no legacy custom stream. |
| `validator-control` lint fixture | lint output/trace paths | missing `fail_count` | normalize to attempt 1 | No `NaN` artifact names. |
| `worker-control` Forge fixture | in-memory worker result | default dependency path and fake deps | typed worker control result returned | No injected `getTrackedAgent` required. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `check-telemetry-contract.mjs` emitter scan | effective source files under `skills/buster` and `skills/nova/pipeline` | none | none | all emitted event names are checked against contract. |
| `check-status-store-slice-surface.mjs` source/API assertions | fixed assertion sequence | none | none | first assertion failure exits. |
| V04c scripts generally | no live polling loops in scoped contract files | None found in scoped files | None found in scoped files | assertion pass/fail. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `--source-root` | CLI flag | V04c contract scripts except telemetry helper uses lifecycle audit args | cwd | Resolves source tree under test. |
| `--contract` | CLI flag | `check-telemetry-contract.mjs` through lifecycle audit helpers | canonical telemetry markdown | Selects telemetry contract document. |
| `--overlay-root` | CLI flag | `check-telemetry-contract.mjs` through lifecycle audit helpers | none | Optional overlay source root. |
| Status-store fixture config | Runtime fixture | `check-status-store-slice-surface.mjs` | temp dirs | `project`, `repo_root`, `_runId`, `_logDir`, `paths.*`, `_progress`, `compatibility.*`. |
| Telemetry fixture config | Runtime fixture | `check-telemetry-contract.mjs` | materialized runtime/fake Redis | `telemetry.enabled`, ignored `telemetry.stream_key`, `_runStats`, `_pluginRegistry`, run ids, paths, module runner overrides. |
| Validator/worker fixture config | Runtime fixture | validator/worker contracts | temp dirs/in-memory | Validator registry, lint paths, worker input/deps. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `services/session-authority.js` | repo source | session authority contract | source | Active dispatch lease authority helper. |
| `runners/stage-envelope-primitives.js` | repo source | stage envelope contract | source | Shared stage ref/invocation helper. |
| `.swarm/logs/.../lifecycle/read-models.json` | status-store lifecycle | status-store contract/runtime | status-store lifecycle fixture | Lifecycle status authority. |
| `modules/<id>/status.json` | status-store fixtures/runtime | status-store/projections | status-store fixture | Legacy evidence/operator snapshot unless lifecycle overlays. |
| gate status JSON | status-store fixture/runtime | gate projections | fixture | Diagnostic/approval-wait evidence; not terminal authority alone. |
| `pipeline:telemetry:<project>:<run_id>` | telemetry runtime | telemetry contract/fake Redis consumers | Nova/Buster emitters | Single canonical live stream. |
| `docs/telemetry-event-schema.md` | docs | telemetry contract | docs | Event-by-event payload reference. |
| `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` | docs | telemetry contract | docs | Canonical event inventory and stream identity. |
| lint attempt artifacts | `runPreCheck` fixture | validator contract | fake lint/report path | Attempt number normalizes missing fail count to 1. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Active session identity | active dispatch lease | session authority/correlation/status compat | None. |
| Stage envelope refs/invocations | `stage-envelope-primitives.js` | module/gate/pipeline builders | None. |
| Module/gate lifecycle status | lifecycle event/read-model store | status-store compat, scheduler, truth drift | None. |
| Legacy `status.json` | runtime/operator snapshot writers | status-store projections | Not authority except explicit migration bootstrap evidence. |
| Redis completion evidence | completion adjudicator with active dispatch confirmation | polling/pollDual/module runner | Existing P17 schema-owner issue remains applicable. |
| Telemetry event inventory/stream identity | telemetry contract markdown and schema docs | Nova/Buster/common telemetry runtimes | Existing P16 runtime schema-owner issue remains applicable. |
| Validator control result | `validator-control-result.js` | module validators/scheduling | None. |
| Worker control result | `worker-control-result.js` and module worker helper | orchestration/module runner | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Active-session authority policy | `session-authority.js` | `code`, `confirmed`, `identity_confirmed`, `monitor_confirmed`, source/role fields, missing/mismatched fields | `buildActiveSessionAuthorityPolicy` | recovery/correlation/status compat. |
| Stage refs/invocation | `stage-envelope-primitives.js` | refs object from `{prefix, parts}` or raw string; invocation `{stageId, ...ids}` | helper constructors | plugin stage owners. |
| Lifecycle/read-model status | status-store lifecycle | module/gate read models, active sessions, cooldowns, wait states, provenance fields | lifecycle legality/projection helpers | scheduler/operators. |
| Completion adjudication result | completion adjudicator | `authority_source`, `authority_policy`, `candidate_completion`, `completion_conflict`, drift entries | `adjudicateCompletionEvidence`, `shouldApplyRedisCompletionToStatus` | polling/module runner. |
| Telemetry event envelope | Nova/Buster telemetry | flat `v=1`, `type`, `project`, `run_id`, `seq`, source/emitter, correlation fields, event-specific fields | contract/schema checks and runtime builders | Redis/live consumers, JSONL audit. |
| Validator control result | validator helper | `schemaVersion:'v1'`, `producerKind:'validator'`, `producerType`, `nextAction`, `issueType`, diagnostics typed validator metadata | validator normalizers/validators | module validators/scheduler. |
| Worker control result | worker helper | typed worker producer, next action, issue/outcome class, diagnostics; no compatibility authority fields | worker normalizers/validators | orchestration/module runner. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Module workers | module worker backend helpers | runtime worker artifacts not directly inspected | Prompt content not inspected in scoped files | worker runtime deps/stage owners | Typed worker control result. |
| Validators | module validators/scheduled validator registry | lint reports/traces for pre-check | Prompt content not inspected in scoped files | validator stage owners | Typed validator control result; malformed outputs fail closed. |
| Telemetry sinks | telemetry sink dispatch fixture | Redis stream / JSONL runtime surfaces | No prompt content | telemetry sink plugin API | Sink input with `stateSnapshot` and event metadata. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `session-authority` fixture | weak/missing/mismatched active-session identity | No | none | policy unconfirmed/incomplete/mismatch; script asserts | none. |
| `status-store` lifecycle guard | guarded status mutation without lifecycle intent | No | none | throws `STATUS_LIFECYCLE_GUARD_VIOLATION` | none. |
| `status-store` legacy projection | unknown legacy projection mode | No | none | fail closed with projection disabled | none. |
| `completion-adjudicator` | unconfirmed Redis terminal or Redis/local conflict | No | none | candidate only or conflict/fail closed | none. |
| `telemetry contract` | event/schema/source/stream drift | No | none | terminal assertion failure | telemetry runtime redaction not directly exercised. |
| `failures`/module runner telemetry fixtures | module failure, blocked, Buster timeout/crash exhaustion | No in fixture | max fails/crash retries from config | FAIL/BLOCKED and retry.exhausted telemetry | runtime redaction helpers not directly inspected. |
| `rate-limit` telemetry fixture | provider cooldown/rate limit | Yes | cooldown_hours 0 in fixture | RATE_LIMITED then TESTING status telemetry | runtime redaction not directly inspected. |
| `validator-control` | malformed validator output | No | none | fail-closed block with contract diagnostic | raw preview bounded by diagnostic helper. |
| `worker-control` | compatibility-shaped backend result | No | none | throws boundary rejection | none. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `session-authority` fixture | identity policy rejection | Yes/partial | returned policy object/assertion output | policy `code` values | session authority helper | Contract diagnostics only. |
| `status-store` lifecycle guard | illegal guarded status mutation | Yes/partial | thrown error | `STATUS_LIFECYCLE_GUARD_VIOLATION` | status-store save guard | No Redis telemetry expected. |
| `completion-adjudicator` | unconfirmed/conflicting Redis completion | Yes/partial | adjudication result/drift entries | `redis_terminal_requires_active_dispatch`, `redis_terminal_conflicts_with_terminal_status` | completion adjudicator | Module runner expected to surface typed conflict. |
| `telemetry contract` | event/schema/source drift | Yes/partial | assertion stderr/stdout | assertion error / success inventory JSON | contract script | Adequate for contract verification. |
| `failures`/module runner fixtures | FAIL/BLOCKED/crash exhaustion | Yes | fake Redis stream | `module.status_changed`, `retry.exhausted`, `phase.started` | failures/module runner telemetry | Exact seq and fields asserted. |
| `rate-limit` fixture | cooldown pause/resume | Yes | fake Redis stream | `rate_limit.detected`, `module.status_changed` RATE_LIMITED/TESTING | rate-limit service | Cooldown zero in fixture. |
| `validator-control` malformed output | contract invalid validator | Yes/partial | typed control diagnostics | `contract_invalid`, `plugin_contract_invalid` diagnostic | validator/scheduling helpers | No Redis telemetry expected in contract script. |
| `worker-control` compatibility-shaped backend | boundary rejection | Yes/partial | thrown error assertion | compatibility-shaped backend rejection | worker control helper | No Redis telemetry expected in contract script. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V04c scripts | ESM, assert, filesystem, dynamic imports | Required. |
| Quiet runtime console helper | local verification helper | repo source | all V04c scripts | suppress noisy logs | Restored before JSON output. |
| Lifecycle audit lib | local verification helper | repo source | telemetry contract | contract parsing, runtime materialization, event extraction | Source/overlay aware. |
| Fake Redis helper | local verification helper | repo source | telemetry contract | Redis stream/counter assertions | No live Redis. |
| `pathToFileURL` dynamic import | Node URL API | Node runtime | most V04c scripts | import production ESM helper APIs | Contract-local only. |
| Temp filesystem | Node fs/os/path | Node runtime | status-store, telemetry, validator fixtures | status/lint/runtime fixtures | Isolated temp roots. |
| Production source modules | repo source | local tree | all V04c scripts | source/API validation | Drift fails fast. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Telemetry Redis live stream | capped live window | shared `TELEMETRY_STREAM_MAXLEN = 10000` | Redis is live window, JSONL is durable truth | contract/source/runtime assertions | Existing P16 schema-owner gap. |
| Telemetry sequencing | Redis per-stream sequence | fake Redis counter | monotonic shared Nova/Buster seq | asserted seqs on `pipeline:telemetry:proj:run-1` | None. |
| Rate-limit fixture | cooldown hours | `cooldown_hours: 0` | immediate RATE_LIMITED then TESTING resume | fake Redis status events | None. |
| Contract scripts | sequential assertions | Node process | first assertion failure exits | stderr/stdout JSON | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Active session authority | active dispatch lease identity with run/attempt/dispatch/session and optional gateway label | lifecycle/orchestration | session authority/status compat/correlation | monitor confirmation optional | policy fixture assertions. |
| Telemetry join keys | typed runtime context fields `session_key`, `module_id`, `gate_id`, `dispatch_id`, `gateway_label` | Nova/Buster telemetry | Redis/JSONL/Discord/replay consumers | Redis seq/capped stream | contract/schema/runtime assertions. |
| Agent/session lifecycle telemetry | `agent.spawned`, `agent.killed`, transcript/progress/observability events | Nova/Buster runtime | telemetry consumers | flushed through fake Redis | telemetry contract assertions. |
| Worker/validator stage envelopes | stage refs and plugin invocation envelopes | stage-envelope primitives/module/gate/pipeline builders | stage-owner registry | no ACP calls in scoped scripts | source/API assertions. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Active-session authority | `check-session-authority-slice-surface.mjs` | High source/API coverage | None found. |
| Stage envelope primitives | `check-stage-envelope-primitives-surface.mjs` | Medium source/API coverage | None found. |
| Status-store lifecycle/read-model authority | `check-status-store-slice-surface.mjs` | Very high source/API/runtime fixture coverage | None found. |
| Telemetry contract/schema/runtime parity | `check-telemetry-contract.mjs` | Very high docs/source/runtime coverage | Existing P16 remains applicable. |
| Validator typed control results | `check-validator-control-result-surface.mjs` | High source/API/runtime fixture coverage | None found. |
| Worker typed control results | `check-worker-control-result-surface.mjs` | High source/API/runtime fixture coverage | None found. |

Validation evidence:

```text
node --check tests/verification/contracts/check-session-authority-slice-surface.mjs
node --check tests/verification/contracts/check-stage-envelope-primitives-surface.mjs
node --check tests/verification/contracts/check-status-store-slice-surface.mjs
node --check tests/verification/contracts/check-telemetry-contract.mjs
node --check tests/verification/contracts/check-validator-control-result-surface.mjs
node --check tests/verification/contracts/check-worker-control-result-surface.mjs
node tests/verification/contracts/check-session-authority-slice-surface.mjs --source-root "$PWD" # {"ok":true,"checked":38}
node tests/verification/contracts/check-stage-envelope-primitives-surface.mjs --source-root "$PWD" # {"ok":true,"checked":20}
node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD" # {"ok":true,"checked":188}
node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD" # produced matching contract/schema event inventories and sharedStreamKey pipeline:telemetry:proj:run-1
node tests/verification/contracts/check-validator-control-result-surface.mjs --source-root "$PWD" # {"ok":true,"checked":72}
node tests/verification/contracts/check-worker-control-result-surface.mjs --source-root "$PWD" # {"ok":true,"checked":54}
git diff --check
```

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
