# Pipeline Simplification Triage

Source review:
- `docs/reviews2/2026-05-30-pipeline-simplification-review.md`

Control plan:
- `docs/reviews2/2026-05-30-pipeline-simplification-implementation-control.md`

Baseline:
- `docs/reviews2/2026-05-30-pipeline-simplification-baseline.md`

Status: Step 3 triage complete; post-Step-11 completion ledger added.

## Decision Legend

- `delete/simplify`: remove code, shrink fallback surface, collapse duplicate logic, or tighten validation.
- `keep`: preserve because it is policy, authority, reliability-critical, or intentionally nonblocking.
- `open/phased`: keep temporarily until a named migration or proof condition is met.

No product-policy open questions remain. Remaining `open/phased` items are engineering sequencing constraints with deletion criteria.

## Completion Status Legend

- `done`: the intended cleanup has landed and a targeted guard or search can prove the old surface is gone or constrained.
- `keep`: the point is closed by decision; no deletion is expected unless product policy changes.
- `partial`: part of the cleanup landed, but the point is not closed.
- `open`: still an actionable simplification target.
- `phased`: intentionally blocked until the named migration/deletion criterion is met.

## Recheck Addendum

The second pass keeps the aggressive simplification goal, with two constraints: explicit platform defaults stay when they are real policy, and deployment-specific env names should be handled at the deployment/config boundary rather than as hidden runtime fallbacks.

Resolved directions:
- `DISCORD_WEBHOOK` may remain the deployment-provided env variable, but runtime should converge on one canonical config key, `discord_webhook_url`. Deployment/chart glue can map `DISCORD_WEBHOOK` into that key before runtime config validation. The pipeline loader should not silently synthesize missing config from env once deployment docs and fixtures are updated.
- `fallback_model` stays as an explicit platform policy default.
- `default_timeout_minutes` and `default_max_fails` stay as explicit module platform defaults.
- Buster Discord should share the common degraded/restored observability state unless a sandbox-process boundary proves that impossible.
- Empty Buster suite lists should be invalid at task validation, before any agent work.
- Gate adapters should emit only `PASS`, `FAIL`, `WAIT`, and `TIMED_OUT`; adapter/domain details belong in typed metadata or presentation text, not in `gateRunStatus`.
- `config._*` mirrors should be deleted after callers use `PipelineContext` or explicit parameters, and after a guard prevents new mirror reads/writes.
- Active docs guards should forbid `.js` runtime path references under `skills/*` outside archives/historical material.

Additional simplifications from the recheck:
- Split config ingress cleanup into two concrete cuts: remove `progress.pipeline_review` copying if no current runtime caller requires it, and replace `DISCORD_WEBHOOK` loader fallback with deployment-to-config mapping.
- Remove thin pipeline-review/case-study wrappers and hard-coded prompt artifact path fallbacks when direct runtime/path authority is available.
- After empty suites are rejected in Buster task validation, remove permissive defaults such as `validateSuiteNames(suites = [])`; suite lists should be required data, not optional control flow.
- Treat approval/review words such as `APPROVED`, `REJECTED`, `GO`, `NO-GO`, `PENDING_APPROVAL`, and `CANCELLED` as adapter-domain labels only. If they are still useful, keep them in metadata; do not allow them as status vocabulary.
- Keep named code constants only where they are truly platform policy and not operator-tuned. `BUSTER_RUNTIME_LOOP_POLICY.errorBackoffMs` and `/sandbox/results` can stay as named runtime contracts; crash retry count should move to validated config or a named documented policy.
- Make the TypeScript complexity guard staged rather than aspirational. First make it scan real `.ts` runtime files, then ratchet the biggest files down as the simplification PRs land.
- When moving Buster Discord to common observability, also shrink alias-heavy inputs in the same area so the move actually deletes local surface instead of adding an adapter layer.
- For docs cleanup, update stale active docs and then add a guard with a narrow `skills/*...*.js` path regex so generic JavaScript discussion and archived references are not false positives.

## Post-Step-11 Completion Ledger

This ledger records implementation status after Step 11. It does not replace the decision ledger below; it marks which review points are actually closed and which still need PR work.

1. `done` - `resolveModel` wrapper removal. The low-risk deletion pass removed the thin model-resolution compatibility entrypoint.

2. `phased` - runtime config mirror migration/deletion. `syncConfigRuntimeFields` is deleted, `_runtimeOverrides` is PipelineContext-only, duplicated run-log resolver copies and the unused runtime run-log helper are removed, lifecycle and status-store startup use shared run-log initialization, scheduled/lifecycle/runner/operator-alert/Discord/telemetry/Buster/generator/lint/Redis/session-mirror artifacts use canonical helpers where available, cost artifacts use shared path helpers, `PipelineContext.pluginRegistry` is explicit from `loadConfig`, startup config no longer writes `_pluginRegistry`, and logger file writes require explicit context log streams. Explicit `_logDir`/`_runLogDir` writes remain.

3. `done` - config ingress for `pipeline_review` and Discord webhook env fallback. `loadConfig` no longer copies `progress.pipeline_review` or reads `DISCORD_WEBHOOK`; Helm maps the deployment secret into canonical `discord_webhook_url` before runtime config validation.

4. `done` - optional registry lookups. Decision paths use `require*`; unused optional decision lookups were deleted, while listener fan-out remains optional and documented.

5. `keep` - core architecture policy surfaces. No implementation deletion expected.

6. `done` - pipeline step-result outcome inference. Producers now pass explicit outcome into the step-result builder and guards reject reintroducing control-payload inference.

7. `done` - gate status vocabulary. `gateRunStatus` validation rejects aliases and allows only `PASS`, `FAIL`, `WAIT`, and `TIMED_OUT`.

8. `done` - validator mapping bridge. Built-in validators now choose typed `nextAction`/`outcomeClass` before building controls; the shared raw `passed`/`blocked` mapper and producer-type inference are deleted.

9. `done` - pipeline rate-limit exhaustion truth. `pipelineStepRateLimitDetails` now derives `rate_limit_exhausted` only from the typed step outcome while preserving diagnostic rate-limit metadata as details.

10. `keep` - worker control strictness. No implementation deletion expected.

11. `done` - raw module terminal helper cleanup. Raw pass/fail/rate-limit helper builders were deleted; PASS paths now emit typed module step results directly and dependency-check failures no longer use the raw FAIL builder.

