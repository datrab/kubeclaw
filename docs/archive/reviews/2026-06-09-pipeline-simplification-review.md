# Pipeline simplification review

Date: 2026-06-09
Scope: static adversarial simplification review only. No implementation changes were made.

## Executive summary

The pipeline code is already materially stricter than the 2026-05-29 batch plan assumed. Several old compatibility surfaces have been deleted or converted into fail-closed guards: plugin config validation is strict, typed gate/worker control contracts reject compatibility result shapes, Buster task validation requires explicit task/session identity, and verification scripts assert that legacy Buster `status_json_path`, dynamic suite loading, hidden suite timeout defaults, and shell-writer helpers do not return.

The remaining simplification opportunity is concentrated in adapter layers rather than core authority. The highest-confidence work is to remove raw module-runner terminal envelopes by making every module phase emit `PipelineStepResult` directly, then deleting the fallback conversion stack in the module-attempt adapter. The next highest-confidence work is deleting small defensive defaults that are unreachable after current validation, such as Buster suite artifact `unknown` fallback segments. Riskier changes should be phased: status-store compatibility projections, gate terminal domain-result mapping, session/runtime default policies, Discord field correlation extraction, and Buster runtime defaults all still sit on active runtime boundaries.

The authority model should stay intact:

- Typed contracts remain the result authority.
- Lifecycle/read-model projections remain the active-session authority.
- Gate active-session files and status `active_agent` fields remain diagnostic only.
- No silent fallback to legacy status/result shapes should be reintroduced.
- No hidden default model/config/session behavior should be added.
- No JavaScript/shim writer reintroduction is needed or recommended.

All requested batches 0-7 were reviewed. Exclusions: none. Verification was not run because this was a review/planning session with no code edits.

## Reviewed scope

Reviewed directly:

- `skills/nova/pipeline`
- `skills/buster`
- `skills/common/pipeline`
- Prior plan: `docs/archive/reviews/2026-05-29-pipeline-simplification-batch-plan.md`
- Relevant verification guards under `tests/verification`

Primary code areas inspected:

- Nova config/policy: `skills/nova/pipeline/core/config.ts`, `skills/nova/pipeline/core/policy.ts`
- Typed contracts: `skills/nova/pipeline/services/contracts/*`
- Lifecycle/session authority: `skills/nova/pipeline/services/status-store.ts`, `skills/nova/pipeline/services/session-authority.ts`, `skills/nova/pipeline/services/gate-active-session.ts`, `skills/common/pipeline/agents/lifecycle.ts`, `skills/common/pipeline/agents/acp-monitor.ts`
- Module runner stack: `skills/nova/pipeline/runners/module-runner*.ts`, `skills/nova/pipeline/runners/module-runner/*`
- Gate runners: `skills/nova/pipeline/runners/gate-runner.ts`, `skills/nova/pipeline/runners/buster-gate-terminal.ts`, `skills/nova/pipeline/runners/review-gate-control.ts`, `skills/nova/pipeline/runners/approval-gate-control.ts`
- Rate limit/runtime/gateway: `skills/nova/pipeline/services/rate-limit.ts`, `skills/buster/pipeline/services/rate-limit.ts`, `skills/common/pipeline/integrations/gateway.ts`
- Telemetry/Discord: `skills/nova/pipeline/services/discord-fields-contract.ts`, `skills/common/pipeline/integrations/discord.ts`, `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts`
- Buster runtime/suites/tasks: `skills/buster/buster-pipeline.ts`, `skills/buster/pipeline/services/task-validation.ts`, `skills/buster/pipeline/services/task-queue.ts`, `skills/buster/pipeline/runners/suite-runner.ts`, `skills/buster/README.md`

## Architecture and authority map

1. Config and policy authority

   `loadConfig` is intentionally strict. It rejects test overrides, requires core platform policy fields, requires Redis Buster dispatch fields, rejects deprecated `config.models`, requires explicit ACP monitor numeric fields, rejects `telemetry.stream_key`, and rejects unknown top-level fields. See `skills/nova/pipeline/core/config.ts:90-327`. Model policy is centralized in `resolvePolicy`, with explicit precedence across runtime options, scope, progress defaults, and configured `fallback_model`; see `skills/nova/pipeline/core/policy.ts:1-80`.

2. Typed result authority

   `PipelineStepResult` construction now requires an explicit outcome and validates terminal decision shape; see `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:114-245`. Gate and worker control results reject legacy compatibility shapes in their coercers; see `skills/nova/pipeline/services/contracts/gate-control-result.ts:174-177` and `skills/nova/pipeline/services/contracts/worker-control-result.ts:71-109`.

3. Lifecycle/read-model authority

   Status store is a facade over lifecycle-backed module state plus gate files/logs. It re-exports lifecycle read-model helpers and guards lifecycle fields from unauthorized writes; see `skills/nova/pipeline/services/status-store.ts:1-60` and `skills/nova/pipeline/services/status-store.ts:172-260`. Read models rebuild and catch up from lifecycle events; see `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts:49-107`.

4. Active-session authority

   Lifecycle read models own active-session authority. `status.active_agent`, tracked-agent files, and gate active-session files are diagnostic/evidence only. The strong identity fields are `run_id`, `attempt`, `dispatch_id`, and `session_key`; see `skills/nova/pipeline/services/session-authority.ts:1-12`. Gate active-session recovery explicitly disallows status/file/tracked authority; see `skills/nova/pipeline/services/gate-active-session.ts:157-209`.

5. Runner and gate adapters

   Module runners still contain the largest compatibility conversion layer. Several producers return raw `{ outcome_class, status, reason }` objects, and `module-runner/attempt.ts` converts them into `PipelineStepResult`; see `skills/nova/pipeline/runners/module-runner/attempt.ts:118-180`. Gate runner itself is typed, but Buster/review/approval gate terminal builders still accept domain result flags and reason strings before constructing typed control results; see `skills/nova/pipeline/runners/gate-runner.ts:54-107` and `skills/nova/pipeline/runners/buster-gate-terminal.ts:91-475`.

