# Values Examples

Status: examples
Audience: operators, developers

## Purpose

Show safe example deployment shapes that operators can adapt. These examples are not production defaults.

Use these pages to choose command flags and understand expected resources before running `scripts/deploy.sh`. The actual deployment sources are `scripts/deploy.sh`, `charts/kubeclaw/values.yaml`, `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, and `my-values/infra/*.yaml`.

## Examples

| Example | Use when | Main flags | Expected shape |
| --- | --- | --- | --- |
| [Local/dev values](local-dev.md) | trying deployment mechanics without optional provider-backed services | `KUBECLAW_DEPLOY_LITELLM=false`, `KUBECLAW_DEPLOY_POSTGRESQL=false`, `KUBECLAW_DEPLOY_QDRANT=false`, `TAILSCALE_OPERATOR_ENABLED=false` | agents plus Redis/registries/NetworkPolicies/fence, no LiteLLM/PostgreSQL/Qdrant/Tailscale |
| [Staging-like values](staging-like.md) | rehearsing production-like dependency wiring with real credentials | optional services enabled | agents plus Redis/PostgreSQL/Qdrant/LiteLLM/registries/NetworkPolicies/fence/Tailscale |

## Verify

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Failure Signals

- Helm render failure means values or templates do not produce valid manifests.
- Deployment truth failure means an example claim about resources, Services, RBAC, config overlays, images, or NetworkPolicies has drifted.
- Live rollout failure after using an example usually points at missing Secrets, provider credentials, image pull permissions, or optional infrastructure readiness.

## Rule

Do not paste real secrets into values files. Use Kubernetes Secrets and the setup flow documented in `../../deployment/secrets.md`.
