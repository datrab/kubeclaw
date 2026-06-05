# Pipeline implementation map

Status: batch definitions restored for next full review; RV-06 resolved
Audience: maintainers and architects
Archived previous review: `docs/archive/pipeline-implementation-map-review-2026-05-08/`

## Purpose

This directory is the detailed documentation-driven review layer for the post-refactor pipeline audit.

The public pipeline docs explain the architecture. This implementation map records the raw code review evidence behind those docs: env vars, path construction, imports, exports, function calls, authority boundaries, dependencies, and verification coverage. Live findings and decisions belong only in `docs/open-issues.md`.

Use it to answer questions like:

- Which files own lifecycle read models, gate outputs, summaries, telemetry, Redis state, and other pipeline control artifacts?
- Which file has authority over `progress.json`, gate outputs, summaries, telemetry, Redis state, and final exit mapping?
- Which functions are called across module boundaries?
- Which environment variables and config fields are read directly?
- Which helpers are canonical, duplicated, or unclear?
- Which post-refactor seams are too complex, stale, or weakly verified?

## Inventory checked before defining batches

Source inventory command:

```bash
find skills/nova/pipeline -type f | sort
find skills/buster -type f | sort
find skills/common -type f | sort
find tests/verification -type f | sort
```

Current source counts from the live tree:

| Area | File count |
| --- | ---: |
| `skills/nova/pipeline/**` | 215 |
| `skills/buster/**` | 69 |
| `skills/common/**` | 33 |
| `skills/nova/project_setup/**` | 3 |
| `skills/prism/**` | 3 |
| `skills/**` total | 324 |
| `tests/verification/**` | 109 |

## Batch rules

- Review one batch at a time.
- Each batch note lives in `docs/pipeline/implementation-map/batches/`.
- Use `batch-template.md` for every batch.
- Batch size must stay at or below 10 files total. Prefer 5-8 files when the files are large or algorithm-heavy.
- Do not use a wildcard in a scope when its live expansion would exceed 10 files; split the batch instead.
- Read every file in the selected batch end to end. This is mandatory to ensure a complete review.
- Every file under `skills/**` must be covered by at least one batch scope. If new skill files are added, update this README in the same change.
- Also read adjacent tests, contracts, config, and old docs when needed to understand the batch.
- Check `git status --short` before editing and do not overwrite unrelated user changes.
- Update cumulative indexes after each batch:
  - `env-vars-and-inputs.md`
  - `path-construction.md`
  - `function-call-map.md`
  - `authority-map.md`
  - `external-boundaries.md`
  - `logic-and-algorithms-map.md`
  - `data-schemas.md`
  - `prompts-and-agent-behavior.md`
  - `resiliency-and-error-handling.md`
  - `dependency-matrix.md`
  - `concurrency-and-backpressure.md`
  - `acp-protocol.md`
- Put all findings, actionable problems, and deferred verification notes in `docs/open-issues.md` using exact affected file paths and an in-depth issue description.
- Put non-urgent improvement ideas in `docs/future-implementation-ideas.md`.
- When code changes touch pipeline surfaces covered by this map, update the relevant implementation-map tables in the same commit so `docs/pipeline/implementation-map/*` stays current with source reality.
- Run `git diff --check` before finishing.
- Commit the completed batch-note, cumulative-map, and issue-tracker updates with a clear `docs:` commit message unless the requester explicitly says not to commit.



## Required batch workflow

1. Read this README and `batch-template.md` completely.
2. Resolve the requested batch ID from this README and verify its scope expands to 10 files or fewer.
3. Read every scoped file completely before writing conclusions.
4. Create exactly one batch note under `batches/` using the template.
5. Update every cumulative map touched by the scoped files.
6. Add or update open issues for actionable findings; every issue must include exact affected files, in-depth description, impact, and next step.
7. Run validation, review the diff, then commit the batch changes.

Do not ask a review agent to run `V02`, `P01`, or any other batch ID until that ID exists in this README.

## Rerun expansion rules

When rerunning documentation batches, do not stop at call relationships. Each batch must capture the implementation logic needed to reimplement or review the system without guessing.

For every scoped file, record these details when present:

