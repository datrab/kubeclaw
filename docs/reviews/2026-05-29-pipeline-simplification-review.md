# Pipeline Simplification Review

Date: 2026-05-29

Scope reviewed:

- `skills/nova/pipeline`
- `skills/buster`
- `skills/common/pipeline`
- Related contract checks and policy documentation referenced by the requested batch plan

All requested batches 0-7 were reviewed. No exclusions.

This is a review/planning artifact only. No implementation changes are proposed here as already applied code.

## Executive Summary

The pipeline has made substantial progress toward typed contracts and lifecycle/read-model authority. The remaining simplification opportunity is concentrated in adapter seams that still preserve older result shapes, identity aliases, default runtime behavior, and docs/tests that explicitly bless compatibility shims.

Highest-confidence near-term deletions:

- Delete the `skills/nova/pipeline/runners/module-runner-buster.ts:1` compatibility re-export after updating its remaining docs/test references.
- Remove stale Buster suite JS artifact references in `skills/nova/pipeline/runners/module-runner-shared.ts:486` and related docs.
- Delete the dead Buster suite dependency fallback at `skills/buster/pipeline/runners/suite-runner.ts:240`; all known suites are already declared in `DEPENDENCIES` at `skills/buster/pipeline/runners/suite-runner.ts:443`.
- Delete unused approval-gate timeout constant surface at `skills/nova/pipeline/runners/approval-gate-shared.ts:19` after confirming no downstream import depends on it.
- Update stale policy/docs references that still describe JS-era or compatibility re-export paths.

Most valuable phased simplifications:

- Make typed `PipelineStepResult` outcome/result fields mandatory at producer boundaries, then delete outcome inference from legacy `exit`, `status`, `issueType`, metadata, and summary-adjacent fields.
- Replace module runner terminal envelopes with typed step results at the point of creation, then delete `buildModuleStepResult` compatibility reconstruction.
- Require explicit session/runtime/gateway/rate-limit identity and config where production behavior depends on it; reserve defaults for test helpers or explicitly named local-development policy.
- Consolidate gate invocation and timeout policy handling so approval/review/Buster gate controls do not each carry independent fallback stacks.
- Stop reconstructing structured correlation by parsing rendered Discord fields; pass structured correlation data into Discord/audit sinks.

Things that should stay:

- Lifecycle/read-model authority for active sessions and gate session state.
- Typed worker/gate control contracts as the result authority.
- Durable operator alert before external notification sinks.
- Redis completion adjudication where it reconciles external completion evidence with local lifecycle/status state.
- Buster strict task validation, especially rejection of legacy `status_json_path`.
- Non-blocking suite artifact writes, but diagnostics should become structured.

## Reviewed Scope

Primary code:

- Nova pipeline entry/config/registry: `skills/nova/pipeline/index.ts`, `skills/nova/pipeline/core/config.ts`, `skills/nova/pipeline/core/registry.ts`, `skills/nova/pipeline/core/registry/*`
- Nova contracts and runners: `skills/nova/pipeline/services/contracts/*`, `skills/nova/pipeline/runners/*`, `skills/nova/pipeline/agents/*`
- Nova lifecycle/session/rate-limit/telemetry: `skills/nova/pipeline/services/*`, `skills/nova/pipeline/integrations/*`
- Shared runtime: `skills/common/pipeline/agents/*`, `skills/common/pipeline/integrations/*`, `skills/common/pipeline/telemetry.ts`
- Buster runtime/suites/services: `skills/buster/buster-pipeline.ts`, `skills/buster/pipeline/runners/*`, `skills/buster/pipeline/services/*`, `skills/buster/pipeline/suites/*`
- Contract/policy checks under `tests/verification/contracts`
- Policy/docs references under `docs`, `charts/kubeclaw/files/config`

The requested root path `kubeclaw-main/...` was not present directly under the workspace root. The active reviewed copy was `git-repo/kubeclaw-main/...`.

## Architecture And Authority Map

Entrypoints:

- `skills/nova/pipeline/index.ts:1` is a narrow public API for config loading, lifecycle shutdown hooks, constants, `runPipeline`, and default export. This surface should remain small.
- `skills/buster/buster-pipeline.ts:1` explicitly defines the Buster runtime start/status API and states that old helper barrel exports are deleted.
- Common pipeline utilities are shared through `skills/common/pipeline`, with Nova/Buster-specific re-export shims where needed for image/runtime boundaries.

Config and plugin authority:

- `skills/nova/pipeline/core/config.ts:22` loads platform swarm config, progress, merged config, and validates before registry construction.
- `skills/nova/pipeline/core/config.ts:94` validates required fields, including explicit `fallback_model`, `rate_limit`, `review_defaults`, and `plugins`.
- `skills/nova/pipeline/core/config.ts:245` requires `acp_monitor` config and rejects hidden monitor defaults.
- `skills/nova/pipeline/core/config.ts:295` rejects unknown top-level config fields.
- `skills/nova/pipeline/core/registry.ts:60` builds the plugin registry from builtins plus normalized config.
- `skills/nova/pipeline/core/registry.ts:151`, `skills/nova/pipeline/core/registry.ts:169`, and `skills/nova/pipeline/core/registry.ts:201` are the hard authority checks for registry presence, stage owner, and handler availability.

Typed result authority:

- `skills/nova/pipeline/services/contracts/worker-control-result.ts:6` and `skills/nova/pipeline/services/contracts/gate-control-result.ts:8` forbid compatibility authority keys.
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:231` builds typed pipeline step results.
- Contract checks at `tests/verification/contracts/check-pipeline-step-result-surface.mjs:42`, `tests/verification/contracts/check-worker-control-result-surface.mjs:49`, and `tests/verification/contracts/check-gate-active-session-surface.mjs:29` enforce typed surface boundaries.

Lifecycle/read-model authority:

- `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts:14` owns lifecycle read-model defaults and load behavior.
- `skills/nova/pipeline/services/session-authority.ts:108` keeps lifecycle read model as active-session authority and treats status/log evidence as diagnostic.
- `tests/verification/contracts/check-session-authority-slice-surface.mjs:32` enforces that active-session authority is not hydrated from persisted JSON or status labels.
- `skills/nova/pipeline/services/gate-active-session.ts:63` applies the same authority policy for gates.

Module runner authority:

- `skills/nova/pipeline/runners/module-runner.ts:1` is the public module runner facade.
- `skills/nova/pipeline/runners/module-runner-shared.ts:196` currently adapts older terminal envelopes into typed step results.
- `skills/nova/pipeline/runners/module-runner-forge.ts:153` creates Forge lifecycle/input state.
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts:140` reconciles Buster completion evidence with local status/lifecycle state.