6. Buster task and suite authority

   Buster task payload validation is strict and requires task, run, dispatch, output, timeout, and session identity; see `skills/buster/pipeline/services/task-validation.ts:115-199`. The task queue guarantees terminal completion or dead-letter before ACK; see `skills/buster/pipeline/services/task-queue.ts:218-310`. Suite runner uses a static suite registry, validates suite names, requires `test_config.suite_timeout_ms`, and emits explicit `SKIP` verdicts for dependency skips; see `skills/buster/pipeline/runners/suite-runner.ts:159-248` and `skills/buster/pipeline/runners/suite-runner.ts:477-485`.

7. Verification policy authority

   Verification already guards many simplifications: no dynamic suite imports, no unknown-suite fallback, no suite timeout fallback, no `status_json_path`, no `buster_capabilities` alias, no Buster output shell writers, and no child-agent `status.json` mutation instructions. See `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:99-118`, `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:230-259`, and `tests/verification/contracts/check-session-authority-slice-surface.mjs:34-60`.

## Findings by batch

### Batch 0: Architecture and policy map

Finding 0.1: Keep strict config and narrow entrypoints.

- Current behavior: `skills/nova/pipeline/index.ts:1-7` exposes a small public API. Config validation rejects missing policy and obsolete config shapes in `skills/nova/pipeline/core/config.ts:90-327`.
- Risk/complexity: The May plan's concern about permissive plugin/config defaults is mostly stale. Broadening this surface would create new hidden policy paths.
- Proposed change: No deletion here. Preserve the strict loader, unknown-field rejection, explicit Buster Redis config, and no `config.models`.
- Blast radius: All Nova startup and deployment rendering.
- Verification needed: `tests/verification/runtime/check-nova-startup-smoke.mjs`, config contract tests, and full fast verification.

Finding 0.2: Treat status-store legacy-shaped module projection as a phased compatibility surface, not runtime authority.

- Current behavior: `buildStatusFromLifecycleModule` still returns a legacy-shaped module status object from lifecycle read models and defaults several display fields, including `status: lifecycleModule.status || 'PENDING'`; see `skills/nova/pipeline/services/status-store.ts:118-165`.
- Risk/complexity: Deleting it directly would break callers that still expect status-shaped objects. Keeping it forever hides lifecycle authority behind legacy field names.
- Proposed change: Phase consumers to read lifecycle/read-model objects directly, then shrink the projection to display-only fields. Do not let this projection become write authority.
- Blast radius: Module scheduling, recovery, operator status display, and any tests reading status JSON shape.
- Verification needed: session authority contract, lifecycle read-model replay, module status/read-model behavior checks.

Finding 0.3: Keep lifecycle guards and active-session diagnostic policy.

- Current behavior: guarded lifecycle fields are protected in `skills/nova/pipeline/services/status-store.ts:172-260`; session authority disallows status/file/tracked authority in `skills/nova/pipeline/services/session-authority.ts:108-166`; gate active-session recovery also rejects non-lifecycle authority in `skills/nova/pipeline/services/gate-active-session.ts:157-209`.
- Risk/complexity: These guardrails are intentionally verbose but remove ambiguity around session ownership.
- Proposed change: Keep. Simplify surrounding callers only when tests prove no weak evidence path can write lifecycle state.
- Blast radius: Active session recovery, rate-limit cooldown resumption, gate cleanup, orphan recovery.
- Verification needed: `tests/verification/contracts/check-session-authority-slice-surface.mjs` and lifecycle audit tests.

### Batch 1: Typed contracts/result authority

Finding 1.1: Remove module-attempt legacy result fallback after producers emit typed terminal results.

- Current behavior: `moduleTerminalOutcomeForResult` converts legacy `outcome_class`, status fields, timeout booleans, and rate-limit booleans into typed outcomes; see `skills/nova/pipeline/runners/module-runner/attempt.ts:118-134`. `buildTypedModuleAttemptResult` then copies reason/status/diagnostics/correlation from raw result aliases; see `skills/nova/pipeline/runners/module-runner/attempt.ts:142-180`.
- Risk/complexity: This adapter is now the main silent fallback from legacy result shapes into typed results. It can mask producer contract regressions.
- Proposed change: First convert every module runner terminal producer to call typed terminal builders. Then make `attempt.ts` accept only `PipelineStepResult` or throw a contract error.
- Blast radius: Forge, pre-Buster, Buster phase, retry/block/error terminal handling.
- Verification needed: `check-pipeline-step-result` style contract tests, module runner behavior tests, rate-limit terminal tests, full fast verification.

Finding 1.2: Make terminal decision action/scope explicit.

- Current behavior: `buildPipelineTerminalDecision` defaults `action` from status and defaults `scope` to `pipeline`; see `skills/nova/pipeline/services/contracts/terminal-decision.ts:36-45` and `skills/nova/pipeline/services/contracts/terminal-decision.ts:118-166`.
- Risk/complexity: Default action is deterministic, but it is still hidden policy inside a general builder.
- Proposed change: Require explicit `action` and `scope` in `buildPipelineTerminalDecision`; keep a named helper for the few places that intentionally derive action from status.
- Blast radius: All typed terminal result builders and tests.
- Verification needed: terminal-decision contract tests, pipeline-step-result contract tests, gate/module terminal tests.

Finding 1.3: Collapse rate-limit details to one typed location.

- Current behavior: `pipelineStepRateLimitDetails` scans diagnostics metadata and control-result metadata for rate-limit fields; see `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:269-283`.
- Risk/complexity: Multiple accepted locations make it harder to know which payload owns cooldown/resume details.
- Proposed change: Pick one typed rate-limit details path, update producers, and delete the cross-location fallback.
- Blast radius: Nova session rate-limit handling, Buster gate/module rate-limit terminal results, Discord/telemetry details.
- Verification needed: rate-limit recovery tests, typed contract tests, Discord/rate-limit telemetry snapshot tests.

