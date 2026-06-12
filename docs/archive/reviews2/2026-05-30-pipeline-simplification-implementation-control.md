# Pipeline Simplification Implementation Control

Source review:
- `docs/reviews2/2026-05-30-pipeline-simplification-review.md`

Purpose:
- Work through the simplification review in controlled batches.
- Maximize safe LOC and complexity reduction.
- Preserve typed contracts, lifecycle/read-model authority, no-JS runtime policy, explicit platform defaults, and full verification.

## Operating Model

This should run as a ratchet:
1. Make the policy decisions durable.
2. Capture a baseline before code changes.
3. Triage every review point into delete/simplify, keep, or open/phased.
4. Add or tighten guards that define the new rules.
5. Delete compatibility and fallback code until the guards pass.
6. Keep each implementation PR narrow enough to review and revert independently.

Definition of done for each implementation PR:
- Net LOC goes down unless the PR is guard-only.
- No new compatibility aliases.
- No new hidden defaults.
- Relevant `rg` proof is included in PR notes.
- Relevant contract checks and smoke tests are green.
- Full verification is green before merge of the full cleanup series.

## Step 1: Commit Resolved Review Policy

Status: complete.

Commit the review report after resolved policy decisions are recorded:
- `fallback_model` remains explicit platform policy.
- `default_timeout_minutes` and `default_max_fails` remain explicit platform defaults.
- Buster Discord can share common degraded/restored observability state.
- Empty Buster suite lists are invalid.
- Gate adapter `gateRunStatus` vocabulary is only `PASS`, `FAIL`, `WAIT`, `TIMED_OUT`.
- `config._*` runtime mirrors are deleted only after `PipelineContext` or explicit parameters own all runtime reads.
- Active `.js` source path docs guards apply to `skills/*` runtime paths outside archives.

## Step 2: Baseline

Status: complete.

Capture before implementation:
- LOC for `skills/nova/pipeline`, `skills/buster`, and `skills/common/pipeline`.
- Current verification state.
- Current compatibility/default surfaces with targeted `rg` queries.
- Current gate status emitters and accepted aliases.
- Current `config._*` runtime mirror reads/writes.
- Current active docs references to `skills/*/*.js`.

Suggested baseline artifacts:
- `git diff --stat`
- `find skills/nova/pipeline skills/buster skills/common/pipeline -name '*.ts' -print | xargs wc -l`
- targeted `rg` output snippets for compatibility surfaces

## Step 3: Review-Point Triage Checklist

Status: complete.

Triage artifact:
- `docs/reviews2/2026-05-30-pipeline-simplification-triage.md`

Before the guard-first PR, assign every row one final decision:
- `delete/simplify`: remove code, shrink fallback surface, or collapse duplicate logic.
- `keep`: preserve intentionally because it is policy, authority, or reliability-critical.
- `open/phased`: keep temporarily with an explicit deletion criterion.

Checklist source spine retained below. Final decisions, deletion criteria, keep reasons, verification expectations, and post-Step-11 completion status are complete in the triage artifact:
- [x] Batch 0 high-confidence simplifications: initial decision `delete/simplify`.
- [x] Batch 0 risky phased changes: initial decision `open/phased`.
- [x] Batch 0 things that should stay: initial decision `keep`.
- [x] Batch 1 F1, contract builders infer too much producer meaning: initial decision `delete/simplify` after producers emit explicit outcome.
- [x] Batch 1 F2, pipeline rate-limit helper contains redundant truth: initial decision `delete/simplify`.
- [x] Batch 1 F3, worker contract strictness should stay: initial decision `keep`.
- [x] Batch 1 F4, validator mapping is still a compatibility bridge: initial decision `open/phased`.
- [x] Batch 2 F1, module attempts convert raw terminal envelopes into typed step results: initial decision `delete/simplify`.
- [x] Batch 2 F2, hidden ACP agent-id fallback: initial decision `delete/simplify`.
- [x] Batch 2 F3, Buster crash retry count hidden literal default: initial decision `open/phased` until required config is explicit.
- [x] Batch 2 F4, worker phases reconstruct poll-result-like objects from typed metadata: initial decision `delete/simplify`.
- [x] Batch 2 F5, shared module worker input builders duplicate state snapshots: initial decision `delete/simplify`.
- [x] Batch 2 F6, some module runner defaults: initial decision `keep`.
- [x] Batch 3 F1, repeated gate runner failure construction: initial decision `delete/simplify`.
- [x] Batch 3 F2, gate snapshots mix authority with diagnostics: initial decision `delete/simplify`.
- [x] Batch 3 F3, waitable gate engine mutates errors to signal stage start: initial decision `delete/simplify`.
- [x] Batch 3 F4, generic gate fix cycle hides missing adapter copy with message fallbacks: initial decision `delete/simplify`.
- [x] Batch 3 F5, Review/Buster gate control correlation fallbacks: initial decision `delete/simplify`.
- [x] Batch 3 things that should stay: initial decision `keep`.
- [x] Batch 4 F1, session termination hard-coded defaults and invalid-option normalization: initial decision `delete/simplify` where hidden defaults exist.
- [x] Batch 4 F2, lifecycle file cleanup best-effort diagnostic-only: initial decision `keep`.
- [x] Batch 4 F3, orchestration hides runtime/session defaults: initial decision `delete/simplify`.
- [x] Batch 4 F4, Nova rate-limit helpers use hard-coded and wrapper defaults: initial decision `delete/simplify`.
- [x] Batch 4 F5, Buster rate-limit service stricter but Discord emission fire-and-forget: initial decision `keep` nonblocking behavior, simplify observability path where possible.
- [x] Batch 5 F1, Nova telemetry nonblocking behavior: initial decision `keep`.
- [x] Batch 5 F2, shared Discord field contract in misleading rate-limit-named file: initial decision `delete/simplify`.
- [x] Batch 5 F3, Buster Discord duplicates observability health logic locally: initial decision `delete/simplify` by moving to common authority.
- [x] Batch 5 F4, Buster telemetry artifact fallback deliberate but naming should stay explicit: initial decision `keep` behavior, simplify naming only if clearer.
- [x] Batch 6 F1, Buster main entrypoint already simplified: initial decision `keep`.
- [x] Batch 6 F2, Buster task lifecycle hidden session defaults: initial decision `delete/simplify`.
- [x] Batch 6 F3, Buster task validation strong boundary: initial decision `keep`, extend for empty suites.
- [x] Batch 6 F4, Buster suite runner strict timeout: initial decision `keep`.
- [x] Batch 6 F5, output file right authority but completion fallback naming should be tightened: initial decision `delete/simplify`.
- [x] Batch 6 F6, Buster task outcome defaults should be narrowed: initial decision `delete/simplify`.
- [x] Batch 7 F1, active docs still refer to `.js` runtime paths: initial decision `delete/simplify`.
- [x] Batch 7 F2, active docs still describe legacy fallbacks and obsolete surfaces: initial decision `delete/simplify`, except explicit platform defaults stay.
- [x] Batch 7 F3, complexity budget scans `.js` only: initial decision `delete/simplify`.
- [x] Batch 7 F4, verification wrappers centralized: initial decision `keep`.
- [x] Batch 7 F5, no-JS runtime policy guarded but docs under-guarded: initial decision `delete/simplify`.

