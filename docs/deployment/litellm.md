# LiteLLM Deployment

Status: current
Audience: operator

## Purpose

Explain how KubeClaw deploys LiteLLM and what upstream LiteLLM owns.

## When LiteLLM Is Deployed

`scripts/deploy.sh infra` deploys LiteLLM when `KUBECLAW_DEPLOY_LITELLM` is enabled. It creates or updates the `litellm-config` ConfigMap from `my-values/infra/litellm-config.yaml`, applies `my-values/infra/litellm-deployment.yaml`, and waits for `deployment/litellm`.

## Required Local Inputs

- `litellm-secrets`
- `google-sa-key` when the LiteLLM config uses Google service account credentials
- PostgreSQL through the bundled PostgreSQL deployment, unless LiteLLM is configured with a direct database URL

## Deploy

Deploy LiteLLM with all enabled infrastructure:

```bash
./scripts/deploy.sh infra
```

Deploy or rerun only LiteLLM:

```bash
./scripts/deploy.sh litellm
```

## Upstream Boundary

LiteLLM owns proxy/provider semantics, OpenAI-compatible endpoints, model routing, virtual keys, and its proxy configuration format. KubeClaw docs should link upstream for those details and document only the local deployment wiring.

Upstream docs: <https://docs.litellm.ai/>

## Verification

```bash
kubectl -n "$NAMESPACE" get configmap litellm-config
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=120s
kubectl -n "$NAMESPACE" get svc litellm
```

## Common Failures

- missing `litellm-secrets`
- missing or invalid `google-sa-key`
- PostgreSQL not ready
- model/provider credential errors surfaced through LiteLLM

## Source-Backed Wiring

| Surface | Source | Expected object |
| --- | --- | --- |
| LiteLLM deployment | `my-values/infra/litellm-deployment.yaml` | `Deployment/litellm`, `Service/litellm`, `Secret/litellm-secrets`, `Secret/google-sa-key`, `ConfigMap/litellm-config` |
| LiteLLM config | `my-values/infra/litellm-config.yaml` | provider/model routing and `master_key: os.environ/LITELLM_MASTER_KEY` |
| Secret creation | `my-values/setup-secrets.sh` | `litellm-secrets` keys `LITELLM_MASTER_KEY` and `DATABASE_URL`; `google-sa-key` key `credentials.json` |
| Agent consumption | `charts/kubeclaw/templates/deployment.yaml`; `configmap-gateway.yaml` | `LITELLM_URL`, `LITELLM_API_KEY`, and runtime OpenClaw config placeholders replaced in `/runtime-config/openclaw.json` |

Run `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` after changing any of these files. That proves source/render wiring, not live provider account validity.