1. **Internal logic and algorithms**
   - Important `if`/`else`, `switch`, guard, precedence, and route-selection conditions.
   - State mutations, including exact merge order, authority precedence, and split-brain behavior.
   - Loop mechanics, including `while`/poll conditions, sleep/backoff, timeout/deadline calculations, and terminal break conditions.
2. **Exact data schemas**
   - JSON artifact structures, payload keys, required/optional/nullable fields, enums, and producer/consumer pairs.
   - Control-result object shapes and the validator/normalizer that enforces them.
   - Event/read-model records such as lifecycle canonical events, telemetry events, Discord webhook payloads, Redis task payloads, and Buster completion payloads.
3. **Prompts and agent behavior**
   - Prompt builders, generated prompt artifact paths, base instructions, few-shot/examples if any, allowed tools, required outputs, and status/progress assumptions embedded in prompts.
   - Buster/Nova/Forge/reviewer tool contracts, especially Redis task schema and expected completion schema.
4. **Error handling and resiliency nuances**
   - Failure classifiers, retryable/non-retryable rules, exact error-code/string matching, timeout thresholds, retry counts, backoff strategy, soft-fail behavior, and terminal escalation.
   - Redaction patterns and the exact classes of secrets they detect.
   - A mandatory telemetry/observability row for every error/resiliency path stating whether telemetry happens and where it is emitted or recorded, for example Discord, Redis stream, filesystem artifact, stdout/log file, or none.
5. **Runtime implementation blockers**
   - External dependency/package matrix and major versions used for Git execution, Redis, Discord HTTP, ACP/session access, and verification tooling.
   - Concurrency/backpressure limits: queue sizes, stream caps, throttles, rate limits, memory/disk assumptions, and what happens when limits are exceeded.
   - ACP protocol details: session identifiers, transcript/delta shape, monitor state shape, throttling, flush semantics, and Redis/telemetry projection format.

If a batch has no entries for one of these categories, say `None found in scoped files` in the batch note. Do not omit the section.

## Expected cumulative output files

The rerun must update or create these cumulative maps:

| File | Required contents |
| --- | --- |
| `env-vars-and-inputs.md` | Environment variables, CLI flags, config fields, defaults, and direct readers. |
| `path-construction.md` | Paths/artifacts, builders, readers, writers, and authority notes. |
| `function-call-map.md` | Cross-module call edges and expected callers. |
| `authority-map.md` | Authoritative state/artifact owners, readers, projections, and split-authority risks. |
| `external-boundaries.md` | External process/API/filesystem/network boundaries. |
| `logic-and-algorithms-map.md` | Branch conditions, routing logic, state mutation/merge algorithms, polling loops, timeout math, and terminal conditions. |
| `data-schemas.md` | Exact JSON/control-result/event/read-model/payload schemas with producers, consumers, validators, and required fields. |
| `prompts-and-agent-behavior.md` | Prompt builders, generated prompt artifacts, base instructions, tool contracts, allowed tools, required agent outputs, and status assumptions. |
| `resiliency-and-error-handling.md` | Retry classifiers, backoff/timeouts, soft-fail behavior, terminal escalation, redaction rules, and mandatory telemetry/observability rows showing if/where each failure is emitted or recorded. |
| `dependency-matrix.md` | External npm/system/tool dependencies, major versions, import/exec owners, and runtime use. |
| `concurrency-and-backpressure.md` | Queues, polling intervals, stream caps, throttles, concurrency limits, memory/disk limits, and overload behavior. |
| `acp-protocol.md` | ACP session/transcript/monitor/delta semantics and how ACP data is throttled, flushed, mirrored, or projected. |

All exact schemas and algorithms must cite source files and functions. If the code has no explicit schema, write the observed shape and add an issue to `docs/open-issues.md` requesting a validator/schema owner.

## Suggested review order

Start with the core path from CLI to pipeline runner, then state authority, then gates/workers, then Buster/common helpers, then verification/deployment surfaces.

Recommended first five batches:

1. `P00a` / `P00b` — Nova entrypoints and top-level surfaces
2. `P01` — Nova core config/runtime/path/policy
3. `P06` — Nova pipeline runner orchestration
4. `P14` — Nova status-store lifecycle authority
5. `P15` — Nova status compatibility, read models, and drift checks