Gate authority:

- `skills/nova/pipeline/runners/gate-runner.ts:251` requires a gate control adapter.
- `skills/nova/pipeline/runners/waitable-gate-engine.ts:23` and `skills/nova/pipeline/runners/remediable-gate-engine.ts:25` own wait/remediation loops.
- `skills/nova/pipeline/runners/approval-gate-control.ts:91`, `skills/nova/pipeline/runners/review-gate-control.ts:51`, and `skills/nova/pipeline/runners/buster-gate-control.ts:118` adapt gate-specific outcomes into typed gate control results.

Session/runtime/rate-limit authority:

- `skills/common/pipeline/agents/acp-monitor.ts:120` requires monitor config, but `skills/common/pipeline/agents/acp-monitor.ts:281` still carries numeric defaults inside monitor state construction.
- `skills/common/pipeline/agents/session-termination.ts:80` returns typed termination results.
- `skills/common/pipeline/integrations/gateway.ts:55` resolves gateway URL from override/env/default and `skills/common/pipeline/integrations/gateway.ts:142` supplies invoke timeout/retry defaults.
- `skills/nova/pipeline/services/rate-limit.ts:80` centralizes Nova session rate-limit handling.
- `tests/verification/contracts/check-rate-limit-slice-surface.mjs:31` enforces the extracted Nova rate-limit surface.

Telemetry/operator authority:

- `skills/nova/pipeline/services/telemetry.ts:1` is a facade over telemetry dispatch.
- `skills/nova/pipeline/services/telemetry.ts:29` records local durable operator alert before sending operator-alert sinks.
- `skills/nova/pipeline/integrations/discord.ts:183` writes Discord audit entries and degraded/restored incidents.
- `tests/verification/contracts/check-operator-alert-surface.mjs:48` enforces durable operator alert before notification sinks.

Buster runtime authority:

- `skills/buster/pipeline/services/task-validation.ts:83` strictly validates Buster tasks and rejects legacy `status_json_path`.
- `skills/buster/pipeline/runners/suite-runner.ts:154` validates suite names before execution.
- `skills/buster/pipeline/services/verdict-schema.ts` owns typed suite verdict shape.
- `skills/buster/pipeline/services/rate-limit.ts:192` probes Buster session liveness before deciding whether a resume/kill path is safe.

## Findings By Batch

### Batch 0: Architecture/Policy Map

#### B0-F01: Plugin config normalization still contains direct-helper defaults

Refs:

- `skills/nova/pipeline/core/registry/config-normalization.ts:136`
- `skills/nova/pipeline/core/registry/config-normalization.ts:146`
- `skills/nova/pipeline/core/config.ts:133`

Current behavior:

`loadConfig` requires a `plugins` object, but `normalizePluginConfig` still accepts missing, null, or invalid plugin config and returns enabled default plugin behavior.

Risk/complexity:

This creates two policy stories: production config validation is strict, while direct registry helper use can silently construct a permissive registry. That weakens the "no hidden default config" invariant in tests or alternate call paths.

Proposed change:

Keep strict `loadConfig` validation as the production authority. Make `normalizePluginConfig` strict by default, or move permissive defaults behind an explicitly named test/local helper.

Blast radius:

Likely limited to registry unit tests and any direct registry helper consumers. Production `loadConfig` already requires `plugins`.

Verification needed:

Run registry tests and contract checks that build plugin registries directly. Add an assertion that production registry construction rejects missing plugin config before normalization.

#### B0-F02: Compatibility projection facade is debt, but should not be deleted first

Refs:

- `skills/nova/pipeline/services/status-store-compat.ts:1`
- `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts:14`
- `tests/verification/contracts/check-session-authority-slice-surface.mjs:32`

Current behavior:

`status-store-compat.ts` exports legacy evidence projection helpers while lifecycle read models remain the authority for active state.

Risk/complexity:

The file name reads like removable compatibility debt, but it is currently part of the diagnostic/projection boundary. Deleting it before replacing references could blur evidence projection with lifecycle authority.

Proposed change:

Rename or split the facade after callers are categorized: keep diagnostic projection helpers with an authority-neutral name, delete only unused compatibility exports.

Blast radius:

Session/gate recovery, diagnostics, and tests that intentionally distinguish lifecycle authority from evidence.

Verification needed:

Run `check-session-authority-slice-surface.mjs`, `check-gate-active-session-surface.mjs`, and lifecycle read-model tests.

#### B0-F03: Manifest defaults are acceptable only when explicitly registered

Refs:

- `skills/nova/pipeline/core/registry/validation.ts:124`
- `skills/nova/pipeline/core/registry.ts:104`

Current behavior:

Plugin modules may receive manifest `configSchema.defaults`, and plugin enabled state defaults through override, manifest, then `true`.

Risk/complexity:

Manifest-owned defaults are auditable. The final implicit `true` for plugin enabled state is less explicit and may make newly added plugins active without config intent.

Proposed change:

Require every built-in plugin manifest to declare `defaultEnabled`, and reject absent enabled policy during registry validation.

Blast radius:

Plugin registry manifests and tests.

Verification needed:

Add/extend registry validation tests for missing `defaultEnabled`; run plugin registry contract checks.

### Batch 1: Typed Contracts/Result Authority

#### B1-F01: `PipelineStepResult` still infers outcome from a fallback stack

Refs:

- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:83`
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:164`
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:181`
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:283`

