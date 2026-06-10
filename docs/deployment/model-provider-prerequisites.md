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

## Upstream References

- OpenClaw provider setup: use the active OpenClaw documentation for the running OpenClaw version.
- LiteLLM docs: <https://docs.litellm.ai/>

## Verification

Provider verification is completed in later deployment/operator docs. The minimum KubeClaw checks are:

```bash
kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets
kubectl -n "$NAMESPACE" rollout status deployment/agent-nova --timeout=180s
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- openclaw gateway status
```