This gives enough authority and flow context before documenting gates, workers, and references.

## Pipeline source batches

### P00a — Nova entrypoints and public docs

Scope:

```text
skills/nova/pipeline.ts
skills/nova/pipeline/README.md
skills/nova/pipeline/SKILL.md
skills/nova/pipeline/index.ts
skills/nova/pipeline/cli.ts
skills/nova/pipeline/cli-args.ts
```

Review focus:

- CLI inputs, status/dry-run/resume behavior, exported skill surface, public docs.

### P00b — Nova top-level shared helper surfaces

Scope:

```text
skills/nova/pipeline/git-primitives.ts
skills/nova/pipeline/lifecycle-state.ts
skills/nova/pipeline/noncritical-reporting.ts
skills/nova/pipeline/redaction.ts
skills/nova/pipeline/security.ts
skills/nova/pipeline/telemetry.ts
skills/nova/pipeline/timing.ts
```

Review focus:

- shared top-level helper import surfaces, runtime overwrite assumptions, common-helper ownership.

### P01 — Nova core config/runtime/path/policy

Scope:

```text
skills/nova/pipeline/core/config.ts
skills/nova/pipeline/core/constants.ts
skills/nova/pipeline/core/context.ts
skills/nova/pipeline/core/git-context.ts
skills/nova/pipeline/core/logger.ts
skills/nova/pipeline/core/paths.ts
skills/nova/pipeline/core/platform-config.ts
skills/nova/pipeline/core/policy.ts
skills/nova/pipeline/core/runtime.ts
skills/nova/pipeline/core/temp.ts
```

Review focus:

- environment variables, config loading, canonical path building, constants, runtime context, git boundaries.

### P02 — Nova registry and dependency loading

Scope:

```text
skills/nova/pipeline/core/registry.ts
skills/nova/pipeline/core/registry/*.ts
skills/nova/pipeline/services/adapter-registry.ts
skills/nova/pipeline/services/dependencies.ts
skills/nova/pipeline/services/validation.ts
```

Review focus:

- registry authority, plugin/config normalization, built-in indexes, validation, dependency injection seams.

### P03 — Nova integrations and external control boundaries

Scope:

```text
skills/nova/pipeline/integrations/*.ts
skills/nova/pipeline/services/discord-fields.ts
skills/nova/pipeline/services/redis-log.ts
skills/nova/pipeline/tools/redis.ts
```

Review focus:

- Discord, gateway, Git integration, Redis logging/tooling, external command/API boundaries.

### P04 — Nova agent lifecycle and runtime foundations

Scope:

```text
skills/nova/pipeline/agents/acp-monitor.ts
skills/nova/pipeline/agents/lifecycle.ts
skills/nova/pipeline/agents/runtime.ts
skills/nova/pipeline/agents/session-semantics.ts
skills/nova/pipeline/agents/shutdown.ts
skills/nova/pipeline/agents/orchestration-healthcheck.ts
```

Review focus:

- ACP process/session lifecycle, shutdown behavior, monitoring, session identity, health checks.

### P05 — Nova agent orchestration and worker control

Scope:

```text
skills/nova/pipeline/agents/module-worker-control-results.ts
skills/nova/pipeline/agents/module-workers.ts
skills/nova/pipeline/agents/orchestration-lifecycle-events.ts
skills/nova/pipeline/agents/orchestration.ts
skills/nova/pipeline/agents/reviewer-lifecycle.ts
```

Review focus:

- Forge/Buster/Echo worker orchestration, reviewer lifecycle, worker control-result mapping.

### P06 — Nova pipeline runner orchestration

Scope:

```text
skills/nova/pipeline/runners/pipeline-runner*.ts
skills/nova/pipeline/runners/pipeline-runner-scheduling/*.ts
```

Review focus:

- CLI-to-runner flow, scheduling, resume/recovery, explicit pipeline state-machine loop ownership, terminal result/exit mapping.

### P07 — Nova module runner top-level flow

Scope:

```text
skills/nova/pipeline/runners/module-runner.ts
skills/nova/pipeline/runners/module-runner-*.ts
```

Review focus:

- module stage sequencing, explicit module attempt state-machine routing, Forge/Buster/pre-Buster handoff, shared module-runner state.

### P08 — Nova module runner internals

Scope:

```text
skills/nova/pipeline/runners/module-runner/*.ts
skills/nova/pipeline/runners/module-runner/buster-phase/*.ts
```

Review focus:

- attempt handling, preflight, Buster phase behavior, terminal module results.

### P09 — Nova generic gate engines and stage envelopes

Scope:

```text
skills/nova/pipeline/runners/gate-runner.ts
skills/nova/pipeline/runners/gate-forge-fix-cycle.ts
skills/nova/pipeline/runners/remediable-gate-engine.ts
skills/nova/pipeline/runners/stage-envelope-primitives.ts
skills/nova/pipeline/runners/waitable-gate-engine.ts
skills/nova/pipeline/services/gate-active-session.ts
skills/nova/pipeline/services/gate-fix-scaffold.ts
```

Review focus:

- generic gate execution, wait/resume mechanics, remediation handoff, stage envelopes, active gate session authority.

### P10 — Nova review gate

Scope:

```text
skills/nova/pipeline/runners/review-gate*.ts
```

Review focus:

- Echo/review gate task generation, output parsing, fix cycle, control-result mapping.

### P11 — Nova Buster gate

Scope:

```text
skills/nova/pipeline/runners/buster-gate*.ts
```

Review focus:

- Buster gate task/run/completion flow, terminal behavior, fix cycle, control-result mapping.

### P12 — Nova approval gate

Scope:

```text
skills/nova/pipeline/runners/approval-gate*.ts
```

Review focus:

- approval state model, wait/signal/resume behavior, Discord/operator-facing gate inputs.

### P13 — Nova contract result surfaces

Scope:

```text
skills/nova/pipeline/services/contracts/README.md
skills/nova/pipeline/services/contracts/*.ts
```

Review focus:

- gate, worker, validator, generator, and pipeline-step control-result contracts.

### P14 — Nova status-store lifecycle authority

Scope:

```text
skills/nova/pipeline/services/status-store.ts
skills/nova/pipeline/services/status-store-lifecycle.ts
skills/nova/pipeline/services/status-store-lifecycle/*.ts
```

Review focus:

- canonical lifecycle events, refs, legality, idempotency, storage, projections, read models.

### P15 — Nova status compatibility, read models, and drift checks

Scope:

```text
skills/nova/pipeline/services/status-store-compat.ts
skills/nova/pipeline/services/status-store-compat/*.ts
skills/nova/pipeline/services/compatibility-authority.ts
skills/nova/pipeline/services/session-authority.ts
skills/nova/pipeline/services/truth-drift.ts
```

Review focus:

- compatibility projections, legacy read/write behavior, status authority boundaries, drift detection.

### P16 — Nova telemetry, event sinks, and observability

Scope:

```text
skills/nova/pipeline/services/acp-observability.ts
skills/nova/pipeline/services/observability.ts
skills/nova/pipeline/services/telemetry.ts
skills/nova/pipeline/services/telemetry-sink-contract.ts
skills/nova/pipeline/services/telemetry-sink-dispatch.ts
skills/nova/pipeline/services/telemetry-stream.ts
skills/nova/pipeline/services/telemetry/*.ts
```

Review focus:

- telemetry event construction, sink dispatch, stream output, observability catch/reporting behavior.

### P17 — Nova polling and completion watching

Scope:

```text
skills/nova/pipeline/services/polling*.ts
skills/nova/pipeline/services/completion-adjudicator.ts
skills/nova/pipeline/services/redis-completion.ts
```

Review focus:

- polling identity, Redis/session completion, dual polling, session-end behavior, completion adjudication.

### P18a — Nova failure semantics, incidents, and retry policy

Scope:

```text
skills/nova/pipeline/services/failure-semantics.ts
skills/nova/pipeline/services/failures/classification.ts
skills/nova/pipeline/services/failures/incidents.ts
skills/nova/pipeline/services/failures/presentation.ts
skills/nova/pipeline/services/failures/retry-policy.ts
```

