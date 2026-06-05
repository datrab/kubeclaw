# Pipeline Simplification Changelog

Date: 2026-05-29

Source plan: `docs/reviews/2026-05-29-pipeline-simplification-execution-checklist.md`

## Baseline

- Added the execution checklist that converts the simplification review into phased implementation work.
- Recorded resolved decisions:
  - plugin config should be strict everywhere;
  - compatibility/status projection helpers should be categorized before deletion;
  - worker/gate aliases should be removed after producer audit;
  - pipeline result fallback removal starts with static/test inventory;
  - production runtime defaults must come from explicit validated config;
  - `buster_capabilities`, weak-evidence guards, and `status_json_path` handling are audit/delete-if-obsolete surfaces.

## Phase A1 - Delete Module Runner Buster Re-Export

- Deleted `skills/nova/pipeline/runners/module-runner-buster.ts`.
- Updated `check-operator-alert-surface.mjs` to inspect the canonical Buster phase files directly.
- Updated the canonical Buster phase file header to refer to its actual extracted path.
- Marked the Phase A1 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-operator-alert-surface.mjs --source-root .`

## Phase A2 - Remove Stale JS Buster Suite Artifact References

- Updated module Buster artifact refs from the old Buster suite JS path shape to canonical TypeScript suite sources under `skills/buster/pipeline/suites/<suite>.ts`.
- Changed the artifact format from `js` to `ts`.
- Marked the Phase A2 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-module-runner-slice-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas module-failures`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas module-failures`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas module-failures`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas migrated-seams`
  - `rg` check for old Buster suite JS path patterns and `format: 'js'` in `skills`/`tests`

## Phase A3 - Remove Dead Buster Suite Dependency Fallback

- Removed the `DEPENDENCIES[suiteName] || ['build', 'health']` fallback.
- Added an explicit `missing_suite_dependencies` validation error if a registered suite lacks dependency policy.
- Tightened the Buster pipeline surface check to reject the deleted fallback and require the loud dependency-policy error.
- Marked the Phase A3 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .`

## Phase A4 - Delete Unused Approval Timeout Constant

- Removed the unused `DEFAULT_TIMEOUT_MINUTES` export from `approval-gate-shared.ts`.
- Removed the unused import from `approval-gate-runner.ts`.
- Kept approval timeout resolution on the existing gate/config path: `gate.timeout_minutes ?? config.default_timeout_minutes`.
- Marked the Phase A4 checklist item as done.
- Verification:
  - `rg -n "DEFAULT_TIMEOUT_MINUTES" skills/nova/pipeline/runners tests/verification`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas approvals`

## Phase A5 - Clean Stale JS And Compatibility Docs

- Updated B7-F01 docs to point at canonical TypeScript module runner and Buster phase paths.
- Removed documentation that described the deleted Buster phase compatibility re-export as an active surface.
- Updated Buster suite artifact documentation from the old Buster suite JS path shape to `skills/buster/pipeline/suites/<suite>.ts`.
- Cleaned additional migration/open-issue docs that still referenced the deleted Buster phase facade.
- Marked the Phase A5 checklist item as done.
- Verification:
  - `rg` check for the deleted Buster facade path and old Buster suite JS path patterns in `docs`/`skills`/`tests`
  - Remaining matches are limited to review/checklist/changelog history for this cleanup.

## Phase B1 - Add Temporary Stale JS Suite Reference Check

- Added `check-pipeline-simplification-migration-surface.mjs` as a temporary migration ratchet.
- The check rejects stale Buster suite artifact refs that report `format: 'js'`, point at the old `skills/buster/suites` directory, or synthesize `${suiteName}.js`.
- Registered the check in the deterministic contract suite and wrapper surface verification.
- Marked the Phase B1 checklist item as done.
- Exit plan: delete this narrow check, or fold it into a broader durable policy check, once the simplification pass is complete.
- Verification:
  - `node tests/verification/contracts/check-pipeline-simplification-migration-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-verification-wrapper-surface.mjs --source-root .`

## Phase B2 - Add Temporary Deleted Compatibility Path Check

- Extended the temporary migration ratchet to assert the deleted Buster phase facade file does not exist.
- Added a scan over active `skills`, `tests`, and non-review `docs` files to reject references to the deleted facade path.
- Marked the Phase B2 checklist item as done.
- Exit plan: delete this narrow check, or fold it into a broader durable policy check, once the simplification pass is complete.
- Verification:
  - `node tests/verification/contracts/check-pipeline-simplification-migration-surface.mjs --source-root .`

## Phase B3 - Replace Fallback-Blessing Tests

- Updated rate-limit summary tests to assert canonical status/tracked correlation wins instead of blessing bare gateway-label fallback behavior.
- Updated module worker tests to pass typed `ids` and `executionContext` worker input instead of legacy top-level module identity fields.
- Updated pipeline-step result tests to provide explicit typed `outcomeClass` for HALT/error classification instead of relying on action-default inference.
- Marked the Phase B3 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-rate-limit-slice-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-worker-control-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root .`