Triage output required before Step 4:
- complete in `docs/reviews2/2026-05-30-pipeline-simplification-triage.md`;
- every checklist item has a final decision;
- every `open/phased` item has a deletion criterion;
- every `keep` item states the policy or reliability reason;
- every `delete/simplify` item has expected verification.

## Step 4: Guard-First PR

Status: complete.

Add or tighten guards before broad deletion:
- Gate emitters may only produce `PASS`, `FAIL`, `WAIT`, or `TIMED_OUT`.
- Buster empty suite list is invalid.
- Active `skills/*` `.js` runtime path refs are forbidden outside archives.
- Complexity budget scans `.ts`, not `.js`.

Expected result:
- Some guards may fail initially if they expose existing debt.
- Fix only what is necessary to make the new guard truthful.

## Step 5: Low-Risk Deletion PR

Status: complete.

Targets:
- unused `resolveModel` wrapper if no callers remain;
- deleted old Nova `handleRateLimit` wrapper;
- ACP agent-id literal fallbacks after required config is explicit;
- stale docs and obsolete compatibility language.

Expected result:
- first meaningful net LOC reduction;
- low behavior risk.

## Step 6: Gate Vocabulary PR

Status: complete.

Changelog:
- gate adapters emit only canonical `PASS`, `FAIL`, `WAIT`, or `TIMED_OUT` `gateRunStatus` values.
- leftover gate status alias sets were deleted from validation and covered by contract guards.

## Step 7: Buster Strictness PR

Status: complete.

Changelog:
- Buster task validation now requires non-empty suites, explicit `timeout_seconds`, and full session launch policy.
- Buster session launch no longer fills `cwd` from repo root or `label` from dispatch id.
- Pre-ACK synthesized completion is named `synthesized_failure_completion_before_ack` and emits only failure.

## Step 8: Typed Result Authority PR 1

Status: complete.

Changelog:
- `buildPipelineStepResultFromControlResult` now requires callers to pass explicit pipeline `outcome`.
- Gate and scheduled-validator projection callers provide outcome from typed producer control data.
- Contract guards now reject reintroducing outcome inference from `gateRunStatus`, `recommendation`, or other control payload fields.

Remaining typed-result work:
- remove validator/generator producer-type inference from stage ids after producer inputs are explicit;
- delete raw `{ exit, status }` terminal builders and projection code once runner phases emit typed step results.

## Step 9: Runtime Context Authority PR

Status: complete.

Changelog:
- CLI runtime model/thinking overrides now enter `PipelineContext.runtimeOverrides` instead of `config._runtimeOverrides`.
- `resolvePolicy` reads active `PipelineContext.runtimeOverrides`.
- Later cleanup removed `syncConfigRuntimeFields` entirely.

Remaining runtime-context work:
- migrate log-dir mirrors and the remaining startup config plugin registry carrier.

## Step 10: Observability Cleanup PR

Status: complete.