12. `done` - hidden ACP agent-id literal fallbacks in the targeted module/Buster dispatch path. The remaining agent-id fallbacks found by search are outside this target and should be reviewed separately before expanding scope.

13. `done` - Buster crash retry literal. The fallback is now a named code policy after existing module/config override points.

14. `done` - poll-result-like reconstruction from typed worker metadata. Forge/Buster routing no longer synthesizes fake poll objects from typed worker metadata; final status and failure class are read as typed worker metadata, while real poll/Redis evidence remains diagnostic input.

15. `done` - duplicated module worker input builders. Step 11 introduced `buildModuleWorkerRunInputBase` and guarded the consolidation.

16. `keep` - explicit module runner platform defaults. `default_timeout_minutes` and `default_max_fails` remain platform policy.

17. `done` - repeated gate runtime-error construction. Step 11 added a shared `buildGateRuntimeErrorControl` path and guarded it.

18. `done` - gate authority snapshots versus diagnostics. `gate-status.json` evidence is now nested under diagnostic state and excluded from canonical prior results.

19. `done` - waitable gate error mutation. Waitable gate failures now return typed `stageStarted` evidence to the gate runner instead of mutating thrown errors with `gateStageStarted`.

20. `done` - typed gate fix-cycle message builders. The shared gate fix-cycle now requires adapter-owned message fields and fails explicitly instead of falling back to generic copy.

21. `done` - Review/Buster gate correlation fallbacks. Remediation controls now require explicit correlation, gate controls no longer derive attempts from rate-limit diagnostics, and Buster issue extraction no longer reads `_verdict`.

22. `keep` - key gate authority surfaces. No implementation deletion expected.

23. `done` - production session termination policy. Defaults remain centralized policy, while aliases and invalid-value fallback normalization are removed.

24. `keep` - lifecycle cleanup diagnostic-only behavior. No implementation deletion expected.

25. `done` - orchestration hidden runtime/session defaults. ACP agent-id fallback work landed, Redis Buster payloads require explicit attempt/dispatch identity, unknown kill/steer agent configs fail explicitly, and Buster suite timeout now comes from canonical platform config instead of local code defaults.

26. `done` - Nova rate-limit hard-coded/wrapper defaults. The legacy `handleRateLimit` wrapper, pause/max defaults, cooldown-buffer code fallback, module `phaseFallback`, and broader run/attempt/dispatch/session/max-pause fallback option fields were deleted. Nova rate-limit helpers now take an explicit identity object plus explicit `maxPauses`.

27. `done` - Buster rate-limit nonblocking Discord reporting. Nonblocking behavior remains, and the rate-limit sender now owns explicit catch/reporting for Discord delivery failures.

28. `keep` - Nova telemetry nonblocking behavior. No implementation deletion expected.

29. `done` - shared Discord identity field contract move. `discord-fields-contract.ts` exists and Nova/Buster use facades instead of importing Discord fields from the rate-limit contract.

30. `done` - Buster Discord health state. Buster Discord and Nova observability now share the common observability health state machine instead of Buster owning a local health map.

31. `done` - Buster telemetry artifact fallback plus option aliases. The degraded artifact fallback stays, while `createTelemetryContext` now accepts snake_case telemetry options only.

32. `keep` - Buster main entrypoint narrowness. No implementation deletion expected.

33. `keep` - Buster runtime-loop backoff as named code policy. No implementation deletion expected unless operators need tuning.

34. `done` - Buster task lifecycle explicit fields. Timeout/cwd/label remain explicit, stage/worker identity is validated at task ingress, and Buster consumes validated identity instead of deriving it from task type.

35. `done` - Buster task validation extension. Non-empty suites, timeout, and session policy validation landed.

36. `keep` - Buster suite runner strict timeout/static registry. No implementation deletion expected.

37. `done` - empty suite list invalid before suite runner. Validation rejects empty suites before agent work.

38. `keep` - sandbox results mount as explicit sandbox contract. No implementation deletion expected unless the sandbox mount becomes deployment-variable.

39. `done` - Buster `fallback_completion` rename/constrain. The ACK-safety path is now named `synthesized_failure_completion_before_ack` and emits failure evidence.

40. `done` - explicit Buster completion outcome/reason. Completion builders and child-session publication now require explicit outcome/reason; only the named emergency pre-ACK terminal guarantee path synthesizes failure evidence.

41. `done` - scoped active Nova/Buster/common pipeline `.js` runtime path docs were cleaned and guarded. Generic `/app/skills/*.js` docs remain outside the current scoped guard.

42. `done` - obsolete fallback/dead-surface docs. Active pipeline reference docs no longer mention obsolete `status_json_path`, global run-state fallback authority, direct gate fallback wording, or legacy telemetry service paths.

43. `done` - TypeScript complexity budget. The guard scans runtime TypeScript and the default max was ratcheted to 780 lines.

44. `keep` - centralized verification wrappers. No implementation deletion expected.

45. `done` - no-JS docs guard now covers scoped active Nova/Buster/common runtime path references. Broader `/app/skills/*.js` docs are a separate policy decision if we expand the guard.

Open implementation buckets after Step 11:
- runtime context mirrors: point 2;
- validator and raw terminal result authority: complete;
- gate runner/fix-cycle/correlation cleanup: complete;
- runtime/session/rate-limit defaults: complete;
- Buster telemetry/lifecycle/completion cleanup: points 30, 34, and 40;
- final docs proof: point 42, plus broader `/app/skills/*.js` policy only if we decide to expand beyond the scoped guard.

## Specific Target Ledger

### 1. Remove the thin `resolveModel` wrapper

Decision: `delete/simplify`

Target:
- `skills/nova/pipeline/core/config.ts:398-400`

What to clean:
- Delete `resolveModel` if `rg "resolveModel\\(" skills tests docs` shows no live callers.
- Update any remaining callers to use `resolvePolicy(...).model` directly.

Why:
- It is a compatibility API over the real policy authority and adds an extra model-resolution entrypoint.

### 2. Migrate and delete `syncConfigRuntimeFields`

Decision: `phased`

Target:
- `skills/nova/pipeline/core/context.ts:119-128`

What to clean:
- Move callers from `config._logDir`, `config._runLogDir`, `config._pluginRegistry`, and `config._runtimeOverrides` to `PipelineContext` or explicit parameters.
- Delete `syncConfigRuntimeFields` after the mirror is no longer needed.

Why:
- Runtime context authority is split between `PipelineContext` and mutable `config._*` mirrors.