## Phase B4 - Add Hidden Fallback Literal Checks

- Extended the temporary migration ratchet to reject the deleted Buster suite dependency fallback literal.
- Extended the same check to reject reintroduction of the removed approval `DEFAULT_TIMEOUT_MINUTES` surface.
- Kept the checks scoped to Phase A removals so future-phase defaults do not fail before their migration work lands.
- Marked the Phase B4 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-pipeline-simplification-migration-surface.mjs --source-root .`

## Full Verification Fix - Remove Forbidden JS Path Strings From Review Docs

- Reworded review/changelog references to old Buster suite JS path patterns so active docs do not retain forbidden skill-path strings.
- Preserved the review intent while avoiding literal deleted JS path references that fail the final reference surface check.
- Verification:
  - `node tests/verification/contracts/check-phase10-final-reference-surface.mjs --source-root .`

## Phase C1 - Inventory Pipeline Step Result Producers

- Added `docs/reviews/2026-05-29-pipeline-step-result-producer-inventory.md`.
- Documented direct `PipelineStepResult` producers, remaining compatibility fallback sources, producer readiness, and the recommended order for the rest of Phase C.
- Marked the Phase C1 checklist item as done.
- Verification:
  - Static inventory with `rg` over step result builders and typed outcome fields.
  - Documentation-only change; no runtime tests required.

## Phase C2 - Require Explicit Direct Step Outcomes

- Removed the direct `buildPipelineStepResult` action-to-outcome default.
- Direct step result producers must now pass a canonical outcome that validates against `nextAction`.
- Added a contract assertion that missing direct-builder outcomes are rejected instead of being synthesized from `nextAction`.
- Marked the Phase C2 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-gate-control-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-worker-control-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-module-runner-slice-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas pipeline`

## Phase C3 - Return Typed Module Attempt Results

- Moved module terminal envelope projection from the public `module-runner.ts` facade into `executeModuleAttempt`.
- The public module runner now receives and returns canonical `PipelineStepResult` objects for completed module attempts.
- Kept retry results unchanged so retry scheduling still sees retry counters and session identity.
- Added module-runner surface assertions that the facade no longer calls `buildModuleStepResult`.
- Marked the Phase C3 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-module-runner-slice-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas module-failures`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas migrated-seams`

## Phase C4 - Delete Module Step Compatibility Reconstruction

- Deleted exported `buildModuleStepResult` from `module-runner-shared.ts`.
- Moved the remaining module terminal step construction into the attempt boundary as private explicit module-terminal projection.
- Removed module-runner contract checks that required the deleted exported helper and replaced them with deletion checks.
- Marked the Phase C4 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-module-runner-slice-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas module-failures`

## Phase C5 - Remove Step Outcome Inference Fallbacks

- Deleted action-default outcome synthesis from `pipeline-step-result.ts`.
- Removed projection inference from control-result top-level outcome fields, diagnostics metadata, and `issueType`.
- Added explicit validator `outcomeClass` production for module and architecture validator control results.
- Updated pipeline-step result contract tests to require typed outcome data for retry/request-fix/block projections.
- Marked the Phase C5 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-gate-control-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-worker-control-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-module-runner-slice-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas pipeline`

## Phase C6 - Tighten Worker And Gate Outcome Classes

- Removed non-canonical pipeline step outcome aliases from `pipeline-step-result.ts`.
- Required worker and gate typed controls to provide canonical `outcomeClass` values directly.
- Updated module worker producers to keep failure details in metadata while emitting canonical lifecycle outcomes.
- Updated Buster, review, approval, and remediation gate producers to emit canonical lifecycle outcomes instead of failure/status aliases.
- Marked the Phase C6 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-worker-control-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-gate-control-result-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas gates`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas approvals`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas module-failures`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas pipeline`

## Phase D1 - Make Plugin Config Normalization Strict

