# Redis Streams

Status: current
Audience: reference reader, maintainer

## Summary

Redis is used for Buster task dispatch/completion and run-scoped telemetry. Redis stream data is transport evidence; Nova still validates completions before changing lifecycle state.

## Buster Task Streams

Task stream:

```text
BUSTER_TASK_STREAM or swarm:<AGENT_NAME>:tasks
```

Default with `AGENT_NAME=buster`:

```text
swarm:buster:tasks
```

Consumer group:

```text
<AGENT_NAME>-group
```

Consumer:

```text
<AGENT_NAME>-buster-pipeline-<hostname>
```

Dead-letter stream:

```text
<task-stream>:dead-letter
```

Default max stream length:

```text
250
```

Pending reclaim idle default:

```text
60000
```

## Completion Streams

Task payloads provide the completion stream. Nova helpers also define project completion keys as:

```text
swarm:pipeline:<project>:completions
```

## Telemetry Streams

Run telemetry stream:

```text
pipeline:telemetry:<project>:<run_id>
```

Telemetry sequence key:

```text
pipeline:telemetry:seq:<project>:<run_id>
```

## Operator Commands

```bash
redis-cli -h redis-master.kubeclaw.svc.cluster.local XLEN swarm:buster:tasks
redis-cli -h redis-master.kubeclaw.svc.cluster.local XPENDING swarm:buster:tasks buster-group
redis-cli -h redis-master.kubeclaw.svc.cluster.local XRANGE swarm:buster:tasks:dead-letter - +
redis-cli -h redis-master.kubeclaw.svc.cluster.local XREVRANGE pipeline:telemetry:my-project:run-123 + - COUNT 20
```

Use the actual group name and run ID from artifacts/config.

## Generated From

This page is manually maintained from:

- `skills/buster/pipeline/services/task-queue.ts`
- `skills/buster/pipeline/services/task-completion.ts`
- `skills/nova/pipeline/core/paths.ts`
- `skills/common/pipeline/telemetry.ts`

## Stream Ownership

| Stream | Producer | Consumer | Failure evidence |
| --- | --- | --- | --- |
| `swarm:<agent>:tasks` | Nova Buster dispatch code and Redis transport helpers | Buster task queue consumer group `<agent>-group` | invalid envelopes and malformed payloads go to `swarm:<agent>:tasks:dead-letter` by default |
| task completion stream from payload | Buster task completion service | Nova completion polling/adjudication | missing completion triggers synthesized failure completion or dead-letter before ACK |
| `pipeline:telemetry:<project>:<run_id>` | Nova/Buster telemetry services | observer plugin, operators, diagnostics | weak identity is rejected rather than writing to `unknown:unknown` |
| `pipeline:telemetry:seq:<project>:<run_id>` | telemetry stream service | telemetry ordering checks | seq restart checks prove monotonic behavior across emitter restarts |

## Troubleshooting

- High `XPENDING` on Buster tasks means work was read but not ACKed; inspect Buster logs and reclaim policy before deleting entries.
- Dead-letter entries mean the task was terminally recorded before ACK; inspect `reason`, `phase`, `payload_keys`, `run_id`, `attempt`, and `dispatch_id`.
- Completion entries without matching lifecycle identity should not advance scheduler state.
- Telemetry stream absence can mean telemetry disabled, weak identity rejected, Redis unavailable, or sink fallback only.

Run the Buster, telemetry, and Redis transport contract tests after stream schema changes.