Deletion criterion:
- Runtime callers read from `PipelineContext` or explicit parameters.
- Verification fails on new mirror usage.
- Logs, telemetry, plugin registry, run IDs, runtime overrides, and summaries pass without the bridge.

### 3. Tighten config ingress for `pipeline_review` and Discord webhook env fallback

Decision: `done`

Target:
- `skills/nova/pipeline/core/config.ts:74-80`

What changed:
- Removed copying `progress.pipeline_review` into runtime config.
- Removed `DISCORD_WEBHOOK` fallback filling from `loadConfig`.
- Kept deployment free to source the webhook from `DISCORD_WEBHOOK`, but moved the mapping into the Helm init config materialization path.

Why:
- These are config mutation/fallback paths at startup and should be intentional platform policy, not accidental defaults.
- `DISCORD_WEBHOOK` is a deployment input name, not necessarily the name runtime code should treat as canonical authority.

Verification:
- Nova startup smoke guards against reintroducing the loader fallback or `progress.pipeline_review` mirror.
- Targeted `rg` proves only deployment mapping, docs, and non-loader tool uses mention `DISCORD_WEBHOOK`.

### 4. Keep only registry optional lookups with non-authoritative semantics

Decision: `done`

Target:
- `skills/nova/pipeline/core/registry.ts:162-167`
- `skills/nova/pipeline/core/registry.ts:214-227`

What changed:
- Deleted unused optional `resolveGateTypeOwner` and `resolveStageHandler` decision lookups.
- Kept `resolveStageOwner` for PluginContext metadata and `resolveHookListeners` for non-authoritative listener fan-out.
- Documented listener absence as a no-op observer/sink policy, not decision authority.

Why:
- Optional lookup is not itself a fallback; deleting it before every authority path uses `require*` can break valid optional plugin behavior.

Verification:
- Module-runner slice contract guards deleted optional decision lookups and the documented listener absence policy.

### 5. Keep core architecture policy surfaces

Decision: `keep`

Targets:
- Thin entrypoints and bounded public API.
- Startup config validation and unknown-field rejection.
- `fallback_model` as explicit platform policy.
- Lifecycle/read-model defaults as empty read-model shape.
- Plugin registry require/resolve split.

Why:
- These are intentional policy/authority boundaries, not cleanup candidates.

### 6. Remove outcome inference from pipeline step result builders

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:135-164`
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:226-254`

What to clean:
- Require every producer-to-step call to pass explicit `outcome`.
- Remove inference from typed metadata, `gateRunStatus`, `outcomeClass`, and `recommendation`.

Why:
- The contract layer currently recovers producer meaning instead of only validating explicit producer truth.

### 7. Shrink gate status alias validation to one canonical vocabulary

Decision: `delete/simplify`

Target:
- `skills/nova/pipeline/services/contracts/gate-control-result.ts:35-50`

What to clean:
- Replace pass/fail/wait alias sets with canonical `PASS`, `FAIL`, `WAIT`, and `TIMED_OUT`.
- Ensure emitters no longer produce `GO`, `NO-GO`, `OK`, `APPROVED`, `REJECTED`, `CANCELLED`, `PENDING`, or `PENDING_APPROVAL` as `gateRunStatus`.

Why:
- Alias acceptance keeps legacy gate result vocabulary alive.

### 8. Delete validator result mapping bridge after producers are typed

Decision: `open/phased`

Targets:
- `skills/nova/pipeline/services/contracts/validator-control-result.ts:111-131`
- `skills/nova/pipeline/services/contracts/validator-control-result.ts:173-220`

What changed:
- Built-in validators now pass explicit typed `nextAction`, `issueType`, and `outcomeClass`.
- Deleted `mapModuleValidatorResultToControl`.
- Removed producer-type inference from the validator contract helper.

Why:
- Mapping `passed` / `blocked` validator results keeps the old validator result protocol alive.

Verification:
- Validator contract guard rejects the deleted mapper, generic compatibility mapping import, and producer-type inference.

### 9. Simplify pipeline rate-limit details to terminal outcome authority

Decision: `delete/simplify`

Target:
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:313-333`

What to clean:
- Set `rate_limit_exhausted` directly from `stepResult.outcome === RATE_LIMITED`.
- Preserve source-specific metadata only as diagnostics.

Why:
- The terminal outcome already owns exhaustion; OR-ing metadata makes status multi-authoritative.

### 10. Keep worker control strictness

Decision: `keep`

Targets:
- `skills/nova/pipeline/services/contracts/worker-control-result.ts:26-61`
- `skills/nova/pipeline/services/contracts/worker-control-result.ts:71-109`
- `skills/nova/pipeline/services/contracts/worker-control-result.ts:111-164`

What stays:
- Explicit typed worker fields.
- Source-redacted diagnostics for invalid results.

Why:
- This is the anti-corruption boundary we want other contract surfaces to match.

### 11. Delete raw module terminal envelopes

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/runners/module-runner/attempt.ts:120-183`
- `skills/nova/pipeline/runners/module-runner/terminal-results.ts:14-78`

What to clean:
- Make Forge/Buster/pre-Buster phase handlers return `PipelineStepResult` for terminal outcomes.
- Keep only a narrow typed retry result for retry outcomes.
- Delete raw `{ exit, status, reason }` terminal builders.

Why:
- The attempt wrapper currently duplicates terminal classification and preserves an older protocol.

### 12. Remove hidden ACP agent-id literal fallbacks

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/runners/module-runner-forge.ts:103-111`
- `skills/nova/pipeline/agents/orchestration.ts:136-169`

What to clean:
- Remove final literal fallbacks like `'forge'` and `agentType`.
- Fail when resolved ACP agent id is missing.

Why:
- Config validation already requires explicit ACP ids for subagent-dispatch agents; literals are hidden session/config defaults.

### 13. Replace Buster crash retry literal with explicit policy

Decision: `open/phased`

Target:
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts:63`

What to clean:
- Prefer required validated config such as `buster_runtime.max_crash_retries` if operators may tune this.
- If it is not operator-tuned, move the value into a named documented platform policy constant.
- Remove `?? 2`.

Why:
- Retry budgets affect task side effects and operator timing, so they should be explicit.

Deletion criterion:
- Config/docs/fixtures provide the field.
- Missing/invalid values fail validation before runtime starts.
- Targeted search shows no anonymous `?? 2` retry budget remains in the Buster dispatch path.

### 14. Stop reconstructing poll-result-like objects from typed worker metadata

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/runners/module-runner-forge.ts:276-282`
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts:89-99`
- `skills/nova/pipeline/agents/module-worker-control-results.ts:117-136`

