# Agent Deployments

Status: current
Audience: operator

## Purpose

Document the rendered Nova and Buster agent pod behavior.

## Current Behavior

Both agent deployments use `strategy.type: Recreate`, persistent config/workspace volumes, and an init container. Nova runs one main `kubeclaw` container. Buster runs one pod with separate `kubeclaw` gateway and `buster-pipeline` worker containers.

The init container:

- prepares the durable empty skills mount and existing OpenClaw config
- installs SSH key material from the Git secret
- pins GitHub known hosts
- clones `GIT_REPO_URL` into `/workspace/git-repo`, or safely fast-forwards an existing clean checkout
- writes workspace bootstrap files only when `workspace.enabled` is true
- initializes `/config/openclaw.json` as the retained OpenClaw config when absent
- normalizes persisted OpenClaw config to canonical OpenAI/Codex model refs and SecretRef-backed LiteLLM/Discord fields
- seeds configured external OpenClaw plugins from the image-baked npm cache into the retained OpenClaw home
- removes obsolete `/app/openclaw-plugins/kubeclaw-agent-observer` plugin load paths from persisted config
- writes or preserves source `swarm.config.json`, `.semgrep.yml`, and `eslint.config.mjs`
- mirrors OpenClaw config into `/runtime-config` for diagnostics and renders runtime `swarm.config.json`
- maps `DISCORD_WEBHOOK` only into the runtime `swarm.config.json`
- overlays the selected code bundle and optional custom skills into `/skills-merged`
- rejects custom overlays targeting protected runtime paths

Nova starts the default gateway command:

```bash
node /app/openclaw.mjs gateway --bind lan --port 18789
```

Buster starts the gateway and worker in separate containers in the same pod:

```bash
node /app/openclaw.mjs gateway --bind lan --port 18789
node /app/skills/buster-pipeline.ts
```

`OPENCLAW_GATEWAY_URL` defaults to `http://127.0.0.1:18789`; the deployment verifier proves an explicit `gateway.url` override is honored. Startup doctor behavior and probe details are documented in [Startup and health checks](startup-and-health.md).

## Deploy

Deploy Nova:

```bash
./scripts/deploy.sh nova
```

Deploy Buster:

```bash
./scripts/deploy.sh buster
```

Deploy both after infrastructure is ready:

```bash
./scripts/deploy.sh agents
```

The deploy script applies the Helm release, deletes the matching agent pods, then waits for the replacement pods to become Ready. This forces Nova and Buster to take the latest image even when an image tag is reused.

## Nova Deployment

Nova uses `ghcr.io/datrab/kubeclaw-general:latest` in production values. It renders without a service account, without sandbox volumes, and with `allowPrivilegeEscalation: false` plus `capabilities.drop: [ALL]` because sandbox mode is disabled. The service exposes:

- `gateway` and `bridge` on the cluster-internal `agent-nova` Service
- `prism-preview` on a dedicated temporary NodePort Service at `30456`

The `prism-preview` sidecar uses `ghcr.io/datrab/kubeclaw-prism-preview:latest`, serves `/designs` on port `3456` from the image entrypoint, and mounts the workspace PVC at `/designs` with `subPath: prism/designs`.

## Buster Deployment

Buster uses `ghcr.io/datrab/kubeclaw-sandbox:latest` in production values. It renders:

- `ServiceAccount/agent-buster`
- `Role/agent-buster-namespace-lease-client`
- `RoleBinding/agent-buster-namespace-lease-client`
- `CustomResourceDefinition/busternamespaceleases.kubeclaw.forgestack.ai`
- `Deployment/agent-buster-namespace-controller`
- `ConfigMap/agent-buster-podman-registries`
- `podman-storage`, `podman-registries`, and `sandbox-workspace` volumes

Buster sets sandbox mode on both Buster containers. The rendered security context is privileged, unconfined for AppArmor/seccomp, allows privilege escalation, and adds container/Kubernetes testing capabilities required by Podman-in-Pod, deterministic Buster suites, and gateway-side agent tests. The gateway container remains available if the pipeline container crashes, and the containers have separate logs:

The production Buster values cap Podman `emptyDir` storage at `50Gi` and set `ephemeral-storage` requests/limits on both Buster containers. Sandbox cleanup emits before/after disk usage for `/sandbox` and `/var/lib/containers`.