Targets:
- move Buster Discord degraded/restored state to common observability;
- move shared Discord field contract out of rate-limit-named module;
- remove Buster Discord alias-heavy context inputs after callers are canonical.

Changelog:
- shared Discord identity field contracts moved from `skills/common/pipeline/services/rate-limit-contract.ts` to `skills/common/pipeline/services/discord-fields-contract.ts`;
- Nova and Buster use local Discord field facades instead of importing Discord field helpers from the rate-limit contract;
- Buster Discord context inputs now use canonical snake_case fields and no longer normalize camelCase/operator alias inputs;
- Buster Discord webhook/audit degraded-restored tracking now uses one local health map and shared transition helpers instead of separate webhook/audit state machines;
- contract guards now reject reintroducing Buster Discord camelCase context reads or separate webhook/audit health maps.

Verification:
- contract suite green;
- Buster operator surface contract green;
- rate-limit slice contract green;
- operator/redaction/foundations behavior areas green;
- Nova and Buster startup smokes green.

## Step 11: Final Consolidation PR

Status: complete.

Targets:
- collapse duplicated worker input builders;
- factor shared gate runtime-error builders;
- update docs/maps;
- tune complexity budgets to enforce the smaller shape.

Changelog:
- module worker run inputs now share `buildModuleWorkerRunInputBase` for common refs, ids, workspace, artifact, state, execution, and deadline scaffolding;
- gate dispatch/execution runtime errors now route through one `buildGateRuntimeErrorControl` path;
- module-runner and gate-control contracts guard the new consolidation points;
- pipeline complexity budget default tightened from 800 to 780 runtime TypeScript lines.

Verification:
- contract suite, module-failures/gates behavior areas, and Nova/Buster startup smokes green.

## Step 12: Completion Ledger Refresh

Status: complete.

Changelog:
- `docs/reviews2/2026-05-30-pipeline-simplification-triage.md` now records post-Step-11 status for all 45 specific target points.
- Status values distinguish `done`, `keep`, `partial`, `open`, and `phased` so the remaining implementation queue is explicit.
- The remaining work is grouped into runtime context mirrors, typed result authority, gate cleanup, runtime/session/rate-limit defaults, Buster cleanup, and final docs proof.

Next implementation candidates:
- choose one narrow remaining bucket from the updated ledger;
- prefer a bucket with net LOC reduction and existing guard coverage;
- keep `git diff --stat`, targeted `rg` proof, contract suite, relevant smoke test, and batch changelog in the PR notes.

## Step 13: Rate-Limit Step Result Authority PR

Status: complete.

Target:
- Point 9, pipeline rate-limit details should use terminal outcome authority for exhaustion.

Changelog:
- `pipelineStepRateLimitDetails` now derives `rate_limit_exhausted` only from `stepResult.outcome === PIPELINE_STEP_OUTCOMES.RATE_LIMITED`.
- Rate-limit status and max-pause metadata remain diagnostic details, not exhaustion authority.
- `check-pipeline-step-result-surface.mjs` now rejects reintroducing metadata-driven exhaustion checks and covers stale metadata on a passed step.

Verification:
- contract suite green;
- rate-limit slice contract green;
- pipeline step-result contract green;
- Nova startup smoke green.

## Step 14: Waitable Gate Error Evidence PR

Status: complete.

Target:
- Point 19, replace waitable gate error mutation.

Changelog:
- `runScheduledWaitableGate` now returns structured `{ controlResult, error, stageStarted }` state instead of mutating thrown errors with `gateStageStarted`.
- `gate-runner` consumes that typed stage-start evidence and builds the same runtime-error control result without hidden error flags.
- Contract guards now reject `gateStageStarted` usage in the waitable gate engine and gate runner.

Verification:
- contract suite green;
- gate-control contract green;
- stage-envelope primitives contract green;
- Nova startup smoke green;
- Buster startup smoke green.

## Step 15: Gate Fix-Cycle Message Authority PR

Status: complete.

Changelog:
- `gate-forge-fix-cycle` no longer accepts generic fallback copy through `callMaybe`.
- Review and Buster gate fix-cycle adapters now provide the previously implicit start/log-level message fields explicitly.
- Degraded Git persistence copy is owned by each adapter so the shared engine does not silently substitute generic operator text.
- `check-gate-fix-scaffold-surface.mjs` rejects reintroducing the generic fallback resolver and guards required adapter message fields.

Verification:
- contract suite, gate-fix scaffold contract, and Nova/Buster startup smokes green.

