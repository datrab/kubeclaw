# Agent Deployments

Nova, Buster, and the single logical Prism agent use OpenClaw gateway deployments. Pipeline execution is
provided by the shared v2 core and installed plugin packages. Buster runs the
plan runtime and the remaining legacy suite worker beside its gateway. Nova
runs Archviewer beside its gateway to serve Nova-authored HTML architecture
presentations. Archviewer is independent from Prism Studio and has no design or
Baseline Bundle authority.

## Deploy

Render the chart with `my-values/nova-values.yaml` or
`my-values/buster-values.yaml`.

Nova addresses remote execution through the neutral `capabilityProviders`
catalog. Each provider declares an `agentRole` and routes every capability
independently:

```yaml
capabilityProviders:
  buster:
    agentRole: buster
    capabilities:
      runtime.dispatch:
        adapter: openclaw
        port: 18789
      test.suite.execute:
        adapter: buster-suite-v2
        port: 18892
        proxyPort: 28892
      test.plan.execute:
        adapter: buster-plan-v1
        scheme: http
        port: 18891
        proxyPort: 28891
```

Helm resolves the role to the canonical in-namespace `agent-<role>` Service and
renders `KUBECLAW_CAPABILITY_PROVIDERS`. No endpoint, namespace, port, agent
framework, or Buster-specific routing rule is embedded in pipeline core.

Production worker routes use local Envoy listeners. SPIRE supplies automatically
rotated X.509-SVIDs, and Envoy requires the expected peer SPIFFE ID over mTLS.
Worker Core accepts forwarded identity only from the loopback proxy. See the
[Worker Trust implementation reference](../security/worker-trust.md) and the
[operator runbook](../operations/worker-trust-runbook.md).

For Buster plan execution, the traffic path is:

```text
Nova application
  -> Nova Envoy 127.0.0.1:28891
  -> SPIFFE mTLS
  -> Buster Envoy agent-buster:18891
  -> Buster runtime 127.0.0.1:28891
```

The legacy route has the same shape with ports `28892` and `18892`.
Envoy does not proxy the OpenClaw gateway route on port `18789`.

Prism is different from Buster: Nova does not call its application Control API
directly. Nova's local Envoy listener `127.0.0.1:28080` establishes mTLS to the
`agent-prism` Envoy ingress. A colocated bridge performs an OpenClaw agent send
with the stable `prism-<project-id>` session key. Only that gateway has model
access; Prism Control, Studio, and Worker are non-agent Node services. See the
[Prism OpenClaw runtime](../architecture/prism-openclaw-runtime.md).

Nova also signs each committed source snapshot with the local Ed25519
private key in `pipeline-test-gate-source-attestation`; Buster verifies it with
the corresponding public key before accepting the archive. This does not depend
on GitHub artifact attestations or any external signing service.

## Verification

Confirm Nova has its gateway, `archviewer`, and `worker-trust-proxy` containers.
Its `archviewer` port is `3456`, exposed through the dedicated NodePort `30456`.
Confirm Buster has its gateway, `buster-v2-runtime`, and `worker-trust-proxy`. Confirm Envoy
exposes plan port `18891` and legacy suite port `18892`. The Service must target
the Envoy port names `buster-plan` and `buster-legacy`. The runtime port names
must remain distinct as `plan-runtime` and `legacy-runtime` on ports `28891` and
`28892`. Kubernetes limits these names to 15 characters.
No Service may target the runtime ports. Neither deployment contains
`buster-pipeline`.

Run the complete live proof after Nova, Buster, and Prism are ready:

```bash
npm run verify:worker-core:trust:live
```

The command uses real SPIRE identities, real Envoy proxies, and real worker
processes. It does not accept a test-double boundary.

## Common Failures

Registry activation failures indicate invalid package, provider, trust, or
grant configuration.

A Kubernetes warning about a duplicate `buster-plan` or `buster-legacy` port
indicates stale port metadata from an older Buster Deployment. The deploy script
replaces the runtime port list before the Helm upgrade. The resulting runtime
ports must be `plan-runtime:28891` and `legacy-runtime:28892`; the Envoy ports
must be `buster-plan:18891` and `buster-legacy:18892`. The deploy script verifies
the runtime, proxy, and Service port mappings after the Helm upgrade and fails if
the Service can bypass Envoy.

