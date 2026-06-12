# Terminal Status Exit Code Inventory

Status: phase 0 inventory
Owner: Nova / maintainers
Created: 2026-06-06
Companion plan: `terminal-status-exit-code-removal-plan.md`

## Summary

Numeric exit codes are currently an internal pipeline domain concept, not just a process-boundary detail.

The active consumers are concentrated in:

- Nova pipeline constants and public exports
- pipeline-step result compatibility projection
- module/gate/validator runner terminal results
- terminal halt orchestration
- telemetry payload schema and builders
- summary/replay artifact writers
- operator and Nova handoff presentation
- verification tests and active docs

No current GitHub workflow, deployment script, or shell wrapper was found that depends on special Nova process codes `10`, `20`, `30`, or `40`. Existing shell/process uses are generic command success/failure exits or helper-tool CLIs.

## Coverage Boundary

This inventory classifies active, non-archive runtime, test, docs, chart, script, example, and values-file occurrences.

Historical archive docs were searched too. They still contain many old references, but they are not migration blockers unless a live verification doc asserts them. They should remain historical or be handled by a final archive-note sweep, not by the runtime migration.

## Search Snapshot

Commands used:

```sh
rg -l "\bEXIT_(OK|ERROR|NEEDS_NOVA|BLOCKED|TIMEOUT|RATE_LIMITED)\b|\bNEEDS_NOVA\b|\bexit_code\b|\bexit_reason\b|\bexit\b" skills/nova/pipeline skills/common/pipeline
rg -l "\bEXIT_(OK|ERROR|NEEDS_NOVA|BLOCKED|TIMEOUT|RATE_LIMITED)\b|\bNEEDS_NOVA\b|\bexit_code\b|\bexit_reason\b|\bexit\b" tests/verification tests/skills
rg -l "\bEXIT_(OK|ERROR|NEEDS_NOVA|BLOCKED|TIMEOUT|RATE_LIMITED)\b|\bNEEDS_NOVA\b|\bexit codes?\b|\bexit_code\b|\bexit_reason\b" docs -g '!docs/archive/**'
rg -n "EXIT_NEEDS_NOVA|EXIT_BLOCKED|EXIT_TIMEOUT|EXIT_RATE_LIMITED|exit 10|exit 20|exit 30|exit 40|NEEDS_NOVA|RATE_LIMITED|process.exitCode|runPipeline|pipeline.ts|nova/pipeline" .github scripts docs/operators docs/deployment docs/reference docs/pipeline
rg -l "\bEXIT_(OK|ERROR|NEEDS_NOVA|BLOCKED|TIMEOUT|RATE_LIMITED)\b|\bNEEDS_NOVA\b|\bexit_code\b|\bexit_reason\b|\bterminal\.exitCode\b|\bexitCode\b|\bexit_label\b|\bexitLabel\b|\bprocess\.exit(Code)?\b|\bprocess\.exit\(" skills tests docs scripts .github -g '!docs/archive/**'
```

Approximate active-match counts under `skills/nova/pipeline`, `skills/common/pipeline`, `tests`, and non-archive `docs`:

- `EXIT_OK`: 65
- `EXIT_ERROR`: 104
- `EXIT_NEEDS_NOVA`: 64
- `EXIT_BLOCKED`: 39
- `EXIT_TIMEOUT`: 22
- `EXIT_RATE_LIMITED`: 50
- `NEEDS_NOVA`: 54
- `exit_code`: 91
- `exit_reason`: 49

These counts are a migration sizing signal, not a replacement checklist. Some matches are comments, docs, or tests that should disappear after runtime changes.

The full repo-wide sweep also found:

- active deployment/config occurrences in `charts/kubeclaw/templates/deployment.yaml`, `examples/nova-values.yaml`, and `my-values/nova-values.yaml`
- active helper CLI/process-boundary occurrences in Buster tools, lint-report tools, project-summary, redis tools, and scripts
- 46 archive files with historical matches under `docs/archive`

## Classification

### Classification keys

- **domain logic**: numeric exit value defines, drives, or derives pipeline meaning
- **operator display**: numeric exit value appears in human-facing wording, handoff text, examples, or runbooks
- **artifact/schema**: numeric exit value is persisted in telemetry, lifecycle, summary, replay, or schema surfaces
- **test expectation**: test or verification asserts numeric exit fields or old labels
- **process boundary**: normal command/process exit code for a CLI, shell script, deployment command, or test runner

