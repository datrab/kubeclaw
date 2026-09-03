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
an OpenAI model route and the LiteLLM credential used for memory-search
embeddings. Control, Studio, worker, and ingestion use
Node images and do not receive provider credentials. Any user authenticated
through the trusted Tailscale ingress can approve a design. Helm uses atomic
upgrades, so a failed upgrade keeps the last healthy release.

The agent release always receives the published Prism runtime code bundle for
the resolved `main` commit. That bundle contains the version-matched canonical
schema and fixture under `/app/skills/packages/prism-contract`; Prism does not
read those runtime contracts from the checked-out project repository. Private
release assets use the existing `github-bundle-reader` Secret. Operators may
pin or override the asset with `PRISM_CODE_BUNDLE_EXPECTED_COMMIT` and
`PRISM_CODE_BUNDLE_ARCHIVE_URL`.

The project checkout remains a separate concern. For now production values use
the explicit SSH remote `git@github.com:datrab/kubeclaw.git` and
`git-deploy-key-nova`. A later pipeline contract may replace that remote with
the project repository supplied by Nova without changing how Prism runtime
contracts are delivered.

Studio keeps a strict Content Security Policy and therefore ships
build-generated JSON Schema validators instead of compiling AJV schemas in the
browser. A connected Tailscale page that remains black while the browser
reports `unsafe-eval` or `Error compiling schema` is an outdated Studio image,
not a relay-latency issue. Rebuild/redeploy Prism; do not add `unsafe-eval` to
the policy. The deploy command restarts the Prism application Deployments after
Helm succeeds so their mutable `latest` tags are pulled even when chart values
did not change.

The desktop project chooser and fatal-error view use the always-visible
`start-panel` layout. The separate `sheet` class is reserved for mobile
navigation overlays and remains hidden on wider viewports until opened.
While Helm waits, the deploy script captures both migration containers. If an
atomic install removes a failed hook, its last bootstrap or SQL error is still
printed in the deploy output.

The Envoy sidecars are probed through their named mTLS listener and do not
depend on shell utilities in the Envoy image. The worker uses its process health
endpoint during the first install so Helm can reach the post-install database
migration; later upgrades migrate the database before rolling workloads. The
Node-based migration containers mount a bounded writable `/tmp` because their
root filesystem remains read-only. The
`prism-artifacts` and `prism-backups` PVCs carry Helm's `keep` policy and survive
release recovery or uninstall.

The shared Secret must contain `gatewayToken-prism`;
`./scripts/deploy.sh secrets` creates it without changing the existing GitHub
credential. For Discord, create the dedicated Prism bot and channel, add `discordToken-prism` to
`openclaw-shared-secrets`, set `discord.channelId`, and change
`discord.enabled` to `true` in `prism-agent-values.yaml`. Do not put provider
tokens into `prism-runtime` or the worker Deployment.

`./scripts/deploy.sh prism` first starts Control, Studio, Worker, and PostgreSQL.
The one-shot `prism-migrate` job has two privilege-separated stages. Its admin
bootstrap waits for PostgreSQL with bounded retries, creates or refreshes the
least-privilege roles, installs the `vector` extension, and ensures that
`prism_migrator` owns the `prism` schema. It also reapplies least-privilege
table grants so objects left by an interrupted earlier install remain usable by
`prism_runtime`. The ordinary migrator then verifies that ownership and runs
only schema-local migrations; it is not granted global database `CREATE` or
role-management privileges. Only after that hook succeeds does the script
install the `agent-prism` OpenClaw gateway. Studio is exposed
through the `prism-studio` Tailscale Ingress; its HTTPS MagicDNS address is
shown by `kubectl get ingress prism-studio -n kubeclaw`.

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