- Removed permissive plugin registry defaults for missing or invalid `config.plugins`.
- Required direct registry callers to provide explicit plugin policy fields: `enabled`, `allowCustomModules`, `extraModulePaths`, `modules`, `stageOwners`, and `restrictedCapabilityAllowlist`.
- Updated verification fixtures that build registries directly to pass explicit plugin config.
- Added behavior assertions that missing or empty plugin config is rejected.
- Marked the Phase D1 checklist item as done.
- Verification:
  - `node tests/verification/behavior/verify.mjs --source-root . --areas foundations`

## Phase D2 - Require Manifest Default Enabled Policy

- Made `manifest.defaultEnabled` mandatory for plugin manifests.
- Removed the registry fallback that enabled plugins when `defaultEnabled` was omitted.
- Updated custom registry test fixtures to declare explicit enablement policy.
- Marked the Phase D2 checklist item as done.
- Verification:
  - `node tests/verification/behavior/verify.mjs --source-root . --areas foundations`

## Phase D3 - Replace ACP Monitor Numeric Defaults

- Removed hidden `?? 10` poll threshold fallbacks from the ACP monitor state builder.
- Required monitor threshold decisions to come from validated `acp_monitor` platform config.
- Added a runtime-monitor behavior guard that fails if the hidden numeric defaults return.
- Marked the Phase D3 checklist item as done.
- Verification:
  - `node tests/verification/behavior/verify.mjs --source-root . --areas runtime-monitor`

## Phase D4 - Make Gateway Policy Explicit

- Removed implicit localhost Gateway URL resolution from production Gateway helpers.
- Removed implicit empty-token resolution; callers must now provide `gatewayToken`, `OPENCLAW_GATEWAY_TOKEN`, or `GATEWAY_TOKEN`, with explicit `gatewayToken: ''` for no-auth local fixtures.
- Added named local-development Gateway URL and named Gateway invoke policies for timeout/retry/delay values.
- Updated ACP monitor, Buster session monitor, and verification fixtures to carry explicit Gateway URL/token policy at the boundary.
- Marked the Phase D4 checklist item as done.
- Verification:
  - `node tests/verification/behavior/verify.mjs --source-root . --areas runtime-surface,runtime-monitor,agent-lifecycle,transcript-monitor,foundations`

## Phase D5 - Require Canonical Rate-Limit Status

- Removed the `statusFallback` reconstruction path from rate-limit exhaustion finalizers.
- Required exhaustion result producers to provide canonical `rate_limit_status` explicitly.
- Removed `result.status` fallback from rate-limit exhausted status, max-pause, and run-id resolution.
- Updated contract fixtures to assert that `result.status` alone is rejected for rate-limit exhaustion.
- Marked the Phase D5 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-rate-limit-slice-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas polling,gates,module-failures,summaries,fix-cycles,foundations`

## Phase D6 - Scope Session Termination Timing Policy

- Replaced raw termination grace/max constants with `SESSION_TERMINATION_POLICY_DEFAULTS`.
- Added `resolveSessionTerminationPolicy` so grace, poll, request, cleanup, and ACP cleanup timing all flow through one named policy helper.
- Updated Buster session monitor to consume the named termination policy instead of importing raw default constants.
- Preserved no-session-key idempotence and active-session file preservation for unconfirmed termination.
- Marked the Phase D6 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-acp-gateway-contract-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas agent-lifecycle,foundations,runtime-monitor`

## Phase E1 - Consolidate Scheduled Gate Invocation

- Added `scheduled-gate-invocation.ts` as the single authority for scheduled gate plugin execution.
- Moved stage handler lookup, plugin context creation, invocation envelope construction, and log-directory setup out of the standard, waitable, and remediable gate paths.
- Required scheduled gate invocations to carry explicit `stageId`, `gateId`, `gateType`, `runId`, and positive `attempt` identity before executing plugin code.
- Removed the `gate:${gate?.type || 'unknown'}` stage fallback from gate run input and plugin invocation construction.
- Updated waitable and remediable gate engines to consume the shared execution helper instead of keeping private context/envelope code.
- Added contract assertions that scheduled gate execution stays centralized and explicit.
- Marked the Phase E1 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-gate-control-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-gate-active-session-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-stage-envelope-primitives-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-remediation-handoff-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas gates,approvals,fix-cycles`

## Phase E2 - Collapse Approval Timeout Policy Authority

- Made approval `on_timeout` mandatory during config validation instead of allowing an implicit block policy.
- Changed approval timeout normalization to reject missing or invalid policy values instead of returning a default.
- Added explicit helpers for creation-time gate policy and persisted-state policy authority.
- Updated approval control results to read timeout policy only from persisted approval state or lifecycle state snapshots, not from result payloads, gate-status metadata, gate config, or hidden defaults.
- Updated approval wait results, signal events, and lifecycle projection to preserve missing policy as invalid/missing instead of projecting `BLOCK`.
- Updated approval behavior fixtures to declare explicit timeout policies and added a validation guard for missing approval `on_timeout`.
- Marked the Phase E2 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-gate-control-result-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-pipeline-simplification-migration-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas approvals`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas foundations`

## Phase E3 - Require Typed Gate Failure Classes

- Removed Buster gate failure-class inference from exit codes, status payloads, and reason text.
- Added explicit registered Buster gate failure classes, including an auditable `unknown_failure` class for producers that truly cannot classify.
- Required every non-pass Buster gate control result to provide `failure_class`; pass results remain classless.
- Added explicit registered Review gate failure classes and required every non-pass Review gate control result to provide `failure_class`.
- Updated Review and Buster failure producers to emit typed classes at the producer boundary for setup, invalid contract, rate limit, runtime failure, timeout, remediation exhaustion, and verdict failure paths.
- Added contract assertions that missing failure classes are rejected and the old text-inference helper cannot return.
- Marked the Phase E3 checklist item as done.
- Verification:
  - `node tests/verification/contracts/check-gate-control-result-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas gates`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas fix-cycles`