Finding 1.4: Keep strict gate and worker control coercers.

- Current behavior: gate and worker control coercers reject compatibility result shapes; see `skills/nova/pipeline/services/contracts/gate-control-result.ts:174-177` and `skills/nova/pipeline/services/contracts/worker-control-result.ts:71-109`.
- Risk/complexity: None worth simplifying. These are the correct contract boundary.
- Proposed change: Keep.
- Blast radius: Gate adapters, worker adapters.
- Verification needed: existing contract suite.

### Batch 2: Module runner stack

Finding 2.1: Replace raw module terminal envelopes with typed terminal builders.

- Current behavior: `module-runner/terminal-results.ts` has a typed pass builder at `skills/nova/pipeline/runners/module-runner/terminal-results.ts:31-52`, but blocked terminals still return raw `outcome_class` envelopes at `skills/nova/pipeline/runners/module-runner/terminal-results.ts:54-69`. State-machine blueprint/unexpected-status paths also return raw envelopes at `skills/nova/pipeline/runners/module-runner/state-machine.ts:75-120`.
- Risk/complexity: Mixed typed/raw producer style keeps the conversion adapter alive and spreads terminal semantics across modules.
- Proposed change: Add typed terminal builders for blocked, blueprint failure, unexpected status, git error, spawn error, validator block, and Buster failure classes. Convert producers one phase at a time.
- Blast radius: Module retry loop, lifecycle status persistence, operator terminal summaries.
- Verification needed: module-runner behavior tests, terminal result contract tests, full fast verification.

Finding 2.2: Convert Forge terminal producers before deleting the adapter.

- Current behavior: Forge runner still returns raw terminal objects for prompt error, worker execution failure, spawn failure, git error, blocked completion, unexpected completion, durable git failure, and pass; see representative refs `skills/nova/pipeline/runners/module-runner-forge.ts:161-177`, `skills/nova/pipeline/runners/module-runner-forge.ts:291-304`, `skills/nova/pipeline/runners/module-runner-forge.ts:474-490`, and `skills/nova/pipeline/runners/module-runner-forge.ts:597-664`.
- Risk/complexity: This is the biggest producer set, so doing it in one patch would be noisy.
- Proposed change: Introduce Forge-local typed terminal helpers, convert terminal returns, then assert the returned value validates as `PipelineStepResult`.
- Blast radius: Forge session spawn, Forge completion parsing, no-work handling, durable git handling.
- Verification needed: Forge module runner tests, no-work/gate-fix behavior tests, lifecycle write guards.

Finding 2.3: Convert pre-Buster and Buster phase terminal producers.

- Current behavior: pre-Buster validator blocks and git sync failures return raw envelopes at `skills/nova/pipeline/runners/module-runner-prebuster.ts:103-115` and `skills/nova/pipeline/runners/module-runner-prebuster.ts:239-278`. Buster terminal failures return raw envelopes in `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:63-72`, `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:132-140`, `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:193-204`, and `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:248-258`.
- Risk/complexity: These are narrower than Forge and can be converted earlier.
- Proposed change: Make these builders return `PipelineStepResult` directly, using the existing explicit Buster failure-class checks.
- Blast radius: Buster module retry/block/failure behavior.
- Verification needed: Buster module terminal tests, task completion tests, full fast verification.

Finding 2.4: Remove duplicate worker-control metadata accessors.

- Current behavior: `workerMetadata`, `workerTypedMetadata`, `workerTypedWorker`, and related helpers are duplicated in Forge and Buster phase; see `skills/nova/pipeline/runners/module-runner-forge.ts:69-97` and `skills/nova/pipeline/runners/module-runner/buster-phase.ts:23-51`.
- Risk/complexity: Low. Duplication can drift in how typed worker metadata is read.
- Proposed change: Move common typed-worker accessors into a small shared helper under `module-runner/`.
- Blast radius: Forge and Buster phase only.
- Verification needed: Type/build checks and module runner tests.

Finding 2.5: Remove hidden Buster crash retry fallback or make it explicit config policy.

- Current behavior: Buster phase uses `mod.max_buster_crash_retries ?? config.max_buster_crash_retries ?? BUSTER_CRASH_RETRY_POLICY_MAX_RETRIES`; see `skills/nova/pipeline/runners/module-runner/buster-phase.ts:21` and `skills/nova/pipeline/runners/module-runner/buster-phase.ts:84`.
- Risk/complexity: A hardcoded retry default is hidden runtime policy if platform config omits it.
- Proposed change: Require `config.max_buster_crash_retries` in `loadConfig`, or move the value into a clearly named platform default validated during config load.
- Blast radius: Buster crash retry behavior.
- Verification needed: config validation tests, Buster crash retry tests.

Finding 2.6: Normalize Forge no-work reasons to one canonical token.

- Current behavior: Forge no-work handling accepts three no-work reason synonyms; see `skills/nova/pipeline/runners/module-runner-forge.ts:383-388`.
- Risk/complexity: Multiple equivalent tokens make downstream analytics and terminal summaries noisier.
- Proposed change: Normalize at the worker-control boundary and keep one canonical reason in module runner code.
- Blast radius: Forge no-work path and tests that assert reason strings.
- Verification needed: worker control contract tests and Forge no-work behavior tests.

### Batch 3: Gate/review/approval runners

Finding 3.1: Keep gate runner adapter strictness.

- Current behavior: `gate-runner.ts` builds typed `PipelineStepResult` from typed gate control, maps runtime errors explicitly, requires explicit run/gate/stage input, and requires a valid adapter contract; see `skills/nova/pipeline/runners/gate-runner.ts:54-107`, `skills/nova/pipeline/runners/gate-runner.ts:163-205`, and `skills/nova/pipeline/runners/gate-runner.ts:217-239`.
- Risk/complexity: This is the desired authority boundary.
- Proposed change: Keep. Simplify only the upstream domain-result adapters.
- Blast radius: All gate execution.
- Verification needed: gate runner contract and behavior tests.

