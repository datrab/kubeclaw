# Deployment

The Helm chart deploys the OpenClaw gateway and v2 plugin runtime. There is no
separate v1 Buster worker.

## Deploy

For automatic deployments after a Git PR merge, follow the
[continuous GitOps setup](continuous-gitops.md).

Use `scripts/deploy.sh` or render `charts/kubeclaw/` with an operator values
file.

## Verification

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Use the [Worker Trust runbook](../operations/worker-trust-runbook.md) to verify
SPIRE, SVID issuance, mTLS, identity denials, and source attestation.

## Troubleshooting

If rendering fails, validate values and Secret references. If runtime startup
fails, inspect the gateway container and registry activation evidence.
