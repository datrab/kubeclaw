# Pipeline Model

Status: current
Audience: operators, developers

## Overview

The KubeClaw pipeline separates orchestration from test execution. Nova owns pipeline scheduling, module and gate lifecycle, status, resume, and terminal outcomes. Buster owns accepted test tasks and emits evidence back through the validated task/completion surface.

## Main Ideas

- Modules group work and can have dependencies.
- Gates validate work before a run proceeds.
- Buster suites run in a separate worker boundary.
- Redis transports task and completion messages.
- Artifacts, summaries, and status files give operators evidence for debugging and recovery.

## Runtime Flow

| Step | Owner | Input | Output or artifact | Failure signal |
| --- | --- | --- | --- | --- |
| Config load | `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts` | `CURRENT_PROJECT`, `REPO_ROOT`, optional `SWARM_CONFIG`, `.swarm/progress.json` | derived `config.paths.*`, plugin registry, progress object | missing project, missing repo root, invalid `swarm.config.json`, unsafe path segment |
| Scheduling | `skills/nova/pipeline/runners/pipeline-runner.ts`; `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` | execution order, module dependencies, gate definitions, resume flags | selected module/gate/generator stage | blocked dependencies, exhausted retry budget, active-session conflicts |
| Module execution | `skills/nova/pipeline/runners/module-runner.ts`; `skills/nova/pipeline/agents/orchestration.ts` | module instructions, runtime model/thinking override, stage identity | lifecycle transitions, active session record, module artifacts | invalid worker result, timeout, rate limit, failed validation |
| Buster task execution | `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/task-queue.ts`; `skills/buster/pipeline/services/task-validation.ts` | Redis task with `module_id`, `run_id`, `attempt`, `dispatch_id`, `completion_stream`, suites, capabilities | completion stream entry or dead-letter stream entry | `BUSTER_TASK_MALFORMED`, terminal guarantee failure, task dead letter |
| Terminal handling | `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`; `skills/nova/pipeline/services/contracts/terminal-decision.ts` | typed step results and terminal decisions | `terminal_status`, `terminal_decision`, summary artifacts, operator alert | non-success terminal status exits process with code 1 |
| Evidence writing | `skills/nova/pipeline/services/status-store.ts`; `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/telemetry.ts` | lifecycle mutations, telemetry builders, artifact refs | `canonical-events.jsonl`, `read-models.json`, `latest.json`, run-scoped `pipeline.jsonl` | lifecycle guard violation, unreadable recovery state, degraded telemetry sink |

## Contracts And Invariants

- Nova lifecycle state is authoritative; Redis completions and Discord/operator messages are evidence that must be projected into lifecycle state before changing scheduler truth.
- Buster must validate task identity before execution and must emit a completion or dead letter before ACK.
- Terminal behavior uses typed `terminal_status`, `terminal_decision`, and `reason_code`; numeric exit codes are process-boundary output only.
- Runtime config is platform-scoped in `charts/kubeclaw/files/config/swarm.config.json`; project-specific state lives under `<repo>/Projects/<project>/src/.swarm/`.

## Verification

```bash
node --test tests/verification/e2e/*.test.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"
```

## Related Pages

- `../pipeline/architecture.md`
- `../pipeline/runtime-flow.md`
- `../pipeline/modules-and-gates.md`
- `../pipeline/workers-and-buster.md`