### Domain logic

These files currently define, map, or interpret numeric exits as pipeline meaning.

- `skills/nova/pipeline/core/constants.ts`
  - Defines `EXIT_OK = 0`, `EXIT_ERROR = 1`, `EXIT_NEEDS_NOVA = 10`, `EXIT_BLOCKED = 20`, `EXIT_TIMEOUT = 30`, and `EXIT_RATE_LIMITED = 40`.
- `skills/nova/pipeline/index.ts`
  - Re-exports the numeric constants as public pipeline API.
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`
  - Defines `PIPELINE_STEP_EXIT_CODES`, `PIPELINE_STEP_EXIT_LABELS`, `pipelineStepExitCodeForOutcome(...)`, `pipelineStepExitLabelForCode(...)`, `pipelineStepExitCode(...)`, and `pipelineStepExitLabel(...)`.
  - Stores `terminal.exitCode` / `terminal.exitLabel` inside typed step result compatibility data.
- `skills/nova/pipeline/runners/module-runner/attempt.ts`
  - Maps raw `result.exit` back to typed step outcomes in `moduleTerminalOutcomeForExit(...)`.

Target:

- Replace with `PipelineTerminalStatus` and `PipelineTerminalDecision`.
- Delete numeric outcome projection from core domain contracts.
- Treat any future number conversion as a boundary adapter only.

Active file classification:

- `skills/nova/pipeline/core/constants.ts`: domain logic
- `skills/nova/pipeline/index.ts`: domain logic/public API
- `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`: domain logic, artifact/schema compatibility
- `skills/nova/pipeline/runners/module-runner/attempt.ts`: domain logic, producer normalization
- `skills/nova/pipeline/services/failures/classification.ts`: domain logic
- `skills/nova/pipeline/services/failures/retry-policy.ts`: domain logic, producer result
- `skills/nova/pipeline/services/rate-limit-exit.ts`: domain logic, artifact/schema, operator projection
- `skills/nova/pipeline/services/status-store.ts`: artifact/schema compatibility, domain lifecycle projection
- `skills/nova/pipeline/services/lint.ts`: process-boundary command metadata, not pipeline terminal domain
- `skills/nova/pipeline/core/temp.ts`: process-boundary cleanup hook, not pipeline terminal domain

### Scheduler and halt actions

These files branch on or return numeric terminal values as orchestration instructions.

- `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
  - Uses `EXIT_LABELS`.
  - `shouldInjectNeedsNovaForExit(...)` triggers Nova handoff for numeric `10` or `30`.
  - `shouldEmitEscalationForExit(...)` emits escalation for numeric `10`, `20`, or `30`.
  - Writes `exit`, `exit_code`, and `exit_reason` into halt outputs, telemetry, summaries, and Discord fields.
- `skills/nova/pipeline/runners/pipeline-runner-start.ts`
  - Uses normalized numeric exits for single-module halt and architecture validation halt handling.
- `skills/nova/pipeline/runners/pipeline-runner-shared.ts`
  - Builds halt payload identity and exposes `exit_code` from `result.exit`.
  - Special-cases identity exposure against `EXIT_BLOCKED`.
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
  - Carries scheduled-generator `exitCode` and `exitReason` fields.

Target:

- Terminal scheduler branches should consume typed decision status/action.
- Handoff, escalation, summary, and operator projections should consume `PipelineTerminalDecision`.

Active file classification:

