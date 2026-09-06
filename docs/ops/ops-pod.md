# Persistent Codex Ops Pod

Status: implementation; live deployment and mobile pairing still require verification.
Audience: Kubernetes operator, incident responder, platform maintainer
Owner: platform operations
Evidence: `scripts/deploy-ops-pod.sh`; `ops/pod/verify.py`; `charts/ops-pod/`
Applies to: the persistent Codex Ops Pod
Last verified: source and CI checks on 2026-09-06; live acceptance pending

Architecture: [Codex Ops Pod architecture](../architecture/ops-pod.md).

## Navigation

- [Build and deploy](#build-and-deploy-once), [login and pair](#login-pair-and-use)
- [Operator reference and configuration](#operator-reference)
- [Live acceptance](#live-acceptance-procedure)
- [Observability and incident triage](#observability-and-incident-triage)
- [Upgrade and rollback](#upgrade-and-rollback)
- [Credential rotation](#credentials-rotation-and-revocation)
- [Backup and restore](#backup-and-restore)
- [Incident repair](#incident-repair-procedure), [decommissioning](#decommissioning)

## Overview

One StatefulSet runs the official Codex CLI and the KubeClaw MCP server in separate
containers. It is installed directly with Helm, independently of Argo and the
KubeClaw build/reconciliation pipeline. There is no additional VM. An optional
unprivileged Tailscale sidecar provides outbound access to the existing tailnet.

This is an in-cluster operations workspace. A broken agent, pipeline or Argo does
not inherently take it down. A failed node, container runtime, Kubernetes network,
DNS or storage can. Two replicas would share these dependencies and cannot safely
share one Codex identity/workspace. Use the existing management/KVM path when the
Pod itself is unreachable; this design does not replace that path.

## Components and boundaries

| Component | Persistent state | Normal access |
| --- | --- | --- |
| Codex CLI 0.153.4 | Home/auth/config (2 GiB), workspace (20 GiB) | Local MCP; GitHub using your separately authenticated identity |
| Ops MCP | None | Read-only Kubernetes observer, exact discovered namespaces; nodes and global Cilium policies |
| Optional Tailscale | Separate 1 GiB PVC | Outbound SOCKS5 on localhost:1055, subject to tailnet grants |

Default CPU/memory requests total 125m/320Mi; limits total 2.5 CPU/3584Mi without
Tailscale. These are initial scheduling budgets, not measured consumption. Local
builds may need larger limits. Storage uses the cluster's default StorageClass
unless overridden. With local-path storage, PVCs remain dependent on their node.

Both primary containers run as UID 1000, with read-only root filesystems, no added
Linux capabilities, no privilege escalation, and no host mounts or runtime socket.
Only MCP mounts a short-lived, kubelet-rotated observer token. Codex receives a
separate random MCP bearer and has no Kubernetes credential by default. The MCP
listens on loopback only. No Ingress, public MCP endpoint or inbound remote shell
is created. The headless Service supplies StatefulSet identity, not MCP access.

The Codex configuration uses `danger-full-access` **inside this restricted
container**, with `on-request` approvals. The container is the execution boundary;
there is no additional nested Codex OS sandbox. GitHub credentials and the
persistent workspace are therefore accessible to processes launched by Codex.
Choose repository-scoped GitHub credentials and review requested changes.

NetworkPolicy denies ingress and permits cluster DNS, discovered API IPs and
public HTTPS. Cilium API-server entity access is added when its CRD is detected.
Policies apply to the entire Pod, including Codex. They do not enforce an OpenAI-
or GitHub-only HTTPS allowlist. The public egress rule targets the existing IPv4
setup; IPv6-only infrastructure needs corresponding explicit values/templates.

## Build and deploy once

The `Build Ops Images` workflow validates both images on pull requests and
publishes on main or manual dispatch. Use its immutable digests for
`kubeclaw-codex-ops` and `kubeclaw-ops-mcp`. The Codex image wraps the pinned official
npm package, plus Git, GitHub CLI, kubectl and Helm. It does not assume that OpenAI
publishes a ready-made mobile remote-host container.

Run from a checkout on your existing administration machine with Python 3,
kubectl, Helm and bootstrap permissions:

```bash
export KUBE_CONTEXT='<your-existing-context>'
export OPS_CODEX_IMAGE='ghcr.io/datrab/kubeclaw-codex-ops@sha256:<build-digest>'
export OPS_MCP_IMAGE='ghcr.io/datrab/kubeclaw-ops-mcp@sha256:<build-digest>'
./scripts/deploy-ops-pod.sh deploy
```

The helper discovers actual API endpoints and existing observer namespaces,
validates the Helm render, creates `kubeclaw-ops`, generates the MCP bearer and
copies the existing `kubeclaw/ghcr-secret` if needed. It does not print credentials.
The deployment is deliberately not gated on login-dependent readiness. Wait for
the containers to be running before using the commands below; initial `NotReady`
while awaiting Codex login is expected.

For an existing pull secret in another namespace set `OPS_PULL_SECRET_SOURCE_NAMESPACE`.
For public images or a manually prepared pull secret set `OPS_COPY_PULL_SECRET=0`.
Use `OPS_POD_VALUES=/absolute/path/values.yaml` for chart overrides, such as storage
and resources. The helper manages the default secret names; custom secret names
must already exist. `OPS_NAMESPACE` and `OPS_RELEASE` select the installation.
`OPS_READ_NAMESPACES` accepts a comma-separated observer namespace list; missing
namespaces are omitted. Re-run deploy after API endpoints or that list change.

Optionally set these **before deploy**:

```bash
export OPS_GITHUB_TOKEN_FILE='/secure/path/repository-token'
export OPS_TAILSCALE_AUTHKEY_FILE='/secure/path/tailscale-authkey'
```

The GitHub file supplies `GH_TOKEN` to Codex only. Grant read access for diagnosis,
or repository contents/pull-request write when you want Codex to propose fixes.
Do not grant administrator or organization-wide access. The Tailscale key should
use a dedicated tag and grants limited to required management destinations. Neither
file is committed. Omit them for interactive GitHub login and no Tailscale.

## Login, pair and use

```bash
./scripts/deploy-ops-pod.sh login
./scripts/deploy-ops-pod.sh github-login  # omit when GH_TOKEN was supplied
./scripts/deploy-ops-pod.sh pair
./scripts/deploy-ops-pod.sh status
./scripts/deploy-ops-pod.sh verify
```

Device login writes into the persistent Codex home. The supervisor then launches
the real foreground `codex remote-control` process and restarts it if it exits.
`pair` invokes the real CLI pairing command. Follow its output in the mobile app.
Login and pairing do not require another image build or Helm deployment. A running
process/readiness is not proof of a working mobile session.

The pinned Linux CLI exposes `remote-control`, `pair` and device login, and accepts
the installed MCP configuration. Whether your account/mobile client can pair with
this Linux host remains a live compatibility check. See the
[official CLI reference](https://learn.chatgpt.com/docs/cli/reference).
If pairing is unavailable, the complete workspace remains accessible with
`./scripts/deploy-ops-pod.sh shell`; no successful pairing is claimed by the tests.

Once GitHub authentication is complete, use the shell or the paired agent to run:

```bash
gh repo clone datrab/kubeclaw /workspace/kubeclaw
cd /workspace/kubeclaw
```

The MCP is preconfigured as `kubeclaw_ops`. It exposes namespace workloads, pod
logs/events, Argo Application state, nodes and Cilium policy/DaemonSet state.
Kubernetes unavailability produces tool errors, not fabricated healthy output.
GitHub changes use `gh` and Git in the workspace. The default MCP provides
observations; it cannot restart workloads, execute in other Pods or change policy.

`verify` calls the actual MCP and API and checks that listing Secrets with the
observer token gets **403**. Connectivity failures and authentication failures do
not pass this negative control. It also verifies that Codex has no mounted service
account token. Pairing and successful pipeline execution are separate live checks.

## Repairs and break-glass access

Normal path: diagnose with MCP, make a targeted Git change and submit a PR using
GitHub. If Argo is broken, apply the reviewed fix through your existing operator
context rather than waiting for Argo to repair itself.

For an approved imperative repair from the Pod, explicitly provide a short-lived,
incident-scoped kubeconfig in `/tmp` through your existing administration session,
then use `KUBECONFIG=/tmp/incident.kubeconfig kubectl ...`. Scope its identity to the
required resources, namespace and verbs; approve each proposed change. Never
replace the MCP observer binding with cluster-admin. Remove the file and revoke
its credential after the incident; do not store it on either PVC. Temporary
credentials remain accessible to Codex while present, so elevation is deliberate.
The normal Pod does not have permission to mint its own elevated token.

Host diagnosis/repair uses your existing SSH identity and management path. No host
root key is provisioned into this Pod. If optional Tailscale is enabled, OpenSSH
can use the userspace proxy with `-o 'ProxyCommand=nc -X 5 -x 127.0.0.1:1055 %h %p'`
and an explicitly supplied key plus verified known_hosts. This is outbound access,
not a Tailscale SSH server or a Cilium-independent entry point. Supply host
credentials only for an intentional session and remove them afterwards.

If Kubernetes/Cilium prevents reaching the Pod, recover through the existing
management/KVM access. A Pod cannot repair networking that also cuts off its own
control channel. Do not disable policy or grant permanent host privileges to hide
that dependency.

## Maintenance and removal

Update the pinned Codex package and lockfile together, run `npm ci && npm test`
in `ops/pod` with Helm installed, and let CI build and smoke-test the actual image.
The image currently pins kubectl v1.34.1; check client/server version skew before
using it against a differently versioned cluster. Deploy new image digests with
the same helper. Auth, configuration and workspace survive Pod/image replacement.

Back up the PVCs using your existing storage backup process. They contain account
credentials and private source code. A PVC is persistence, not a backup.

Helm uninstall retains StatefulSet PVCs and the optional Tailscale PVC. Bootstrap
Secrets also remain until explicitly removed. For a permanent removal, revoke
Codex/GitHub/Tailscale access first, uninstall the release, then delete its PVCs
and Secrets once their contents are no longer needed. Keep replicas at one.

## Operator reference

Use the [architecture contract](../architecture/ops-pod.md) for the rationale,
trust model, failure domains and source map. This runbook covers procedures for
the implementation; commands below are not a record of completed live acceptance.

### Administration session

Run management commands from the existing administration machine and repository
root. Keep one explicit context, namespace and release throughout an operation:

```bash
export KUBE_CONTEXT='<intended-context>'
export OPS_NAMESPACE='kubeclaw-ops'
export OPS_RELEASE='codex-ops'
pod="${OPS_RELEASE}-0"
k=(kubectl --context "$KUBE_CONTEXT" --namespace "$OPS_NAMESPACE")
```

The examples use Bash arrays. They do not switch the global kubectl context.
Before a mutation, confirm the target and source revision:

```bash
git rev-parse HEAD
kubectl config get-contexts "$KUBE_CONTEXT"
kubectl --context "$KUBE_CONTEXT" get nodes
kubectl --context "$KUBE_CONTEXT" get storageclass
```

Bootstrap needs discovery reads for namespaces, the default Kubernetes Service
and Endpoints, and Cilium CRDs. It needs namespace creation, Helm installation
(including cluster roles/bindings), and permission to read/create the selected
pull/authentication Secrets. These are operator permissions, not the observer
permissions granted to the running Pod.

### Helper configuration

| Variable | Default / meaning | When needed |
| --- | --- | --- |
| `KUBE_CONTEXT` | Required explicit kubeconfig context | Every helper invocation |
| `OPS_NAMESPACE` | `kubeclaw-ops` | Select release namespace |
| `OPS_RELEASE` | `codex-ops` | Select Helm release and Pod prefix |
| `OPS_CODEX_IMAGE`, `OPS_MCP_IMAGE` | Required immutable registry digests | `deploy` |
| `OPS_POD_VALUES` | Optional values file | Keep durable custom chart settings |
| `OPS_READ_NAMESPACES` | `kubeclaw,argocd,kube-system,cilium,tailscale,spire-server,spire-system` | Bootstrap selects existing namespaces and always includes its own |
| `OPS_COPY_PULL_SECRET` | `1` | Set `0` when pull credentials are already prepared or unnecessary |
| `OPS_PULL_SECRET_SOURCE_NAMESPACE` | `kubeclaw` | Source of `ghcr-secret` when copying |
| `OPS_GITHUB_TOKEN_FILE` | Unset | Populate `codex-ops-github` and enable its reference |
| `OPS_TAILSCALE_AUTHKEY_FILE` | Unset | Populate `codex-ops-tailscale` and enable the sidecar |

Values precedence is chart defaults, discovered values, `OPS_POD_VALUES`, then
helper image/optional-credential flags. Keep the intended configuration file and
image digests with the deployment record. Re-running deploy is not a merge of
arbitrary previous Helm values: do not rely on an old interactive environment to
preserve options.

For example, to observe an existing namespace `platform`, use:

```yaml
# /secure/ops-values.yaml -- configuration, not credential contents
# Keep other intended overrides in this same file.
defaultNamespace: platform
argoNamespace: argocd
resources:
  mcp:
    requests:
      memory: 64Mi
    limits:
      memory: 512Mi
```

Set `OPS_READ_NAMESPACES=platform,argocd,kube-system` and
`OPS_POD_VALUES=/secure/ops-values.yaml` before deploy. `defaultNamespace` selects
default tool/verification scope; it does not grant access. The chosen namespace
must exist and be in the observer bindings. Missing requested namespaces are
omitted by discovery, not created as application namespaces.

When initially enabling GitHub or Tailscale using the optional file variables,
record `githubSecret: codex-ops-github` and/or `tailscale.enabled: true` in the
values file for later upgrades that do not resupply those file variables. Existing
Secrets are retained, but retaining a Secret alone does not enable its chart option.

### Expected default names

| Object | Name / location |
| --- | --- |
| Pod / StatefulSet | `codex-ops-0` / `codex-ops` in `kubeclaw-ops` |
| Containers | `codex`, `ops-mcp`, optional `tailscale` |
| Home PVC | `home-codex-ops-0`, mounted at `/home/node` |
| Workspace PVC | `workspace-codex-ops-0`, mounted at `/workspace` |
| Tailscale PVC | `codex-ops-tailscale`, mounted in Tailscale only |
| Observer ServiceAccount | `codex-ops` in `kubeclaw-ops` |
| Namespaced reader role/bindings | `kubeclaw-ops-codex-ops-reader` |
| Cluster reader role/binding | `kubeclaw-ops-codex-ops-cluster-reader` |
| MCP bearer Secret | `codex-ops-bearer`, key `token` |
| Optional GitHub Secret | `codex-ops-github`, key `token` |
| Optional Tailscale Secret | `codex-ops-tailscale`, key `authkey` |
| Registry Secret | `ghcr-secret` |

### Publish an unmerged candidate

In GitHub Actions, select **Build Ops Images**, choose **Run workflow**, and select
the intended branch. Record the run's source revision and both published digests.
A green pull-request check does not produce pullable images. Do not guess a digest
from a commit tag or substitute a local Docker image ID. The primary images are
validated by the chart as `image@sha256:<64 hexadecimal characters>`.

The workflow publishes on matching main pushes as well. Neither trigger installs
the chart. A candidate may be deployed once and then authenticated/paired without
another deployment. Future source/image or chart changes naturally require an
upgrade of the affected running configuration.

## Live acceptance procedure

### 1. Establish workload and storage state

```bash
"${k[@]}" get pods,pvc
"${k[@]}" describe pod "$pod"
"${k[@]}" get events --sort-by=.metadata.creationTimestamp
```

Expected: claims bind, images pull, both primary containers are running. Codex can
be not-ready while waiting for login. Helm success proves that installation was
accepted, not that these conditions or mobile connectivity have passed.

### 2. Authenticate and verify the control path

Run the login, GitHub-login (if needed), pair and verify helper commands above.
The two verification stages must succeed: real local MCP/API reads, and a real
403 for Secret listing with the observer credential in the configured default
namespace. A 401, timeout, missing credential or missing file is a failed check.

From the mobile session, request one read-only observation in the configured
namespace and check that it returns current data. Confirm the session can use
`/workspace/kubeclaw` and inspect Git status. Do not use a destructive repair as
the first pairing test. Record mobile success separately from Pod readiness.

### 3. Prove persistence during a controlled restart

Do this after initial acceptance, with no active Codex task or file writes:

```bash
"${k[@]}" exec "$pod" -c codex -- sh -c 'umask 077; printf "ops-persistence-check\n" > /workspace/ops-persistence-check.txt'
"${k[@]}" delete pod "$pod"
```

Wait until Kubernetes recreates the Pod and both containers run. Then:

```bash
"${k[@]}" exec "$pod" -c codex -- cat /workspace/ops-persistence-check.txt
"${k[@]}" exec "$pod" -c codex -- codex login status
./scripts/deploy-ops-pod.sh verify
```

Reopen the mobile session and verify usable remote access, without assuming that
an in-flight task survives process termination. Remove the test file afterwards.
Persistent credentials do not guarantee uninterrupted remote sessions.

### 4. Record acceptance

Record date, operator, context, namespace, release revision, source revision, both
image digests, PVC status, verification outputs, mobile result and persistence
result. Keep logs private if they contain infrastructure/application information.
Also record a successful login to the existing management path. Do not inject a
host/Cilium outage solely to complete this initial acceptance.

## Observability and incident triage

```bash
./scripts/deploy-ops-pod.sh status
"${k[@]}" logs "$pod" -c codex --tail=100
"${k[@]}" logs "$pod" -c ops-mcp --tail=100
"${k[@]}" get events --sort-by=.metadata.creationTimestamp
```

For a previously terminated container, add `--previous` to its logs command. That
history may be unavailable after Pod replacement. If Metrics Server is present,
`"${k[@]}" top pod "$pod" --containers` shows current usage; its absence does not
mean the Ops Pod is unhealthy. The chart deploys no metrics collector or alerts.

| Observation | Meaning / next check |
| --- | --- |
| `waiting-for-login` | Supervisor is available; check `codex login status` and perform device login |
| `remote-process-running` | Remote CLI process exists; separately verify mobile pairing and actual tasks |
| `remote-process-exited` | Inspect exit code and Codex logs; the supervisor retries after ten seconds |
| Status file missing | Container may not have reached supervisor initialization; inspect logs, mounts and permissions |
| MCP health succeeds, API reads fail | Process is alive; inspect API connectivity, projected credentials and RBAC |
| `Pending` with unbound PVC | Inspect StorageClass, capacity, claim events and any node affinity |
| `ImagePullBackOff` | Check published digest and registry Secret location/access; never print the Secret value |
| `OOMKilled` | Check the affected container and workload; 512Mi is the MCP limit, not the entire Pod limit |
| Cilium tool returns 404 | Check CRD installation/resource availability; it is not a healthy-policy result |
| API 403 on an intended read | Check exact namespace, resource and observer RoleBinding; do not grant cluster-admin |
| MCP 401 | Check bearer configuration/rotation and whether both processes were restarted together |
| API TLS error | Check API URL/CA/certificate validity and actual endpoint; do not disable certificate verification |
| Pairing unavailable but exec works | Inspect real pairing output and account/client support; preserve the PVC and use the administration fallback |
| API/exec unreachable | Move to the existing management path; this Pod cannot guarantee its own rescue |

The default Pod has no arbitrary shell MCP tool or host diagnostic daemon. Node
conditions are Kubernetes observations, not a full host examination. Diagnose
host service/disk/kernel faults using the existing management connection.

### Local MCP health and interactive Codex

Check MCP health inside its container, because it listens on loopback:

```bash
"${k[@]}" exec "$pod" -c ops-mcp -- node -e 'fetch("http://127.0.0.1:8080/healthz").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
```

The remote child inherits its bearer from the supervisor. The supported `shell`
helper starts `/opt/codex/shell.sh`, which reads the mounted bearer, validates it
and exports it before opening Bash. No manual token export is needed:

```bash
./scripts/deploy-ops-pod.sh shell
codex mcp list
```

For direct `kubectl exec`, invoke `bash /opt/codex/shell.sh` as well: plain Bash
does not inherit the supervisor environment. The wrapper refuses to start if the
mounted credential is missing or too short. Avoid shell tracing while handling
credentials. A listed MCP entry proves config
loading; use the live verifier for actual calls. Do not start a second background
remote-control supervisor in the same persistent home.

## Upgrade and rollback

1. Finish or stop active tasks and record their state, Git worktree status, current
   image digests, values and Helm revision.
2. Keep the intended values file. Publish the new images if source changed, then
   supply their digests and run `deploy` from the intended repository revision.
3. Inspect startup, run the live verifier and verify mobile access. Existing login
   and workspace should remain, but CLI compatibility is still checked explicitly.

```bash
helm history "$OPS_RELEASE" --kube-context "$KUBE_CONTEXT" --namespace "$OPS_NAMESPACE"
helm status "$OPS_RELEASE" --kube-context "$KUBE_CONTEXT" --namespace "$OPS_NAMESPACE"
```

If a previous revision is known-good and its image remains available, choose its
numeric revision from history and run:

```bash
rollback_revision='<revision-from-history>'
helm rollback "$OPS_RELEASE" "$rollback_revision" --kube-context "$KUBE_CONTEXT" --namespace "$OPS_NAMESPACE"
```

Rollback changes Helm-managed manifests. It does not undo GitHub operations,
restore PVC contents, revert Codex auth/config changes or restore bootstrap
Secrets. CLI state migrations may require a compatible backup or reauthentication.
Helm history is limited to five revisions by the helper. Do not treat it as backup.

StatefulSet claim templates are not an in-place volume resizing interface. Before
changing storage size/class, check the actual storage provider and plan a supported
PVC expansion or migration. The helper does not automate it. Never delete claims
to resolve an upgrade error without first protecting their contents.

## Credentials: rotation and revocation

| Credential | Routine handling | Activation / limit |
| --- | --- | --- |
| Kubernetes observer projection | Kubelet manages rotation; do not copy to a PVC | MCP reads token and CA per request; no routine process restart required |
| MCP bearer | Replace the existing bearer Secret from a secure file | MCP and supervisor read at startup: recreate the Pod after updating |
| GitHub `GH_TOKEN` | Update using `OPS_GITHUB_TOKEN_FILE` during deploy or approved Secret tooling | Environment-based credentials require container/Pod recreation even if manifests did not change |
| Interactive GitHub login | Reauthenticate with `gh`; revoke old credential in GitHub when required | State persists in Codex home; `GH_TOKEN`, when set, takes precedence |
| Codex login | Use the real CLI logout/login and account-side revocation as appropriate | Restart the Pod to stop an already-running remote process; logout alone is not proof of revocation |
| Tailscale | Revoke the device/key using existing tailnet administration | Replacing an auth key is not device rotation when persistent state and `TS_AUTH_ONCE` reuse the login |
| Registry pull credential | Update the Secret through existing registry credential tooling | Existing running containers do not prove future image pulls will succeed |

For bearer rotation, create a new random value on the administration machine and
replace only the intended Secret. This example keeps the value out of command-line
arguments and printed output; it requires the default bearer Secret name:

```bash
umask 077
token_file=$(mktemp)
python3 -c 'import secrets; print(secrets.token_urlsafe(48))' > "$token_file"
"${k[@]}" create secret generic codex-ops-bearer --from-file="token=$token_file" --dry-run=client -o json | "${k[@]}" apply -f -
rm -f -- "$token_file"
"${k[@]}" delete pod "$pod"
```

Schedule the interruption, wait for replacement, then verify MCP and mobile
access. Updating the Secret without restarting both consumers can leave one or
both using the old in-memory bearer. The same controlled Pod recreation activates
changed environment-based GitHub credentials. A no-op Helm upgrade does not
necessarily recreate containers.

For suspected credential compromise, revoke affected account/device credentials
using a trusted administration path first. Stop access to the compromised Pod,
preserve relevant evidence, rebuild from reviewed images, and restore only trusted
workspace data. A restart does not remove malicious persistent configuration.
Reauthentication can be safer than restoring old account state.

## Backup and restore

Use the existing storage backup system. This chart creates no scheduled backups,
CSI snapshot configuration or restore automation. Set retention and recovery-point
objectives according to how much unpushed work can be lost; do not inherit an
unverified backup claim from another workload.

Protect these items:

- Workspace, especially uncommitted and unpushed work. A remote Git repository does
  not back up ignored files, local branches or pending edits.
- Codex home for continuity, treating it as credential-bearing data. Re-login is
  an alternative when restoring account state would be inappropriate.
- Optional Tailscale state only when intentionally restoring the same device
  identity. Never run two copies of the restored identity concurrently.
- Source revision, image digests, values, namespace/release names and PVC mapping.
  Record Secret names and recovery sources; avoid plaintext credential exports.

For a consistent backup, stop active work and use the storage provider's supported
quiesce/snapshot procedure. If needed, explicitly scale the StatefulSet to zero
while taking an offline backup and return it to one afterwards. That interrupts
mobile access; a later Helm deploy restores the chart's desired one replica.

Restore sequence:

1. Establish a working management path, cluster network and storage provider.
2. Keep the original Ops instance stopped before restoring its identity elsewhere.
3. Restore claims using the storage provider's procedure, preserving UID/GID 1000
   access and the intended claim names. The helper does not import volume backups.
4. Recreate required registry/bearer/optional account Secrets from trusted sources.
5. Deploy the recorded compatible image digests and values to the intended release.
6. Inspect mounts and startup; reauthenticate where needed. Run live verification,
   confirm Git/workspace integrity, and perform a mobile task.
7. Record the restore outcome and any lost work. A completed backup job alone is
   not restore proof.

## Incident repair procedure

1. Capture the actual failure: affected namespace/resource, symptoms, time and
   relevant logs. Distinguish pipeline, Argo, MCP, network and host failures.
2. Use permanent read-only MCP observations where available. For a pipeline run,
   preserve its journal, source revision and current attempt before any repair.
3. Prefer a reviewed Git change for desired-state configuration. If reconciliation
   is unavailable, use an explicit operator context for the necessary imperative
   change and bring Git back into agreement afterwards.
4. If repair must run inside Codex, deliberately supply a scoped short-lived
   kubeconfig/SSH identity for this incident. Do not broaden the observer role.
5. Check the affected service and normal Ops path after the change. Resume the
   pipeline only through its supported commands; do not edit its durable state to
   manufacture a successful result.
6. Remove temporary credentials and revoke their authority, record what changed,
   and identify whether a durable source fix is still outstanding.

For Kubernetes credential transfer, prefer the existing management context unless
there is a concrete reason to execute inside the Pod. A temporary kubeconfig may
reference certificate files or exec-auth plugins unavailable inside the image;
prepare it for its actual execution environment. `/tmp` is ephemeral storage, not
secure erasure and not an automatic revocation mechanism. A malicious process
could copy a credential while it is present; expiry and server-side revocation
are the actual end of authority.

The existing [worker trust runbook](../operations/worker-trust-runbook.md) and
[pipeline recovery guide](../site/use/recovery.md) describe their own recovery
contracts. The Ops Pod gives an operator a workspace to use those procedures;
it does not replace their state machines or validate a pipeline run by itself.

## Decommissioning

Finish active work, preserve required data and revoke Codex/GitHub/Tailscale
identities as appropriate. Uninstall the exact release:

```bash
helm uninstall "$OPS_RELEASE" --kube-context "$KUBE_CONTEXT" --namespace "$OPS_NAMESPACE"
"${k[@]}" get pvc
"${k[@]}" get secrets
```

The Secret listing shows metadata, not values. Review retained claims and Secrets
before deleting any of them. Do not delete an entire namespace as a shortcut if
it contains unrelated resources. Verify that Helm removed its roles/bindings,
including bindings in observed namespaces. Do not revoke a shared registry
credential at its source while other workloads still depend on it.