Review focus:

- failure classification, incidents, retry policy, presentation, terminal escalation behavior.

### P18b — Nova rate-limit handling

Scope:

```text
skills/nova/pipeline/services/rate-limit.ts
skills/nova/pipeline/services/rate-limit-builders.ts
skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts
skills/nova/pipeline/services/rate-limit-contract.ts
skills/nova/pipeline/services/rate-limit-exit.ts
```

Review focus:

- rate-limit detection, control contracts, exit behavior, operator/telemetry surfaces.

### P19 — Nova validators and contract diagnostics

Scope:

```text
skills/nova/pipeline/services/arch-validator.ts
skills/nova/pipeline/services/arch-validator-checks.ts
skills/nova/pipeline/services/contract-diagnostics.ts
skills/nova/pipeline/services/module-validators.ts
```

Review focus:

- pre-pipeline validation, module validators, diagnostic result semantics, validation authority.

### P20 — Nova artifacts, summaries, cost, blueprint, and serialization

Scope:

```text
skills/nova/pipeline/services/artifact-bundle.ts
skills/nova/pipeline/services/blueprint.ts
skills/nova/pipeline/services/case-study.ts
skills/nova/pipeline/services/correlation.ts
skills/nova/pipeline/services/observability.ts
skills/nova/pipeline/services/serialization.ts
skills/nova/pipeline/services/summary.ts
skills/nova/pipeline/services/summary/*.ts
skills/nova/pipeline/services/summary-session-cleanup.ts
```

Review focus:

- artifact ownership, summaries, cost reports, case-study output, correlation IDs, serialization semantics.

### P21 — Nova notifications, governance, remediation, and lint service

Scope:

```text
skills/nova/pipeline/services/governance-context.ts
skills/nova/pipeline/services/lint.ts
skills/nova/pipeline/services/notification-contract.ts
skills/nova/pipeline/services/notification-dispatch.ts
skills/nova/pipeline/services/remediation-handoff.ts
```

Review focus:

- notification contracts, governance context, remediation payloads, lint service boundaries.

### P22 — Nova prompts

Scope:

```text
skills/nova/pipeline/prompts/*.ts
```

Review focus:

- prompt inputs, generated artifacts/tasks, status/progress references inside prompts, stale assumptions.

### P23a — Nova project-summary and lint-report entrypoint

Scope:

```text
skills/nova/pipeline/tools/project-summary.ts
skills/nova/pipeline/tools/project-summary-formatters.ts
skills/nova/pipeline/tools/lint-report.ts
```

Review focus:

- project summary generation, lint-report entrypoint behavior, CLI/tool path behavior.

### P23b — Nova lint-report internals

Scope:

```text
skills/nova/pipeline/tools/lint-report/constants.ts
skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts
skills/nova/pipeline/tools/lint-report/discovery.ts
skills/nova/pipeline/tools/lint-report/execution.ts
skills/nova/pipeline/tools/lint-report/output.ts
skills/nova/pipeline/tools/lint-report/parsers.ts
skills/nova/pipeline/tools/lint-report/report.ts
skills/nova/pipeline/tools/lint-report/tool-registry.ts
```

Review focus:

- lint-report discovery, execution, parsing, output generation, tool registry behavior.

## Buster source batches

### B00a — Buster root runtime entry and docs

Scope:

```text
skills/buster/README.md
skills/buster/CONVENTIONS.md
skills/buster/package.json
skills/buster/buster-pipeline.ts
skills/buster/pipeline/cli-args.ts
skills/buster/pipeline/git-primitives.ts
```

Review focus:

- Buster CLI/task entry, root docs, package/runtime entry behavior, env/config inputs.

### B00b — Buster top-level shared helper surfaces

Scope:

```text
skills/buster/pipeline/lifecycle-state.ts
skills/buster/pipeline/noncritical-reporting.ts
skills/buster/pipeline/redaction.ts
skills/buster/pipeline/security.ts
skills/buster/pipeline/telemetry.ts
skills/buster/pipeline/timing.ts
```

Review focus:

- Buster shared helper import surfaces, runtime overwrite assumptions, common-helper ownership.

### B01 — Buster agents, runtime services, and gateway

Scope:

```text
skills/buster/pipeline/agents/*.ts
skills/buster/pipeline/integrations/gateway.ts
skills/buster/pipeline/services/gateway-health.ts
skills/buster/pipeline/services/logger.ts
skills/buster/pipeline/services/runtime.ts
skills/buster/pipeline/services/runtime-diagnostics.ts
skills/buster/pipeline/services/session-monitor.ts
```

Review focus:

- task agent lifecycle, gateway/session monitoring, runtime diagnostics.

### B02a — Buster task orchestration top-level services

Scope:

```text
skills/buster/pipeline/integrations/discord-webhook.ts
skills/buster/pipeline/runners/suite-runner.ts
skills/buster/pipeline/services/discord.ts
skills/buster/pipeline/services/git-workflows.ts
skills/buster/pipeline/services/orphan-recovery.ts
skills/buster/pipeline/services/pipeline-helpers.ts
skills/buster/pipeline/services/sandbox-cleanup.ts
skills/buster/pipeline/services/task-completion.ts
skills/buster/pipeline/services/task-lifecycle.ts
```

Review focus:

- suite runner sequencing, task lifecycle entrypoint, cleanup, Git/Discord boundaries, completion signaling.

### B02b — Buster task lifecycle internals, queue, validation, and verdicts

Scope:

```text
skills/buster/pipeline/services/task-lifecycle/cleanup.ts
skills/buster/pipeline/services/task-lifecycle/completion-signal.ts
skills/buster/pipeline/services/task-lifecycle/git-sync.ts
skills/buster/pipeline/services/task-lifecycle/session.ts
skills/buster/pipeline/services/task-queue.ts
skills/buster/pipeline/services/task-validation.ts
skills/buster/pipeline/services/verdict-schema.ts
```

Review focus:

- task lifecycle internals, queue semantics, task validation, verdict schema, completion payloads.

### B03 — Buster primary deterministic suites

Scope:

```text
skills/buster/pipeline/suites/api.ts
skills/buster/pipeline/suites/build.ts
skills/buster/pipeline/suites/e2e.ts
skills/buster/pipeline/suites/k8s.ts
skills/buster/pipeline/suites/manifest.ts
skills/buster/pipeline/suites/repo-paths.ts
skills/buster/pipeline/suites/unit.ts
```

Review focus:

- suite commands, repo-scoped path handling, environment assumptions, task validation behavior.

### B04 — Buster specialized suites and visual tools

Scope:

```text
skills/buster/pipeline/suites/a11y.ts
skills/buster/pipeline/suites/bundle.ts
skills/buster/pipeline/suites/health.ts
skills/buster/pipeline/suites/perf.ts
skills/buster/pipeline/suites/security.ts
skills/buster/pipeline/suites/visual-reg.ts
skills/buster/pipeline/suites/visual-reg-discord.ts
skills/buster/pipeline/tools/screenshot.ts
skills/buster/pipeline/tools/visual-audit.ts
```

Review focus:

- specialized suite execution, visual/audit tools, external tool/path assumptions.

### B05 — Buster support services and tools

Scope:

```text
skills/buster/pipeline/services/base-images.ts
skills/buster/pipeline/services/rate-limit.ts
skills/buster/pipeline/services/rate-limit-contract.ts
skills/buster/pipeline/services/telemetry.ts
skills/buster/pipeline/tools/redis.ts
skills/buster/pipeline/tools/verify-task.ts
```

Review focus:

- base-image lookup, rate-limit behavior, telemetry output, Redis tool, task verification tool.

## Common shared-helper batches

### C00a — Common root and core pipeline helpers

Scope:

```text
skills/common/discord-purge.ts
skills/common/pipeline/cli-args.ts
skills/common/pipeline/git-primitives.ts
skills/common/pipeline/lifecycle-state.ts
skills/common/pipeline/noncritical-reporting.ts
skills/common/pipeline/redaction.ts
skills/common/pipeline/security.ts
skills/common/pipeline/telemetry.ts
skills/common/pipeline/timing.ts
```

Review focus:

- shared helper ownership, duplicated Nova/Buster helper behavior, import compatibility, common security/redaction/timing surfaces.

### C00b — Common agent, integration, and service helpers

Scope:

```text
skills/common/pipeline/agents/acp-monitor.ts
skills/common/pipeline/agents/lifecycle.ts
skills/common/pipeline/agents/runtime.ts
skills/common/pipeline/agents/session-semantics.ts
skills/common/pipeline/agents/tracked-agents.ts
skills/common/pipeline/integrations/discord-webhook.ts
skills/common/pipeline/integrations/gateway.ts
skills/common/pipeline/services/acp-gateway-contract.ts
skills/common/pipeline/services/rate-limit-contract.ts
```

Review focus:

- shared ACP/session helpers, neutral tracked-agent registry, integration helpers, ACP/gateway result contracts, rate-limit contract surfaces, import compatibility.

## Other skill documentation batches

### S00 — Other skill instructions and docs

Scope:

```text
skills/nova/project_setup/*.md
skills/prism/*
```

Review focus:

- non-pipeline skill instructions, project setup guidance, Prism design guidance, stale assumptions, and cross-skill documentation drift.

## Verification companion batches

These batches validate what the implementation batches are allowed to claim. They are reviewed alongside the matching implementation area, not only at the end.

### V00 — Verification entrypoints and documentation surface

Scope:

```text
tests/verification/README.md
tests/verification/behavior-verification.md
tests/verification/packaging-verification.md
tests/verification/run-fast-verification.sh
tests/verification/run-full-verification.sh
tests/verification/run-local-acp-verification.sh
```

### V01a — Behavior verification foundations and docs harness

Scope:

```text
tests/verification/behavior/README.md
tests/verification/behavior/areas/README.md
tests/verification/behavior/verify.mjs
tests/verification/behavior/areas/docs-surface.mjs
tests/verification/behavior/areas/foundations.mjs
tests/verification/behavior/areas/repo-docs.mjs
```

### V01b — Behavior verification governance, models, operators, and runtime surface

Scope:

```text
tests/verification/behavior/areas/governance.mjs
tests/verification/behavior/areas/migrated-seams.mjs
tests/verification/behavior/areas/models.mjs
tests/verification/behavior/areas/operator-surface.mjs
tests/verification/behavior/areas/runtime-surface.mjs
```

### V02a1 — Behavior verification approvals, fix cycles, and lifecycle surface

Split note: original V02a was split after scope expansion was found to be ~7.8k lines. Each split remains under the 10-file maximum and preserves the original V02a file set.

Scope:

```text
tests/verification/behavior/areas/approvals.mjs
tests/verification/behavior/areas/fix-cycles.mjs
tests/verification/behavior/areas/gate-session-persistence.mjs
tests/verification/behavior/areas/lifecycle-state-surface.mjs
```

### V02a2 — Behavior verification gate execution matrix

Scope:

```text
tests/verification/behavior/areas/gates.mjs
```

### V02a3 — Behavior verification module failures

Scope:

```text
tests/verification/behavior/areas/module-failures.mjs
```

### V02b — Behavior verification pipeline, recovery, resume, sequence, and stops

Scope:

```text
tests/verification/behavior/areas/pipeline.mjs
tests/verification/behavior/areas/restart-recovery.mjs
tests/verification/behavior/areas/resume-idempotence.mjs
tests/verification/behavior/areas/seq-restart.mjs
tests/verification/behavior/areas/stops.mjs
```

### V03a — Behavior verification agents, Buster, deployment, polling, and redaction

Scope:

```text
tests/verification/behavior/areas/agent-lifecycle.mjs
tests/verification/behavior/areas/buster-runtime-normalization.mjs
tests/verification/behavior/areas/deployment-surface.mjs
tests/verification/behavior/areas/discord-correlation.mjs
tests/verification/behavior/areas/many-module-soak.mjs
tests/verification/behavior/areas/polling.mjs
tests/verification/behavior/areas/redaction-surface.mjs
```

### V03b — Behavior verification runtime monitor, shutdown, summaries, telemetry, and transcripts

Scope:

```text
tests/verification/behavior/areas/runtime-monitor.mjs
tests/verification/behavior/areas/shell-boundary.mjs
tests/verification/behavior/areas/shutdown-integration.mjs
tests/verification/behavior/areas/summaries.mjs
tests/verification/behavior/areas/telemetry-docs.mjs
tests/verification/behavior/areas/telemetry-schema.mjs
tests/verification/behavior/areas/telemetry.mjs
tests/verification/behavior/areas/transcript-monitor.mjs
```

### V04a — Contract verification docs, artifacts, imports, gates, generators, and modules

Scope:

```text
tests/verification/contracts/README.md
tests/verification/contracts/check-artifact-authority-slice-surface.mjs
tests/verification/contracts/check-critical-dynamic-imports.mjs
tests/verification/contracts/check-pipeline-complexity-budgets.mjs
tests/verification/contracts/check-gate-active-session-surface.mjs
tests/verification/contracts/check-gate-control-result-surface.mjs
tests/verification/contracts/check-gate-fix-scaffold-surface.mjs
tests/verification/contracts/check-generator-result-surface.mjs
tests/verification/contracts/check-module-runner-slice-surface.mjs
```

### V04b — Contract verification observability, pipeline, rate-limit, Redis, and remediation

Scope:

```text
tests/verification/contracts/check-observability-catch-reporting.mjs
tests/verification/contracts/check-operator-alert-surface.mjs
tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs
tests/verification/contracts/check-pipeline-runner-slice-surface.mjs
tests/verification/contracts/check-prompt-ingress-surface.mjs
tests/verification/contracts/check-pipeline-step-result-surface.mjs
tests/verification/contracts/check-rate-limit-slice-surface.mjs
tests/verification/contracts/check-redis-completion-service-surface.mjs
tests/verification/contracts/check-redis-log-ownership.mjs
tests/verification/contracts/check-remediation-handoff-surface.mjs
```

### V04c — Contract verification session, status, telemetry, validators, and workers

Scope:

```text
tests/verification/contracts/check-session-authority-slice-surface.mjs
tests/verification/contracts/check-stage-envelope-primitives-surface.mjs
tests/verification/contracts/check-status-store-slice-surface.mjs
tests/verification/contracts/check-telemetry-contract.mjs
tests/verification/contracts/check-validator-control-result-surface.mjs
tests/verification/contracts/check-worker-control-result-surface.mjs
```

### V05 — Contract verification for Buster/common support surfaces

Scope:

```text
tests/verification/contracts/check-buster-operator-surface.mjs
tests/verification/contracts/check-buster-pipeline-slice-surface.mjs
tests/verification/contracts/check-buster-repo-scoped-paths.mjs
tests/verification/contracts/check-buster-verify-task-scope.mjs
tests/verification/contracts/check-common-helper-import-surface.mjs
tests/verification/contracts/check-strict-cli-args-surface.mjs
```

### V06a — Deployment, library, and live verification helpers

Scope:

```text
tests/verification/deployment/README.md
tests/verification/deployment/check-deployment-truth.mjs
tests/verification/lib/README.md
tests/verification/lib/fake-redis-lib.mjs
tests/verification/lib/lifecycle-audit-lib.mjs
tests/verification/lib/verification-console.mjs
tests/verification/live/redis-backend-smoke.mjs
```

### V06b — Runtime verification helpers

Scope:

```text
tests/verification/runtime/README.md
tests/verification/runtime/check-acp-launch.mjs
tests/verification/runtime/check-buster-startup-smoke.mjs
tests/verification/runtime/check-final-gate-hardening.mjs
tests/verification/runtime/check-nova-startup-smoke.mjs
tests/verification/runtime/check-runtime-collisions.mjs
tests/verification/runtime/check-subagent-launch.mjs
tests/verification/runtime/session-launch-lib.mjs
```

## Later system/deployment batches

These are defined at the directory level now and should be split into exact batches when Phase 4 begins:

```text
charts/**
docker/**
scripts/**
examples/**
my-values/**
.github/**
```

Review focus:

- deployed components, Helm values, Docker images, Redis/gateway assumptions, CI/deploy behavior, secrets/config, path and environment contracts.
