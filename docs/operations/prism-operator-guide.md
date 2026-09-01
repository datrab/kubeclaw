# Prism operator guide

## Install

1. Run `./scripts/deploy.sh setup`.
2. Run `./scripts/deploy.sh secrets`.
3. Run `./scripts/deploy.sh prism`.
4. Run `./scripts/deploy.sh prism-status`.
5. Run `./scripts/deploy.sh prism-smoke`.

`deploy.sh prism` installs two Helm releases: the deterministic Prism services
from `my-values/prism-values.yaml` and the single OpenClaw agent from
`my-values/prism-agent-values.yaml`. The latter is the only Prism workload with
a LiteLLM credential or model route. Control, Studio, worker, and ingestion use
Node images and do not receive provider credentials. Any user authenticated
through the trusted Tailscale ingress can approve a design. Helm uses atomic
upgrades, so a failed upgrade keeps the last healthy release.

The shared Secret must contain `gatewayToken-prism`; `setup-secrets.sh` creates
it without changing the existing GitHub credential. For Discord, create the
dedicated Prism bot and channel, add `discordToken-prism` to
`openclaw-shared-secrets`, set `discord.channelId`, and change
`discord.enabled` to `true` in `prism-agent-values.yaml`. Do not put provider
tokens into `prism-runtime` or the worker Deployment.

Verify the intended ownership after deployment:

```bash
kubectl get deploy agent-prism prism-control prism-worker prism-studio -n kubeclaw
kubectl exec -n kubeclaw deployment/agent-prism -c kubeclaw -- openclaw gateway status
kubectl get deploy prism-worker -n kubeclaw -o yaml | grep -q PRISM_PROVIDER && echo "unexpected provider credential"
```

## Remove workloads

Run `./scripts/deploy.sh teardown-prism`. This command keeps the database PVC,
artifact PVC, and Secrets.

Use `teardown-all` only for a disposable environment. It removes the complete
Prism namespace after the destructive confirmation.

## Status

`./scripts/deploy.sh prism-status` shows workloads, Jobs, Services, PVCs, and
the Helm release. `./scripts/deploy.sh status` includes the same Prism view when
Prism is enabled.

See [Prism OpenClaw runtime](../architecture/prism-openclaw-runtime.md) for the
request flow and the reason Envoy remains part of the deployment.
