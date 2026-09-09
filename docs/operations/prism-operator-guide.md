# Prism operator guide

## Install

1. Merge a reviewed runtime image release selection and verify it with `node scripts/updates/materialize-release.mjs --family=runtime --check`, then run `./scripts/deploy.sh setup`.
2. Run `./scripts/deploy.sh secrets`.
3. Run `./scripts/deploy.sh prism`.
4. Run `./scripts/deploy.sh prism-status`.
5. Run `./scripts/deploy.sh prism-smoke`.

`deploy.sh prism` installs two Helm releases: the deterministic Prism services
from `releases/values/prism.yaml` and the single OpenClaw agent from
`releases/values/prism-agent.yaml`. Both come from the same selected runtime receipt. The latter is the only Prism workload with
an OpenAI model route and the LiteLLM credential used for memory-search
embeddings. Control, Studio, worker, and ingestion use
Node images and do not receive provider credentials. Any user authenticated
through the trusted Tailscale ingress can approve a design. Helm uses atomic
upgrades, so a failed upgrade keeps the last healthy release.

Production Prism image digests come from the reviewed `releases/runtime-images.json`.
`deploy.sh prism` verifies the complete receipt, source chart/value bytes and
generated values before either release changes. Image environment overrides must
repeat the selected slot's repository/digest. `PRISM_VALUES_FILE` and
`PRISM_AGENT_VALUES_FILE` remain optional private overlays for operational values;
they cannot replace or remove selected runtime image slots.

The agent release receives the published Prism runtime code bundle for that same
receipt source commit. That bundle contains the version-matched canonical schema
and fixture under `/app/skills/packages/prism-contract`; Prism does not read those
runtime contracts from the project checkout. Private release assets use the
existing `github-bundle-reader` Secret or the configured auth override. Operators
may override `PRISM_CODE_BUNDLE_ARCHIVE_URL`, but any explicit
`PRISM_CODE_BUNDLE_EXPECTED_COMMIT` must equal the selected runtime commit.
`./scripts/deploy.sh render prism` checks both actual Helm renders locally without
changing cluster resources.

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
the policy. A selected digest changes the Pod template during Helm upgrade; a mutable-tag
restart is not the release selection mechanism.

The desktop project chooser and fatal-error view use the always-visible
`start-panel` layout. The separate `sheet` class is reserved for mobile
navigation overlays and remains hidden on wider viewports until opened.
Studio forwards Control's `prism_session` and `prism_csrf` cookies as separate
`Set-Cookie` values. Combining or overwriting them causes the first authenticated
API request to fail with `invalid session` even though the Tailscale identity
exchange itself succeeded.
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
Opening Studio does not create a project or invoke the agent. Before Nova has
submitted an architecture, Studio shows an empty state. Submitted projects are
listed immediately, with design generation marked pending until `agent-prism`
has committed the three directions.

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

### Pipeline preference identity

For automatic Nova design generation, set the platform-owned Helm value
`control.pipelinePreferenceSubject` to the real subject ID shown as `userId` in
that operator's authenticated Prism preference events (`user-` followed by 24
hexadecimal characters). The Control deployment passes it as
`PRISM_PIPELINE_PREFERENCE_SUBJECT`. No real account is selected by the default
chart: an empty value leaves automated snapshots without a personal subject.

After verifying Nova's existing signed or SPIFFE dispatch identity, Control uses
this configured subject even when the request contains no subject field. A
request containing `preferenceSubjectId` must match the configured subject
exactly; absent configuration or a mismatch rejects it before project mutation
or preference access. Project definitions, signal issuer IDs and architecture
content cannot select another personal account. Studio requests continue using
the authenticated Studio session's subject. The recorded generation snapshot
shows which subject and events were actually used. Changing this platform value
requires access to the deployment configuration; do not populate it from a
project-authored value or an untrusted request header.
