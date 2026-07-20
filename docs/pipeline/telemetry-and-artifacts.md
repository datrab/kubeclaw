# Telemetry And Artifacts

Status: current
Audience: operator, maintainer, developer

## Overview

KubeClaw records pipeline E2E behavior in local artifacts, Redis telemetry streams, Discord notifications, and Buster task outputs. Operators should start with local artifacts because they are durable and source-scoped; Redis and Discord are live observability surfaces.

## Event Layers

The pipeline uses several event-like surfaces with different authority:

- Lifecycle events: append-only scheduler truth under `runs/<run_id>/lifecycle/canonical-events.jsonl`.
- Redis tasks: asynchronous work requests from Nova to Buster.
- Redis completions: asynchronous Buster evidence back to Nova, accepted only after identity/adjudication checks.
- Telemetry events: live observability for dashboards, diagnostics, and sinks.
- Discord notifications: selected, human-readable presentation events.
- JSONL logs: local audit trails for pipeline, Redis operations, Discord sends, Buster task steps, and quarantined telemetry.

Do not treat these as interchangeable. Lifecycle events decide state. The other surfaces explain, transport, or enrich state.

## Completion Authority

Phase and gate runners do not own terminal state. They produce completion evidence, then the lifecycle reducer appends the canonical event and projects read models.

The boundary is:

```text
runner evidence -> Completion -> lifecycle reducer -> lifecycle event spine -> read models -> sinks/plugins/reports
```

A completion records only the completed target, phase, attempt, status, evidence authority, optional typed reason, and optional observation. Session identity is observation/control metadata. It is required for live operations such as monitor, kill, or rate-limit handling, but it is not required to accept terminal evidence that is already proven by run ID, attempt, dispatch ID, and the configured authority.

Sinks such as Discord consume lifecycle events and read models. They may render messages, links, summaries, and diagnostics, but they must not decide whether a module or gate passed.

## Primary Artifact Paths

Project-global pipeline artifacts:

```text
Projects/<project>/src/.swarm/logs/pipeline/latest.json
Projects/<project>/src/.swarm/logs/pipeline/run-catalog.jsonl
Projects/<project>/src/.swarm/logs/pipeline/pipeline.jsonl
Projects/<project>/src/.swarm/logs/pipeline/discord.jsonl
Projects/<project>/src/.swarm/logs/pipeline/summary.json
```

`run-catalog.jsonl` is the durable discovery authority. `latest.json` is only a convenience pointer and must never be used for replay or repair authority.

Run-scoped artifacts:

```text
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/pipeline.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/discord.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/summary.json
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/nova-injections.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/quarantine.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl
```

`nova-injections.jsonl` is the needs-Nova handoff audit. The canonical delivery proof is the Gateway `message.send` receipt for the launch channel; Gateway `session_send`, cron injection, and Discord webhooks are not needs-Nova handoff authorities.

Module and gate helpers also write Buster outputs, gate outputs, approval request/decision files, lint reports, review outputs, architecture validator logs, and plugin artifacts under the project `.swarm` tree.

Lifecycle artifacts:

```text
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/lifecycle/canonical-events.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/lifecycle/read-models.json
```

Buster task artifacts commonly include:

```text
Projects/<project>/src/.swarm/logs/buster/<module_id>/attempt-<n>/buster-pipeline.jsonl
Projects/<project>/src/.swarm/logs/buster/<module_id>/attempt-<n>/suite-results.json
Projects/<project>/src/.swarm/modules/<module_dir>/buster-output.json
```

Exact paths can vary for gate tasks and overridden `log_dir` values, but every task should have run/module/gate identity in the payload and logs.

## Evidence Strength

| Evidence | Strong enough to change state? | Required identity or fields | Troubleshooting use |
| --- | --- | --- | --- |
| lifecycle event/read model | yes | run ref plus module/gate/wait/cooldown refs | determine current scheduler state and legal next action |
| Completion | yes, after lifecycle reducer append | target kind/id, phase, attempt, status, authority | canonical boundary for phase/gate terminal evidence |
| Buster completion | candidate only | `run_id`, `attempt`, `dispatch_id`, target id, completion stream | unblock Nova only after completion adjudication |
| Buster dead-letter | no direct state mutation | Redis id, stream, reason, phase, payload identity when available | explain task failure before ACK |
| telemetry event | no | run id, run ref, primary ref, event type, payload, ISO timestamp | dashboard/debug timeline |
| Discord notification | no | presentation fields and correlation IDs | human notification; cross-check against artifacts |
| pod log line | no | container, timestamp, related run/session/task id | diagnose runtime, CNI, Secret, or tool failures |