What to clean:
- Route on typed `nextAction`, `outcomeClass`, correlation, and failure metadata.
- Keep raw poll/Redis data only as diagnostics.

Why:
- Reconstructing old poll-result shapes undermines typed worker contract authority.

### 15. Collapse duplicated module worker input builders

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/runners/module-runner-shared.ts:221-289`
- `skills/nova/pipeline/runners/module-runner-shared.ts:292-354`
- `skills/nova/pipeline/runners/module-runner-shared.ts:423-511`

What to clean:
- Introduce one `buildModuleWorkerRunInputBase`.
- Keep Forge/Buster/validator-specific extensions explicit.

Why:
- Duplicated refs, execution context, workspace, deadline, artifact, and snapshot fields make authority migrations error-prone.

### 16. Keep explicit module runner platform defaults

Decision: `keep`

Targets:
- `skills/nova/pipeline/runners/module-runner/attempt.ts:108-117`
- `charts/kubeclaw/files/config/swarm.config.json:12-20`

What stays:
- Module timeout defaults to `config.default_timeout_minutes`.
- Module max-fails defaults to `config.default_max_fails`.

Why:
- These are validated platform policy defaults and do not require every module to duplicate config.

### 17. Factor repeated gate runtime-error construction

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/runners/gate-runner.ts:77-135`
- `skills/nova/pipeline/runners/gate-runner.ts:403-446`

What to clean:
- Create one `buildGateRuntimeErrorControl` helper.
- Use it for dispatch, evaluation, and remediation errors.

Why:
- Duplicate failure construction can drift in metadata and failure-class assignment.

### 18. Separate gate authority snapshots from diagnostics

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/runners/gate-runner.ts:138-190`
- `skills/nova/pipeline/runners/gate-runner.ts:193-235`

What to clean:
- Nest or rename diagnostic-only `gate-status.json` refs under explicit diagnostics.
- Keep lifecycle/read-model and typed output fields as authoritative.

Why:
- Gate plugin inputs currently mix diagnostic evidence with authority fields.

### 19. Replace waitable gate error mutation

Decision: `delete/simplify`

Target:
- `skills/nova/pipeline/runners/waitable-gate-engine.ts:47-89`

What to clean:
- Return a typed object like `{ started, controlResult, error }`.
- Stop setting `error.gateStageStarted = true`.

Why:
- Mutable error markers are fragile and hard to type.

### 20. Require typed gate fix-cycle message builders

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts:13-17`
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts:97-163`
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts:188-260`

What to clean:
- Replace `callMaybe` accepting strings/functions with a required typed message-builder object.
- Fail startup/adapter validation when required message builders are missing.

Why:
- Missing adapter-specific operator copy currently becomes silently generic.

### 21. Remove Review/Buster gate correlation fallbacks

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/runners/review-gate-control.ts:72-115`
- `skills/nova/pipeline/runners/review-gate-control.ts:125-172`
- `skills/nova/pipeline/runners/buster-gate-control.ts:130-169`
- `skills/nova/pipeline/runners/buster-gate-control.ts:187-236`
- `skills/nova/pipeline/runners/buster-gate-control.ts:240-286`

What to clean:
- Require explicit `GateControlCorrelation`.
- Require typed issue payloads from gate completion/evaluation.
- Remove `_verdict`, generic `result.status`, and rate-limit-derived attempt fallbacks from controls.

Why:
- Gate controls can look typed while still depending on old result shapes.

### 22. Keep key gate authority surfaces

Decision: `keep`

Targets:
- `skills/nova/pipeline/runners/gate-runner.ts:247-304`
- `skills/nova/pipeline/runners/approval-gate-shared.ts:19-42`
- `skills/nova/pipeline/services/gate-active-session.ts:65-171`

What stays:
- Generic `runGate` registry dispatch and adapter validation.
- Approval timeout policy validation.
- Gate active-session lifecycle/read-model authority.

Why:
- These are the gate architecture boundaries that prevent ad hoc execution and status authority.

### 23. Make session termination policy explicit for production callers

Decision: `delete/simplify`

Target:
- `skills/common/pipeline/agents/session-termination.ts:13-55`

What to clean:
- Keep defaults only for test helpers.
- Require production callers to pass validated termination policy.
- Invalid numeric options should fail closed instead of normalizing to defaults.

Why:
- Teardown budgets affect external sessions and should not silently normalize.

### 24. Keep lifecycle cleanup diagnostic-only

Decision: `keep`

Targets:
- `skills/common/pipeline/agents/lifecycle.ts:59-89`
- `skills/common/pipeline/agents/lifecycle.ts:140-174`
- `skills/buster/pipeline/services/orphan-recovery.ts:27-55`

What stays:
- Persisted active-session files remain diagnostic.
- Cleanup failures do not become lifecycle authority.
- Buster startup blocks when persisted evidence exists without lifecycle authority.

Why:
- Hydrating or killing from file evidence would weaken lifecycle/read-model authority.

### 25. Remove hidden defaults in orchestration payload/session construction

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/agents/orchestration.ts:150-169`
- `skills/nova/pipeline/agents/orchestration.ts:308-321`
- `skills/nova/pipeline/agents/orchestration.ts:333-359`
- `skills/nova/pipeline/agents/orchestration.ts:411-441`

What to clean:
- Require validated ACP agent id.
- Require suite timeout, attempt, and dispatch id before dispatch.
- Convert unknown Redis kill/steer configs to explicit typed no-op or error with operator diagnostic.

Why:
- This is a central dispatch boundary and should not infer runtime/session defaults.

### 26. Remove Nova rate-limit hard-coded/wrapper defaults

Decision: `delete/simplify`

Targets:
- `skills/nova/pipeline/services/rate-limit.ts:80-208`
- `skills/nova/pipeline/services/rate-limit.ts:344-390`
- `skills/nova/pipeline/services/rate-limit.ts:450-525`
- `skills/nova/pipeline/services/rate-limit-builders.ts:137-177`
- `skills/nova/pipeline/services/rate-limit-exit.ts:27-80`

What to clean:
- Add required `cooldown_buffer_ms` config or named policy.
- Require phase for recovery resume.
- Delete or strictify old `handleRateLimit`; if kept, require `maxPauses`.
- Introduce one required `RateLimitIdentity` and stop passing `*Fallback` fields.

Why:
- Rate-limit recovery is high impact and should not infer phase, budgets, or identity.

