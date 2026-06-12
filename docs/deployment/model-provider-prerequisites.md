# Model Provider Prerequisites

Status: current with upstream dependency
Audience: operator

## Purpose

Explain which model/provider setup belongs to OpenClaw or LiteLLM and which parts KubeClaw consumes.

## Boundary

KubeClaw does not own provider-specific account setup. Use upstream OpenClaw and LiteLLM documentation for provider credentials, supported providers, model names, and proxy behavior.

KubeClaw owns:

- Kubernetes Secrets and values that pass provider/proxy credentials into agents.
- Optional LiteLLM deployment wiring.
- Agent verification that the configured provider path is reachable.

## KubeClaw Inputs

- `openclaw-shared-secrets.anthropicApiKey`
- `openclaw-shared-secrets.stitchApiKey`
- `openclaw-shared-secrets.litellmApiKey`
- `litellm-secrets.LITELLM_MASTER_KEY` when LiteLLM is deployed
- `google-sa-key` when LiteLLM config uses Google service account credentials

## Source-Backed Wiring

| Provider path | Source owner | Inputs | Runtime output | Verification |
| --- | --- | --- | --- | --- |
| Agent LiteLLM client | `charts/kubeclaw/templates/configmap-gateway.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `charts/kubeclaw/values.yaml` | `litellm.endpoint`, `litellm.defaultModel`, `litellm.models`, `openclaw-shared-secrets.litellmApiKey` | runtime `/home/node/.openclaw/openclaw.json` with `models.providers.litellm.baseUrl` and API key substituted from Secret | render chart; `kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- openclaw gateway status` |
| Optional LiteLLM proxy | `my-values/infra/litellm-config.yaml`; `my-values/infra/litellm-deployment.yaml`; `scripts/deploy.sh` | `KUBECLAW_DEPLOY_LITELLM`, `litellm-secrets.LITELLM_MASTER_KEY`, `litellm-secrets.DATABASE_URL`, `google-sa-key.credentials.json` | `Deployment/litellm`, `Service/litellm` NodePort `30050`, model list for `gemini-flash`, `gemini-pro`, `claude-opus`, `claude-sonnet`, `claude-haiku`, wildcard Vertex AI fallback | deployment truth; `kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=180s` |
| ACP Claude harness | `charts/kubeclaw/templates/deployment.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml` | `anthropic.existingSecret`, `anthropic.existingSecretKey`, `openclaw-shared-secrets.anthropicApiKey` | Anthropic credential exposed to runtime container from Kubernetes Secret | `kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets -o go-template='{{ index .data "anthropicApiKey" }}'` |
| Stitch design tooling | `my-values/nova-values.yaml`; `charts/kubeclaw/templates/deployment.yaml` | `stitch.existingSecret`, `stitch.existingSecretKey`, `openclaw-shared-secrets.stitchApiKey` | Stitch key exposed to the Nova runtime when configured | Secret key check plus Nova rollout/gateway status |

## Failure Modes

- Missing `litellmApiKey` breaks agent calls to the configured LiteLLM endpoint even if the LiteLLM pod is healthy.
- Missing `LITELLM_MASTER_KEY`, `DATABASE_URL`, or `google-sa-key.credentials.json` breaks the optional LiteLLM proxy deployment path.
- Provider model names in `my-values/infra/litellm-config.yaml` are source-backed current config, not a guarantee that the upstream provider will accept them forever.
- If `KUBECLAW_DEPLOY_LITELLM=false`, the KubeClaw-managed proxy is skipped; the operator must provide a reachable endpoint matching `litellm.endpoint`.

## Upstream References

- OpenClaw provider setup: use the active OpenClaw documentation for the running OpenClaw version.
- LiteLLM docs: <https://docs.litellm.ai/>

## Verification

Provider verification is completed in later deployment/operator docs. The minimum KubeClaw checks are:

```bash
kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets
kubectl -n "$NAMESPACE" get secret litellm-secrets google-sa-key
kubectl -n "$NAMESPACE" rollout status deployment/agent-nova --timeout=180s
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- openclaw gateway status
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Readiness Checklist

| Requirement | Repo-proven source | Live/operator proof |
| --- | --- | --- |
| Agent gateway token, Anthropic key, Stitch key, Discord tokens/webhook | `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/configmap-gateway.yaml`; `deployment.yaml` | `kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets -o yaml` and agent gateway status |
| LiteLLM proxy Secret and database URL | `my-values/setup-secrets.sh`; `my-values/infra/litellm-deployment.yaml` | `kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=120s` |
| Vertex/Google service account mount | `my-values/infra/litellm-values.yaml`; `litellm-deployment.yaml` | `kubectl -n "$NAMESPACE" get secret google-sa-key -o jsonpath='{.data.credentials\\.json}'` |
| Model names and provider routing | `my-values/infra/litellm-config.yaml` | LiteLLM health and a real model request with current provider credentials |

The repository can prove that KubeClaw wires the expected keys and files. It cannot prove that upstream provider accounts, quotas, model IDs, OAuth policies, or API compatibility are still valid on the day you deploy.
