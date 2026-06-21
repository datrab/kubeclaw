# Startup and Health Checks

Status: current
Audience: operator, maintainer

## Purpose

Explain what happens when an agent pod starts, what Kubernetes probes check, and how to diagnose startup or readiness failures without guessing from logs alone.

## Source Owners

| Surface | Source | Runtime artifact | Verification |
| --- | --- | --- | --- |
| Init flow and lifecycle hooks | `charts/kubeclaw/templates/deployment.yaml` | init container script, `postStart`, `preStop` | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Startup doctor defaults | `charts/kubeclaw/values.yaml`; deployment template | `/runtime-config/kubeclaw-startup-doctor.sh`; `/home/node/.openclaw/logs/startup-doctor.log` | deployment truth render assertions |
| Probe implementation | deployment template | `/runtime-config/kubeclaw-health.mjs` | deployment truth render assertions plus live pod probes |
| Live smoke | `scripts/deploy.sh` | rollout, readiness, `openclaw gateway status`, runtime files | `./scripts/deploy.sh smoke` |

## Startup Sequence

Agent Deployments use `strategy.type: Recreate`, a retained config PVC, a workspace PVC, and one init container before runtime containers start.

The init container does the durable setup:

- installs SSH key material from the configured Git Secret
- pins GitHub host keys
- clones or safely fast-forwards `GIT_REPO_URL` into `/workspace/git-repo`
- initializes `/config/openclaw.json` when the retained config is absent
- normalizes retained OpenClaw config to canonical provider/model refs and env SecretRefs
- seeds image-baked external OpenClaw plugin home state into `/config` only when the baked plugin-cache version changes
- writes chart-owned `swarm.config.json`, `.semgrep.yml`, and `eslint.config.mjs`
- renders pod-local runtime config into `/runtime-config`
- merges packaged skills and allowed custom skills into `/skills-merged`
- writes the generated health and startup-doctor helper scripts
- hardens `/config` and `openclaw.json` permissions

Runtime containers then mount:

- retained OpenClaw home at `/home/node/.openclaw`
- retained source config again at `/home/node/.openclaw-persisted`
- workspace at `/home/node/.openclaw/workspace`
- merged skills at `/app/skills`
- pod-local runtime config at `/runtime-config`

`openclaw.json` is a normal writable file in the retained OpenClaw home. The chart intentionally does not bind-mount it through `subPath` because `openclaw doctor` repairs config by writing a temporary file and atomically renaming it over `openclaw.json`.

## Startup Doctor

The gateway container has a `postStart` hook when `gateway.startupDoctor.enabled=true`, which is the default. The hook starts `/runtime-config/kubeclaw-startup-doctor.sh` in the background so Kubernetes container startup is not blocked by doctor output.

The helper:

1. waits for the local gateway `/health` endpoint
2. runs `node /app/openclaw.mjs doctor --fix` once
3. writes logs to `/home/node/.openclaw/logs/startup-doctor.log`
4. exits without failing the container if the gateway never becomes healthy before the wait budget

The relevant values are:

```yaml
gateway:
  startupDoctor:
    enabled: true
    waitSeconds: 120
    pollSeconds: 5
```

Use the startup doctor as a cleanup pass for safe OpenClaw-owned repairs, such as registry refreshes or removal of stale managed plugin records. Do not rely on it to install missing runtime dependencies from the network; required plugins are baked into the image and seeded by init before the gateway starts.

Inspect startup doctor output:

```bash
kubectl -n "$NAMESPACE" exec deploy/agent-nova -c kubeclaw -- \
  tail -200 /home/node/.openclaw/logs/startup-doctor.log

kubectl -n "$NAMESPACE" exec deploy/agent-buster -c kubeclaw -- \
  tail -200 /home/node/.openclaw/logs/startup-doctor.log
```

## Probe Model

Init writes `/runtime-config/kubeclaw-health.mjs`. Kubernetes calls this script through exec probes:

- `startupProbe`: gives the gateway and dependencies time to come up
- `readinessProbe`: decides whether the pod should receive traffic/work
- `livenessProbe`: decides whether Kubernetes should restart the container

Startup verification is the deep first-boot gate. It verifies:

- `/home/node/.openclaw/openclaw.json`
- `/home/node/.openclaw/swarm.config.json`
- `/app/skills`
- OpenClaw gateway `/health`
- Redis `PING`
- a Redis stream write to `kubeclaw:health:<agent>` unless another stream is configured
- LiteLLM `/health` when enabled
- Qdrant `/readyz` when enabled
- configured registry `/v2/` endpoints when enabled

On success or failure it writes persistent records under the retained OpenClaw home:

- `/home/node/.openclaw/logs/startup-verification.json`
- `/home/node/.openclaw/logs/startup-verification.jsonl`

Readiness is intentionally cheaper. It verifies:

- drain marker absence
- startup verification already passed
- `/home/node/.openclaw/openclaw.json`
- `/home/node/.openclaw/swarm.config.json`
- `/app/skills`
- OpenClaw gateway `/health`
- Redis `PING`
- Buster heartbeat freshness when the agent is Buster

Readiness also checks the drain marker. `preStop` writes `KUBECLAW_DRAIN_FILE` before Kubernetes sends `SIGTERM`, so terminating containers stop reporting Ready during rollouts, evictions, or node drains.

Liveness is intentionally narrower:

- gateway containers check local gateway health
- the Buster pipeline container does not use external dependencies for liveness
- Buster heartbeat is readiness evidence, not a liveness restart trigger

This keeps external outages from causing restart loops. Redis, LiteLLM, Qdrant, registry, or Buster heartbeat issues should make a pod unready first, giving operators a clear signal while preserving logs and local state.

## Probe Values

The default probe budgets live in `charts/kubeclaw/values.yaml`:

```yaml
probes:
  startup:
    enabled: true
    initialDelaySeconds: 10
    periodSeconds: 10
    timeoutSeconds: 10
    failureThreshold: 24
  readiness:
    enabled: true
    initialDelaySeconds: 5
    periodSeconds: 10
    timeoutSeconds: 10
    failureThreshold: 3
  liveness:
    enabled: true
    initialDelaySeconds: 120
    periodSeconds: 15
    timeoutSeconds: 5
    failureThreshold: 3
```

Dependency checks are also value-controlled under `probes.dependencies`. Production values can raise Buster liveness budgets for sandbox pressure without changing the probe script.

## Operator Checks

Start with rollout and pod state:

```bash
kubectl -n "$NAMESPACE" rollout status deploy/agent-nova
kubectl -n "$NAMESPACE" rollout status deploy/agent-buster
kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=kubeclaw
```

Run the chart-backed smoke path:

```bash
./scripts/deploy.sh smoke
```

Inspect probe failures:

```bash
kubectl -n "$NAMESPACE" describe pod -l app.kubernetes.io/instance=agent-nova
kubectl -n "$NAMESPACE" describe pod -l app.kubernetes.io/instance=agent-buster
```

Run the same health script manually inside the gateway container:

```bash
kubectl -n "$NAMESPACE" exec deploy/agent-nova -c kubeclaw -- \
  node /runtime-config/kubeclaw-health.mjs startup-status

kubectl -n "$NAMESPACE" exec deploy/agent-nova -c kubeclaw -- \
  node /runtime-config/kubeclaw-health.mjs readiness

kubectl -n "$NAMESPACE" exec deploy/agent-buster -c kubeclaw -- \
  node /runtime-config/kubeclaw-health.mjs startup-status

kubectl -n "$NAMESPACE" exec deploy/agent-buster -c kubeclaw -- \
  node /runtime-config/kubeclaw-health.mjs readiness
```

For Buster, check both containers:

```bash
kubectl -n "$NAMESPACE" logs deploy/agent-buster -c kubeclaw --tail=200
kubectl -n "$NAMESPACE" logs deploy/agent-buster -c buster-pipeline --tail=200
```

## Failure Signals

| Symptom | Likely surface | First check |
| --- | --- | --- |
| startup doctor log is missing | `postStart` did not run or runtime config was not generated | describe pod events, then check `/runtime-config/kubeclaw-startup-doctor.sh` |
| startup doctor skipped | gateway `/health` did not become healthy before `waitSeconds` | gateway logs and `openclaw.json` |
| readiness fails on Redis | Redis Secret, DNS, password, or service availability | `REDIS_HOST`, `REDIS_PASSWORD`, Redis pod readiness |
| startup verification fails on Redis stream | Redis reachable but write path is blocked or misconfigured | stream name, Redis ACL/password, Redis logs |
| startup verification fails on LiteLLM | LiteLLM service, API key, PostgreSQL, or provider config | LiteLLM pod logs and `litellm-secrets` |
| startup verification fails on Qdrant | Qdrant service or persistence issue | Qdrant pod readiness and logs |
| startup verification fails on registries | local registry/mirror service unavailable to the namespace | registry pods and NetworkPolicy |
| Buster readiness fails on heartbeat | Buster pipeline process is stopped, wedged, or still starting | `buster-pipeline` logs and heartbeat path in `swarm.config.json` |
| liveness restarts gateway | local OpenClaw gateway process is unhealthy | gateway logs, config, and startup doctor log |

## Boundaries

Repository checks prove rendered startup hooks, probe wiring, mounted runtime paths, and generated helper script content. They do not prove live provider credentials, external DNS, actual registry reachability, live CNI enforcement, or Tailscale tailnet policy. Use `./scripts/deploy.sh smoke`, `./scripts/deploy.sh image`, `./scripts/deploy.sh code`, and live `kubectl describe/logs/exec` checks for those surfaces.
