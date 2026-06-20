# Deployment Overview

Status: current
Audience: operator

## Purpose

Explain the source-backed deployment path before the detailed setup pages.

## Current Deployment Shape

KubeClaw deploys infrastructure first, then two agent releases from the shared Helm chart:

- `agent-nova` uses `my-values/nova-values.yaml`.
- `agent-buster` uses `my-values/buster-values.yaml`.
- Redis, PostgreSQL, Qdrant, LiteLLM, registry services, network policies, and the Buster namespace fence are deployed by `scripts/deploy.sh infra`.
- Tailscale Kubernetes Operator is installed by `scripts/deploy.sh tailscale` or as part of `scripts/deploy.sh infra` when enabled.

## Source-Verified Flow

| Phase | Command | Source owner | Inputs | Outputs | Recovery signal |
| --- | --- | --- | --- | --- | --- |
| Setup | `./scripts/deploy.sh setup` | `cmd_setup` in `scripts/deploy.sh`; `my-values/setup-secrets.sh` | `NAMESPACE`, workspace namespace prompt settings, secret setup mode | namespace, Helm repos, Secrets, remembered workspace namespace file `my-values/.workspace-namespace` | required command missing, secret setup warning/failure, invalid namespace |
| Infra | `./scripts/deploy.sh infra` | `cmd_infra` and component helpers in `scripts/deploy.sh` | `KUBECLAW_DEPLOY_POSTGRESQL`, `KUBECLAW_DEPLOY_QDRANT`, `KUBECLAW_DEPLOY_LITELLM`, `TAILSCALE_OPERATOR_ENABLED`, `ALLOW_PARTIAL_INFRA` | Redis, Qdrant, PostgreSQL, LiteLLM, registry services, NetworkPolicies, namespace fence, optional Tailscale operator | rollout failure; fail-closed unless `ALLOW_PARTIAL_INFRA=true` |
| Agents | `./scripts/deploy.sh agents` or `./scripts/deploy.sh image [target]` | `deploy_agent` in `scripts/deploy.sh`; Helm chart templates | `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, `ghcr-secret`, runtime Secrets | `agent-nova` and `agent-buster` releases, Services, PVCs, runtime config overlays, rollout restart for mutable runtime tags | Helm render failure, rollout restart failure, rollout timeout, gateway readiness failure |
| Code bundles | `./scripts/deploy.sh code [target]` | `deploy_agent` in `scripts/deploy.sh`; `.github/workflows/build-images.yaml`; `scripts/package-agent-skill-bundle.sh`; Helm chart templates | per-agent expected commit plus optional explicit bundle URL override | default all-agent `/app/skills` bundle rollout without local image builds; optional single-agent targeting | missing expected commit, failed bundle download, manifest mismatch, rollout timeout |
| Smoke | `./scripts/deploy.sh smoke` | `cmd_smoke` and `cmd_smoke_agent` in `scripts/deploy.sh` | live pods in `NAMESPACE` | pod readiness, gateway status, packaged skills and runtime config checks | pod not ready, `openclaw gateway status` fails, missing runtime files |

## Normal Command Order

```bash
./scripts/deploy.sh setup
./scripts/deploy.sh infra
./scripts/deploy.sh image
./scripts/deploy.sh smoke
```

For code-only updates:

```bash
./scripts/deploy.sh code nova
```

By default the deploy script resolves the latest remote `main` commit, then derives the GitHub release asset URL from the current repository and `CODE_BUNDLE_RELEASE_TAG=agent-code-bundles`. Set `NOVA_CODE_BUNDLE_EXPECTED_COMMIT`, `BUSTER_CODE_BUNDLE_EXPECTED_COMMIT`, `NOVA_CODE_BUNDLE_ARCHIVE_URL`, or `BUSTER_CODE_BUNDLE_ARCHIVE_URL` only when overriding that default source.

`scripts/setup.sh` is a guarded legacy Git repository bootstrap. It is not the normal platform deployment flow.

## Runtime Artifacts

- Agent config PVCs and workspace PVCs are rendered by `charts/kubeclaw/templates/pvc.yaml` and are annotated with `helm.sh/resource-policy: keep`.
- Persistent OpenClaw config lives under `/home/node/.openclaw` and is also exposed at `/home/node/.openclaw-persisted`; only webhook-expanded `swarm.config.json` is overlaid from pod-local runtime config.
- Buster uses a two-container pod when `busterPipeline.enabled: true`; `kubeclaw` owns the OpenClaw gateway and `buster-pipeline` runs the Redis task loop.
- Nova's Prism preview sidecar mounts workspace `prism/designs` at `/designs` and serves port `3456`.

## Verification

```bash
helm template kubeclaw charts/kubeclaw -f my-values/nova-values.yaml
helm template kubeclaw charts/kubeclaw -f my-values/buster-values.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area deployment-surface
```

## Related Pages

- `setup-flow.md`
- `secrets.md`
- `infrastructure.md`
- `agent-deployments.md`
- `deployment-verification.md`