## Redis Telemetry

Run telemetry stream:

```text
pipeline:telemetry:<project>:<run_id>
```

Sequence key:

```text
pipeline:telemetry:seq:<project>:<run_id>
```

The telemetry stream is intended for live consumers such as dashboards. It includes event families for pipeline lifecycle, module lifecycle, gate lifecycle, approval, retry, rate limit, agent lifecycle, plugin events, and observability degradation/restoration.

Redis task/completion streams are separate from telemetry streams:

```text
swarm:buster:tasks
swarm:buster:tasks:dead-letter
swarm:pipeline:<project>:completions
swarm:pipeline:<project>:completions:log
```

Task streams move work. Completion streams unblock scheduler polling after validation. Telemetry streams broadcast what happened.

## Notification Hooks

Built-in notification hooks are:

- `pipeline.started`
- `pipeline.completed`
- `module.started`
- `module.completed`
- `gate.started`
- `gate.completed`

Built-in notification sinks write telemetry, structured event artifacts, and Discord messages. Discord notifications are filtered presentation surfaces; they are not the source of scheduler truth.

## Telemetry Sinks

Built-in telemetry sinks:

- Redis sink: full-firehose telemetry for live consumers.
- Discord sink: filtered notifications only when an event carries explicit Discord presentation data.

Sink input validation requires a run ID, run reference, primary reference, event type, event payload object, and ISO timestamp. Discord sink presentation supports `level`, `title`, `description`, and string fields. Raw embeds are rejected by the telemetry sink contract.

## Agent Observability

The compact `swarm.config.json` selects the `standard` profile, which expands Nova's OpenClaw observer controller policy and the Redis ingester. Buster instead enables the same plugin permanently in gateway config, because the dedicated Buster pipeline sidecar does not own OpenClaw plugin lifecycle. Current effective `standard` values for the Nova controller and shared ingester are:

- plugin ID: `kubeclaw-agent-observer`
- plugin command: `openclaw`
- plugin command timeout: `10000` ms
- ingester loop delay: `250` ms
- Redis command timeout: `1000` ms
- control lag degraded threshold: `1000`
- payload pressure degraded threshold: `10000`

When telemetry delivery degrades, the code records degraded/restored evidence and quarantines payloads that cannot be admitted canonically.

## Operator Checks

List verified runs through the pipeline-owned verifier and catalog:

```bash
tail -n 20 Projects/my-project/src/.swarm/logs/pipeline/run-catalog.jsonl
```

Inspect terminal summary:

```bash
RUN_ID="$(tail -n 1 Projects/my-project/src/.swarm/logs/pipeline/run-catalog.jsonl | jq -r '.run_id')"
jq . "Projects/my-project/src/.swarm/logs/pipeline/runs/${RUN_ID}/summary.json"
```

Watch telemetry in Redis:

```bash
redis-cli -h redis-master.kubeclaw.svc.cluster.local \
  XREVRANGE "pipeline:telemetry:my-project:${RUN_ID}" + - COUNT 20
```

Find observability degradation:

```bash
rg '"observability.degraded|observability.restored"' Projects/my-project/src/.swarm/logs/pipeline
```

## Troubleshooting

- Missing Discord messages: check `discord.jsonl` and webhook configuration. Continue using local artifacts for authority.
- Missing Redis telemetry: check `quarantine.jsonl`, Redis connectivity, and expanded `agent_observability.ingester` settings.
- Missing catalog entry: inspect the run directory for a durable closure/archive and run the verifier before repair.
- Summary missing but pipeline has logs: inspect terminal completion errors in run-scoped `pipeline.jsonl`.
- Redis stream empty but artifacts present: Redis sink may be degraded; use local artifacts and recover Redis separately.

## Sources

- `skills/nova/pipeline/services/artifact-bundle.ts`
- `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts`
- `skills/nova/pipeline/services/telemetry-stream.ts`
- `skills/nova/pipeline/services/notification-contract.ts`
- `skills/nova/pipeline/services/telemetry-sink-contract.ts`
- `skills/nova/pipeline/services/redis-completion.ts`
- `skills/common/pipeline/services/telemetry/payload-schema.ts`
- `skills/buster/pipeline/services/telemetry.ts`
