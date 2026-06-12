# CLI Reference

Status: generated reference
Audience: reference reader, operator, developer

## Summary

This page lists deployment CLI commands currently extracted from source inventory. Pipeline and Buster CLI references will be added in later inventory slices.

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `scripts/deploy.sh`

## Deployment Commands

| Command | Description |
| --- | --- |
| `./scripts/deploy.sh setup` | Create namespace + secrets + helm repos |
| `./scripts/deploy.sh secrets` | Create/copy/prompt required Kubernetes secrets |
| `./scripts/deploy.sh infra` | Deploy required infra plus optional Qdrant/PostgreSQL/LiteLLM |
| `./scripts/deploy.sh tailscale` | Deploy Tailscale Kubernetes Operator |
| `./scripts/deploy.sh agents` | Deploy agents (Nova + Buster) |
| `./scripts/deploy.sh agent <name>` | Deploy single agent (nova\|buster) |
| `./scripts/deploy.sh build-local-images [tag]` | Build + push verification images to registry-local |
| `./scripts/deploy.sh verify-live [tag]` | Build local images, redeploy agents, run pod smoke |
| `./scripts/deploy.sh smoke` | Run pod-level smoke checks for Nova + Buster |
| `./scripts/deploy.sh smoke-agent <name>` | Run pod-level smoke checks for one agent |
| `./scripts/deploy.sh all` | Full deployment (setup + infra + agents) |
| `./scripts/deploy.sh status` | Show all pods and services |
| `./scripts/deploy.sh teardown` | Remove agents + infra, keep namespace/secrets |
| `./scripts/deploy.sh teardown-agents` | Remove agents only, keep infra |
| `./scripts/deploy.sh teardown-all` | Destroy namespace and everything in it |

## Command Cases

- `setup`
- `infra`
- `secrets`
- `tailscale`
- `agents`
- `agent`
- `all`
- `build-local-images`
- `verify-live`
- `smoke`
- `smoke-agent`
- `status`
- `teardown`
- `teardown-agents`
- `teardown-all`

## Component Flags

- `KUBECLAW_DEPLOY_POSTGRESQL`
- `KUBECLAW_DEPLOY_QDRANT`
- `KUBECLAW_DEPLOY_LITELLM`
- `TAILSCALE_OPERATOR_ENABLED`
- `ALLOW_PARTIAL_INFRA`


<!-- END GENERATED -->

## Used by

- `../deployment/setup-flow.md`
- `../deployment/deployment-verification.md`
- `../operators/recovery-runbook.md`

## Command Expectations

| Command group | Runtime owner | Expected artifacts or resources | Failure signals |
| --- | --- | --- | --- |
| setup and secrets | `scripts/deploy.sh`; `my-values/setup-secrets.sh` | namespace, required Kubernetes Secrets, Helm repositories, optional workspace namespace record | missing command, invalid secret setup mode, missing required Secret keys |
| infra | `scripts/deploy.sh`; `my-values/infra/*.yaml` | Redis, optional PostgreSQL/Qdrant/LiteLLM, registry helpers, NetworkPolicies, namespace fence | rollout timeout, Helm repo failure, invalid manifest, partial infra warning when `ALLOW_PARTIAL_INFRA=true` |
| agents | `charts/kubeclaw/templates/*.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml` | `Deployment/agent-nova`, `Deployment/agent-buster`, Services, PVCs, runtime ConfigMaps | Helm render failure, image pull failure, init-container Git/config/skill error |
| smoke and verify-live | `scripts/deploy.sh`; chart health script | pod smoke output, cluster image-pull preflight, local image override values | gateway health failure, Redis/LiteLLM dependency failure, local registry push/pull mismatch |
| teardown | `scripts/deploy.sh` | removed Helm releases/resources according to selected teardown scope | confirmation prompt mismatch, retained PVCs or Secrets that need manual review |

## Verification

```bash
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

This generated page proves command inventory and documented command groups. It does not prove live provider credentials, Tailscale tailnet policy, node firewall rules, or CNI enforcement.

## Generated from

- `../generated/inventory/deploy-script.json`
- `../../scripts/docs-generate.mjs`