- `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`: domain logic, operator display, artifact/schema, process-boundary return
- `skills/nova/pipeline/runners/pipeline-runner-start.ts`: domain logic, artifact/schema, process-boundary return
- `skills/nova/pipeline/runners/pipeline-runner-shared.ts`: domain logic, artifact/schema
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`: artifact/schema, scheduled-generator compatibility

### Producer results

These files produce terminal objects with `exit: EXIT_*` or compare `result.exit`.

Module and Forge/Buster module paths:

- `skills/nova/pipeline/runners/module-runner-forge.ts`
- `skills/nova/pipeline/runners/module-runner-prebuster.ts`
- `skills/nova/pipeline/runners/module-runner-buster-worker.ts`
- `skills/nova/pipeline/runners/module-runner/state-machine.ts`
- `skills/nova/pipeline/runners/module-runner/terminal-results.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts`

Gate paths:

- `skills/nova/pipeline/runners/buster-gate-runner.ts`
- `skills/nova/pipeline/runners/buster-gate-terminal.ts`
- `skills/nova/pipeline/runners/buster-gate-completion.ts`
- `skills/nova/pipeline/runners/buster-gate-control.ts`
- `skills/nova/pipeline/runners/review-gate-runner.ts`
- `skills/nova/pipeline/runners/review-gate-control.ts`
- `skills/nova/pipeline/runners/review-gate-task.ts`
- `skills/nova/pipeline/runners/approval-gate-runner.ts`
- `skills/nova/pipeline/runners/approval-gate-control.ts`
- `skills/nova/pipeline/runners/approval-gate-state.ts`
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts`

Failure/rate-limit paths:

- `skills/nova/pipeline/services/failures/retry-policy.ts`
- `skills/nova/pipeline/services/failures/classification.ts`
- `skills/nova/pipeline/services/rate-limit-exit.ts`
- `skills/nova/pipeline/services/rate-limit-builders.ts`
- `skills/nova/pipeline/services/rate-limit.ts`

Target:

- Owners should produce typed terminal data directly.
- Gate control result builders should stop requiring `result.exit` to infer pass/fail/request-fix/rate-limited behavior.
- Rate-limit exhaustion should produce `status: 'rate_limited'`, not `EXIT_RATE_LIMITED`.

Active file classification:

- `skills/nova/pipeline/runners/module-runner-forge.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/module-runner-prebuster.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/module-runner-buster-worker.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/module-runner/state-machine.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/module-runner/terminal-results.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts`: domain logic, producer result, operator semantics
- `skills/nova/pipeline/runners/buster-gate-runner.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/buster-gate-terminal.ts`: domain logic, producer result, operator semantics
- `skills/nova/pipeline/runners/buster-gate-completion.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/buster-gate-control.ts`: domain logic, gate control mapping
- `skills/nova/pipeline/runners/review-gate-runner.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/review-gate-control.ts`: domain logic, gate control mapping
- `skills/nova/pipeline/runners/review-gate-task.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/approval-gate-runner.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/approval-gate-control.ts`: domain logic, gate control mapping
- `skills/nova/pipeline/runners/approval-gate-state.ts`: domain logic, producer result
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts`: domain logic, producer result
- `skills/nova/pipeline/services/rate-limit-builders.ts`: domain logic, artifact/schema
- `skills/nova/pipeline/services/rate-limit.ts`: domain logic
- `skills/nova/pipeline/agents/shutdown.ts`: process boundary, shutdown return metadata

### Operator display and Nova handoff

These files surface numeric exit semantics to people or handoff paths.

- `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
  - Discord presentation includes `Exit Code`.
  - Description says `Exit: ...`.
  - Branches to Nova handoff by numeric code.
- `skills/nova/pipeline/services/failures/presentation.ts`
  - `injectNeedsNova(...)` reads `result.exit`.
  - Uses `exitLabel` of `TIMEOUT` or `NEEDS_NOVA`.
  - Writes `exit` and `exit_label` into `nova-injections.jsonl`.
  - Handoff message includes `Exit: ...`.
- `skills/nova/pipeline/services/durable-operator-alert.ts`
  - Durable alert writer itself is generic, but current callers pass numeric exit fields.

Target:

- Operator display should lead with `Status`, `Action`, and `Reason`.
- Nova handoff should trigger on `terminal_status: 'action_required'`.
- `nova-injections.jsonl` should record typed terminal status and reason code, not `exit` / `exit_label`.

Active file classification:

- `skills/nova/pipeline/services/failures/presentation.ts`: operator display, Nova handoff, artifact/schema
- `skills/nova/pipeline/services/durable-operator-alert.ts`: artifact/schema, operator-alert sink; numeric fields come from callers
- `skills/nova/pipeline/README.md`: operator/developer display
- `examples/nova-values.yaml`: operator display/prompt text
- `my-values/nova-values.yaml`: operator display/prompt text
- `my-values/buster-values.yaml`: operator/developer prompt text for Buster helper exit reporting
- `docs/operators/recovery-runbook.md`: operator display
- `docs/pipeline/failure-and-recovery.md`: operator/developer display
- `docs/pipeline/runtime-flow.md`: operator/developer display
- `docs/reference/exit-codes.md`: operator/developer display, reference schema
- `docs/open-issues.md`: active docs/history; some entries are historical, some describe live tests