## Step 16: Gate Snapshot Diagnostics PR
Status: complete. Changelog: gate-status evidence moved to `stateSnapshot.diagnostics.gate_status`; `priorResults` now contains canonical gate output artifacts only. Verification: contract suite, gate-control contract, and Nova/Buster startup smokes green.
## Step 17: Gate Correlation Fallback Cleanup PR
Status: complete. Changelog: Review/Buster remediation controls require explicit correlation, gate controls no longer derive attempts from rate-limit diagnostics, and Buster issue extraction no longer reads `_verdict`. Verification: contract suite, gate-control contract, and Nova/Buster startup smokes green.
## Step 18: Buster Crash Retry Policy PR - complete. Changelog: anonymous `?? 2` moved to named code policy after module/config overrides. Verification: contract suite, module-runner slice contract, and Nova/Buster startup smokes green.
## Step 19: Session Termination Policy PR - complete. Changelog: termination timing still uses centralized policy defaults, but legacy grace aliases and invalid-value fallback normalization were removed. Verification: contract suite, ACP/gateway contract, and Nova/Buster startup smokes green.
## Step 20: Buster Telemetry Option Alias Cleanup PR - complete. Changelog: degraded telemetry artifact fallback remains explicit, while `createTelemetryContext` accepts snake_case options only and callers no longer pass camelCase aliases. Verification: contract suite, Buster pipeline-slice contract, and Nova/Buster startup smokes green.
## Step 21: Config Ingress Fallback Cleanup PR - complete. Changelog: Nova `loadConfig` no longer mirrors `progress.pipeline_review` or fills `discord_webhook_url` from env; Helm maps the deployment `DISCORD_WEBHOOK` secret into canonical config before runtime validation. Verification: contract suite, Nova startup smoke, and Buster startup smoke green.
## Step 22: Registry Optional Lookup Cleanup PR - complete. Changelog: unused optional stage-handler and gate-owner decision lookups were deleted; optional hook listener absence is documented as non-authoritative observer/sink fan-out. Verification: contract suite, module-runner slice contract, and Nova/Buster startup smokes green.
## Step 23: Validator Mapping Bridge Cleanup PR - complete. Changelog: built-in validators now emit explicit typed control policy before building results; the shared raw validator mapper and producer-type inference were deleted. Verification: contract suite, validator/module-runner contracts, and Nova/Buster startup smokes green.
## Step 24: Module Terminal Helper Cleanup PR - complete. Changelog: raw pass/fail/rate-limit terminal helper builders were deleted; existing PASS paths now return typed module step results directly and dependency-check failures bypass the raw FAIL builder. Verification: module-runner contract green.
## Step 25: Worker Poll Reconstruction Cleanup PR - complete. Changelog: Forge/Buster phase routing no longer reconstructs poll-result-like objects from typed worker metadata; Buster failure handling receives typed failure class directly and poll failure handling is null-safe for absent raw poll evidence. Verification: module-runner contract green.
## Step 26: Orchestration Dispatch Identity Cleanup PR - partial. Changelog: Redis Buster payload construction now requires explicit attempt and dispatch identity, unknown kill/steer agent configs fail explicitly, and small Buster payload helpers were collapsed. Remaining Point 25 work is suite-timeout producer policy, handled with Buster lifecycle cleanup.
## Step 27: Legacy Rate-Limit Wrapper Cleanup PR - partial. Changelog: deleted the legacy `handleRateLimit` wrapper and its hard-coded pause/max defaults; the telemetry fixture now calls canonical session rate-limit helpers directly. Remaining Point 26 work is broader rate-limit identity/fallback cleanup.
## Step 28: Buster Rate-Limit Discord Reporting PR - complete. Changelog: Buster rate-limit pause notifications remain nonblocking, but the sender now owns explicit catch/reporting for Discord delivery failures. Verification: Buster pipeline slice contract.
## Step 29: Buster Payload Policy Cleanup PR - complete. Changelog: Buster suite timeout now comes from canonical platform config, task ingress requires explicit stage/module worker identity, and lifecycle execution consumes validated identity instead of deriving it from task type. Verification: Buster pipeline slice contract.
## Step 30: Rate-Limit Cooldown Buffer Policy PR - partial. Changelog: Nova rate-limit cooldown buffer now comes from required platform config instead of a hidden local `5000` fallback. Remaining Point 26 work is rate-limit identity/fallback consolidation.
## Step 31: Buster Completion Outcome/Reason PR - complete. Changelog: Buster completion record construction, completion signal emission, and child-result publication now require explicit outcome/reason; only the pre-ACK terminal guarantee path synthesizes failure evidence. Verification: Buster pipeline slice contract.
## Step 32: Rate-Limit Module Phase Identity PR - partial. Changelog: Nova module rate-limit status/recovery now takes explicit `phase` and the module `phaseFallback` alias is deleted. Remaining Point 26 work is broader run/attempt/dispatch/session/max-pause fallback consolidation.
## Step 33: Shared Observability Health State PR - complete. Changelog: Buster Discord degraded/restored tracking now uses the shared common observability health state machine, and Nova observability uses the same tracker. Verification: Buster pipeline slice contract plus observability catch-reporting contract.
## Step 34: Obsolete Reference Docs Cleanup PR - complete. Changelog: removed stale `status_json_path`, global run-state fallback, direct gate fallback, and legacy telemetry path wording from active pipeline reference docs. Verification: final reference guard plus targeted docs proof.
## Step 35: Rate-Limit Identity Field Cleanup PR - complete. Changelog: Nova rate-limit status, recovery, and exit helpers now accept one explicit identity object plus explicit `maxPauses`; run/attempt/dispatch/gateway/session/max-pause fallback option fields were removed from helpers, callers, and the rate-limit contract guard. Verification: rate-limit slice contract, contract suite, and Nova/Buster startup smokes green.
## Step 36: Runtime Override Mirror Cleanup PR - complete. Changelog: runtime model/thinking overrides are now PipelineContext-only; `_runtimeOverrides` was removed from config validation, context construction fallback, and policy resolution fallback. Remaining Point 2 work is `_logDir` and `_runLogDir` mirror migration. Verification: strict CLI/config contract plus contract suite and Nova/Buster startup smokes green.
## Step 37: Plugin Registry Mirror Backwrite Cleanup PR - complete. Changelog: `syncConfigRuntimeFields` no longer writes `PipelineContext.pluginRegistry` back onto config, and mandatory review lint scheduling now queries the registry through `resolveStageOwner` instead of reading `_pluginRegistry.stageOwners` directly. Remaining Point 2 work is log-dir mirrors. Verification: pipeline-runner slice contract plus contract suite and Nova/Buster startup smokes green.
## Step 38: Runtime Field Sync Method Deletion PR - complete. Changelog: deleted the broad `syncConfigRuntimeFields` method; context creation now binds run id/stats directly, while the still-required log-dir compatibility bridge is constrained to explicit `setLogDirs` calls. Remaining Point 2 work is log-dir mirror migration. Verification: pipeline-runner and status-store slice contracts plus contract suite and Nova/Buster startup smokes green.
## Step 39: Project Log Dir Initialization Helper PR - complete. Changelog: duplicated recovery/lock `_logDir` initialization moved behind `ensureProjectLogDir`, leaving the existing config-backed log path behavior intact while shrinking repeated mirror setup. Remaining Point 2 work is run-log-dir/log artifact migration. Verification: pipeline-runner slice contract plus contract suite and Nova/Buster startup smokes green.
## Step 40: Pipeline Run Log Dir Initialization Helper PR - complete. Changelog: startup and scheduled-gate run-log setup now use `ensurePipelineRunLogDir` instead of local `_logDir`/`_runLogDir` initialization blocks, preserving current artifact paths while shrinking duplicate mirror setup. Remaining Point 2 work is module plugin log-dir setup, log artifact consumers. Verification: pipeline-runner slice contract plus contract suite and Nova/Buster startup smokes green.
## Step 41: Module Plugin Log Dir Initialization Helper PR - complete. Changelog: module worker plugin log-dir setup now uses `ensurePipelineRunLogDir`; the shared project-log helper preserves the existing modules-dir fallback, and the module runner no longer imports `fs` solely for run-log directory creation. Remaining Point 2 work is log artifact consumers. Verification: module-runner slice contract plus contract suite and Nova/Buster startup smokes green.
## Step 42: Run Log Resolver Authority PR - complete. Changelog: durable operator alerts and plugin artifact lanes now use `resolvePipelineRunLogDir` from `core/paths.ts` instead of local run-log resolver copies. Remaining Point 2 work is log artifact consumers. Verification: path/artifact/operator-alert contracts plus contract suite and Nova/Buster startup smokes green.
## Step 43: Lifecycle Run Log Initialization PR - complete. Changelog: status-store lifecycle storage now delegates run-log initialization to `ensurePipelineRunLogDir` while preserving the explicit missing-log-dir error. Remaining Point 2 work is log artifact consumers. Verification: status-store/path contracts plus contract suite and Nova/Buster startup smokes green.
## Step 44: Runtime Run Log Helper Deletion PR - complete. Changelog: removed the unused `runLogDir` helper from `core/runtime.ts`; run-log path construction now stays in `core/paths.ts`. Remaining Point 2 work is log artifact consumers. Verification: contract suite and Nova/Buster startup smokes green.
## Step 45: Scheduled Artifact Path Authority PR - complete. Changelog: scheduled validator completion state now uses canonical `resolvePipelineRunLogDir` instead of rebuilding `.swarm/logs/pipeline/runs/<run>` from `paths.swarm_dir`, and generator artifact snapshots now use `getPipelineArtifactBundle` instead of local `_logDir`/`_runLogDir` path construction. Remaining Point 2 work is log artifact consumers. Verification: pipeline-runner/path/stage-envelope contracts plus contract suite and Nova/Buster startup smokes green.
## Step 46: Status Store Run Log Initialization PR - complete. Changelog: `initLogDir` now delegates run-log directory creation to `ensurePipelineRunLogDir` instead of locally computing, mkdiring, and writing `_runLogDir`; lifecycle completion events source summary/latest artifact paths from `getPipelineArtifactBundle` instead of rebuilding them locally from `_logDir`/`_runLogDir`. Remaining Point 2 work is log artifact consumers. Verification: status-store/path/artifact contracts plus contract suite and Nova/Buster startup smokes green.
## Step 47: Pipeline Review Prompt Path Cleanup PR - complete. Changelog: removed the thin `pipelineReviewDispatchMode` wrapper and stopped writing hard-coded `.swarm/logs/pipeline/...` fallback paths into pipeline-review prompts when runtime log dirs are unavailable. Remaining Point 2 work is log artifact consumers. Verification: summary contracts plus contract suite and Nova/Buster startup smokes green.
## Step 48: Case Study Prompt Path Cleanup PR - complete. Changelog: removed the thin `caseStudyDispatchMode` wrapper and stopped writing hard-coded `.swarm/logs/pipeline/...` fallback paths into case-study prompts when runtime log dirs are unavailable. Remaining Point 2 work is log artifact consumers. Verification: generator contracts plus contract suite and Nova/Buster startup smokes green.
## Step 49: Runtime Mirror Consumer Cleanup PR - in progress. Changelog: durable operator alert targets now use `getPipelineArtifactBundle` instead of locally rebuilding pipeline/run artifact directories from `_logDir`/`_runLogDir`; `PipelineContext` now receives the startup plugin registry explicitly from `loadConfig` instead of reading `config._pluginRegistry`; startup config no longer writes `_pluginRegistry`, registry lookup uses explicit registry, PipelineContext, or active context authority, `PipelineContext` log directories come from explicit constructor/setter inputs instead of config mirror reads or backwrites, loaded config rejects `_logDir`/`_runLogDir` as top-level input, and path helpers derive project/run log directories from canonical `paths.swarm_dir`/`paths.modules_dir` without mutating config mirrors; Discord audit, structured telemetry, runner lifecycle/recovery artifacts, status-store log initialization, lint diagnostics, Redis completion tracing/targets, session transcript mirroring, module/gate log dirs, polling worktree ignores, approval audit artifact guards, Buster task payload log dirs, generator prompt paths, standalone Redis/project-summary Discord audit targets, project summary paths, blueprint sync artifacts, model policy logs, and architecture-validator artifacts use canonical/cached artifact helpers where available, unused test-log path helpers were deleted, run-log helper errors no longer name bridge fields, cost/lint/architecture-validator artifact guards live in path helpers, Discord audit/Buster task/summary generator field builders accept canonical fields only, logger file writes and types require explicit context log streams instead of falling back to `ctx.config._runLogDir`, foundations/restart-recovery/approval/summaries/runtime-surface behavior helpers expect deleted optional registry/log-dir lookups to stay absent, and approval behavior expects canonical gateRunStatus values. Remaining Point 2 work is fixture/doc references to deleted `_logDir`/`_runLogDir` mirrors outside the production source tree.
## Step 50: Buster Rate-Limit Completion Policy Cleanup PR - complete. Changelog: Buster rate-limit completion now reads max pauses only from canonical monitor status or explicit payload `rate_limit.max_pauses`; legacy camelCase/top-level/acp_monitor aliases and the hard-coded `3` fallback were deleted. Verification: Buster pipeline slice contract plus contract suite and Nova/Buster startup smokes green.
## Step 51: Shared Helper Runtime Collision Inventory PR - complete. Changelog: runtime collision verification now treats `discord-fields-contract.ts` and `observability-health.ts` as intentional common-owned helper overwrites, matching the existing Nova/Buster repo-local re-export shim policy. Verification: runtime collision guard, foundations behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 52: Polling Behavior Alias Fixture Cleanup PR - complete. Changelog: polling behavior fixtures now use canonical `identity` and `pluginRegistry` fields instead of deleted rate-limit fallback aliases or `_pluginRegistry` mirrors. Verification: polling behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 53: Active Log-Dir Mirror Reference Cleanup PR - complete. Changelog: active reference docs now describe canonical project/run log-dir helpers instead of deleted `_logDir`/`_runLogDir` config mirror fields; the final reference guard rejects reintroducing those mirror names in active docs; docs-surface latest-pointer fixtures now seed canonical `paths.swarm_dir`. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir" docs skills charts my-values plugins tests/verification/behavior/areas/docs-surface.mjs tests/verification/behavior/areas/telemetry-docs.mjs -g '!docs/archive/**' -g '!docs/ts-migration/**' -g '!docs/reviews/**' -g '!docs/reviews2/**'` returns no matches. Verification: final reference guard, telemetry-docs/docs-surface behavior areas, contract suite, and Nova/Buster startup smokes green.
## Step 54: Contract Fixture Log-Dir Mirror Cleanup PR - complete. Changelog: contract fixtures now seed canonical `paths.swarm_dir` and local expected project/run log-dir variables instead of writing `_logDir`/`_runLogDir` mirror fields. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir" tests/verification/contracts -g '*.mjs'` returns no matches. Verification: touched contract guards, contract suite, and Nova/Buster startup smokes green.
## Step 55: Focused Behavior Fixture Mirror Cleanup PR - complete. Changelog: models, resume-idempotence, and transcript-monitor behavior fixtures now seed canonical `paths.swarm_dir` and explicit `pluginRegistry` fields instead of deleted log-dir/registry mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/models.mjs tests/verification/behavior/areas/resume-idempotence.mjs tests/verification/behavior/areas/transcript-monitor.mjs` returns no matches. Verification: resume-idempotence/models/transcript-monitor behavior areas, contract suite, and Nova/Buster startup smokes green.
## Step 56: Discord Correlation Fixture Mirror Cleanup PR - complete. Changelog: discord-correlation behavior fixtures now seed canonical `paths.swarm_dir` instead of `_logDir`/`_runLogDir` mirrors while preserving explicit artifact assertions. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir" tests/verification/behavior/areas/discord-correlation.mjs` returns no matches. Verification: discord-correlation behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 57: Governance Fixture Mirror Cleanup PR - complete. Changelog: governance behavior fixtures now rely on existing canonical `paths.swarm_dir` inputs instead of duplicate `_logDir` mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir" tests/verification/behavior/areas/governance.mjs` returns no matches. Verification: governance behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 58: Restart-Recovery Fixture Mirror Cleanup PR - complete. Changelog: restart-recovery behavior fixtures now rely on canonical `paths.swarm_dir`/`paths.modules_dir` instead of duplicate `_logDir` mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir" tests/verification/behavior/areas/restart-recovery.mjs` returns no matches. Verification: restart-recovery behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 59: Agent-Lifecycle Fixture Mirror Cleanup PR - complete. Changelog: agent-lifecycle behavior fixtures now seed canonical `paths.swarm_dir`, explicit `pluginRegistry`, and explicit Buster suite-timeout fixture policy instead of deleted log-dir/registry mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/agent-lifecycle.mjs` returns no matches. Verification: agent-lifecycle behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 60: Telemetry Fixture Mirror Cleanup PR - complete. Changelog: telemetry behavior fixtures now use canonical Buster telemetry snake_case options, canonical `paths.swarm_dir`, and explicit `pluginRegistry` instead of deleted log-dir/registry mirrors; Buster rate-limit Discord reporting now wraps the synchronous send result before attaching nonblocking catch handling. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/telemetry.mjs` returns no matches; `rg -n "Promise.resolve\\(sendDiscord" skills/buster/pipeline/services/rate-limit.ts` finds the explicit wrapper. Verification: telemetry behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 61: Small Behavior Fixture Mirror Cleanup PR - complete. Changelog: stops, fix-cycles, and redaction-surface behavior fixtures now use explicit `pluginRegistry`, canonical `paths.swarm_dir`, and Buster telemetry snake_case context fields instead of deleted log-dir/registry mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/stops.mjs tests/verification/behavior/areas/fix-cycles.mjs tests/verification/behavior/areas/redaction-surface.mjs` returns no matches. Verification: stops/fix-cycles/redaction-surface behavior areas, contract suite, and Nova/Buster startup smokes green.
## Step 62: Seq-Restart Fixture Mirror Cleanup PR - complete. Changelog: seq-restart behavior fixtures now use explicit `pluginRegistry`, canonical `paths.swarm_dir`, and Buster telemetry snake_case context fields instead of deleted log-dir/registry mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/seq-restart.mjs` returns no matches. Verification: seq-restart behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 63: Migrated/Soak Fixture Mirror Cleanup PR - complete. Changelog: migrated-seams and many-module-soak behavior fixtures now use explicit `pluginRegistry`, canonical `paths.swarm_dir`, and harness-mapped Claude fixture models instead of deleted log-dir/registry mirrors or unmapped placeholder models. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry|fallback-model" tests/verification/behavior/areas/migrated-seams.mjs tests/verification/behavior/areas/many-module-soak.mjs` returns no matches. Verification: migrated-seams/many-module-soak behavior areas, contract suite, and Nova/Buster startup smokes green.
## Step 64: Summaries Fixture Mirror Cleanup PR - complete. Changelog: summaries behavior fixtures now rely on canonical `paths.swarm_dir`/`paths.modules_dir` instead of duplicate `_logDir`/`_runLogDir` mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/summaries.mjs` returns no matches. Verification: summaries behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 65: Foundations Fixture Mirror Cleanup PR - complete. Changelog: foundations behavior fixtures now rely on canonical `paths.swarm_dir` and run ids instead of duplicate `_logDir`/`_runLogDir` mirrors or config backwrites, while keeping the intentional guard assertions that reject those fields. Proof: `git diff --stat` net-negative; `rg -n "_pluginRegistry|_logDir\\s*:|_runLogDir\\s*:|config\\._runLogDir|config\\._logDir" tests/verification/behavior/areas/foundations.mjs` returns no matches. Verification: foundations behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 66: Approvals Fixture Mirror Cleanup PR - complete. Changelog: approvals behavior fixtures now seed canonical `paths.swarm_dir` where needed and no longer write `_logDir`/`_runLogDir` mirror fields. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/approvals.mjs` returns no matches. Verification: approvals behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 67: Operator Surface Fixture Mirror Cleanup PR - complete. Changelog: operator-surface behavior fixtures now seed canonical `paths.swarm_dir`, explicit `pluginRegistry`, and Buster telemetry snake_case context fields instead of deleted log-dir/registry mirrors; the audit-log failure test blocks the canonical run-log path directly. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/operator-surface.mjs` returns no matches. Verification: operator-surface behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 68: Polling Fixture Mirror Cleanup PR - complete. Changelog: polling behavior fixtures now rely on canonical `paths.swarm_dir`/`paths.modules_dir` and no longer write `_logDir`/`_runLogDir` mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry" tests/verification/behavior/areas/polling.mjs` returns no matches. Verification: polling behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 69: Module-Failures Fixture Mirror Cleanup PR - complete. Changelog: module-failures behavior fixtures now use canonical `paths.swarm_dir`/`paths.modules_dir`, explicit `pluginRegistry`, and harness-mapped Forge models where the real registry path is exercised; the obsolete direct `handleRateLimit` compatibility-wrapper record was deleted. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry|handleRateLimit" tests/verification/behavior/areas/module-failures.mjs` returns no matches. Verification: module-failures behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 70: Gates Fixture Mirror Cleanup PR - complete. Changelog: gates behavior fixtures now use canonical `paths.swarm_dir`, explicit `pluginRegistry`, canonical run-log paths, and current diagnostic gate-status snapshot fields instead of deleted log-dir/registry mirrors. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry|config\\._runLogDir|config\\._logDir" tests/verification/behavior/areas/gates.mjs` returns no matches. Verification: gates behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 71: Pipeline Fixture Mirror Cleanup PR - complete. Changelog: pipeline behavior fixtures now seed canonical `paths.swarm_dir`/`paths.modules_dir`, explicit `pluginRegistry`, and local canonical log artifact paths instead of deleted log-dir/registry mirrors or helper backwrites. Proof: `git diff --stat` net-negative; `rg -n "_logDir|_runLogDir|_pluginRegistry|config\\._runLogDir|config\\._logDir" tests/verification/behavior/areas/pipeline.mjs` returns no matches. Verification: pipeline behavior area, contract suite, and Nova/Buster startup smokes green.
## Step 72: Active Registry Mirror Reference Cleanup PR - complete. Changelog: active implementation-map docs now name explicit `pluginRegistry` instead of deleted `_pluginRegistry` config mirrors, and the final reference guard rejects reintroducing runtime mirror field names in active docs. Proof: `git diff --stat` net-negative; `rg -n "_pluginRegistry|_logDir|_runLogDir" docs/pipeline/implementation-map tests/verification/contracts/check-phase10-final-reference-surface.mjs` returns no matches. Verification: final reference guard green.
## Step 73: Generator Fixture Temp-Path Cleanup PR - complete. Changelog: generator behavior fixtures now keep canonical `paths.swarm_dir`/`paths.modules_dir` inside their per-run `mkdtemp` repo roots instead of fixed `/tmp/behavior-generator-*` locations. Proof: `git diff --stat` net-negative; `rg -n "swarm_dir: '/tmp/behavior-generator|modules_dir: '/tmp/behavior-generator" tests/verification/behavior/areas/pipeline.mjs` returns no matches. Verification: pipeline behavior area, contract suite, Nova/Buster startup smokes, and full verification green with `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789`.
## Step 74: Runtime-Monitor Telemetry Fixture Cleanup PR - complete. Changelog: runtime-monitor Buster rate-limit recovery fixtures now seed canonical `run_id`/`log_dir` telemetry context instead of removed camelCase options, preserving explicit audit-log assertions without a compatibility alias. Proof: `git diff --stat` net-negative; `rg -n "runId: 'run-buster-rate-limit-gateway|logDir: rateLimitLogDir|swarm_dir: '/tmp/behavior-generator|modules_dir: '/tmp/behavior-generator" tests/verification/behavior/areas/runtime-monitor.mjs tests/verification/behavior/areas/pipeline.mjs` returns no matches. Verification: runtime-monitor and pipeline behavior areas, contract suite, Nova/Buster startup smokes, and full verification green with `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789`.
## Step 75: Late Behavior Fixture Contract Cleanup PR - complete. Changelog: shutdown integration proof now matches the current explicit `reaperAfterKill(entry.agentId, sessionKey, entry.gatewayLabel)` orchestration cleanup call; Buster runtime-normalization now asserts strict rejection when rate-limit completion lacks explicit `rate_limit.max_pauses`; valid Buster task fixtures seed explicit `stage_id`/`worker_type`; queue fixtures no longer include the redundant `module` alias; and the polling throttle fixture no longer lets its synthetic clock exhaust the timeout before session closure. Proof: `git diff --stat` net-negative; `rg -n "entry\\.agentId \\|\\| agentType|runId: 'run-buster-rate-limit-gateway|logDir: rateLimitLogDir|swarm_dir: '/tmp/behavior-generator|modules_dir: '/tmp/behavior-generator|resolveBusterRateLimitMaxPauses\\(\\{\\}, \\{\\}\\), 3|pollForSessionEnd\\(config, 'forge-throttle-elapsed', 1," tests/verification/behavior/areas/shutdown-integration.mjs tests/verification/behavior/areas/runtime-monitor.mjs tests/verification/behavior/areas/pipeline.mjs tests/verification/behavior/areas/buster-runtime-normalization.mjs tests/verification/behavior/areas/polling.mjs` returns no matches. Verification: shutdown-integration/runtime-monitor/pipeline/buster-runtime-normalization/polling behavior areas, contract suite, Nova/Buster startup smokes, and full verification green with `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789`.
## Final Gate

Status: complete.
- Contract suite: green.
- Nova startup smoke: green.
- Buster startup smoke: green.
- Full verification: green with `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789`; behavior harness `414` passed / `0` failed.
- Final batch LOC delta: net-negative; compatibility-surface delta: no new aliases/defaults, targeted stale-pattern proofs clean.