An OpenClaw `missing-package-dir` error that points to
`/tmp/openclaw-plugin-home` indicates plugin metadata from an image build path.
Gateway images package pinned archives and an npm cache. The setup container
installs the pinned `npm:@openclaw/*` specifications offline against
`/home/node/.openclaw`. Keeping the official npm provenance is required for
privileged plugin state APIs such as Discord's `openKeyedStore`; installing the
same archive through `npm-pack:` records a local/global origin and is therefore
not trusted. An install-mode marker repairs old archive-origin installs once.
Plugin refresh must not replace the persistent SQLite state.

An init failure containing `Unable to create fallback OpenClaw temp dir:
/home/node/.cache/openclaw-0` means an OpenClaw CLI process cannot write its
fallback cache while the image root filesystem is read-only. The migration,
setup, and gateway containers must all mount the pod's writable `tmp` volume at
both `/tmp` and `/home/node/.cache`.

An `init-setup` termination with exit code `137` and reason `OOMKilled` means
the offline plugin installation exceeded its memory limit. Buster reserves a
`1Gi` request and `8Gi` limit for setup, plus a `256Mi` request and `4Gi` limit
for state migration. These init budgets are sequential and do not add to the
running Buster containers. The running pod requests about `20Gi` and has limits
of about `48.25Gi`: `24Gi` gateway, `24Gi` runtime, and `256Mi` Envoy.

OpenClaw 2026.8 validates multi-agent ownership before it can migrate persistent
state. The migration init container therefore adds `agents.ownership: explicit`
atomically to an existing managed multi-agent configuration before running
`openclaw doctor`; newly rendered gateway configurations contain the field
already. Nova and Buster run the doctor with a `3072MiB` V8 heap inside a `4Gi`
container limit. Nova also reserves a `1Gi` request and `8Gi` limit for the
following offline plugin setup. Both init containers run sequentially and do
not add to the steady-state pod memory.

The setup init container follows `runAsRoot`. Root-based agents keep the UID 0
ownership handoff required by their shared runtime, while non-root agents such
as Prism run setup as UID/GID 1000, store SSH material below
`/home/node/.ssh`, and rely on the pod's `fsGroup: 1000`. Their projected
deploy key is owner/group-readable (`0440`) so UID 1000 can copy it without
making it world-readable; root-based agents retain `0400`. A
`CreateContainerConfigError` saying that `init-setup` breaks the non-root policy
indicates an older chart render and requires redeploying the agent release.

A pod mount error referencing `buster-plan-trust` or another object absent from
the current values indicates stale Helm release values, commonly after a
rollback to an older revision. Agent upgrades use `--reset-values` so the chart
defaults plus the checked-in role values are the complete deployment source.
Nova additionally pins `extraVolumes: []` and `extraVolumeMounts: []` to remove
the retired direct-TLS Buster trust mount across rollback boundaries. Agent
deploys also remove the retired `NODE_EXTRA_CA_CERTS` environment entry,
`buster-plan-trust` mount, and matching volume from a drifted live Nova
Deployment before Helm computes its three-way merge. This repairs clusters
whose Helm manifest is already clean but whose Kubernetes object retained the
old fields. Agent upgrades use atomic cleanup so a failed wait rolls back
instead of leaving a new pending release revision.

The repository URL in role values is authoritative for both new and persistent
workspaces. During setup, an existing checkout keeps its files and local edits,
but its `origin` remote is reconciled to `agent.git.repoUrl` before fetching.
This removes retired repository identities without deleting the workspace.

Before an agent upgrade, the deployment CLI checks the Helm release status. A
`pending-install`, `pending-upgrade`, or `pending-rollback` release is rejected
before any reconciliation or Helm mutation. First inspect local `helm` and
`deploy.sh` processes and the release history. Stop only a process confirmed to
be stale; then recover the pending revision before retrying the deployment.
The CLI never deletes Helm release metadata automatically because the pending
operation may still belong to an active operator process.

Envoy keeps its administrative listener on `127.0.0.1:9901`; it is never
published through the Pod IP or a Service. Readiness and liveness use a dedicated
direct-response listener on container port `19000`, which is likewise not
published by a Service. This avoids shell dependencies in the Envoy image while
leaving the administrative API private.