### Telemetry payloads

These files make numeric exits part of the published telemetry surface.

- `skills/common/pipeline/services/telemetry/payload-schema.ts`
  - Requires `pipeline.completed.exit_code`.
  - Defines `exit_code` and `exit_reason` for `pipeline.halted`, `summary.started`, and `summary.completed`.
- `skills/nova/pipeline/services/telemetry/builders.ts`
  - `onPipelineCompleted(...)` accepts `exitCode` and emits `exit_code`.
  - `onPipelineHalted(...)` emits `exit_code`.
  - `onEscalated(...)` emits `exit_code`.
  - `onSummaryStarted(...)` / `onSummaryCompleted(...)` pass through numeric fields supplied by callers.

Target:

- Add a canonical terminal-decision event with typed status.
- During migration, projected legacy events may carry old numeric fields temporarily.
- New canonical schemas should use `terminal_status`, `reason_code`, `human_reason`, `operator_action`, `retryable`, and `resumable`.

Active file classification:

- `skills/common/pipeline/services/telemetry/payload-schema.ts`: artifact/schema
- `skills/nova/pipeline/services/telemetry/builders.ts`: artifact/schema, domain projection
- `tests/verification/lib/lifecycle-audit-lib.mjs`: artifact/schema test helper

### Summary and replay artifacts

These files write or index numeric exit semantics in replay artifacts.

- `skills/nova/pipeline/services/summary.ts`
  - Writes `exit_code`, `exit_reason`, and status derived from numeric exit for pipeline summaries.
- `skills/nova/pipeline/services/artifact-bundle.ts`
  - Indexes replay bundle paths, including `nova-injections.jsonl`; not itself numeric, but downstream summary/replay schemas point at numeric-bearing artifacts.
- `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts`
  - Appends lifecycle events with `exit_code` from `result.exit`.
- `skills/nova/pipeline/services/status-store-lifecycle/projections.ts`
  - Projects exit/halt fields into read models.
- `skills/nova/pipeline/tools/project-summary.ts`
  - CLI has normal `process.exit(0/1/2)` behavior.
  - Summary content still participates in the current numeric terminal artifact model.

Target:

- Summary and lifecycle read models should store typed terminal status and reason code.
- Historical replay readers may tolerate old numeric files, but new writers should not require numeric terminal fields.

Active file classification:

- `skills/nova/pipeline/services/summary.ts`: artifact/schema
- `skills/nova/pipeline/services/artifact-bundle.ts`: artifact/schema index
- `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts`: artifact/schema
- `skills/nova/pipeline/services/status-store-lifecycle/projections.ts`: artifact/schema
- `skills/nova/pipeline/tools/project-summary.ts`: process boundary, artifact writer
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`: artifact/schema for generator lifecycle
- `skills/nova/pipeline/tools/lint-report/report.ts`: process-boundary command metadata, not pipeline terminal domain
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`: process-boundary command metadata, not pipeline terminal domain
- `skills/nova/pipeline/tools/lint-report/execution.ts`: process-boundary command metadata, not pipeline terminal domain

### CLI and process boundaries

These files use real process exits or `process.exitCode`.

- `skills/nova/pipeline/cli.ts`
  - Imports `EXIT_OK` / `EXIT_ERROR`.
  - Writes JSON outputs with `exit`.
  - Sets `process.exitCode` to pipeline return values.
  - Help text documents `10 NEEDS_NOVA`.
- `skills/nova/pipeline/tools/project-summary.ts`
  - Uses `process.exit(0/1/2)` as a helper CLI.
- `skills/nova/pipeline/tools/lint-report.ts`
  - Computes normal lint-report CLI exit status.
- `skills/nova/pipeline/tools/lint-report/execution.ts`
  - Captures child tool exit codes as command execution metadata.
- `skills/nova/pipeline/tools/redis.ts`
  - Uses normal helper CLI process exits.
- `skills/buster/pipeline/tools/*`
  - Uses normal helper CLI process exits.
- `skills/common/discord-purge.ts`
  - Uses normal helper CLI process exits.