## Phase F1 - Pass Structured Discord Correlation

- Stopped Discord audit correlation from parsing rendered field names and values.
- Added non-rendered `correlation_key` metadata to canonical Discord identity fields produced by the shared identity-field builder.
- Added explicit `opts.correlation` / `opts.correlations` support to Discord audit mirroring so manually assembled embeds can pass correlation as data.
- Kept Discord webhook payloads and rendered field text unchanged; the extra correlation metadata is non-enumerable and is not sent as an embed field.
- Updated Discord correlation behavior coverage to prove rendered-only `Run ID`, `Dispatch`, `Gateway Label`, and `Session` fields are not treated as audit authority.
- Net LOC delta at commit time: +69.
- Marked the Phase F1 checklist item as done.
- Verification:
  - `node tests/verification/behavior/verify.mjs --source-root . --areas discord-correlation`
  - `node tests/verification/contracts/check-operator-alert-surface.mjs --source-root .`

## Phase F2 - Remove Pipeline Halt Step-ID Inference

- Removed `pipeline.halted` telemetry inference that classified halted steps by `gate:` string prefixes or `config.gates` lookups.
- Kept explicit typed context support: `step_type: 'module'` maps `step_id` to `module_id`, and `step_type: 'gate'` maps `step_id` to `gate_id`.
- Updated telemetry contract coverage so the direct builder fixture provides typed `step_type` and rejects reintroduction of step-id/config-gate inference.
- Marked the Phase F2 checklist item as done.
- Net LOC delta at commit time: 0.
- Verification:
  - `node tests/verification/contracts/check-telemetry-contract.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas telemetry,telemetry-schema,pipeline`

## Phase F4 - Tighten Buster Telemetry Identity

- Updated Buster task lifecycle plugin telemetry so gate-owned tasks emit `gate_id`/`gate_type` with `module_id: null`, while module-owned tasks keep `module_id`.
- Updated Buster suite start/completion telemetry to follow the same module-vs-gate identity split from typed telemetry context.
- Routed Redis-dispatched task Discord alerts through structured correlation instead of relying on rendered field parsing, including Nova dispatch alerts and Buster webhook/audit delivery.
- Preserved degraded/fallback observability by keeping Buster Discord webhook and audit-log degradation events correlated with run, gate, attempt, dispatch, and session identity.
- Added contract guards for Buster task/suite telemetry identity and updated behavior coverage for explicit Discord correlation after rendered-field parsing removal.
- Marked the Phase F4 checklist item as done.
- Net LOC delta at commit time: +136.
- Verification:
  - `node tests/verification/contracts/check-telemetry-contract.mjs --source-root .`
  - `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas operator-surface`
  - `OPENCLAW_GATEWAY_URL=http://127.0.0.1:9 node tests/verification/behavior/verify.mjs --source-root . --areas telemetry,buster-runtime-normalization,operator-surface`

## Phase G1 - Structure Buster Runtime Loop Diagnostics