### 27. Keep Buster rate-limit nonblocking Discord, but make reporting explicit

Decision: `keep` with local simplification

Targets:
- `skills/buster/pipeline/services/rate-limit.ts:88-106`
- `skills/buster/pipeline/services/rate-limit.ts:192-256`
- `skills/buster/pipeline/services/rate-limit.ts:258-363`

What to clean:
- Route every Buster rate-limit Discord call through the sender with internal catch/reporting, or await it where delivery diagnostics matter.

Why:
- Nonblocking notification is acceptable, but unawaited side effects should have explicit reporting.

### 28. Keep Nova telemetry nonblocking

Decision: `keep`

Targets:
- `skills/nova/pipeline/services/telemetry.ts:1-8`
- `skills/nova/pipeline/services/telemetry/dispatch.ts:13-121`
- `skills/nova/pipeline/services/telemetry-sink-dispatch.ts:50-160`
- `tests/verification/contracts/check-operator-alert-surface.mjs:47-64`

What stays:
- Local-first durable alerts.
- Telemetry sink failures and invalid payloads classify as degraded evidence, not orchestration failures.

Why:
- Observability failure must not mutate lifecycle/result authority.

### 29. Move shared Discord identity fields out of rate-limit contract

Decision: `delete/simplify`

Targets:
- `skills/common/pipeline/services/rate-limit-contract.ts:51-238`
- `skills/nova/pipeline/services/discord-fields.ts:1-9`
- `docs/pipeline/implementation-map/authority-map.md:50`

What to clean:
- Move shared Discord identity fields to `services/discord-fields-contract.ts`.
- Temporarily re-export from `rate-limit-contract.ts` only if needed.
- Update imports and delete the Nova `discord-fields.ts` shim.

Why:
- The current file name hides broader Discord field authority and couples unrelated concepts.

### 30. Move Buster Discord health state to common observability

Decision: `delete/simplify`

Targets:
- `skills/buster/pipeline/services/discord.ts:111-130`
- `skills/buster/pipeline/services/discord.ts:204-244`
- `skills/buster/pipeline/services/discord.ts:258-345`
- `skills/buster/pipeline/services/discord.ts:387-468`

What to clean:
- Port Buster Discord degraded/restored state to common observability.
- Delete local webhook/audit health maps after callers use common state.
- Shrink `DiscordContext` to one canonical internal field style.

Why:
- Buster has a parallel circuit breaker and alias-heavy context surface; common state reduces drift.

### 31. Keep Buster telemetry artifact fallback, remove option aliases

Decision: `done`

Targets:
- `skills/buster/pipeline/services/telemetry.ts:145-166`
- `skills/buster/pipeline/services/telemetry.ts:206-250`
- `skills/buster/pipeline/services/telemetry.ts:398-454`
- `skills/buster/pipeline/services/telemetry.ts:463-497`

What changed:
- Kept artifact fallback for missing identity/Redis failure.
- Migrated Buster telemetry callers to canonical snake_case options.
- Removed option aliases like `runId`, `module`, `moduleId`, `logDir`, `dispatchId`, `sessionKey`, `gateId`, and `gateType`.
- Added a Buster pipeline-slice contract guard so those option aliases cannot return.

Why:
- The fallback is observable and typed; it is not a silent result fallback.

### 32. Keep Buster main entrypoint narrow

Decision: `keep`

Targets:
- `skills/buster/buster-pipeline.ts:14-17`
- `skills/buster/buster-pipeline.ts:72-93`
- `skills/buster/buster-pipeline.ts:95-148`
- `skills/buster/buster-pipeline.ts:153-221`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:83-90`

What stays:
- No helper barrel.
- Structured shutdown and Redis disconnect.
- Startup block when persisted active session file exists without lifecycle authority.

Why:
- The root runtime is already simplified and typed enough.

### 33. Keep Buster runtime-loop backoff as named code policy

Decision: `keep` unless operators need tuning

Target:
- `skills/buster/buster-pipeline.ts:78-80`

What to clean:
- Leave `BUSTER_RUNTIME_LOOP_POLICY.errorBackoffMs` as named code policy.
- Move it to validated runtime config only if operators need to tune it.

Why:
- A named code policy is acceptable when it is not a hidden local literal and not operator-tuned.

### 34. Make Buster task lifecycle session/runtime fields explicit

Decision: `delete/simplify`

Targets:
- `skills/buster/pipeline/services/task-lifecycle.ts:63-80`
- `skills/buster/pipeline/services/task-lifecycle.ts:112-123`
- `skills/buster/pipeline/services/task-lifecycle/session.ts:129-145`

What to clean:
- Require or schema-document producer-owned defaults for `timeout_seconds`, session `cwd`, and session label.
- Keep log-dir derivation only if documented as Buster artifact layout.
- Review defaults for `suites = []`, stage id from task type, and worker type from task type.

Why:
- Some derived fields are useful, but runtime behavior like timeout/cwd/label should be explicit.

### 35. Keep and extend Buster task validation

Decision: `keep` and extend

Targets:
- `skills/buster/pipeline/services/task-validation.ts:83-145`
- `skills/buster/pipeline/services/task-validation.ts:41-80`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:328-340`

What to clean:
- Add non-empty suite-list validation.
- Add any new required session/runtime fields here rather than deeper in task flow.

Why:
- This boundary already rejects weak task inputs and protects token spend.

### 36. Keep Buster suite runner strict timeout and static registry

Decision: `keep`

Targets:
- `skills/buster/pipeline/runners/suite-runner.ts:157-185`
- `skills/buster/pipeline/runners/suite-runner.ts:187-215`
- `skills/buster/pipeline/runners/suite-runner.ts:221-238`
- `skills/buster/pipeline/runners/suite-runner.ts:390-497`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:92-110`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs:272-284`

What stays:
- Static suite registry.
- Unknown suite validation.
- Required dependency declaration.
- Required `test_config.suite_timeout_ms`.
- Result write failures as degraded evidence, not verdict authority.

Why:
- These are correct strict boundaries for suite execution.

### 37. Make empty suite list invalid before suite runner

Decision: `delete/simplify`

Target:
- `skills/buster/pipeline/runners/suite-runner.ts:187`

What to clean:
- Stop relying on `validateSuiteNames(suites = [])`.
- Reject no-suite tasks in Buster task validation before work starts.

Why:
- Empty pretest coverage should not spend tokens or run an agent.

### 38. Keep sandbox results mount as explicit sandbox contract