- `scripts/*`
  - Uses normal shell success/failure exits; `scripts/pipeline-light-watchdog.sh` captures notification command exit status generically.

Target:

- Keep generic helper CLI exits where they are truly process-boundary behavior.
- Remove special pipeline-domain process codes from `skills/nova/pipeline/cli.ts`.
- If the pipeline CLI still needs a process result, use only a boundary adapter near the CLI.

Active file classification:

- `skills/nova/pipeline/cli.ts`: process boundary, operator display, domain leakage
- `skills/nova/pipeline/tools/lint-report.ts`: process boundary
- `skills/nova/pipeline/tools/lint-report/execution.ts`: process-boundary command metadata
- `skills/nova/pipeline/tools/lint-report/report.ts`: process-boundary command metadata
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`: process-boundary command metadata
- `skills/nova/pipeline/tools/project-summary.ts`: process boundary, artifact writer
- `skills/nova/pipeline/tools/redis.ts`: process boundary
- `skills/nova/pipeline/services/lint.ts`: process-boundary child command interpretation
- `skills/nova/pipeline/core/temp.ts`: process-boundary cleanup hook
- `skills/buster/buster-pipeline.ts`: process boundary
- `skills/buster/pipeline/services/gateway-health.ts`: process-boundary health command result
- `skills/buster/pipeline/suites/e2e.ts`: process-boundary child command metadata
- `skills/buster/pipeline/suites/unit.ts`: process-boundary child command metadata
- `skills/buster/pipeline/tools/redis.ts`: process boundary
- `skills/buster/pipeline/tools/screenshot.ts`: process boundary
- `skills/buster/pipeline/tools/verify-task.ts`: process boundary
- `skills/buster/pipeline/tools/visual-audit.ts`: process boundary
- `skills/common/discord-purge.ts`: process boundary
- `scripts/check-ts-migration-guardrails.mjs`: process boundary
- `scripts/clawpatch-pipeline-light.mjs`: process boundary
- `scripts/deploy.sh`: process boundary
- `scripts/pipeline-light-openclaw-notify.sh`: process boundary
- `scripts/pipeline-light-watchdog.sh`: process boundary
- `scripts/setup.sh`: process boundary
- `my-values/setup-secrets.sh`: process boundary
- `my-values/buster-values.yaml`: process-boundary command snippet plus operator prompt text
- `charts/kubeclaw/templates/deployment.yaml`: process boundary inside container startup command

These are not reasons to preserve domain-specific `10/20/30/40` semantics. They are normal command status handling unless called out above as Nova CLI domain leakage.

### Active docs

Active non-archive docs still describe numeric exits as current behavior.

- `docs/reference/exit-codes.md`
- `docs/pipeline/failure-and-recovery.md`
- `docs/pipeline/runtime-flow.md`
- `docs/operators/recovery-runbook.md`
- `docs/decisions/pipeline-decisions.md`
- `docs/reference/README.md`
- `docs/developers/adding-gates.md`
- `docs/open-issues.md`
- `docs/README.md`
- `docs/DOCUMENTATION_PLAN.md`
- `docs/DOCUMENTATION_WORKFLOW.md`
- `docs/deployment/agent-deployments.md`

Target:

- Replace exit-code reference docs with typed terminal status docs.
- Move old numeric semantics to archive only if useful for historical context.
- Update runtime-flow wording so terminal halt consequences are projections of a typed decision.

Active file classification:

- `docs/reference/exit-codes.md`: operator/developer display, reference schema
- `docs/pipeline/failure-and-recovery.md`: operator/developer display
- `docs/pipeline/runtime-flow.md`: operator/developer display
- `docs/operators/recovery-runbook.md`: operator display
- `docs/decisions/pipeline-decisions.md`: developer decision record
- `docs/developers/adding-gates.md`: developer display
- `docs/reference/README.md`: reference index
- `docs/README.md`: documentation index
- `docs/DOCUMENTATION_PLAN.md`: docs planning/index
- `docs/DOCUMENTATION_WORKFLOW.md`: docs workflow guidance
- `docs/deployment/agent-deployments.md`: process-boundary deployment command example
- `docs/open-issues.md`: active docs/history; split live assertions from old resolved notes during cleanup
- `skills/nova/pipeline/README.md`: developer display
- `examples/nova-values.yaml`: operator prompt/config text
- `my-values/nova-values.yaml`: operator prompt/config text
- `my-values/buster-values.yaml`: operator/developer prompt/config text

### Verification

Tests currently assert numeric exits in three ways:

1. Contract tests pin numeric schema and helper surfaces.
2. Behavior tests assert exact `exit`, `exit_code`, `exit_reason`, `NEEDS_NOVA`, and `RATE_LIMITED` payloads.
3. Runtime tests assert CLI process behavior.

High-impact files:

- `tests/verification/contracts/check-pipeline-step-result-surface.mjs`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `tests/verification/contracts/check-gate-control-result-surface.mjs`
- `tests/verification/contracts/check-module-runner-slice-surface.mjs`
- `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`
- `tests/verification/behavior/areas/pipeline.mjs`
- `tests/verification/behavior/areas/module-failures.mjs`
- `tests/verification/behavior/areas/gates.mjs`
- `tests/verification/behavior/areas/summaries.mjs`
- `tests/verification/behavior/areas/telemetry.mjs`
- `tests/verification/behavior/areas/telemetry-docs.mjs`
- `tests/verification/behavior/areas/repo-docs.mjs`
- `tests/skills/nova/pipeline/cli.test.mjs`

Target:

- Add tests for `PipelineTerminalDecision` before deleting numeric expectations.
- Replace numeric assertions with typed terminal-status assertions slice by slice.
- Keep helper CLI tests only for actual process-boundary tools.

Active file classification:

- `tests/verification/contracts/check-pipeline-step-result-surface.mjs`: test expectation, domain contract
- `tests/verification/contracts/check-telemetry-contract.mjs`: test expectation, artifact/schema
- `tests/verification/contracts/check-gate-control-result-surface.mjs`: test expectation, gate control compatibility
- `tests/verification/contracts/check-module-runner-slice-surface.mjs`: test expectation, domain producer
- `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`: test expectation, scheduler/domain
- `tests/verification/contracts/check-rate-limit-slice-surface.mjs`: test expectation, rate-limit helper surface
- `tests/verification/contracts/check-status-store-slice-surface.mjs`: process-boundary test cleanup hook
- `tests/verification/contracts/check-strict-cli-args-surface.mjs`: test expectation, helper CLI process boundary
- `tests/verification/contracts/check-artifact-authority-slice-surface.mjs`: test expectation, artifact/schema
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`: test expectation, process-boundary guard
- `tests/verification/behavior/areas/pipeline.mjs`: test expectation, scheduler/operator/artifact
- `tests/verification/behavior/areas/module-failures.mjs`: test expectation, producer/operator/artifact
- `tests/verification/behavior/areas/gates.mjs`: test expectation, producer/operator/artifact
- `tests/verification/behavior/areas/summaries.mjs`: test expectation, summary/artifact/process-boundary summary tools
- `tests/verification/behavior/areas/telemetry.mjs`: test expectation, artifact/schema
- `tests/verification/behavior/areas/telemetry-docs.mjs`: test expectation, docs/schema
- `tests/verification/behavior/areas/telemetry-schema.mjs`: test expectation, artifact/schema
- `tests/verification/behavior/areas/repo-docs.mjs`: test expectation, docs/operator wording
- `tests/verification/behavior-verification.md`: test expectation/documentation surface
- `tests/verification/behavior/areas/discord-correlation.mjs`: test expectation, operator/Nova handoff artifact fields
- `tests/verification/behavior/areas/many-module-soak.mjs`: test expectation, process-boundary return
- `tests/verification/behavior/areas/polling.mjs`: test expectation, rate-limit terminal compatibility
- `tests/verification/behavior/areas/approvals.mjs`: test expectation, gate terminal compatibility
- `tests/verification/behavior/areas/fix-cycles.mjs`: test expectation, gate terminal compatibility
- `tests/verification/behavior/areas/governance.mjs`: test expectation, gate terminal compatibility
- `tests/verification/behavior/areas/restart-recovery.mjs`: test expectation, process-boundary return
- `tests/verification/behavior/areas/stops.mjs`: test expectation, terminal compatibility
- `tests/verification/behavior/areas/buster-runtime-normalization.mjs`: test expectation, process-boundary guard
- `tests/verification/behavior/areas/foundations.mjs`: test expectation, process-boundary or fixture refs
- `tests/verification/behavior/areas/migrated-seams.mjs`: test expectation
- `tests/verification/behavior/areas/resume-idempotence.mjs`: test expectation
- `tests/verification/behavior/verify.mjs`: process boundary for verifier
- `tests/verification/lib/verification-console.mjs`: process boundary for verifier
- `tests/verification/live/redis-backend-smoke.mjs`: process boundary for verifier
- `tests/verification/runtime/check-acp-launch.mjs`: process boundary for verifier
- `tests/verification/runtime/check-final-gate-hardening.mjs`: process boundary for verifier
- `tests/verification/runtime/check-nova-startup-smoke.mjs`: test expectation, Nova CLI process boundary
- `tests/verification/runtime/check-buster-startup-smoke.mjs`: process-boundary verifier
- `tests/verification/runtime/check-runtime-collisions.mjs`: process boundary for verifier
- `tests/verification/runtime/check-subagent-launch.mjs`: process boundary for verifier
- `tests/verification/run-fast-verification.sh`: process boundary for verifier
- `tests/verification/run-full-verification.sh`: process boundary for verifier
- `tests/verification/run-local-acp-verification.sh`: process boundary for verifier
- `tests/verification/lib/run-contract-suite.sh`: process boundary for verifier
- `tests/verification/lib/cleanup-home-artifacts.sh`: process boundary for verifier
- `tests/skills/nova/pipeline/cli.test.mjs`: test expectation, process boundary
- `tests/skills/nova/pipeline/runners/module-runner-worker-lifecycle.test.mjs`: test expectation, producer terminal compatibility
- `tests/skills/nova/pipeline/runners/pipeline-runner.test.mjs`: test expectation
- `tests/skills/nova/pipeline/services/failures/presentation.test.mjs`: test expectation, Nova handoff operator/artifact fields
- `tests/skills/nova/pipeline/services/gate-active-session.test.mjs`: test expectation
- `tests/skills/nova/pipeline/services/lint.test.mjs`: test expectation, process-boundary lint behavior
- `tests/skills/nova/pipeline/tools/redis.test.mjs`: process-boundary helper test
- `tests/skills/buster/buster-pipeline.test.mjs`: process-boundary helper test
- `tests/skills/buster/pipeline/suites/perf.test.mjs`: process-boundary command metadata
- `tests/skills/buster/pipeline/suites/unit.test.mjs`: process-boundary command metadata