Finding 3.2: Replace Buster gate domain-result string switches with a typed gate evaluation result.

- Current behavior: Buster gate terminal logic maps domain result fields and reason strings such as `config_invalid`, `spawn_failed`, `invalid_contract`, `parse_corrupted`, `timeout`, `git_error`, and `rate_limit_exhausted` into typed gate control results; see `skills/nova/pipeline/runners/buster-gate-terminal.ts:60-62`, `skills/nova/pipeline/runners/buster-gate-terminal.ts:91-100`, `skills/nova/pipeline/runners/buster-gate-terminal.ts:103-358`, `skills/nova/pipeline/runners/buster-gate-terminal.ts:360-399`, and `skills/nova/pipeline/runners/buster-gate-terminal.ts:401-475`.
- Risk/complexity: The terminal layer still accepts legacy-looking flags like `passed`, `outcome_class`, and domain `status`.
- Proposed change: Introduce a typed `BusterGateEvaluationResult` before terminal mapping. The terminal builder should accept only that typed shape.
- Blast radius: Buster gate pass/fail/fix/block/rate-limit outcomes.
- Verification needed: Buster gate terminal tests, gate control contract tests, end-to-end gate behavior.

Finding 3.3: Remove pass-detection fallback forms from review and approval gate controls.

- Current behavior: review pass detection accepts `passed === true`, `outcome_class === 'passed'`, or `status === PASS`; see `skills/nova/pipeline/runners/review-gate-control.ts:101-105`. Approval pass detection accepts `passed`, `outcome_class`, approved status, or timed-out continue policy; see `skills/nova/pipeline/runners/approval-gate-control.ts:95-100`.
- Risk/complexity: These helpers preserve old domain result forms at a typed control boundary.
- Proposed change: Canonicalize review/approval domain results before control builders, then make pass detection accept one canonical status/decision.
- Blast radius: Review gate, approval gate, timeout-continue policy.
- Verification needed: review/approval gate control contract tests, approval timeout behavior tests.

Finding 3.4: Make review failure-class mapping exhaustive.

- Current behavior: review failure classes are registered in `skills/nova/pipeline/runners/review-gate-control.ts:19-26`, but decision mapping still has a generic unknown fallback at `skills/nova/pipeline/runners/review-gate-control.ts:53-67`.
- Risk/complexity: The explicit class registry and generic fallback can drift.
- Proposed change: Replace generic fallback with an exhaustive switch over registered failure classes. Unknown class should be a contract error before decision mapping.
- Blast radius: Review gate failure summaries and issue types.
- Verification needed: review-gate failure-class tests.

### Batch 4: Session/runtime/rate-limit authority

Finding 4.1: Make session spawn/kill/wait defaults explicit platform policy.

- Current behavior: common lifecycle spawn requires explicit session runtime/model/agent/cwd/label, but still defaults retry and transport fields (`maxRetries`, `retryDelayMs`, `thread`, `mode`, `cleanup`, `streamTo`) in `skills/common/pipeline/agents/lifecycle.ts:283-361`. Kill/session cleanup uses timeout defaults in `skills/common/pipeline/agents/lifecycle.ts:390-497`. `waitForSessionIdle` still supports old numeric arguments and defaults timeout/grace values in `skills/common/pipeline/agents/acp-monitor.ts:586-596`.
- Risk/complexity: The model/runtime identity is explicit, but session behavior still has hidden defaults.
- Proposed change: Move these values into a named session runtime policy loaded from platform config, or require callers to pass them. Remove numeric `waitForSessionIdle` compatibility signature after callers converge on object options.
- Blast radius: ACP/subagent spawn, kill, cleanup, rate-limit recovery, monitor idle detection.
- Verification needed: session launch smoke tests, ACP local verification, runtime monitor tests.

Finding 4.2: Remove ACP monitor dual call shape after callers converge.

- Current behavior: `getAcpMonitorState` accepts both Nova-style `(config, sessionLabelOrKey, ...)` and direct `(childSessionKey, streamLogPath, prev, opts)` signatures; see `skills/common/pipeline/agents/acp-monitor.ts:384-405`.
- Risk/complexity: This compatibility branch makes monitor authority harder to audit and forces session-key guessing through `looksLikeSessionKey`.
- Proposed change: Move to one object-shaped API with explicit session key, stream log path, config, and gateway options.
- Blast radius: Nova monitor adapter, Buster rate-limit liveness probe, session idle waits.
- Verification needed: ACP monitor unit tests, Buster rate-limit recovery tests, session launch smoke.

Finding 4.3: Delete default session rate-limit exhausted-result builders after call sites provide typed builders.

- Current behavior: Nova rate-limit service has default exhausted-result builders at `skills/nova/pipeline/services/rate-limit.ts:32-80`; monitor/result wrappers fall back to them at `skills/nova/pipeline/services/rate-limit.ts:212-252` and `skills/nova/pipeline/services/rate-limit.ts:447-513`.
- Risk/complexity: Callers can omit the explicit terminal result shape for rate-limit exhaustion.
- Proposed change: Require `buildExhaustedResult` or `exhaustedResultOptions` at all callers, then delete the defaults.
- Blast radius: Module/gate/session rate-limit terminal handling and Discord/telemetry summaries.
- Verification needed: Nova rate-limit tests, module/gate rate-limit terminal contract tests.

Finding 4.4: Keep gateway URL/token fail-closed behavior.

- Current behavior: gateway base URL and token resolution require explicit env/override, while gateway invocation has named timeout/retry policies; see `skills/common/pipeline/integrations/gateway.ts:13-21`, `skills/common/pipeline/integrations/gateway.ts:62-100`, and `skills/common/pipeline/integrations/gateway.ts:273-315`.
- Risk/complexity: The named policies are not legacy result fallbacks. Removing them without a config replacement would reduce reliability.
- Proposed change: Keep current behavior unless platform config is extended to own gateway invocation policy.
- Blast radius: All ACP gateway operations.
- Verification needed: gateway contract tests and ACP launch smoke.