```bash
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c kubeclaw
kubectl logs -n "$NAMESPACE" deployment/agent-buster -c buster-pipeline
```

## Runtime Environment

Both agents receive Redis, Qdrant, LiteLLM, gateway, Git, Discord, and project environment from the chart. Secret-backed variables include `REDIS_PASSWORD`, `OPENCLAW_GATEWAY_TOKEN`, `LITELLM_API_KEY`, optional `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN`, optional `DISCORD_TOKEN`, and optional `DISCORD_WEBHOOK`.

The chart pins `SWARM_CONFIG` to `/home/node/.openclaw/swarm.config.json` and `REPO_ROOT` to `/home/node/.openclaw/workspace/git-repo`. Runtime containers mount the retained config PVC at `/home/node/.openclaw`, expose the same retained source at `/home/node/.openclaw-persisted`, and overlay `/runtime-config/openclaw.json` at `/home/node/.openclaw/openclaw.json`. Secret-bearing OpenClaw config fields use env SecretRefs for `LITELLM_API_KEY` and `DISCORD_TOKEN`, while `swarm.config.json` is still overlaid from an `emptyDir` runtime config volume so `DISCORD_WEBHOOK` does not persist to the PVC. Startup doctor runs after gateway health against a staged writable temp home and syncs repaired `openclaw.json` back into both the persistent and runtime copies. Buster's gateway and pipeline containers share this runtime config, the workspace PVC, `/app/skills`, Podman storage, registry config, and `/sandbox`, so pipeline preparation and gateway-side agent tests use the same runtime surface.

Persistent storage and incident checks are detailed in `persistent-storage.md` and `../operators/security-operations.md`. The deployment verifier asserts that the retained config source is exposed separately, `openclaw.json` is overlaid from `/runtime-config` through `subPath`, Buster containers mount `/var/lib/containers` and `/sandbox`, and the sandbox ephemeral-storage limit remains `50Gi`.

## Health Probes

Init writes `/runtime-config/kubeclaw-health.mjs`, and runtime containers use it for `startupProbe`, `readinessProbe`, and `livenessProbe`.

Startup and readiness are dependency-aware. They check runtime config files, `/app/skills`, OpenClaw gateway `/health`, Redis `PING`, a Redis stream write to `kubeclaw:health:<agent>`, enabled LiteLLM, enabled Qdrant, configured registry `/v2/` endpoints, and Buster heartbeat when `agentRole` is `buster`.

Readiness is also drain-aware. Container `preStop` hooks write `KUBECLAW_DRAIN_FILE` before Kubernetes sends `SIGTERM`, so terminating containers stop reporting Ready during rollout, eviction, or node drain.

Liveness is intentionally conservative. The gateway container checks local gateway health. The Buster pipeline container keeps liveness local-only; its heartbeat is a readiness signal so short sandbox pressure makes the pod unready instead of forcing restart loops. External dependency outages should make the pod unready, not force restart loops.

For operator commands, failure signals, probe budgets, and startup doctor logs, use [Startup and health checks](startup-and-health.md).

## Verification

```bash
kubectl -n kubeclaw rollout status deploy/agent-nova
kubectl -n kubeclaw rollout status deploy/agent-buster
kubectl -n kubeclaw get pods -l app.kubernetes.io/instance=agent-nova
kubectl -n kubeclaw get pods -l app.kubernetes.io/instance=agent-buster
```

For Buster worker health:

```bash
kubectl -n kubeclaw logs deploy/agent-buster -c buster-pipeline --tail=200
```

## Shutdown

Agent pods render `terminationGracePeriodSeconds` from `shutdown.terminationGracePeriodSeconds`. The default is 180 seconds.

Runtime containers define a `preStop` hook that creates `shutdown.drainFile` and waits `shutdown.preStopDrainSeconds` before `SIGTERM`. Buster's pipeline process already handles `SIGTERM` with structured shutdown: it stops the runtime loop, terminates any active session, runs bounded sandbox cleanup, and disconnects Redis before exit.

## Common Failures

- Image pull failure: verify `ghcr-secret` and rendered image references.
- Gateway not ready: inspect OpenClaw config, shared secrets, and provider/LiteLLM reachability.
- Buster gateway ready but tasks stuck: inspect the `buster-pipeline` logs and Redis stream state.
- Config change did not roll out: verify checksum annotations changed after Helm upgrade.