Decision: `keep` unless sandbox contract changes

Target:
- `skills/buster/pipeline/runners/suite-runner.ts:38`

What to clean:
- Keep `RESULTS_DIR = '/sandbox/results'` as a named sandbox contract.
- Only inject it via validated payload/platform config if the sandbox mount becomes deployment-variable.

Why:
- Hard-coded mount paths are acceptable only when they are explicit runtime contract.

### 39. Rename and constrain Buster `fallback_completion`

Decision: `delete/simplify`

Targets:
- `skills/buster/pipeline/services/pipeline-helpers.ts:117-149`
- `skills/buster/pipeline/services/pipeline-helpers.ts:151-204`
- `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts:30-85`
- `skills/buster/pipeline/services/task-completion.ts:41-80`
- `skills/buster/pipeline/services/task-completion.ts:143-213`

What to clean:
- Rename `fallback_completion` to something like `synthesized_failure_completion_before_ack`.
- Ensure it can only emit `FAIL` unless an already-authored output file validates as `PASS`.

Why:
- The fallback is ACK safety, but the current name looks like silent result fallback.

### 40. Require explicit Buster completion outcome/reason

Decision: `delete/simplify`

Targets:
- `skills/buster/pipeline/services/task-lifecycle/session.ts:337-368`
- `skills/buster/pipeline/services/task-completion.ts:41-74`
- `skills/buster/pipeline/services/task-completion.ts:175-190`

What to clean:
- Require explicit outcome and reason at completion-emission boundaries.
- Keep only emergency process-error fallback in `ensureTaskTerminalBeforeAck`, named as synthesized failure evidence.

Why:
- Defaulting to `FAIL` is safe, but it hides missing reason quality.

### 41. Update active docs that still use `.js` runtime paths

Decision: `delete/simplify`