Finding 4.5: Preserve Buster-owned canonical rate-limit telemetry.

- Current behavior: Buster rate-limit state requires explicit numeric config; see `skills/buster/pipeline/services/rate-limit.ts:84-101`. Buster-owned cooldown sleeps emit canonical rate-limit telemetry by default through `ownsCanonicalSignal = true`; see `skills/buster/pipeline/services/rate-limit.ts:261-339`.
- Risk/complexity: This default is intentionally asserted by verification, not an obsolete compatibility fallback.
- Proposed change: Keep. Do not suppress gate-test Buster-owned pause telemetry.
- Blast radius: Buster operator visibility during cooldowns.
- Verification needed: `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:200-213`.

### Batch 5: Telemetry/Discord/operator surfaces

Finding 5.1: Replace Discord rendered-field correlation extraction with structured correlation input.

- Current behavior: Discord identity fields attach a non-enumerable `correlation_key`; see `skills/nova/pipeline/services/discord-fields-contract.ts:126-146`. The Discord integration later scans embed fields to recover correlation; see `skills/common/pipeline/integrations/discord.ts:44-63`, `skills/common/pipeline/integrations/discord.ts:184-229`, and `skills/common/pipeline/integrations/discord.ts:264-274`.
- Risk/complexity: Correlation authority is hidden in presentation data. It works, but it is harder to reason about than structured options.
- Proposed change: Require callers to pass `opts.correlation` or `opts.correlations` explicitly. Keep field rendering for display only, then delete field scanning and the non-enumerable marker.
- Blast radius: Discord audit log correlation, operator replay bundles, alert dedupe.
- Verification needed: Discord audit/correlation tests, operator replay/audit verification.

Finding 5.2: Keep local-first operator evidence and degraded/restored reporting.

- Current behavior: Discord audit writes before delivery and emits degraded/restored incidents on failures and recovery; see `skills/common/pipeline/integrations/discord.ts:120-229`. The telemetry facade documents local-first operator evidence; see `skills/nova/pipeline/services/telemetry.ts:1-10`.
- Risk/complexity: This is reliability behavior, not removable code debt.
- Proposed change: Keep.
- Blast radius: Operator alert evidence and replay.
- Verification needed: Discord integration tests and telemetry contract tests.

Finding 5.3: Keep `plugin.event` fallback for unpromoted observability hooks.

- Current behavior: the agent observability mapper maps unpromoted/hook-mismatched events to canonical `plugin.event`; see `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts:108-125`, `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts:337-369`, and `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts:371-383`.
- Risk/complexity: This is a typed canonical fallback, not a legacy event-name fallback. Removing it would drop valid plugin telemetry.
- Proposed change: Keep, but add/keep tests that unregistered plugin-specific event names are not emitted.
- Blast radius: Agent observability ingestion, plugin telemetry, operator timelines.
- Verification needed: telemetry contract tests and agent observability mapper tests.

### Batch 6: Buster runtime/suite surface

Finding 6.1: Make Buster runtime heartbeat and stream defaults explicit policy.

- Current behavior: Buster runtime loop has a named backoff policy, but heartbeat path/interval default from env-or-constant; see `skills/buster/buster-pipeline.ts:92-97`. Task queue defaults `AGENT_NAME`, stream key, poll interval, stream max length, and pending reclaim idle; see `skills/buster/pipeline/services/task-queue.ts:20-28`.
- Risk/complexity: These operational defaults are convenient, but they are hidden runtime behavior unless deployment config owns them.
- Proposed change: Move these into one `BUSTER_RUNTIME_POLICY`/config boundary or validate env/config at startup. If local defaults are retained, document them as explicit local runtime policy.
- Blast radius: Buster deployment startup, Redis stream naming, liveness probes.
- Verification needed: Buster startup smoke, deployment truth checks, task queue contract tests.

Finding 6.2: Delete unreachable suite artifact `unknown` fallback.

- Current behavior: `requireSuiteIdentity` fails if module/project identity is missing; see `skills/buster/pipeline/runners/suite-runner.ts:301-314`. `safeArtifactSegment` still defaults missing identity to `unknown`; see `skills/buster/pipeline/runners/suite-runner.ts:316-324`.
- Risk/complexity: The fallback is now defensive clutter and conflicts with the no-hidden-identity policy.
- Proposed change: Remove the fallback parameter and make `safeArtifactSegment` require a non-empty string, or inline sanitized `moduleId` after `requireSuiteIdentity`.
- Blast radius: Suite artifact directory naming only.
- Verification needed: Buster suite runner contract tests, especially `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:107-108`.

Finding 6.3: Fail explicitly when `payload.test_config` is not an object.

- Current behavior: `runSuites` converts a non-record `payload.test_config` to `{}`, then `resolveSuiteTimeoutMs` fails as missing `test_config.suite_timeout_ms`; see `skills/buster/pipeline/runners/suite-runner.ts:428-434` and `skills/buster/pipeline/runners/suite-runner.ts:230-247`.
- Risk/complexity: The current behavior fails closed, but the diagnostic points at a missing timeout instead of invalid `test_config`.
- Proposed change: Add an explicit `invalid_test_config_shape` validation error before timeout resolution.
- Blast radius: Buster task validation diagnostics and tests that assert exact reason strings.
- Verification needed: Buster suite runner validation tests.

Finding 6.4: Keep static suite registry, explicit suite timeout, and dependency SKIP verdicts.

