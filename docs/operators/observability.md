# Observability

Status: current
Audience: operator

## Purpose

Show where operators should look first when KubeClaw, OpenClaw gateways, or the Nova/Buster pipeline need inspection.

## Current Observation Points

KubeClaw observability is currently built from Kubernetes state, pod logs, OpenClaw gateway status, pipeline artifacts, Redis telemetry streams, and optional Discord audit files. The chart and values do not currently render ServiceMonitor, PodMonitor, Prometheus scrape annotations, OpenTelemetry collectors, Fluent Bit, Loki, or other Kubernetes-native telemetry resources.

Start with the surface closest to the symptom:

- deployment readiness: Kubernetes pods, services, PVCs, rollouts, events, and `./scripts/deploy.sh status`
- gateway readiness: `openclaw gateway status` inside Nova and Buster containers
- pipeline progress: `.swarm/logs/pipeline/latest.json`, run-scoped `pipeline.jsonl`, and `summary.json`
- Buster worker health: `buster-pipeline` container logs and `node /app/skills/buster-pipeline.ts --status`
- live structured events: Redis stream `pipeline:telemetry:<project>:<run_id>`
- notification delivery: global and run-scoped `discord.jsonl`

## Fast Checks

Check the deployment surface:

```bash
./scripts/deploy.sh status
kubectl -n "$NAMESPACE" get pods,svc,pvc
kubectl -n "$NAMESPACE" get events --sort-by=.lastTimestamp | tail -40
```

Check agent logs:

```bash
kubectl -n "$NAMESPACE" logs deployment/agent-nova -c kubeclaw --tail=200
kubectl -n "$NAMESPACE" logs deployment/agent-buster -c kubeclaw --tail=200
kubectl -n "$NAMESPACE" logs deployment/agent-buster -c buster-pipeline --tail=200
```

Check OpenClaw gateway status:

```bash
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- openclaw gateway status
kubectl -n "$NAMESPACE" exec deployment/agent-buster -c kubeclaw -- openclaw gateway status
```

Check Buster worker status from the deployed worker:

```bash
kubectl -n "$NAMESPACE" exec deployment/agent-buster -c buster-pipeline -- \
  node /app/skills/buster-pipeline.ts --status
```

## Pipeline Artifacts

Pipeline artifacts are the durable audit path. The global files point to the latest run:

```text
Projects/<project>/src/.swarm/logs/pipeline/latest.json
Projects/<project>/src/.swarm/logs/pipeline/pipeline.jsonl
Projects/<project>/src/.swarm/logs/pipeline/discord.jsonl
Projects/<project>/src/.swarm/logs/pipeline/summary.json
```

Run-scoped files preserve detailed evidence:

```text
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/pipeline.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/discord.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/summary.json
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/nova-injections.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/buster-telemetry-fallback.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl
```

Find and inspect the latest run:

```bash
jq . Projects/my-project/src/.swarm/logs/pipeline/latest.json
RUN_ID="$(jq -r '.run_id' Projects/my-project/src/.swarm/logs/pipeline/latest.json)"
jq . "Projects/my-project/src/.swarm/logs/pipeline/runs/${RUN_ID}/summary.json"
```

## Redis Telemetry

The live telemetry stream is:

```text
pipeline:telemetry:<project>:<run_id>
```

The sequence key is:

```text
pipeline:telemetry:seq:<project>:<run_id>
```

Read recent events:

```bash
redis-cli -h redis-master.kubeclaw.svc.cluster.local \
  XREVRANGE "pipeline:telemetry:my-project:${RUN_ID}" + - COUNT 20
```

Telemetry write failures are non-blocking for scheduler truth when local artifacts preserve recovery evidence. Look for degraded or restored observability records before assuming a missing stream means a missing run:

```bash
rg '"observability.degraded|observability.restored"' Projects/my-project/src/.swarm/logs/pipeline
```

The Redis telemetry path is:

```text
telemetry builder in skills/nova/pipeline/services/telemetry/builders.ts
  -> emitEvent/emitEventNonBlocking in services/telemetry/dispatch.ts
  -> telemetry sink contract in services/telemetry-sink-contract.ts
  -> Redis stream writer in services/telemetry-stream.ts
  -> pipeline:telemetry:<project>:<run_id>
```

OpenClaw hook observability is separate. The `kubeclaw-agent-observer` plugin registers OpenClaw hooks in `plugins/openclaw-agent-observer/src/index.ts`, normalizes hook/model usage events in `hook-normalizers.ts`, and writes Redis events through `redis-writer.ts`. Its config defaults come from `agent_observability.plugin_control.*` and `agent_observability.ingester.*` in `swarm.config.json`.

Inspect observer streams and dead letters with the stream names configured by the plugin source:

```bash
redis-cli -h redis-master.kubeclaw.svc.cluster.local --scan --pattern '*agent*observability*'
redis-cli -h redis-master.kubeclaw.svc.cluster.local --scan --pattern '*openclaw*'
```

Open question: this repository verifies observer plugin packaging and source-level stream policy, but it does not include a live cluster check proving every OpenClaw hook fires in production.

## Discord Audit

Discord notifications are presentation output, not scheduler authority. When configured, KubeClaw writes delivery audit entries to:

```text
Projects/<project>/src/.swarm/logs/pipeline/discord.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/discord.jsonl
```

If Discord is quiet but artifacts and Redis show progress, continue the operational decision from artifacts first, then inspect webhook configuration and `discord.jsonl`.

## Common Failures

- pod not ready: check rollout status, pod events, init container logs, mounted secrets, and PVCs
- gateway unhealthy: run `openclaw gateway status` in the agent container and inspect `kubeclaw` logs
- pipeline appears stuck: inspect `latest.json`, run-scoped `pipeline.jsonl`, and Redis telemetry for the same run ID
- Buster not consuming tasks: inspect `buster-pipeline` logs, worker status, Redis connectivity, and `BUSTER_TASK_STREAM`
- Redis telemetry empty: inspect `buster-telemetry-fallback.jsonl`, Redis connectivity, and local artifact logs
- Discord missing: inspect `discord.jsonl`; webhook delivery can fail while the pipeline continues
- Observer stream quiet: check `agent_observability.plugin_control.enabled`, plugin runtime logs, Redis connectivity, and whether OpenClaw emitted the hook family being inspected

## Related Pages

- [Observability model](../architecture/observability-model.md)
- [Running the platform](running-the-platform.md)
- [Running the pipeline](running-the-pipeline.md)
- [Debugging](debugging.md)
- [Telemetry and artifacts](../pipeline/telemetry-and-artifacts.md)
- [Telemetry events](../reference/telemetry-events.md)
- [Status and artifacts](../reference/status-and-artifacts.md)
