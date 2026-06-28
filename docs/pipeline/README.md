# Pipeline

Status: current
Audience: operator, developer

## Purpose

This section documents Nova's pipeline orchestration and Buster's worker integration.

## Guides

- [Architecture](architecture.md)
- [Technical implementation map](technical-implementation-map.md)
- [End-to-end flow](end-to-end-flow.md)
- [Runtime flow](runtime-flow.md)
- [Modules and gates](modules-and-gates.md)
- [Workers and Buster](workers-and-buster.md)
- [Failure and recovery](failure-and-recovery.md)
- [Telemetry and artifacts](telemetry-and-artifacts.md)
- [Progress JSON interpretation](progress-json.md)
- [Configuration](configuration.md)

## Source boundaries

Nova owns scheduling, state, gates, lifecycle, and terminal outcomes. Buster owns task execution and test artifacts for accepted Redis tasks. Redis task and completion messages are transport data and are validated before they influence lifecycle or operator evidence.

## Pipeline Source Map

| Area | Owner | Inputs | Outputs | Verification |
| --- | --- | --- | --- | --- |
| CLI and config | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts` | `CURRENT_PROJECT`, `REPO_ROOT`, `SWARM_CONFIG`, `.swarm/progress.json`, `--module`, `--resume`, `--prompt`, `--nova-channel` | loaded config/progress, plugin registry, run ID/stats | config registry/path tests; pipeline E2E behavior area |
| Scheduling and runners | `skills/nova/pipeline/runners/pipeline-runner.ts`; `pipeline-runner-scheduling.ts`; `module-runner.ts`; `gate-runner.ts` | execution order, dependencies, gates, active sessions, retry policy | module/gate/generator execution, action-required handoff, terminal flow | runner contract checks and pipeline E2E behavior area |
| Lifecycle and state | `skills/nova/pipeline/services/status-store.ts`; `status-store-lifecycle/**`; `session-authority.ts` | lifecycle mutations, active session identity, Redis evidence | `canonical-events.jsonl`, `read-models.json`, guarded module/gate projections | status-store contract check; restart-recovery behavior area |
| Buster integration | `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/task-queue.ts`; `task-validation.ts`; `task-completion.ts` | Redis tasks, suites, capabilities, session identity, timeout config | deterministic suite artifacts, Redis completion or dead-letter, Buster diagnostics | Buster contract check; task validation/completion tests |
| Artifacts and telemetry | `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/telemetry.ts`; `skills/nova/pipeline/services/telemetry/builders.ts`; `skills/nova/pipeline/services/telemetry/dispatch.ts` | lifecycle events, step results, artifact refs, sink config | run artifact bundle, `latest.json`, telemetry events, Redis stream entries | telemetry docs behavior area; telemetry contract check |

## Runtime Commands

```bash
node /app/skills/pipeline.ts --project "$CURRENT_PROJECT" --resume --nova-channel "$NOVA_CHANNEL"
node /app/skills/pipeline.ts --project "$CURRENT_PROJECT" --status
node /app/skills/pipeline.ts --project "$CURRENT_PROJECT" --dry-run
```

Repo-side verification:

```bash
node --test tests/verification/e2e/*.test.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
```

## Invariants

- The scheduler must consume lifecycle state, not raw Redis or Discord messages.
- Buster must validate tasks and emit terminal completion or dead-letter before ACK.
- Generated summaries and final previews are artifacts, not scheduler authority.
- `terminal_status`, `terminal_decision`, and `reason_code` are domain data; numeric exit codes are process-boundary results only.