- Current behavior: suite registry is static and unknown suites fail; see `skills/buster/pipeline/runners/suite-runner.ts:159-224`. Suite timeout is required; see `skills/buster/pipeline/runners/suite-runner.ts:230-247`. Dependency skips are emitted as explicit `STATUS.SKIP` verdicts with reasons; see `skills/buster/pipeline/runners/suite-runner.ts:477-485`.
- Risk/complexity: These are reliability policies. Dependency skip behavior is not silent because it produces a verdict.
- Proposed change: Keep.
- Blast radius: Buster suite execution and operator test summaries.
- Verification needed: Buster pipeline slice contract and suite runner behavior tests.

Finding 6.5: Keep task terminal-before-ACK guarantee.

- Current behavior: task queue ACKs only after `ensureTaskTerminalBeforeAck` succeeds or malformed tasks are dead-lettered; see `skills/buster/pipeline/services/task-queue.ts:218-310`.
- Risk/complexity: This code is not minimal, but it prevents invisible task loss.
- Proposed change: Keep.
- Blast radius: Redis task reliability and replay.
- Verification needed: task queue/transport contract tests.

### Batch 7: Docs, verification, and dead policy references

Finding 7.1: Update stale Buster README suite-order text.

- Current behavior: README says suites run in payload order; see `skills/buster/README.md:97-103`. Actual runner sorts requested suites by `EXECUTION_ORDER`; see `skills/buster/pipeline/runners/suite-runner.ts:293-299`.
- Risk/complexity: Operators may think payload order controls execution when code normalizes order.
- Proposed change: Change README to say payload selects the suites and runner executes them in canonical dependency order.
- Blast radius: Docs only.
- Verification needed: docs review; no runtime tests.

Finding 7.2: Update stale Buster README criticality text.

- Current behavior: README says only build and manifest are critical by default; see `skills/buster/README.md:121`. Runtime catch path marks thrown `build` and `health` suite errors critical; see `skills/buster/pipeline/runners/suite-runner.ts:515-522`. Dependency policy also makes many suites depend on `health`; see `skills/buster/README.md:105-119` and `skills/buster/pipeline/runners/suite-runner.ts:477-485`.
- Risk/complexity: Docs understate health as a critical dependency in thrown-error paths.
- Proposed change: Clarify that explicit suite verdicts may set criticality, thrown `build` and `health` errors are critical, and dependency skips are explicit `SKIP` verdicts.
- Blast radius: Docs only.
- Verification needed: docs review.

Finding 7.3: Update Buster README `AGENT_NAME` default.

- Current behavior: README lists `AGENT_NAME` default as `unknown`; see `skills/buster/README.md:171`. Code defaults `AGENT_NAME` to `buster`; see `skills/buster/pipeline/services/task-queue.ts:20`.
- Risk/complexity: Operational docs do not match Redis consumer naming.
- Proposed change: Update README default to `buster`.
- Blast radius: Docs only.
- Verification needed: docs review.

Finding 7.4: Preserve verification guardrails that already encode simplification policy.

- Current behavior: verification asserts no dynamic suite imports, no suite dependency fallback, no suite timeout fallback, no legacy task aliases, no status JSON side channels, and no shell-writer helpers; see `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:99-118` and `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:230-259`. Verification docs define canonical `tests/verification` ownership and bounded compatibility entrypoints; see `tests/verification/README.md:112-137`.
- Risk/complexity: Removing these tests would make it easier to regress into the old compatibility model.
- Proposed change: Keep and extend these tests when implementing the findings above.
- Blast radius: CI/verification only.
- Verification needed: full verification suite.

## High-confidence deletion and simplification candidates

1. Convert `buildBlockedTerminalResult` and state-machine terminal envelopes to typed terminal builders, then delete their raw result shapes. Refs: `skills/nova/pipeline/runners/module-runner/terminal-results.ts:54-69`, `skills/nova/pipeline/runners/module-runner/state-machine.ts:75-120`.
2. Convert pre-Buster and Buster terminal failure builders to typed `PipelineStepResult` producers. Refs: `skills/nova/pipeline/runners/module-runner-prebuster.ts:103-115`, `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:63-258`.
3. Share duplicated typed-worker metadata accessors. Refs: `skills/nova/pipeline/runners/module-runner-forge.ts:69-97`, `skills/nova/pipeline/runners/module-runner/buster-phase.ts:23-51`.
4. Remove `safeArtifactSegment` fallback after explicit suite identity validation. Refs: `skills/buster/pipeline/runners/suite-runner.ts:301-324`.
5. Add explicit invalid `test_config` shape diagnostics instead of converting non-record `test_config` to `{}`. Refs: `skills/buster/pipeline/runners/suite-runner.ts:428-434`.
6. Fix Buster README stale docs for suite order, criticality, and `AGENT_NAME`. Refs: `skills/buster/README.md:97-121`, `skills/buster/README.md:171`.

## Default fallback removals to prioritize

1. `config.max_buster_crash_retries` fallback to hardcoded `BUSTER_CRASH_RETRY_POLICY_MAX_RETRIES`: require config or named validated platform policy. Ref: `skills/nova/pipeline/runners/module-runner/buster-phase.ts:21-84`.
2. `buildPipelineTerminalDecision` action/scope defaults: require explicit terminal action/scope or use an intentionally named helper. Ref: `skills/nova/pipeline/services/contracts/terminal-decision.ts:36-166`.
3. Nova session rate-limit default exhausted-result builders: require explicit caller-provided typed exhausted result. Refs: `skills/nova/pipeline/services/rate-limit.ts:32-80`, `skills/nova/pipeline/services/rate-limit.ts:212-252`, `skills/nova/pipeline/services/rate-limit.ts:447-513`.
4. Session spawn/kill/wait default options: move to explicit config/session policy or require callers to pass them. Refs: `skills/common/pipeline/agents/lifecycle.ts:283-361`, `skills/common/pipeline/agents/lifecycle.ts:390-497`, `skills/common/pipeline/agents/acp-monitor.ts:586-596`.
5. Buster heartbeat/task queue operational env defaults: either validate startup config or document as explicit runtime policy. Refs: `skills/buster/buster-pipeline.ts:92-97`, `skills/buster/pipeline/services/task-queue.ts:20-28`.

