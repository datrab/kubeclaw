# Running the Platform

Status: current
Audience: operator

## Purpose

Operate a deployed KubeClaw namespace.

## Current Behavior

Show pods, services, and PVCs:

```bash
./scripts/deploy.sh status
```

Run agent smoke checks:

```bash
./scripts/deploy.sh smoke
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
```

Smoke checks require a live cluster. They verify deployment and service existence, rollout completion, pod readiness, `openclaw gateway status` inside the `kubeclaw` container, `/app/skills`, and `/home/node/.openclaw/swarm.config.json`.

Pod readiness is dependency-aware. It checks OpenClaw gateway health, Redis `PING`, a small Redis stream write, configured registry endpoints, enabled LiteLLM/Qdrant endpoints, runtime config files, and Buster heartbeat for the Buster pod. Tailscale operator readiness is checked during infra deployment, not by every agent pod.

The full startup order, startup doctor behavior, probe budgets, and failure signals are documented in [Startup and health checks](../deployment/startup-and-health.md).

Refresh runtime images for both agents:

```bash
./scripts/deploy.sh image both
```

Deploy a specific pinned code bundle to one agent:

```bash
NOVA_CODE_BUNDLE_ARCHIVE_URL=... \
NOVA_CODE_BUNDLE_EXPECTED_COMMIT=<sha> \
./scripts/deploy.sh code nova
```

`image` uses a rollout restart after Helm apply so mutable tags are pulled without deleting pods by selector. `code` changes only the selected bundle inputs and waits for the Helm-triggered rollout. By default it resolves the latest published remote `main` bundle; explicit commit and archive overrides remain available for pinning.

Collect logs:

```bash
kubectl logs -n "$NAMESPACE" deployment/agent-nova -c kubeclaw
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c kubeclaw
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c buster-pipeline
```

There is no Kubernetes-native log aggregation or metrics stack in current manifests.

## Normal Operating Loop

1. Check namespace health:

```bash
./scripts/deploy.sh status
```

2. Confirm both agents are responsive:

```bash
./scripts/deploy.sh smoke
```

3. Tail the active control-plane logs:

```bash
kubectl logs -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -f
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c kubeclaw -f
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c buster-pipeline -f
```

4. Inspect project artifacts in the cloned repo workspace when a pipeline run needs diagnosis:

```text
Projects/<project>/src/.swarm/logs/pipeline/latest.json
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/pipeline.jsonl
Projects/<project>/src/.swarm/logs/pipeline/runs/<run_id>/summary.json
```

5. Use `image` after runtime image or chart changes, and `code` after bundle-only agent updates.

## Restart Expectations

Both agent deployments use `strategy.type: Recreate` and persistent config/workspace PVCs. The init container preserves existing OpenClaw and swarm config unless the relevant override flag is enabled. Restarting a pod can therefore keep runtime-edited config and workspace state.

## Steady-State Signals

| Signal | Where to check | Healthy expectation |
| --- | --- | --- |
| Pods | `kubectl -n "$NAMESPACE" get pods` | agent pods Ready, Buster pipeline container running when Buster is deployed |
| Gateway | `./scripts/deploy.sh smoke-agent nova`; `./scripts/deploy.sh smoke-agent buster` | health script succeeds for gateway/config/dependencies that are enabled |
| Pipeline run | `.swarm/logs/pipeline/latest.json` | status and terminal fields match current work; run directory exists |
| Redis work queue | `XPENDING`/`XLEN` on `swarm:buster:tasks` | pending work drains or has explainable dead-letter/completion records |
| Telemetry | run-scoped `pipeline.jsonl`, Redis telemetry stream, optional observer output | event identity includes project and run ID; external sinks may degrade without owning scheduler truth |

Use `image` after image or chart changes. Use `code` after agent bundle changes. Use behavior/contract verifiers for source changes that do not require a live cluster.