Current behavior:

Step result construction accepts broad outcome aliases, infers outcome from typed diagnostics, top-level `outcome`/`outcomeClass`, metadata, `issueType`, and finally action defaults. HALT defaults to error if no stronger authority is present.

Risk/complexity:

This preserves current behavior, but it is the largest remaining silent compatibility path in typed result authority. Producers can omit explicit typed outcome and still produce a valid step result.

Proposed change:

Phase 1: instrument/report every fallback source used by `inferOutcomeFromControlResult`.

Phase 2: require typed `outcomeClass` or a typed terminal reason on all control results.

Phase 3: delete metadata/top-level/issueType/default inference and reduce aliases to canonical enum values.

Blast radius:

Module runner terminal paths, gate controls, rate-limit terminal results, and tests that expect ambiguous HALT to map to error.

Verification needed:

Run `tests/verification/contracts/check-pipeline-step-result-surface.mjs` and add producer-level tests proving every terminal control result includes explicit typed outcome.

#### B1-F02: Gate control typed status still carries broad compatibility aliases

Refs:

- `skills/nova/pipeline/services/contracts/gate-control-result.ts:42`
- `skills/nova/pipeline/services/contracts/gate-control-result.ts:92`
- `skills/nova/pipeline/services/contracts/gate-control-result.ts:191`

Current behavior:

Gate control rejects compatibility-shaped outputs, but status normalization still maps several pass/fail/wait strings into typed gate run statuses.

Risk/complexity:

The result shape is typed, but semantics are still tolerant of older status vocabulary. This makes it hard to know when all gates have migrated.

Proposed change:

Audit current gate producers, then reduce accepted aliases to canonical `passed`, `failed`, `wait`, and `skipped` values. Keep compatibility alias rejection strict.

Blast radius:

Approval, review, Buster gate controls, and any plugin-provided gates.

Verification needed:

Run gate control contract tests and plugin gate fixtures. Add negative tests for old aliases after migration.

#### B1-F03: Module worker control still defaults unknown issue/outcome metadata

Refs:

- `skills/nova/pipeline/agents/module-worker-control-results.ts:18`
- `skills/nova/pipeline/agents/module-worker-control-results.ts:62`
- `skills/nova/pipeline/agents/module-worker-control-results.ts:99`
- `skills/nova/pipeline/agents/module-worker-control-results.ts:120`

Current behavior:

Forge worker result helpers default non-pass issue type to `unknown`, infer outcome class from reason/pass state, and preserve/fall back to Redis session evidence for Buster metadata. Buster already requires `failureClass` on non-pass results.

Risk/complexity:

Unknown fallbacks hide malformed worker result producers and keep Redis evidence embedded in typed worker metadata longer than necessary.

Proposed change:

Require explicit issue type/outcome class for every non-pass Forge worker result. For Buster, require typed session/correlation identity from worker output and stop embedding `_redis_entry` as metadata authority.

Blast radius:

Forge worker adapters, Buster phase terminal failure handling, and worker control tests that still build top-level legacy inputs.

Verification needed:

Run `check-worker-control-result-surface.mjs`, module worker tests, and Buster worker terminal failure tests.

#### B1-F04: Raw result diagnostics are useful and should stay

Refs:

- `skills/nova/pipeline/services/contracts/worker-control-result.ts:110`
- `skills/nova/pipeline/services/contracts/gate-control-result.ts:229`

Current behavior:

Invalid typed result normalization includes raw result, input, invocation, and producer diagnostics in `ContractInvalidError`.

Risk/complexity:

This increases object size but does not create fallback behavior.

Proposed change:

Keep raw diagnostics. If size becomes a concern, redact by policy rather than deleting the diagnostic channel.

Blast radius:

Debugging and contract failure reports.

Verification needed:

Contract invalid tests should continue to prove failures are loud and actionable.

### Batch 2: Module Runner Stack

#### B2-F01: Module terminal results are still reconstructed from legacy envelopes

Refs:

- `skills/nova/pipeline/runners/module-runner-shared.ts:196`
- `skills/nova/pipeline/runners/module-runner-shared.ts:213`
- `skills/nova/pipeline/runners/module-runner-shared.ts:229`
- `skills/nova/pipeline/runners/module-runner-forge.ts:130`
- `skills/nova/pipeline/runners/module-runner/terminal-results.ts:25`

Current behavior:

`buildModuleStepResult` accepts legacy terminal envelopes with `exit`, `status`, `module_dir`, `phase`, `reason`, and diagnostics, then builds a typed pipeline step result.

Risk/complexity:

This is the main compatibility bridge that allows producers to avoid typed result construction. It also duplicates field mapping and reason/status semantics across module phases.

Proposed change:

Introduce a typed terminal result builder for module phases and convert each terminal return path at source. Once all terminal paths return `PipelineStepResult`, delete legacy reconstruction from `buildModuleStepResult`.

Blast radius:

Forge prompt failure, Forge worker failure, no-work, rate-limit, git failure, Buster terminal failure, and retry paths.

Verification needed:

Run module runner unit tests, `check-pipeline-step-result-surface.mjs`, worker control contracts, and an end-to-end pipeline dry run where available.

#### B2-F02: Forge worker input still carries typed and legacy identity in parallel

Refs:

- `skills/nova/pipeline/runners/module-runner-forge.ts:180`
- `skills/nova/pipeline/runners/module-runner-forge.ts:196`
- `skills/nova/pipeline/runners/module-runner-forge.ts:207`

Current behavior:

Forge worker input includes typed `ids` and `executionContext`, but also legacy top-level aliases such as `moduleId`, `moduleDir`, `timeoutMinutes`, `model`, `prompt`, `thinking`, `attempt`, and `headBefore`.

Risk/complexity:

Parallel input shapes keep worker backends coupled to old fields. Tests currently still exercise default dependency paths through top-level input.

Proposed change:

Update worker backends/tests to consume only typed `ids` and `executionContext`, then delete top-level aliases.

Blast radius:

Forge worker invocation, dependency injection tests, and any plugin worker implementation reading legacy top-level fields.

Verification needed:

Run `tests/verification/contracts/check-worker-control-result-surface.mjs`, module worker tests, and plugin worker invocation fixtures.

#### B2-F03: Buster phase contains hidden crash retry and Redis identity fallbacks

Refs:

- `skills/nova/pipeline/runners/module-runner/buster-phase.ts:63`
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts:89`
- `skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts:12`
- `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:48`
- `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:151`

Current behavior:

Buster crash retries default to `2`, completion identity falls back across Redis, camel/snake fields, and status, and terminal failure may still read failure/session evidence from Redis/status metadata.

Risk/complexity:

The Buster phase is correct but hard to reason about because completion, failure class, and session identity are collected from several places.

Proposed change:

Require `max_buster_crash_retries` through validated config/progress. Require canonical completion identity and failure class in Buster worker results. Keep Redis adjudication for external completion evidence, but stop using Redis/status as a typed identity fallback.

Blast radius:

Buster worker completion, Redis task completion, terminal failure reporting, and crash retry behavior.

Verification needed:

Run Buster phase tests, Redis completion tests, and rate-limit/resume tests.

#### B2-F04: Module-runner Buster compatibility re-export can be deleted

Refs:

- `skills/nova/pipeline/runners/module-runner-buster.ts:1`
- `docs/ts-migration/architecture-map.md:263`
- `docs/ts-migration/authority-registry.md:267`
- `docs/pipeline/implementation-map/function-call-map.md:139`
- `tests/verification/contracts/check-operator-alert-surface.mjs:21`

Current behavior:

`module-runner-buster.ts` re-exports the extracted Buster phase implementation for compatibility. Runtime code imports the extracted phase directly.

Risk/complexity:

The shim keeps obsolete module topology alive and forces tests/docs to keep recognizing it.

Proposed change:

Update the one contract check and stale docs to point at canonical files, then delete the re-export.

Blast radius:

Low. Mostly docs/tests/import cleanup.

Verification needed:

Run `check-operator-alert-surface.mjs`, docs reference grep, and TypeScript import checks.

#### B2-F05: Stale Buster suite JS artifact references violate the no-JS policy

Refs:

- `skills/nova/pipeline/runners/module-runner-shared.ts:486`
- `skills/nova/pipeline/runners/module-runner-shared.ts:491`
- `docs/archive/implementation-map-batches/P07-nova-module-runner-top-level-flow.md:23`
- `docs/archive/implementation-map-batches/P07-nova-module-runner-top-level-flow.md:112`

Current behavior:

Buster artifact references still describe suite source files using the old Buster suite JS path shape.

Risk/complexity:

This does not reintroduce executable JS, but it keeps JS-era paths visible in operator artifacts and docs.

Proposed change:

Use canonical TypeScript suite identities or suite registry names instead of JS path references.

Blast radius:

Artifact metadata and docs. Low runtime risk.

Verification needed:

Run no-JS reference checks and artifact snapshot tests if present.

### Batch 3: Gate/Review/Approval Runners

#### B3-F01: Gate invocation code is duplicated across standard, waitable, and remediable paths

Refs:

- `skills/nova/pipeline/runners/gate-runner.ts:204`
- `skills/nova/pipeline/runners/waitable-gate-engine.ts:48`
- `skills/nova/pipeline/runners/remediable-gate-engine.ts:96`

Current behavior:

Each path builds scheduled gate plugin invocations and normalizes gate input with local defaults for stage/gate identity.

Risk/complexity:

Subtle invocation drift is likely as gate types evolve. Unknown/default stage IDs make malformed gate configuration harder to catch.

Proposed change:

Extract a single scheduled gate invocation builder that requires explicit `stageId`, `gateId`, `gateType`, run id, and attempt.

Blast radius:

All gate runners and plugin gate tests.

Verification needed:

Run gate runner tests, waitable/remediable gate tests, and `check-gate-active-session-surface.mjs`.

#### B3-F02: Approval timeout policy has multiple fallback authorities

Refs:

- `skills/nova/pipeline/runners/approval-gate-shared.ts:21`
- `skills/nova/pipeline/runners/approval-gate-control.ts:91`
- `skills/nova/pipeline/runners/approval-gate-control.ts:135`
- `skills/nova/pipeline/runners/approval-gate-runner.ts:468`
- `skills/nova/pipeline/runners/approval-gate-runner.ts:646`

Current behavior:

Timeout policy may come from result, lifecycle state, gate-status metadata, gate config, or default `block`.

Risk/complexity:

Approval timeout is operator-visible control flow. Multiple fallback authorities can make an expired approval gate behave differently depending on which evidence path populated first.

Proposed change:

Validate `gate.on_timeout` at config load. Persist the normalized timeout policy into lifecycle gate state at gate creation. At control-result time, read only lifecycle state, with config as creation-time input rather than runtime fallback.

Blast radius:

Approval gate state creation, timeout behavior, and tests that expect implicit block.

Verification needed:

Approval timeout tests for approve/pass, timeout/block, timeout/fail, stale state, and missing policy rejection.

#### B3-F03: Review/Buster gate controls infer unknown failures from text/status

Refs:

- `skills/nova/pipeline/runners/buster-gate-control.ts:21`
- `skills/nova/pipeline/runners/buster-gate-control.ts:167`
- `skills/nova/pipeline/runners/review-gate-control.ts:38`
- `skills/nova/pipeline/runners/review-gate-control.ts:51`

Current behavior:

Buster gate failure class can be inferred from exit/reason text and defaults to `unknown`. Review gate failure mapping also falls back to unknown/error.

Risk/complexity:

Text/status inference keeps legacy runner output valid and delays producer fixes.

Proposed change:

Require typed failure class/outcome from gate producers. Keep a temporary explicit `unknown_failure` enum only if the producer truly cannot classify, and make it auditable.

Blast radius:

Buster gate fix request generation, review gate failure reporting, and tests that currently pass reason-only failures.

Verification needed:

Gate control contract tests and Buster/review gate fixtures covering unclassified failures.

#### B3-F04: Gate active-session authority is correct and should stay

Refs:

- `skills/nova/pipeline/services/gate-active-session.ts:63`
- `skills/nova/pipeline/services/gate-active-session.ts:139`
- `tests/verification/contracts/check-gate-active-session-surface.mjs:88`

Current behavior:

Lifecycle state decides active gate session. File/tracked evidence is diagnostic only. Persist/clear helpers intentionally tolerate missing diagnostic files.

Risk/complexity:

This code is easy to mistake for legacy compatibility because it still reads diagnostic evidence.

Proposed change:

Keep the authority policy. Only improve missing diagnostic persistence reporting if needed; do not hydrate active session from files.

Blast radius:

Gate session recovery and stuck-session cleanup.

Verification needed:

Keep `check-gate-active-session-surface.mjs` green.

### Batch 4: Session/Runtime/Rate-Limit Authority

#### B4-F01: ACP monitor requires config, then still supplies numeric defaults

Refs:

- `skills/common/pipeline/agents/acp-monitor.ts:120`
- `skills/common/pipeline/agents/acp-monitor.ts:281`
- `skills/nova/pipeline/core/config.ts:245`

Current behavior:

Monitor config is required by Nova validation, but common monitor state construction still defaults unknown/stale poll limits to `10`.

Risk/complexity:

This is a hidden default in the shared runtime path and weakens the validation guarantee.

Proposed change:

Remove numeric defaults from `buildMonitorState`; require `getAcpMonitorConfig` output or explicit validated values at every production call site.

Blast radius:

Nova monitor creation, any Buster/common monitor call sites, and tests that instantiate monitor state directly.

Verification needed:

Monitor config tests, timeout budget checks, and `check-time-budget-surface.mjs`.

#### B4-F02: Gateway integration has local-development defaults mixed into production path

Refs:

- `skills/common/pipeline/integrations/gateway.ts:12`
- `skills/common/pipeline/integrations/gateway.ts:55`
- `skills/common/pipeline/integrations/gateway.ts:87`
- `skills/common/pipeline/integrations/gateway.ts:142`

Current behavior:

Gateway URL falls back to localhost, token falls back to empty string, and invoke options default timeout/retry/delay.

Risk/complexity:

These defaults are convenient locally but hidden in production behavior unless platform config/env is explicit.

Proposed change:

Separate local-development gateway defaults from production gateway resolution. Require gateway URL/token policy from config/env in production and make retry/timeout policy explicit.

Blast radius:

Gateway startup, ACP monitor, Buster runtime gateway wait/monitor, local developer flows.

Verification needed:

Gateway integration tests in both local-default and production-required modes.

#### B4-F03: Rate-limit handling still carries identity/status fallback fields

Refs:

- `skills/nova/pipeline/services/rate-limit.ts:262`
- `skills/nova/pipeline/services/rate-limit.ts:345`
- `skills/nova/pipeline/services/rate-limit-builders.ts:116`
- `skills/nova/pipeline/services/rate-limit-builders.ts:133`
- `skills/nova/pipeline/services/rate-limit-builders.ts:318`
- `tests/verification/contracts/check-rate-limit-slice-surface.mjs:159`

Current behavior:

Rate-limit finalization uses central helpers, but module/gate status builders still accept many fallback fields. Contract tests currently assert some gateway-label fallback behavior.

Risk/complexity:

Rate-limit behavior is high impact. The helpers are centralized, which is good, but the accepted fallback surface is broad.

Proposed change:

Make rate-limit detection producers emit a typed rate-limit diagnostic node with canonical run/session/gateway/attempt/status fields. Then delete fallback fields from builders and update tests to require explicit identity.

Blast radius:

Module/gate rate-limit pause/resume, Discord summaries, operator alerts, and contract checks.

Verification needed:

Run `check-rate-limit-slice-surface.mjs`, rate-limit lifecycle tests, and Discord/operator alert tests.

#### B4-F04: Session authority correctly rejects file/status hydration

Refs:

- `skills/nova/pipeline/services/session-authority.ts:49`
- `skills/nova/pipeline/services/session-authority.ts:108`
- `tests/verification/contracts/check-session-authority-slice-surface.mjs:72`

Current behavior:

Session identity normalization accepts camelCase aliases, but active-session authority is lifecycle read model only. Numeric attempt alone is not strong authority.

Risk/complexity:

The alias normalization is compatibility debt, but the core authority policy is correct.

Proposed change:

Keep lifecycle authority intact. Later, remove camelCase/snake alias acceptance only after all producers use canonical fields.

Blast radius:

Session recovery, module/gate active session diagnostics, and tests that create synthetic identity.

Verification needed:

Keep session authority contract checks green.

#### B4-F05: Session termination defaults should be policy-scoped, not implicit production behavior

Refs:

- `skills/common/pipeline/agents/session-termination.ts:13`
- `skills/common/pipeline/agents/session-termination.ts:80`
- `skills/common/pipeline/agents/session-termination.ts:152`

Current behavior:

Termination grace/poll intervals have shared defaults, no-session-key is an idempotent confirmed result, and active-session termination preserves files when termination is unconfirmed.

Risk/complexity:

The idempotent semantics are useful. The timing defaults are less clearly policy-owned.

Proposed change:

Keep no-session-key idempotence and unconfirmed preservation. Move grace/poll defaults to validated runtime config or explicitly named helper defaults.

Blast radius:

Shutdown hooks, stuck-session cleanup, and tests that omit termination options.

Verification needed:

Session termination tests and shutdown integration tests.

### Batch 5: Telemetry/Discord/Operator Surfaces

#### B5-F01: Discord audit reconstructs correlation by parsing rendered fields

Refs:

- `skills/nova/pipeline/integrations/discord.ts:25`
- `skills/nova/pipeline/integrations/discord.ts:183`
- `skills/nova/pipeline/integrations/discord.ts:257`
- `skills/nova/pipeline/services/discord-fields.ts:1`

Current behavior:

Discord field builders are canonicalized through shared rate-limit contract helpers, but audit correlation is extracted by scanning field names and values.

Risk/complexity:

Rendered message fields are presentation, not data authority. Parsing them makes correlation fragile and duplicates operator identity logic.

Proposed change:

Pass structured correlation metadata alongside Discord fields. Keep `discord-fields.ts` as presentation-only.

Blast radius:

Discord audit logs, observability degraded/restored incidents, rate-limit summaries, and operator alerts.

Verification needed:

Discord audit tests proving structured run/module/session/gateway identity is preserved without parsing field labels.

#### B5-F02: Telemetry builders infer gate/module type from step ids

Refs:

- `skills/nova/pipeline/services/telemetry/builders.ts:101`
- `skills/nova/pipeline/services/telemetry/builders.ts:218`
- `skills/nova/pipeline/services/telemetry/builders.ts:298`

Current behavior:

Pipeline halted telemetry infers gate/module semantics from step id and configured gates.

Risk/complexity:

Telemetry should reflect typed step authority, not rebuild classification from naming conventions.

Proposed change:

Use typed `PipelineStepResult` metadata/diagnostics as telemetry input. Remove step-id inference after producers include explicit stage/kind.

Blast radius:

Telemetry event shape and tests/snapshots.

Verification needed:

Telemetry builder tests and end-to-end halted pipeline telemetry checks.

#### B5-F03: Durable operator alert ordering should stay

Refs:

- `skills/nova/pipeline/services/telemetry.ts:29`
- `tests/verification/contracts/check-operator-alert-surface.mjs:48`

Current behavior:

Operator alerts are recorded durably before external notification sinks.

Risk/complexity:

This is exactly the right failure mode for Discord/webhook degradation.

Proposed change:

Keep this ordering. Simplify around it, not through it.

Blast radius:

Operator alert reliability.

Verification needed:

Keep `check-operator-alert-surface.mjs` green, especially after deleting `module-runner-buster.ts`.

#### B5-F04: Buster telemetry has explicit degraded/fallback behavior that should stay, but identity should tighten

Refs:

- `skills/buster/pipeline/services/telemetry.ts:145`
- `skills/buster/pipeline/services/telemetry.ts:192`
- `skills/buster/pipeline/services/telemetry.ts:252`
- `skills/buster/pipeline/services/telemetry.ts:285`
- `skills/buster/pipeline/services/telemetry.ts:500`

Current behavior:

Buster telemetry records unavailable identity and fallback events instead of throwing when stream identity is missing. Canonical plugin events are emitted as `plugin.event`.

Risk/complexity:

Fallback event persistence is useful for reliability, but missing project/run/module identity should become rarer and louder.

Proposed change:

Keep local fallback telemetry. Tighten task/runtime validation so missing identity is a producer error except during bootstrap/degraded paths.

Blast radius:

Buster telemetry context creation and fallback event tests.

Verification needed:

Buster telemetry tests for valid identity, missing identity degraded event, and canonical `plugin.event` shape.

### Batch 6: Buster Runtime/Suite Surface

#### B6-F01: Buster runtime loop uses raw sleep and minimal structured diagnostics

Refs:

- `skills/buster/buster-pipeline.ts:147`
- `skills/buster/buster-pipeline.ts:181`

Current behavior:

Buster waits for gateway, recovers orphan sessions diagnostically, monitors gateway, optionally pre-pulls base images, and loops. Loop errors log to stderr and sleep for 3000 ms.

Risk/complexity:

The runtime behavior is simple, but raw loop sleep/backoff is not centrally policy-owned and does not emit the same structured degraded evidence as other surfaces.

Proposed change:

Use shared abortable sleep/backoff config and emit a structured runtime degraded event on loop errors.

Blast radius:

Buster runtime resiliency and shutdown timing.

Verification needed:

Buster runtime loop tests with abort signal and gateway degraded cases.

#### B6-F02: Suite runner has dead dependency fallback and hidden timeout/default identity

Refs:

- `skills/buster/pipeline/runners/suite-runner.ts:38`
- `skills/buster/pipeline/runners/suite-runner.ts:199`
- `skills/buster/pipeline/runners/suite-runner.ts:240`
- `skills/buster/pipeline/runners/suite-runner.ts:330`
- `skills/buster/pipeline/runners/suite-runner.ts:443`

Current behavior:

Suite timeout defaults to five minutes, result directory is hardcoded, dependencies default to `['build', 'health']` if a suite is missing from the map, and summary identity can default to `unknown`.

Risk/complexity:

The dependency fallback is dead because suite names are validated and all known suites are mapped. Timeout/result-dir defaults are hidden runtime policy. Unknown identity can hide task validation regressions.

Proposed change:

Delete dependency fallback and assert suite/dependency maps stay in sync. Require explicit timeout/result-dir policy from validated config or a named local default. Treat missing module/project identity as validation failure.

Blast radius:

Suite execution tests, result artifact locations, and task payload tests.

Verification needed:

Suite runner tests for every known suite, dependency skip behavior, timeout policy, and invalid identity rejection.

#### B6-F03: Buster task validation is strong and should stay

Refs:

- `skills/buster/pipeline/services/task-validation.ts:83`
- `skills/buster/pipeline/services/task-validation.ts:92`
- `skills/buster/pipeline/services/task-validation.ts:106`

Current behavior:

Buster requires task type, module/project/run/attempt/dispatch/commit/output fields and rejects legacy `status_json_path`. Capabilities still accept `payload.buster_capabilities` alias.

Risk/complexity:

Validation is an important boundary. The only simplification target is the compatibility capabilities alias.

Proposed change:

Keep strict validation. Remove `buster_capabilities` alias once all producers emit canonical `capabilities`.

Blast radius:

Buster task producers and queue payload tests.

Verification needed:

Buster task validation tests and Redis transport policy checks.

#### B6-F04: Repo path resolution contains hardcoded workspace layout

Refs:

- `skills/buster/pipeline/suites/repo-paths.ts:8`
- `skills/buster/pipeline/suites/repo-paths.ts:21`

Current behavior:

Buster suite path helpers default to `/home/node/.openclaw/workspace/git-repo` and then resolve repo-scoped paths.

Risk/complexity:

The path policy is visible but not portable. It couples suites to one runtime layout.

Proposed change:

Resolve repo root from validated runtime config or shared `getRepoRoot` equivalent. Keep repo-scoped path rejection.

Blast radius:

Buster suites, local tests, and container runtime layout.

Verification needed:

Run `check-buster-repo-scoped-paths.mjs` and suite tests with configured repo root.

#### B6-F05: Non-blocking result writes should stay, but diagnostics should be structured

Refs:

- `skills/buster/pipeline/runners/suite-runner.ts:116`
- `skills/buster/pipeline/runners/suite-runner.ts:261`

Current behavior:

Suite result write failures are warned but do not change verdict execution.

Risk/complexity:

Non-blocking writes preserve test execution reliability. Plain warnings are less observable.

Proposed change:

Keep non-blocking semantics. Report structured Buster telemetry/diagnostic events for result write failures.

Blast radius:

Suite artifact observability only.

Verification needed:

Suite runner test where result directory is unwritable and verdict still returns while telemetry records degradation.

### Batch 7: Docs/Verification/Dead Policy References

#### B7-F01: Docs still preserve JS-era and compatibility shim language

Refs:

- `docs/archive/implementation-map-batches/P07-nova-module-runner-top-level-flow.md:23`
- `docs/archive/implementation-map-batches/P07-nova-module-runner-top-level-flow.md:112`
- `docs/ts-migration/architecture-map.md:263`
- `docs/ts-migration/authority-registry.md:267`
- `docs/pipeline/implementation-map/function-call-map.md:139`
- `docs/ts-migration/fallback-ledger.md:638`
- `docs/ts-migration/phase-0-batch-plan.md:907`

Current behavior:

Docs still describe module-runner Buster compatibility re-export and old JS paths.

Risk/complexity:

These references keep obsolete policy alive and make future reviews treat dead shims as intentional architecture.

Proposed change:

Update docs to canonical TypeScript phase paths and mark the re-export deletion as complete.

Blast radius:

Docs and any doc-driven architecture checks.

Verification needed:

Run docs reference grep for JS path references, compatibility re-export language, and the deleted Buster facade name.

#### B7-F02: Verification tests currently bless some fallbacks that should be phased out

Refs:

- `tests/verification/contracts/check-rate-limit-slice-surface.mjs:159`
- `tests/verification/contracts/check-worker-control-result-surface.mjs:176`
- `tests/verification/contracts/check-operator-alert-surface.mjs:21`
- `tests/verification/contracts/check-pipeline-step-result-surface.mjs:201`

Current behavior:

Some tests correctly prevent legacy result authority, but others still assert fallback behavior such as rate-limit gateway-label fallback, top-level worker input dependency paths, and module-runner-buster source scanning.

Risk/complexity:

Tests are now partially enforcing the debt they were originally written to contain.

Proposed change:

Update tests in lockstep with producer migrations. Do not simply delete checks; replace them with stricter canonical-input assertions.

Blast radius:

Verification suite and migration confidence.

Verification needed:

Run the full verification matrix below after each implementation batch.

#### B7-F03: Platform config defaults should be documented as explicit config, not hidden runtime fallback

Refs:

- `charts/kubeclaw/files/config/swarm.config.json:13`
- `charts/kubeclaw/files/config/swarm.config.json:24`
- `charts/kubeclaw/files/config/swarm.config.json:73`
- `charts/kubeclaw/files/config/swarm.config.json:75`
- `docs/architecture-validator-reference.md:191`

Current behavior:

Platform config contains explicit defaults such as default timeouts, monitor poll limits, fallback model, and review defaults. Architecture validator docs also describe fallback model behavior.

Risk/complexity:

These are not hidden if they are loaded from validated config, but docs should distinguish explicit platform defaults from runtime fallback literals.

Proposed change:

Document "validated platform config defaults" as allowed. Remove or flag runtime literals that bypass config.

Blast radius:

Docs and policy checks.

Verification needed:

Config validation tests and docs grep for ambiguous "fallback" wording.

## High-Confidence Deletions

1. Delete `skills/nova/pipeline/runners/module-runner-buster.ts:1` after updating references.
2. Remove Buster suite JS source artifact references in `skills/nova/pipeline/runners/module-runner-shared.ts:486`.
3. Remove dead dependency fallback `DEPENDENCIES[suiteName] || ['build', 'health']` at `skills/buster/pipeline/runners/suite-runner.ts:240`.
4. Delete unused `DEFAULT_TIMEOUT_MINUTES` at `skills/nova/pipeline/runners/approval-gate-shared.ts:19` if import cleanup confirms no use.
5. Remove stale docs references listed in B7-F01.
6. Remove `buster_capabilities` alias in `skills/buster/pipeline/services/task-validation.ts:106` after producer audit.

## Default Fallback Removals To Phase

- Pipeline step outcome inference from metadata/issueType/action defaults: `skills/nova/pipeline/services/contracts/pipeline-step-result.ts:181`.
- Forge worker issue/outcome defaults: `skills/nova/pipeline/agents/module-worker-control-results.ts:18` and `skills/nova/pipeline/agents/module-worker-control-results.ts:62`.
- Forge harness fallback to literal `forge`: `skills/nova/pipeline/runners/module-runner-forge.ts:103`.
- Buster crash retry literal `2`: `skills/nova/pipeline/runners/module-runner/buster-phase.ts:63`.
- Approval timeout fallback to block: `skills/nova/pipeline/runners/approval-gate-shared.ts:21`.
- ACP monitor numeric defaults: `skills/common/pipeline/agents/acp-monitor.ts:281`.
- Gateway localhost/empty-token/default retry behavior: `skills/common/pipeline/integrations/gateway.ts:55`, `skills/common/pipeline/integrations/gateway.ts:87`, `skills/common/pipeline/integrations/gateway.ts:142`.
- Rate-limit detail/status fallback fields: `skills/nova/pipeline/services/rate-limit-builders.ts:116`, `skills/nova/pipeline/services/rate-limit-builders.ts:133`.
- Suite timeout and unknown identity defaults: `skills/buster/pipeline/runners/suite-runner.ts:199`, `skills/buster/pipeline/runners/suite-runner.ts:330`.
- Hardcoded Buster repo root: `skills/buster/pipeline/suites/repo-paths.ts:8`.

## Things That Should Stay

- Lifecycle read model as active-session authority: `skills/nova/pipeline/services/session-authority.ts:108`.
- Gate active-session lifecycle authority: `skills/nova/pipeline/services/gate-active-session.ts:63`.
- Contract-invalid raw diagnostics: `skills/nova/pipeline/services/contracts/worker-control-result.ts:110`, `skills/nova/pipeline/services/contracts/gate-control-result.ts:229`.
- Redis completion adjudication in Buster phase while Redis remains an external completion source: `skills/nova/pipeline/runners/module-runner/buster-phase.ts:140`.
- Durable operator alert before external sinks: `skills/nova/pipeline/services/telemetry.ts:29`.
- Buster strict task validation and legacy `status_json_path` rejection: `skills/buster/pipeline/services/task-validation.ts:92`.
- Suite result writes remaining non-blocking: `skills/buster/pipeline/runners/suite-runner.ts:116`.

## Recommended Implementation Sequence

1. Docs/test cleanup with no behavior changes:
   - Update stale JS and compatibility re-export docs.
   - Update `check-operator-alert-surface.mjs` to inspect canonical files.
   - Delete `module-runner-buster.ts`.
   - Remove JS artifact references.

2. Dead/default cleanup with low blast radius:
   - Remove Buster suite dependency fallback.
   - Delete unused approval timeout constant.
   - Require plugin manifest `defaultEnabled`.
   - Move permissive plugin normalization behind a named test/local helper.

3. Add observability before removing runtime fallbacks:
   - Instrument `PipelineStepResult` fallback source usage.
   - Instrument rate-limit builder fallback usage.
   - Instrument gate timeout fallback source usage.
   - Instrument gateway local-default usage.

4. Convert producers to typed canonical output:
   - Module terminal returns produce `PipelineStepResult` directly.
   - Forge/Buster workers emit explicit issue/outcome/failure/session identity.
   - Gate controls emit explicit failure class/outcome/status.
   - Rate-limit producers emit a canonical typed diagnostic node.

5. Delete compatibility adapters:
   - Remove module terminal envelope reconstruction.
   - Remove legacy top-level worker input aliases.
   - Remove pipeline-step metadata/issueType/action-default inference.
   - Remove Buster Redis/status identity fallback from typed result paths.

6. Tighten runtime config:
   - Move monitor/session/gateway/suite timeout defaults into validated config or named local-dev helpers.
   - Require Buster repo root from config/shared root resolution.
   - Preserve explicit platform config defaults documented in chart config.

7. Final verification pass:
   - Run full contract verification and targeted runtime/suite tests.
   - Grep docs/code for deleted compatibility names, stale JS suite paths, and new hidden fallback literals.

## Verification Matrix

Batch 0:

- `node tests/verification/contracts/check-session-authority-slice-surface.mjs`
- `node tests/verification/contracts/check-gate-active-session-surface.mjs`
- Registry/config validation tests

Batch 1:

- `node tests/verification/contracts/check-pipeline-step-result-surface.mjs`
- `node tests/verification/contracts/check-worker-control-result-surface.mjs`
- Gate control contract tests

Batch 2:

- Module runner tests
- Buster phase tests
- `node tests/verification/contracts/check-worker-control-result-surface.mjs`
- `node tests/verification/contracts/check-operator-alert-surface.mjs`
- Import/typecheck after deleting `module-runner-buster.ts`

Batch 3:

- Approval gate timeout tests
- Review gate and Buster gate control tests
- `node tests/verification/contracts/check-gate-active-session-surface.mjs`

Batch 4:

- `node tests/verification/contracts/check-rate-limit-slice-surface.mjs`
- `node tests/verification/contracts/check-time-budget-surface.mjs`
- ACP monitor tests
- Gateway integration tests
- Session termination tests

Batch 5:

- `node tests/verification/contracts/check-operator-alert-surface.mjs`
- `node tests/verification/contracts/check-observability-catch-reporting.mjs`
- Discord audit tests
- Telemetry builder tests
- Buster telemetry tests

Batch 6:

- Buster task validation tests
- Suite runner tests
- `node tests/verification/contracts/check-buster-repo-scoped-paths.mjs`
- `node tests/verification/contracts/check-redis-transport-policy.mjs`

Batch 7:

- `node tests/verification/contracts/check-phase10-nova-service-facades.mjs`
- `rg` docs/skills/tests for the deleted Buster facade name, compatibility re-export language, stale JS suite paths, and old JS wording.
- Full repo typecheck/test target used by current CI

Final implementation gate:

- Full verification must remain green.
- No JS reintroduction.
- No typed contract authority regression.
- Lifecycle/read-model authority remains intact.
- No silent fallback to legacy status/result shapes.
- No hidden default model/config/session behavior.

## Open Questions

1. Should localhost gateway defaults remain available through a named local-development mode, or should every runtime path require explicit gateway config/env?
2. Is platform `fallback_model` considered an approved explicit config default for all model resolution, or should some agents require per-role model configuration with no fallback?
3. Can all plugin manifests be required to declare `defaultEnabled`, or are externally supplied plugins allowed to omit that field?
4. Should `status-store-compat.ts` be renamed to a diagnostic projection name before deleting exports, to prevent accidental authority changes?
5. What is the intended canonical Buster suite source identity for artifacts: TypeScript file path, suite registry key, or both?
6. Should Buster result write failures remain non-blocking in all environments, or should CI/test-like modes fail hard when artifacts cannot be written?
7. How long should the fallback-source instrumentation phase run before deleting pipeline-step and rate-limit fallback paths?