## Risky phased changes

1. Delete module-attempt legacy fallback conversion only after every producer returns `PipelineStepResult`. Ref: `skills/nova/pipeline/runners/module-runner/attempt.ts:118-180`.
2. Shrink status-store legacy-shaped projections only after callers consume lifecycle/read-model objects directly. Ref: `skills/nova/pipeline/services/status-store.ts:118-165`.
3. Replace Buster gate domain-result switch with typed `BusterGateEvaluationResult` only after upstream Buster gate producers are canonical. Ref: `skills/nova/pipeline/runners/buster-gate-terminal.ts:91-475`.
4. Remove review/approval pass fallback forms only after result producers canonicalize pass/timeout policy shape. Refs: `skills/nova/pipeline/runners/review-gate-control.ts:101-105`, `skills/nova/pipeline/runners/approval-gate-control.ts:95-100`.
5. Remove Discord field-scanning correlation only after all callers pass structured correlation options. Refs: `skills/nova/pipeline/services/discord-fields-contract.ts:126-146`, `skills/common/pipeline/integrations/discord.ts:44-63`.
6. Remove ACP monitor dual signature only after Nova and Buster callers use one explicit object-shaped call. Ref: `skills/common/pipeline/agents/acp-monitor.ts:384-405`.

## Things that should stay

1. Strict config validation and rejection of obsolete config fields. Ref: `skills/nova/pipeline/core/config.ts:90-327`.
2. Typed gate/worker control result coercers rejecting compatibility shapes. Refs: `skills/nova/pipeline/services/contracts/gate-control-result.ts:174-177`, `skills/nova/pipeline/services/contracts/worker-control-result.ts:71-109`.
3. Lifecycle/read-model active-session authority and diagnostic-only status/file evidence. Refs: `skills/nova/pipeline/services/session-authority.ts:1-12`, `skills/nova/pipeline/services/gate-active-session.ts:157-209`.
4. Status-store lifecycle guarded fields. Ref: `skills/nova/pipeline/services/status-store.ts:172-260`.
5. Gateway URL/token fail-closed behavior. Ref: `skills/common/pipeline/integrations/gateway.ts:62-100`.
6. Buster task payload validation and terminal-before-ACK guarantee. Refs: `skills/buster/pipeline/services/task-validation.ts:115-199`, `skills/buster/pipeline/services/task-queue.ts:218-310`.
7. Static Buster suite registry, explicit suite timeout, dependency `SKIP` verdicts, and nonblocking observability artifact writes. Refs: `skills/buster/pipeline/runners/suite-runner.ts:159-248`, `skills/buster/pipeline/runners/suite-runner.ts:326-365`, `skills/buster/pipeline/runners/suite-runner.ts:477-485`.
8. Local-first Discord/operator evidence and degraded/restored reporting. Ref: `skills/common/pipeline/integrations/discord.ts:120-229`.
9. Canonical `plugin.event` fallback for unpromoted observability hooks. Ref: `skills/nova/pipeline/services/agent-observability-ingester/mapper.ts:108-125`.
10. Verification guards that prevent JS/shell-writer, legacy status, dynamic suite loading, and fallback-policy regressions. Refs: `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:99-118`, `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:230-259`.

## Recommended implementation sequence

1. Documentation-only cleanup

   Update `skills/buster/README.md` suite order, criticality, and `AGENT_NAME` default. This has no runtime blast radius and removes stale operator guidance.

2. Small Buster suite simplifications

   Remove unreachable `safeArtifactSegment` fallback and add explicit invalid `test_config` shape diagnostics. Extend the Buster pipeline slice test if needed.

3. Module terminal producer conversion, narrow phases first

   Convert pre-Buster and Buster phase terminal builders to typed `PipelineStepResult` producers. Keep `attempt.ts` adapter in place temporarily as a safety net.

4. Forge terminal producer conversion

   Convert Forge raw terminal returns to typed terminal builders and normalize no-work reasons.

5. Delete module-attempt fallback adapter

   Once all producers validate as typed, remove `outcome_class`/status/boolean fallback conversion from `module-runner/attempt.ts`.

6. Gate terminal typed result cleanup

   Introduce typed Buster/review/approval domain evaluation results, then remove `passed`/`outcome_class`/status fallback pass detection from control builders.

7. Explicit policy defaults

   Move crash retry, session spawn/kill/wait defaults, rate-limit exhausted-result builders, and Buster runtime env defaults into explicit config/policy boundaries. This should happen after terminal result cleanup so failures remain easy to diagnose.

8. Operator surface cleanup

   Add structured Discord correlation options at all call sites, then delete field-scanning correlation recovery and the non-enumerable field marker.

9. Read-model projection shrink

   After callers are updated, reduce legacy-shaped status projections to display-only compatibility or delete them if no callers remain.

## Verification matrix

| Area | Minimum verification after implementation |
|---|---|
| Buster docs only | Docs review; no runtime verification required |
| Buster suite runner simplification | `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`; suite runner behavior tests |
| Typed module terminal producers | Pipeline step result contract tests; module runner behavior tests; `tests/verification/run-fast-verification.sh` |
| Forge terminal conversion | Forge worker/control tests; module runner behavior tests; lifecycle guard tests |
| Buster phase terminal conversion | Buster task lifecycle/completion tests; Buster pipeline slice contract |
| Gate terminal typed cleanup | Gate control contract tests; Buster/review/approval gate behavior tests |
| Session/runtime default cleanup | `tests/verification/runtime/check-subagent-launch.mjs`; `tests/verification/run-local-acp-verification.sh` for ACP-local changes; monitor/rate-limit tests |
| Rate-limit exhausted-result cleanup | Nova and Buster rate-limit tests; Discord/telemetry snapshot checks |
| Discord correlation cleanup | Discord audit/correlation tests; telemetry contract tests; operator replay checks |
| Lifecycle/read-model projection cleanup | `node tests/verification/contracts/check-session-authority-slice-surface.mjs`; lifecycle replay/read-model tests |
| Full release confidence | `tests/verification/run-full-verification.sh`; deployment truth checks if config/deployment policy changed |