## External Consumer Check

No dependency on the special pipeline exit codes was found in:

- `.github/workflows/build-images.yaml`
- `scripts/deploy.sh`
- `scripts/pipeline-light-watchdog.sh`
- `scripts/pipeline-light-openclaw-notify.sh`
- `scripts/clawpatch-pipeline-light.mjs`
- deployment docs that start `buster-pipeline.ts`

Observed process exits in scripts are normal shell success/failure control, not semantic consumers of Nova pipeline `10/20/30/40`.

Conclusion:

- There is no evidence that special pipeline process codes must be preserved for current external automation.
- The migration can remove them from pipeline domain logic.
- If a future external consumer appears, add a new boundary adapter intentionally.

## Recommended Removal Order

1. Add `PipelineTerminalDecision` contract and tests.
2. Add a compatibility builder that maps current `pipeline-step-result` outcomes to terminal decisions without numeric fields.
3. Emit/persist the terminal decision from `finalizeTerminalHalt(...)` while preserving current side effects.
4. Move operator alert and Discord presentation to typed status.
5. Move Nova handoff to typed `action_required` policy.
6. Move telemetry schemas to typed terminal status, keeping old projected fields only during transition.
7. Move summary/replay writers to typed terminal status.
8. Convert module/gate/summary producers from `{ exit: EXIT_* }` to typed terminal result data.
9. Delete `EXIT_*`, `PIPELINE_STEP_EXIT_CODES`, `terminal.exitCode`, and numeric docs/tests.

## First Slice Boundary

The next implementation slice should not delete numeric behavior yet.

It should:

- add the terminal decision contract
- add focused validation tests
- add a decision builder from existing step outcomes
- prove the new decision shape has no `exit`, `exit_code`, `exit_reason`, `exitCode`, or `exitLabel`

That gives later slices a stable target for projection rewrites.
