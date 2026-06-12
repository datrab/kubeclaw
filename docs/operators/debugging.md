# Debugging

Status: current
Audience: operator, developer

## Purpose

Find the current evidence for platform, gateway, Redis, and pipeline failures.

## Current Behavior

Deployment surface:

```bash
./scripts/deploy.sh status
./scripts/deploy.sh smoke
kubectl get pods,svc,pvc -n "$NAMESPACE"
```

Gateway surface:

```bash
kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw -- openclaw gateway status
kubectl exec -n "$NAMESPACE" deployment/agent-buster -c kubeclaw -- openclaw gateway status
```

Pod logs:

```bash
kubectl logs -n "$NAMESPACE" deployment/agent-nova -c kubeclaw
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c kubeclaw
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c buster-pipeline
```

Pipeline artifacts:

- `.swarm/logs/pipeline/latest.json`
- `.swarm/logs/pipeline/runs/<run_id>/pipeline.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/discord.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/summary.json`
- `.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl`
- `.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl`

Buster status:

```bash
node /app/skills/buster-pipeline.ts --status
```

Run that command inside the deployed pod when debugging a live worker:

```bash
kubectl exec -n "$NAMESPACE" deployment/agent-buster -c buster-pipeline -- node /app/skills/buster-pipeline.ts --status
```

Redis completion helper from the Nova skill docs:

```bash
node /app/skills/pipeline/tools/redis.ts --action read-completion --stream <key> --module <ID>
```

## Triage Flow

1. Check deployment and service status with `./scripts/deploy.sh status`.
2. Run `./scripts/deploy.sh smoke-agent nova` or `./scripts/deploy.sh smoke-agent buster` to prove gateway and mounted config.
3. If the pod is not ready, inspect `kubectl describe pod` and init container logs first; the init container owns Git sync, config migration, and skills merge.
4. If the gateway is ready but pipeline work stalls, inspect `.swarm/logs/pipeline/latest.json`, run-scoped `pipeline.jsonl`, and Redis audit files.
5. If Buster does not consume work, check `BUSTER_TASK_STREAM`, Redis connectivity, `buster-pipeline` container logs, and `node /app/skills/buster-pipeline.ts --status`.
6. If Discord is quiet, inspect run-scoped `discord.jsonl`; webhook delivery is best-effort and can be explicitly disabled by runtime env.

## Init Container Clues

Common deployment failures show up before the main process starts:

- missing Git deploy key at `/secrets/ssh/id_rsa`
- Git clone or pull errors for `GIT_REPO_URL`
- invalid persisted source `/home/node/.openclaw-persisted/openclaw.json`
- custom skill overlay attempting to replace protected runtime paths
- missing or malformed rendered `swarm.config.json`

## Evidence Order

| Layer | Evidence | What it proves |
| --- | --- | --- |
| Kubernetes | `kubectl get pods,svc,pvc`, pod events, init/main/gateway/Buster logs | live resource scheduling, image pull, volume, health, and dependency status |
| Runtime config | `/config/openclaw.json`, `/runtime-config/openclaw.json`, `/home/node/.openclaw/swarm.config.json` inside the pod | rendered config, placeholder replacement, and active swarm config path |
| Pipeline artifacts | `.swarm/logs/pipeline/latest.json`, `runs/<run_id>/pipeline.jsonl`, `summary.json`, lifecycle read models | run state, durable audit log, terminal status, and recovery identity |
| Redis streams | `swarm:<agent>:tasks`, completion stream, `:dead-letter`, telemetry stream | live work queue, Buster completion/dead-letter, and observability events |
| Docs/source proof | deployment truth, behavior areas, contract checks | whether the repository still matches the documented claim |

If layers disagree, prefer durable pipeline artifacts over presentation surfaces. Discord messages and external sink output are useful audit evidence, but they are not scheduler truth.