## Open questions

1. Should `max_buster_crash_retries` be required in platform config, or should a named platform default be rendered into config by deployment tooling?
2. Should Buster heartbeat path/interval and Redis stream/poll defaults become required deployment config, or remain documented local runtime policy?
3. Which callers still require legacy-shaped module status from `buildStatusFromLifecycleModule`, and can they consume lifecycle/read-model objects directly?
4. Should terminal decision `scope` ever be something other than `pipeline`, and if so should each producer own that policy explicitly?
5. Which typed location should own rate-limit details: `diagnostics.metadata.rateLimit`, terminal decision metadata, or a dedicated top-level terminal detail object?
6. Can Discord correlation be made mandatory for all pipeline-owned sends, with diagnostic-only sends explicitly marked as uncorrelated?
7. Is `plugin.event` fallback intended for every unpromoted observability hook, or should hook mismatch become a degraded diagnostic while preserving only truly generic plugin events?
8. Should `payload.test_config` shape validation live in Buster task payload validation instead of suite runner validation?

## Batch coverage confirmation

All requested batches were reviewed:

- 0. Architecture/policy map: reviewed.
- 1. Typed contracts/result authority: reviewed.
- 2. Module runner stack: reviewed.
- 3. Gate/review/approval runners: reviewed.
- 4. Session/runtime/rate-limit authority: reviewed.
- 5. Telemetry/Discord/operator surfaces: reviewed.
- 6. Buster runtime/suite surface: reviewed.
- 7. Docs/verification/dead policy references: reviewed.

No exclusions.

## Handoff goal: canonical pipeline cleanup

Goal: run through every remaining pipeline simplification point and leave one canonical implementation path per pipeline function. Remove legacy fallbacks, compatibility branches, mixed-version behavior, and silent default paths instead of preserving them. Every retained branch must be an explicit canonical policy path, a fail-closed validation path, or a current test/verification guard.

Autoreview requirement: run Autoreview with `gpt-5.5` and high thinking.

Execution rules:

1. Fix one point at a time, or one tightly coupled group when the code proves they cannot be separated cleanly.
2. After each fix, run focused tests for the touched surface and run Autoreview on the diff with `gpt-5.5` high thinking.
3. If Autoreview finds issues, fix them before moving to the next point unless the issue is explicitly rejected as incompatible with the no-legacy goal.
4. Run full verification after every 8 completed fixes. If verification fails because the verification surface is stale, update the verification to match the canonical runtime behavior and rerun it.
5. After all points are done, run final Autoreview with `gpt-5.5` high thinking, then run full verification and fast verification.
6. Do not add compatibility shims, migration fallbacks, mixed-version support, hidden defaults, or legacy adapters. Pre-release means incompatible cleanup is allowed when it produces one clean canonical path.
7. Dead-lettering invalid new payloads is allowed and expected. Reinterpreting old payloads is not.

Deletion gate: before deleting any function, adapter, fallback, projection, or default builder, make an inventory of all callers and behavior paths. If the target is still the main implementation for any path, first choose and implement the canonical replacement, migrate callers, and add or update proof tests. Deletion is only allowed after the inventory proves the legacy/fallback behavior is no longer reachable and no caller depends on it as the primary implementation.

Total remaining points in this handoff: 25.

### P0: Lifecycle status projection removal

1. Complete the final lifecycle status projection migration: inventory every runtime caller that still depends on `loadStatus()` returning the legacy-shaped projection from `buildStatusFromLifecycleModule`, identify whether `buildStatusFromLifecycleModule` is still the main implementation anywhere, choose the canonical lifecycle/read-model replacement for each caller, migrate polling, scheduling, recovery, rate-limit, and module-runner paths, prove fallback/legacy projection behavior is no longer reachable, delete `buildStatusFromLifecycleModule` only after that proof exists, and update or remove verification that still asserts the legacy projection exists.

### P1: Highest-value simplification

2. Convert module terminal producers to typed `PipelineStepResult`.
3. Convert pre-Buster terminal producers to typed `PipelineStepResult`.
4. Convert Buster phase terminal producers to typed `PipelineStepResult`.
5. Convert Forge terminal producers to typed `PipelineStepResult`.
6. Delete the module-attempt legacy fallback adapter after all producers are typed.
7. Make terminal decision `action` and `scope` explicit everywhere they are produced.
8. Collapse rate-limit details into one typed authority location.
9. Phase status-store legacy projection consumers toward lifecycle/read-model objects, then remove remaining legacy projection behavior.

### P2: Runtime policy and hidden defaults

10. Make Buster crash retry policy explicit in platform config.
11. Make Buster heartbeat and queue runtime defaults explicit config or documented local policy, with no hidden runtime fallback.
12. Make session spawn, kill, and wait defaults explicit policy.
13. Remove ACP monitor dual call shape after callers converge.
14. Delete default session rate-limit exhausted-result builders after callers provide typed builders.

### P3: Gate, review, and approval cleanup

15. Replace Buster gate domain-result string switches with typed `BusterGateEvaluationResult`.
16. Remove review pass-detection fallback forms.
17. Remove approval pass-detection fallback forms.
18. Make review failure-class mapping exhaustive.

### P4: Operator and telemetry surface

19. Replace Discord rendered-field correlation extraction with structured correlation input.
20. Keep or strengthen tests ensuring unregistered plugin-specific events do not leak past `plugin.event`.

### P5: Small Buster suite and docs cleanup

21. Remove unreachable Buster suite artifact `unknown` fallback.
22. Add explicit invalid `payload.test_config` shape diagnostics.
23. Update stale Buster README suite-order text.
24. Update stale Buster README criticality text.
25. Update stale Buster README `AGENT_NAME` default.