Targets:
- `docs/pipeline-reference-v10.md:139-180`
- `docs/pipeline-reference-v10.md:231-237`
- `docs/pipeline-reference-v10.md:365-399`
- `docs/pipeline-reference-v10.md:1153-1306`
- `docs/pipeline-reference-v10.md:1379-1402`
- `docs/pipeline/implementation-map/authority-map.md:28-35`
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md:48-57`

What to clean:
- Rewrite active runtime docs to `.ts` paths or extensionless wording.
- Add guard for active `skills/nova|buster|common/...*.js` references outside archives.

Why:
- Active docs conflict with TypeScript-only runtime reality.

### 42. Remove obsolete fallback/dead-surface docs

Decision: `delete/simplify` with explicit-policy exceptions

Targets:
- `docs/pipeline-reference-v10.md:395`
- `docs/pipeline-reference-v10.md:782`
- `docs/pipeline-reference-v10.md:835`
- `docs/pipeline-reference-v10.md:1823`
- `docs/pipeline-reference-v10.md:1922-1971`
- `docs/architecture-validator-reference.md:191-205`

What to clean:
- Remove obsolete `status_json_path` docs.
- Remove old direct gate wrapper docs.
- Remove or reword `RUN_ID` / `_runStats` legacy fallback docs.
- Remove `telemetry.stream_key` legacy enable-flag language if obsolete.
- Keep `fallback_model`, `default_timeout_minutes`, and `default_max_fails` as explicit platform policy.
- Track `config._*` as a phased bridge with deletion criteria.

Why:
- Docs currently mix obsolete surfaces, policy defaults, and migration bridges.

### 43. Make complexity budget scan TypeScript

Decision: `delete/simplify`

Targets:
- `tests/verification/contracts/check-pipeline-complexity-budgets.mjs:18-31`
- `tests/verification/contracts/check-pipeline-complexity-budgets.mjs:44-62`

What to clean:
- Replace `listJsFiles` with TypeScript runtime scanning.
- Set staged budgets by file class.
- Keep exceptions only for generated declarations/shims if needed.

Why:
- The current guard checks zero runtime files after TS migration.

### 44. Keep centralized verification wrappers

Decision: `keep`

Targets:
- `tests/verification/contracts/check-verification-wrapper-surface.mjs:25-69`
- `tests/verification/lib/run-contract-suite.sh:11-61`

What stays:
- Fast/full wrappers delegate to the shared deterministic contract list.
- Required guards stay centralized.

Why:
- This is the policy wall; new guards should be added here, not scattered.

### 45. Extend no-JS docs guard

Decision: `delete/simplify`

Targets:
- `tests/verification/contracts/check-phase9-unpaired-js-surface.mjs:29-47`
- `tests/verification/contracts/check-phase10-final-reference-surface.mjs:32-77`

What to clean:
- Add docs-focused assertion for `skills/nova/pipeline`, `skills/buster/pipeline`, and `skills/common/pipeline` `.js` path mentions outside archives.
- Keep generic JavaScript concepts and archived/historical references where they do not point at active runtime skill paths.

Why:
- Runtime no-JS is guarded, but active docs can still drift.

## Source Review Spine

The specific target ledger above is the actionable Step 3 triage. The source-spine section below is retained only to preserve the original batch grouping and decision trace from the review.

## Batch 0: Architecture/Policy Map

### High-confidence simplifications

Decision: `delete/simplify`

Action:
- Keep these as first deletion targets where they have low blast radius: dead wrappers, stale docs, alias surfaces, redundant result recovery, and obsolete compatibility paths.

Verification:
- Targeted `rg` proof for removed symbols.
- Contract suite.
- Relevant runtime smoke if touched area participates in startup.

### Risky phased changes

Decision: `open/phased`

Deletion criterion:
- Each item must have producers/callers migrated first and a guard that fails on reintroduction.
- Do not delete runtime bridges, result projections, or read-model compatibility until all current consumers have a typed authority path.

Verification:
- Contract suite.
- Behavior area for the affected lifecycle, runtime, gate, or Buster path.
- Full verification before the cleanup series lands.

### Things that should stay

Decision: `keep`

Reason:
- These are policy or authority surfaces, not debt: typed contracts, lifecycle/read-model authority, no-JS runtime policy, explicit platform defaults, and nonblocking observability where it preserves pipeline progress.

Verification:
- Existing contract guards should stay in wrapper lists.
- Add guards around the policy wording where docs drift is likely.

## Batch 1: Typed Contracts/Result Authority

### F1: Contract builders still infer too much producer meaning

Decision: `delete/simplify`

Action:
- Require explicit producer `outcome`.
- Canonicalize gate `gateRunStatus` to `PASS`, `FAIL`, `WAIT`, or `TIMED_OUT`.
- Remove outcome inference from `gateRunStatus`, `recommendation`, and broad typed metadata candidates.

Verification:
- `check-pipeline-step-result-surface.mjs`
- `check-gate-control-result-surface.mjs`
- Add/extend guard for allowed `gateRunStatus` emitters.

### F2: Pipeline rate-limit helper contains redundant truth

Decision: `delete/simplify`

Action:
- Collapse redundant rate-limit summary/status truth once the typed result authority path is explicit.

Verification:
- `check-rate-limit-slice-surface.mjs`
- `check-pipeline-step-result-surface.mjs`
- behavior areas: polling, runtime-monitor, restart-recovery.

### F3: Worker contract strictness should stay

Decision: `keep`

Reason:
- Worker control results already enforce explicit canonical `outcomeClass`; this protects typed contract authority.

Verification:
- `check-worker-control-result-surface.mjs`
- Keep strict negative fixtures.

### F4: Validator mapping is still a compatibility bridge

Decision: `open/phased`

Deletion criterion:
- Validator producers pass explicit `producerType`, outcome class, and terminal meaning.
- Contract guard fails if `producerType` is inferred from stage IDs.

Verification:
- `check-validator-control-result-surface.mjs`
- `check-pipeline-step-result-surface.mjs`
- targeted validator fixtures.

## Batch 2: Module Runner Stack

### F1: Module attempts still convert raw terminal envelopes into typed step results

Decision: `delete/simplify`

Action:
- Make module phases return typed step results directly.
- Delete raw `{ exit, status }` terminal builders and projection glue after migration.

Verification:
- `check-module-runner-slice-surface.mjs`
- module-failures behavior area.
- contract suite.

### F2: Hidden ACP agent-id fallback should be removed

Decision: `delete/simplify`

Action:
- Remove literal ACP agent-id fallbacks after config/progress requires explicit dispatch identity.

Verification:
- targeted `rg` proof for fallback literals.
- startup smokes.
- runtime-surface behavior area.

### F3: Buster crash retry count has a hidden literal default

Decision: `open/phased`

Deletion criterion:
- Add explicit config for crash retry count and cooldown buffer.
- Validate missing/invalid config before runtime starts.
- Remove literal fallback after fixtures and docs provide the field.

Verification:
- Buster startup smoke.
- `check-buster-pipeline-slice-surface.mjs`
- relevant runtime diagnostics fixture.

### F4: Forge/Buster worker phases reconstruct poll-result-like objects from typed worker metadata

Decision: `delete/simplify`

Action:
- Stop reconstructing legacy poll-result-like shapes from typed worker metadata.
- Pass typed worker result through to terminal handling.

Verification:
- `check-worker-control-result-surface.mjs`
- `check-module-runner-slice-surface.mjs`
- module-failures behavior area.

### F5: Shared module worker input builders duplicate large state snapshots

Decision: `delete/simplify`

Action:
- Extract one shared base builder for worker input snapshots.
- Keep role-specific fields explicit.

Verification:
- `check-module-runner-slice-surface.mjs`
- module-failures behavior area.
- targeted snapshot fixture if available.

### F6: Some defaults in module runner should stay for now

Decision: `keep`

Reason:
- `fallback_model`, `default_timeout_minutes`, and `default_max_fails` are now resolved as explicit platform policy defaults.
- Module-level overrides remain supported without forcing duplicate module config.

Verification:
- `check-time-budget-surface.mjs`
- model policy checks.
- docs should describe these as policy defaults, not hidden fallback behavior.

## Batch 3: Gate/Review/Approval Runners

### F1: Gate runner error projection has repeated failure construction

Decision: `delete/simplify`

Action:
- Factor shared gate runtime-error/failure builders.
- Preserve gate-specific metadata and remediation policy.

Verification:
- `check-gate-control-result-surface.mjs`
- gates behavior area.
- approval behavior area when approval code is touched.

### F2: Gate state snapshots mix authority with diagnostics

Decision: `delete/simplify`

Action:
- Separate authoritative lifecycle/read-model state from diagnostic `gate-status.json` evidence.
- Keep diagnostic evidence named clearly as diagnostic.

Verification:
- `check-status-store-slice-surface.mjs`
- `check-artifact-authority-slice-surface.mjs`
- gate-session-persistence behavior area.

### F3: Waitable gate engine mutates errors to signal stage start

Decision: `delete/simplify`

Action:
- Replace mutable error markers with typed execution result/state.

Verification:
- gates behavior area.
- approvals behavior area.
- `check-gate-control-result-surface.mjs`

### F4: Generic gate fix cycle hides missing adapter copy with message fallbacks

Decision: `delete/simplify`

Action:
- Fail closed on missing adapter copy.
- Remove message fallback behavior after adapters provide typed copy explicitly.

Verification:
- fix-cycles behavior area.
- `check-remediation-handoff-surface.mjs`
- targeted adapter fixture.

### F5: Review/Buster gate control still uses correlation fallbacks

Decision: `delete/simplify`

Action:
- Require explicit correlation fields from gate producers.
- Remove fallback correlation reads after producers are canonical.

Verification:
- `check-gate-control-result-surface.mjs`
- `check-buster-completion-controller-surface.mjs`
- discord-correlation behavior area.

### Things that should stay

Decision: `keep`

Reason:
- Gate/review/approval runners should continue to preserve typed remediation handoff, lifecycle authority, approval signal semantics, and operator-facing evidence.

Verification:
- Existing gate, approval, remediation, and status-store contract guards stay mandatory.

## Batch 4: Session/Runtime/Rate-limit Authority

### F1: Session termination policy has hard-coded defaults and invalid-option normalization

Decision: `delete/simplify`

Action:
- Remove hidden/default normalization where callers should pass explicit policy.
- Keep only validation and documented platform defaults.

Verification:
- `check-session-authority-slice-surface.mjs`
- runtime-monitor and shutdown-integration behavior areas.

### F2: Lifecycle file cleanup is best-effort and diagnostic-only

Decision: `keep`

Reason:
- Cleanup failures should not override lifecycle/read-model authority or terminal state.
- Diagnostic-only cleanup is reliability-preserving.

Verification:
- lifecycle-state-surface behavior area.
- restart-recovery behavior area.

### F3: Orchestration hides runtime/session defaults

Decision: `delete/simplify`

Action:
- Require explicit session runtime, label, cwd, timeout, and dispatch identity where payloads are built.
- Keep explicit platform time budget defaults where policy says they remain.

Verification:
- `check-buster-pipeline-slice-surface.mjs`
- `check-session-authority-slice-surface.mjs`
- startup smokes.

### F4: Nova rate-limit helpers use hard-coded and wrapper defaults

Decision: `delete/simplify`

Action:
- Delete obsolete wrappers.
- Move remaining policy values into explicit config or typed call arguments.

Verification:
- `check-rate-limit-slice-surface.mjs`
- polling and runtime-monitor behavior areas.

### F5: Buster rate-limit service is stricter, but Discord emission is fire-and-forget

Decision: `keep` with local simplification

Reason:
- Nonblocking Discord is correct; observability failures must not block task lifecycle.
- Simplification should focus on shared/common observability state, not making Discord terminal.

Verification:
- `check-buster-operator-surface.mjs`
- `check-observability-catch-reporting.mjs`
- operator-surface behavior area.

## Batch 5: Telemetry/Discord/Operator Surfaces

### F1: Nova telemetry nonblocking behavior should stay

Decision: `keep`

Reason:
- Telemetry failures are observability incidents, not pipeline lifecycle authority.

Verification:
- `check-telemetry-contract.mjs`
- `check-observability-catch-reporting.mjs`

### F2: Shared Discord field contract is in a misleading rate-limit-named file

Decision: `delete/simplify`

Action:
- Move shared Discord field contract to a correctly named common module.
- Keep compatibility facade only if needed briefly and with deletion criteria.

Verification:
- `check-operator-alert-surface.mjs`
- `check-buster-operator-surface.mjs`
- discord-correlation behavior area.

### F3: Buster Discord duplicates observability health logic locally

Decision: `delete/simplify`

Action:
- Move Buster degraded/restored state to common observability authority.
- Delete Buster-local duplicate health maps after callers use common state.

Verification:
- `check-observability-catch-reporting.mjs`
- `check-buster-operator-surface.mjs`
- operator-surface behavior area.

### F4: Buster telemetry artifact fallback is deliberate, but naming should stay explicit

Decision: `keep` with naming cleanup only

Reason:
- Artifact fallback is reliability-preserving when Redis or external observability is degraded.
- Naming should remain explicit so it is not confused with result authority fallback.

Verification:
- `check-telemetry-contract.mjs`
- `check-buster-operator-surface.mjs`

## Batch 6: Buster Runtime/Suite Surface

### F1: Buster main entrypoint is already simplified

Decision: `keep`

Reason:
- The entrypoint is already narrow and typed enough; churn here is low value.

Verification:
- Buster startup smoke.
- `check-buster-pipeline-slice-surface.mjs`

### F2: Buster task lifecycle still has hidden session defaults

Decision: `delete/simplify`

Action:
- Require explicit session runtime, label, cwd, timeout, and agent identity.
- Remove presentation defaults that imply missing runtime policy.

Verification:
- `check-buster-pipeline-slice-surface.mjs`
- `check-session-authority-slice-surface.mjs`
- Buster startup smoke.

### F3: Buster task validation is a strong boundary

Decision: `keep` and extend

Reason:
- Strict validation protects token spend and task authority.
- Add invalid empty suite-list validation per resolved policy.

Verification:
- `check-buster-pipeline-slice-surface.mjs`
- Add/extend empty-suite negative fixture.

### F4: Buster suite runner mostly removed old defaults; keep strict timeout

Decision: `keep`

Reason:
- Required `suite_timeout_ms` is the right explicit boundary and prevents indefinite tests.

Verification:
- Buster suite runner validation tests.
- `check-buster-pipeline-slice-surface.mjs`

### F5: Buster output file is the right completion authority, but completion fallback naming should be tightened

Decision: `delete/simplify`

Action:
- Keep output file as completion authority.
- Rename or narrow `fallback_completion` so it only describes synthesized failure evidence.

Verification:
- `check-buster-completion-controller-surface.mjs`
- `check-redis-completion-service-surface.mjs`
- Buster runtime-normalization behavior area.

### F6: Buster task outcome defaults should be narrowed

Decision: `delete/simplify`

Action:
- Remove defaulted outcome interpretation where task lifecycle should emit explicit status/classification.

Verification:
- `check-buster-pipeline-slice-surface.mjs`
- `check-buster-completion-controller-surface.mjs`

## Batch 7: Docs/Verification/Dead Policy References

### F1: Active docs still refer to `.js` runtime paths

Decision: `delete/simplify`

Action:
- Update active runtime-path docs to `.ts` or extensionless wording.
- Guard active `skills/*` runtime references outside archives.

Verification:
- `check-phase10-final-reference-surface.mjs`
- new or extended docs path-extension guard.

### F2: Active docs still describe legacy fallbacks and obsolete surfaces

Decision: `delete/simplify` with explicit-policy exceptions

Action:
- Remove obsolete `status_json_path`, direct gate wrapper, and legacy fallback language.
- Keep `fallback_model`, `default_timeout_minutes`, and `default_max_fails` documented as explicit platform policy.
- Track `config._*` as a phased bridge, not a permanent authority.

Verification:
- `check-implementation-map-sync-surface.mjs`
- stale-policy-doc guard.

### F3: Complexity budget currently scans `.js` files only

Decision: `delete/simplify`

Action:
- Switch complexity budget to scan `.ts`.
- Set realistic staged budgets by file class.

Verification:
- `check-pipeline-complexity-budgets.mjs`
- baseline/report-mode output before enforcement.

### F4: Verification wrappers are centralized and should stay

Decision: `keep`

Reason:
- Centralized wrappers are the policy wall. New guards should be added there rather than scattered.

Verification:
- `check-verification-wrapper-surface.mjs`

### F5: No-JS runtime policy is guarded, but docs are under-guarded

Decision: `delete/simplify`

Action:
- Extend docs guard for active `skills/*` `.js` runtime path references outside archives.
- Keep generic JavaScript concepts and historical/archive material where they are not active runtime paths.

Verification:
- `check-phase9-unpaired-js-surface.mjs`
- `check-phase10-final-reference-surface.mjs`
- new or extended docs guard.

## Step 4 Readiness

Step 4 can start after this triage with these first guard targets:
- allowed gate `gateRunStatus` values are only `PASS`, `FAIL`, `WAIT`, and `TIMED_OUT`;
- empty Buster suite lists are invalid;
- active `skills/*` `.js` runtime path refs outside archives are forbidden;
- complexity budget scans `.ts` files instead of checking zero `.js` files.
