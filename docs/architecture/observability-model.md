# Observability Model

Status: current
Audience: operator, maintainer

## Purpose

Describe exactly what operators can observe today and what is not implemented.

## Current Behavior

KubeClaw observability is runtime-artifact and Redis-stream based today. The chart and values do not render Kubernetes-native observability resources such as ServiceMonitor, PodMonitor, Prometheus scrape annotations, metrics ports, Fluent Bit, Loki, OpenTelemetry collectors, or log-shipping sidecars.

Pipeline artifacts:

- `.swarm/logs/pipeline/latest.json`
- `.swarm/logs/pipeline/pipeline.jsonl`
- `.swarm/logs/pipeline/discord.jsonl`
- `.swarm/logs/pipeline/summary.json`
- `.swarm/logs/pipeline/runs/<run_id>/pipeline.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/discord.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/summary.json`
- `.swarm/logs/pipeline/runs/<run_id>/nova-injections.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/buster-telemetry-fallback.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl`

Redis telemetry stream keys use `pipeline:telemetry:<project>:<run_id>`, with sequence keys under `pipeline:telemetry:seq:<project>:<run_id>`. Stream events include `v`, `type`, `ts`, `run_id`, `project`, `seq`, `source`, and `emitter`.

Discord notification code writes audit entries to global and run-scoped `discord.jsonl` when possible and records degraded/restored observability events when webhook or audit writes fail.

Buster writes telemetry to Redis when available and appends fallback artifacts when Redis telemetry degrades. Buster also records process diagnostics and malformed task artifacts.

Operators collect pod logs with `kubectl logs` today. There is no source-proven central aggregation for Buster sandbox stdout/stderr beyond runtime files and pod logs.

## Collection Paths

Operator collection today is manual and file/stream oriented:

```bash
kubectl logs -n "$NAMESPACE" deployment/agent-nova -c kubeclaw
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c kubeclaw
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c buster-pipeline
kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- openclaw gateway status
kubectl exec -n "$NAMESPACE" deployment/agent-buster -c kubeclaw -- openclaw gateway status
```

Inside project workspaces, pipeline artifacts under `.swarm/logs/**` are the primary audit trail. Redis telemetry streams are the live structured event channel. Discord webhook delivery is best-effort and writes audit evidence when configured.

## Explicit Non-Claims

Do not assume these exist unless future manifests add them:

- Prometheus scraping
- Loki or Fluent Bit log shipping
- OpenTelemetry collectors
- ServiceMonitor or PodMonitor resources
- automatic central aggregation of Buster sandbox stdout/stderr
- ClawDeck metric-stack integration

## Open Issues

- Missing Kubernetes-native metrics/log aggregation is tracked in `../future-implementation-ideas.md`.