- Replaced the Buster task-poll loop's raw `setTimeout` sleep with shared abortable `sleep` from the Buster timing facade.
- Added named `BUSTER_RUNTIME_LOOP_POLICY` backoff configuration for loop-error recovery.
- Added structured process diagnostics for task-poll loop failures using `reportBusterRuntimeDiagnostic` with component `buster_runtime_loop`, surface `task_poll_loop`, and reason `task_poll_loop_failed`.
- Wired shutdown to abort a pending loop backoff so process termination is not delayed by the retry sleep.
- Added contract guards that reject the old raw sleep and require the named policy plus typed diagnostics.
- Marked the Phase G1 checklist item as done.
- Net LOC delta at commit time: +35.
- Verification:
  - `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .`
  - `node tests/verification/runtime/check-buster-startup-smoke.mjs --source-root .`
  - `node tests/verification/contracts/check-common-helper-import-surface.mjs --source-root .`
  - `OPENCLAW_GATEWAY_URL=http://127.0.0.1:9 node tests/verification/behavior/verify.mjs --source-root . --areas buster-runtime-normalization`

## Phase G2 - Remove Buster Suite Timeout And Identity Defaults

- Removed the suite runner's hidden five-minute timeout fallback; `test_config.suite_timeout_ms` is now required at the suite-runner boundary.
- Moved the local default timeout policy to Nova's Buster payload producer as named `BUSTER_SUITE_RUNNER_DEFAULT_POLICY`, while preserving owner/config overrides.
- Required explicit suite `moduleId` and `payload.project` identity before suite execution instead of defaulting missing values to `unknown`.
- Kept suite timeout validation strict for invalid numeric values and added a missing-timeout validation path.
- Updated direct behavior/live fixtures to carry explicit `suite_timeout_ms`.
- Added contract guards for missing timeout, missing identity defaults, and the named Nova payload policy.
- Marked the Phase G2 checklist item as done.
- Net LOC delta at commit time: +63.
- Verification:
  - `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .`
  - `OPENCLAW_GATEWAY_URL=http://127.0.0.1:9 node tests/verification/behavior/verify.mjs --source-root . --areas buster-runtime-normalization,shell-boundary`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas foundations`

## Phase G3 - Delete Obsolete Buster Validation Compatibility

- Kept strict Buster task validation for canonical task type, module/project/run/attempt/dispatch/commit/output identity, gate identity, path boundaries, and unknown canonical capabilities.
- Removed the obsolete `status_json_path`-specific rejection path after confirming no active producer emits that field.
- Removed the legacy `buster_capabilities` alias from Buster task validation, Buster capability context resolution, and Nova Buster payload production; only canonical `capabilities` remains authoritative.
- Updated Buster runtime normalization and contract coverage to stop blessing legacy `status_json_path` rejection and to guard against reintroducing `buster_capabilities`.
- Marked the Phase G3 checklist item as done.
- Net LOC delta at commit time: -30.
- Verification:
  - `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .`
  - `OPENCLAW_GATEWAY_URL=http://127.0.0.1:9 node tests/verification/behavior/verify.mjs --source-root . --areas buster-runtime-normalization,shell-boundary`

## Phase G4 - Resolve Buster Repo Root From Shared Policy

- Replaced the hardcoded `/home/node/.openclaw/workspace/git-repo` Buster suite root with shared `getRepoRoot` resolution.
- Added explicit `REPO_ROOT` override support for runtime environments that provide a validated root outside Git discovery.
- Kept `resolveRepoScopedPath` on the common scoped-path boundary so absolute/traversal escapes still fail closed.
- Updated repo-scope verification to assert the active repository root is resolved dynamically and the hardcoded host path is absent.
- Marked the Phase G4 checklist item as done.
- Net LOC delta at commit time: +18.
- Verification:
  - `node tests/verification/contracts/check-buster-repo-scoped-paths.mjs --source-root .`
  - `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .`
  - `OPENCLAW_GATEWAY_URL=http://127.0.0.1:9 node tests/verification/behavior/verify.mjs --source-root . --areas buster-runtime-normalization,shell-boundary`

## Phase G5 - Structure Non-Blocking Suite Result Write Diagnostics

- Preserved non-blocking suite result write semantics: sandbox and `.swarm` result write failures still do not alter suite verdict execution.
- Added structured `observability.degraded` telemetry for suite result write failures with component `buster_suite_runner`, surface `suite_results`, and the write failure classification as `reason`.
- Preserved module/gate, attempt, dispatch, and session correlation in the degraded diagnostic when telemetry context is available.
- Added contract coverage that blocks the `.swarm` results directory, verifies the suite verdict still returns, and asserts the structured degraded diagnostic is emitted.
- Recorded the Phase G5 keep item as verified in the checklist.
- Net LOC delta at commit time: +102.
- Verification:
  - `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .`
  - `OPENCLAW_GATEWAY_URL=http://127.0.0.1:9 node tests/verification/behavior/verify.mjs --source-root . --areas buster-runtime-normalization,shell-boundary`
