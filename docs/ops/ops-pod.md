# Persistent Codex Ops Pod

Status: implementation; live deployment and mobile pairing still require verification.
Audience: Kubernetes operator, incident responder, platform maintainer
Owner: platform operations
Evidence: `scripts/deploy-ops-pod.sh`; `ops/pod/verify.py`; `charts/ops-pod/`
Applies to: the persistent Codex Ops Pod
Last verified: local source, transport and Helm checks on 2026-10-21; live acceptance pending

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

For the read-only equivalent of the resource sections in `kubectl describe node ax41-production`,
call `platform_cluster_state` with `{"resource":"nodes","node":"ax41-production"}`.
It returns `capacity`, `allocatable`, `nonTerminatedPods` and `allocatedResources`
(requests/limits and integer percentages of allocatable). CPU quantities are cores
or millicores (`m`); memory/storage totals are decimal bytes. These are reservations
and limits, not measured usage or a namespace quota. Accounting follows Kubernetes
1.36 container resize status, pod-level resource budgets, init-container peaks,
restartable sidecars and overhead. Pod-level resize status and DRA claim accounting
are not enabled, matching the default Kubernetes resource-helper options.
This mode requires `readAllNamespaces: true` as well as the existing tool grant.
It uses only node/pod GET and LIST access already granted to the central observer;
no exec, credentials, annotations or full pod specifications are returned.
Pod reads use a node/phase field selector and scan at most 20 pages of 100 pods
within the shared list deadline. If incomplete, `partial` is true and both total
pod count and allocated resources are withheld. Without `node`, the existing
paginated node-health listing is unchanged. Deploy the updated MCP image before
using the new input; updating source alone does not update a running connector.

A StatefulSet runs the official Codex CLI. A separate Deployment runs the central
Ops MCP, shared by Codex, Nova and Buster through per-client policy. Argo owns the Helm release, but the `codex-ops` child Application has
no automated sync so an image promotion cannot restart an active workspace. There
is no additional VM. An optional unprivileged Tailscale sidecar provides outbound
access to the existing tailnet.

This is an in-cluster operations workspace. A broken agent, pipeline or Argo does
not inherently take it down. A failed node, container runtime, Kubernetes network,
DNS or storage can. Two replicas would share these dependencies and cannot safely
share one Codex identity/workspace. Use the existing management/KVM path when the
Pod itself is unreachable; this design does not replace that path.

## Components and boundaries

| Component | Persistent state | Normal access |
| --- | --- | --- |
| Codex CLI 0.162.0 | Home/auth/config (2 GiB), workspace (20 GiB) | Central MCP; GitHub using your separately authenticated identity |
| Ops MCP | None | Namespace/tool-scoped Kubernetes observations and explicitly granted pod exec |
| Optional Tailscale | Separate 1 GiB PVC | Outbound SOCKS5 on localhost:1055, subject to tailnet grants |

Default steady-state CPU/memory requests total 135m/352Mi; limits total 2.7 CPU/3712Mi without
Tailscale. These are initial scheduling budgets, not measured consumption. Local
builds may need larger limits. Storage uses the cluster's default StorageClass
unless overridden. With local-path storage, PVCs remain dependent on their node.

Codex and MCP run as UID 1000, with read-only root filesystems, no added
Linux capabilities, no privilege escalation, and no host mounts or runtime socket.
MCP and its separate platform provisioner/reconciler identities use short-lived Kubernetes tokens. Codex and Nova
receive distinct MCP bearers and no API credentials or bindings. MCP is reachable
through an internal TLS Service. NetworkPolicy permits only configured clients.
The headless Codex Service remains its StatefulSet identity.

The Codex configuration uses `danger-full-access` **inside this restricted
container**, with `on-request` approvals. The container is the execution boundary;
there is no additional nested Codex OS sandbox. GitHub credentials and the
persistent workspace are therefore accessible to processes launched by Codex.
Choose repository-scoped GitHub credentials and review requested changes.

Codex permits DNS, MCP access and public HTTPS; it has no Kubernetes API egress
rule. The separate MCP permits API/DNS/Hubble access. Nova's own API egress is
removed. Public HTTPS is not an OpenAI/GitHub hostname allowlist.

## Build and deploy once

The `Build Ops Images` workflow validates both images on pull requests and
publishes on main or manual dispatch. Use its immutable digests for
`kubeclaw-codex-ops` and `kubeclaw-ops-mcp`. The Codex image wraps the pinned official
npm package, plus Git, GitHub CLI, kubectl and Helm. It does not assume that OpenAI
publishes a ready-made mobile remote-host container.

The Ops promotion workflow selects the immutable image digests and regenerates
`gitops/platform/bootstrap/codex-ops.yaml`. Merging that selection updates Argo's
desired revision, but does not deploy it. Review the `codex-ops` child diff in Argo
and manually sync it without Prune or Force when the workspace is idle. Then run:

```bash
export KUBE_CONTEXT='<your-existing-context>'
./scripts/deploy-ops-pod.sh verify
```

The direct `deploy` helper remains a bootstrap/recovery path before Argo adoption;
do not use it for routine upgrades of an Argo-owned release. The helper discovers
actual API endpoints and existing observer namespaces, validates the Helm render,
creates `kubeclaw-ops` and copies the existing
`kubeclaw/ghcr-secret` if needed. It does not print credentials. Initial `NotReady`
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

## Central MCP migration

This source change does not itself alter the running cluster. Existing release
receipts and generated values still select their recorded source commits/images.
Publish and promote matching Ops/runtime releases before regenerating their values;
do not hand-edit old receipts to claim that old images contain the new server.
The deployment path is GitHub image promotion followed by an Argo sync. Agent Pods
never need an administrative kubeconfig for it. `codex-ops` remains manually synced
so the operator can choose an idle Codex session; the sync itself runs in Argo.

1. Finish active Nova/Buster runs and record the selected revisions. Existing Nova
   leases become unauthorized after its broker grant is removed. The controller
   rejects those provisioned leases and deletes their owned test namespaces,
   revoking the contained RoleBindings. Drain runs before this transition.
2. Merge the implementation after CI succeeds. Publish and promote the matching
   Ops images through the existing `Build Ops Images` / `Promote image release`
   workflows. Promotion updates the exact chart revision and immutable images.
   The generated Ops Application also carries exact credential-data diff rules.
3. Perform a **full** Argo sync of the `codex-ops` Application (not an individual Pod) while the workspace is idle. Wave -3
   creates deterministic empty named Secrets/ConfigMaps, the provisioner identity,
   named get/patch permissions and network access. The Sync hook in wave -1 fills
   missing client tokens, the retained private CA, the service certificate and
   public trust. Only after the hook succeeds do the wave-0 workloads start. These include a
   separate MCP Deployment/Pod and the namespace-access reconciler; the MCP does
   not run as a Codex sidecar.
   Selective resource sync skips hooks and is not a supported initial cutover.
4. Verify MCP readiness and Codex MCP access. Then promote/sync the runtime release
   for Nova and Buster. Explicit empty rules/subjects retire Nova's former grants
   even with `prune: false`; no manual RoleBinding deletion is needed.
   Keep Ops and runtime promotion in this order so Nova's new mounts already exist.
5. Confirm that both agent identities have no direct workload, Secret, exec or
   namespace authority, including any separately managed group bindings. Check
   absence of API-token mounts in Codex/Nova and allowed/denied MCP operations.
   Run the Buster lease test. Local rendering and transport fixtures do not prove
   live cluster authorization or a completed cutover.

The chart creates no random credential bytes during rendering and commits no
credential material. Its provisioner can only `get` and `patch` the predeclared
Secret/ConfigMap names in the configured client namespaces: no `create`, `list`,
workload exec or cluster-wide Secret grant. It uses optimistic resource-version
checks. Existing valid client tokens are preserved; differing copies or reused
client credentials fail the hook instead of silently rotating identities.

Argo owns the credential objects; the provisioner owns their `/data`. The generated
Application sets `RespectIgnoreDifferences=true` with exact kind/namespace/name
rules for that field only. RBAC, policies, images, object metadata and all unrelated
Secrets remain diffed normally. Credential objects are retained on prune/removal
so a reconciliation cannot discard the CA or unexpectedly reset a client token.
Removing a client from policy revokes access even while its old Secret is retained.
These rules follow Argo's [sync phases and waves](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/)
and [sync options](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/).

The daily CronJob runs the same idempotent provisioner. It renews the 90-day leaf
certificate when fewer than 30 days remain, under the retained private service CA.
The CA signing key stays in `kubeclaw-ops`, is not mounted into the MCP, and is never
copied to clients. The MCP reloads a valid Secret key/certificate pair without
restarting; a half-observed rotation retains the last valid context. Clients keep
trusting the same CA. Back up the retained CA Secret; a lost CA with an existing
leaf fails closed. Plan a reviewed CA rollover before the ten-year CA expires.

Set `mcp.provision.enabled=false` only when an external credential/PKI controller
owns these objects. That also disables the Job/CronJob and generated data-diff
exceptions. Custom names/namespaces must align between clients and chart values.
Existing image-pull/GitHub/Tailscale credentials remain separate from this MCP
provisioning path and are not copied into Git.

`mcp.clients` is the central configuration point. Each entry has `id`, a server-side
`tokenSecret`, client namespace/Pod selector, `namespaces`, `namespacePrefixes`,
exact `tools` and explicit `exec` grants. `rbac.namespaces`, `execNamespaces` and
`namespacePrefixes` cap scoped access; `rbac.readAllNamespaces` explicitly enables global observation. Buster receives only `test*` reads and exec;
Nova receives all regular-container exec targets in exactly `kubeclaw` and `test*`,
plus namespace-scoped Hubble flows and resource inventory; Ops can read every namespace. Matching ignores
case and covers `test`, `testing`, `test-123` and future matching namespaces.
Only the Ops/Codex client has `readAllNamespaces: true` and the `platform_cluster_state(resource=namespaces)`
operation. Its reads include current and future namespaces. The production override has an explicit
`allNonSystemNamespaces` exec grant permitting all regular containers outside
reserved `kube-*` namespaces, with 30-second and 65536-byte ceilings.
Pods with system priority classes or numeric priority at least 2000000000
are excluded even in other namespaces. `rbac.execAllNonSystemNamespaces: true`
is the backend upper bound; disabling it also requires removing the broad client
grant. The selected Ops release `7a0f35a20f5619d671109960abace162af7a4754`
already supports this grant. Production sets `readOnly: false`, includes
`exec_pod` in Codex's tool list, and sets `rbac.execAllNonSystemNamespaces: true`
in `gitops/platform/values/codex-ops.yaml` with this Codex grant:

```yaml
exec:
  - allNonSystemNamespaces: true
    allPods: true
    allContainers: true
    timeoutSeconds: 30
    maxOutputBytes: 65536
```

Regenerate the Argo application with `node scripts/argocd-self-management.mjs`,
then sync `codex-ops` through the operator deployment path. The child Application
requires a manual sync; merging configuration alone does not activate exec.
Nova and Buster do not inherit this global read permission. The observer
role excludes Secrets and all mutation/exec rights. Disabling global observation
reconciles its named ClusterRoleBinding to empty subjects without relying on prune.
The dedicated reconciler grants only the MCP workload namespace exec access, normally within five seconds
of namespace creation. Its mandatory admission guard rejects reserved `kube-*`
namespaces and mismatched roles or subjects. No agent gets these RoleBindings. Buster retains only its
existing broker lease exception. Buster and Nova connect through OpenClaw's native
`mcp.servers.ops` connector. Each advertised operation appears as a typed agent
tool, such as `ops__get_pod`, `ops__get_pod_logs` and `ops__exec_pod`. Discovery
uses that agent's own identity; the central server supplies descriptions and
schemas and enforces every call. The existing `coding` tool profile includes
configured MCP servers. Session or agent tool denials still apply.
Prefix exec grants explicitly permit all Pods/regular containers in `test*`;
exact namespace grants can explicitly permit all Pods/regular containers with both
`allPods: true` and `allContainers: true`, or retain label/container restrictions.
The namespace-wide exact grant requires an MCP image built from the matching
authorization source. Publish and promote that image before syncing the updated
Nova policy; the previously selected image rejects this new grant format.

OpenClaw directly launches a small stdio-to-HTTPS transport adapter with Node;
an agent does not need its shell tool to discover or invoke these operations.
The adapter has no Kubernetes client or authorization policy. It reads the
agent's mounted bearer and CA files on each request, verifies HTTPS and never
retries a failed call. Tool errors retain MCP `isError` and content. Cancellation
closes the local request; it does not prove remote process termination. Tokens
are not embedded in config, command arguments or connector environment values.
The MCP credential mounts remain exclusive to the gateway container, including
for Buster; its worker retains only the existing lease-controller exception.

The managed `ops` connector is reconciled before startup Doctor and during setup,
including on persisted installations. Disabling `opsMcp.enabled` removes it on
the next rollout. Other connectors and local tool policies are preserved. Argo
deploys the chart changes through the selected immutable runtime bundle; no
manual client installation or chat-message-based permission grant is needed.
Already active sessions may need a new turn/session to discover the connector.

The shipped CLI remains available for diagnostics without Kubernetes credentials:

```bash
node /opt/ops-mcp-client/client.mjs list
node /opt/ops-mcp-client/client.mjs call get_pod '{"namespace":"kubeclaw","pod":"<pod-name>"}'
```

The Nova workspace TOOLS template prefers the native tools. Existing persisted
TOOLS.md files are retained when `workspace.override=false`; reconcile that one
section on an existing workspace without overwriting its other notes.

Exec has no stdin or TTY, max 120-second transport deadline, max 64-KiB output,
and at most four concurrent connections. Policy may set lower limits. A lost
connection, timeout or output overflow does not confirm remote process termination;
inspect effects before retrying. Audit JSON on MCP stderr records the client,
request, tool, target and command digest, not argument contents, output or tokens.
Send these records to the existing log collector for durable retention.

Rotate Nova tokens in both namespaces together and restart the Codex supervised
process after rotating its bearer (the server observes file rotation immediately).
Leaf renewal is automatic and does not restart MCP. A CA replacement is a
separate coordinated trust rollover for both clients.
Keep recovery administrative credentials outside all agent Pods.

## Login, pair and use

```bash
./scripts/deploy-ops-pod.sh login
./scripts/deploy-ops-pod.sh github-login  # omit when GH_TOKEN was supplied
./scripts/deploy-ops-pod.sh pair
./scripts/deploy-ops-pod.sh status
./scripts/deploy-ops-pod.sh verify
```

Device login writes into the persistent Codex home. The supervisor then launches
`codex app-server --remote-control --listen unix://` and waits for its local control socket.
A lost socket triggers child termination/restart. Shutdown terminates and reaps the
child. The standalone daemon installer and auto-updater are not needed.
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
GitHub changes use `gh` and Git in the workspace. The central policy determines which tools each client can call. `exec_pod` is
mutating and restricted by namespace, live Pod labels and exact container names.
`get_pod` includes resource limits; `get_pod_metrics` reads actual metrics-server samples.

`verify` calls the actual MCP and API and checks that listing Secrets with the
observer token gets **403**. Connectivity failures and authentication failures do
not pass this negative control. It also verifies that Codex has no mounted service
account token. Pairing and successful pipeline execution are separate live checks.

## Repairs and break-glass access

Normal path: diagnose with MCP, make a targeted Git change and submit a PR using
GitHub. If Argo is broken, apply the reviewed fix through your existing operator
context rather than waiting for Argo to repair itself.

Use an authorized MCP exec tool for a container-level repair. Do not inject a
kubeconfig into Codex or Nova. Changes outside the configured tools remain an
external operator action; extending a tool/grant is a reviewed central change.
Exec includes the target container's effective credentials, so grant targets narrowly.

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

Update `codex.version` in `versions.json`, run `npm run versions:sync`, then run
`npm ci && npm test` in `ops/pod` with Helm installed. The sync command updates
the generated package declaration, npm integrity lock, chart metadata and current
operator documentation. Let CI build and smoke-test the actual image.
The installed kubectl binary has no agent API credentials; keeping a binary in
the image does not grant cluster access. Operator-side tools must match the server
version requirements. Deploy new image digests with
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
rbac:
  execNamespaces: []
mcp:
  # Lists replace defaults: include every intended client explicitly.
  clients:
    - id: codex
      tokenSecret: codex-ops-bearer
      namespace: kubeclaw-ops
      podLabels: {app.kubernetes.io/name: codex-ops}
      namespaces: [platform]
      tools: [namespace_overview, get_pod, get_pod_logs, get_events, platform_cluster_state]
      exec: []
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
| Containers | `codex` and optional `tailscale` in the StatefulSet; `ops-mcp` in its own Deployment |
| Home PVC | `home-codex-ops-0`, mounted at `/home/node` |
| Workspace PVC | `workspace-codex-ops-0`, mounted at `/workspace` |
| Tailscale PVC | `codex-ops-tailscale`, mounted in Tailscale only |
| MCP ServiceAccount | `codex-ops-mcp` in `kubeclaw-ops`; `codex-ops` has no bindings |
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

Expected: claims bind, images pull, Codex and the separate MCP Pod are running. Codex can
be not-ready while waiting for login. Helm success proves that installation was
accepted, not that these conditions or mobile connectivity have passed.

### 2. Authenticate and verify the control path

Run the login, GitHub-login (if needed), pair and verify helper commands above.
The two verification stages must succeed: real central MCP/API reads, and a real
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

If the namespace-access pod fails readiness because `/tmp/ready` is missing,
inspect that pod's logs: the file is written only after a successful reconciliation.
`NAMESPACE_ACCESS_BINDING_COLLISION` means an existing binding did not pass the
ownership or grant checks. Helm-created reader bindings can coexist with dynamic
namespace reconciliation when their roleRef and sole MCP ServiceAccount subject
match exactly. The reconciler leaves these externally owned grants untouched;
it repairs subject drift only on bindings carrying its ownership label. Other
roles or subjects remain collisions. Do not delete reader bindings or add ownership
labels merely to silence readiness. The MCP's HTTP `/healthz` is a separate check;
it can be healthy while a new namespace-access replica is unready.

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

Check the separate MCP Deployment from the operator session:

```bash
"${k[@]}" get deployment "$OPS_RELEASE-mcp"
"${k[@]}" logs "deployment/$OPS_RELEASE-mcp" -c ops-mcp --tail=100
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
4. For container-level repairs, use centrally granted MCP exec. Keep API
   credentials out of Codex and Nova; other changes use the external operator path.
5. Check the affected service and normal Ops path after the change. Resume the
   pipeline only through its supported commands; do not edit its durable state to
   manufacture a successful result.
6. Remove temporary credentials and revoke their authority, record what changed,
   and identify whether a durable source fix is still outstanding.

Do not transfer Kubernetes credentials into an agent Pod. The external operator
retains recovery access when the MCP or cluster networking is unavailable.

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

## Read-only resource diagnostics

The chart default `codex` MCP principal has `readOnly: true`, an explicit
read-tool allowlist and `exec: []`. Production explicitly overrides this with
`readOnly: false`, `exec_pod`, and the workload-namespace grant described above.
The policy parser rejects exec tools or grants
for a read-only principal; tool authorization and exec authorization independently
reject them too. Helm rejects an exec-enabled read-only client before deployment.
Nova and Buster retain their separate grants. The shared MCP ServiceAccount still
has their exec rights: this is per-client enforcement by the trusted MCP, not an
OS sandbox against a compromised MCP server. Codex receives no Kubernetes token.

Additional reads:

- `platform_cluster_state` includes node allocatable resources, taints and the
  unschedulable flag, as well as capacity and health.
- `get_resource_inventory` returns paginated pod requests/limits, pod-level
  resources, init/sidecar requests and overhead; PVC/PV capacities; storage classes;
  and EndpointSlices. Follow every `nextContinueToken`. Storage source credentials,
  CSI attributes, provisioner parameters, environment variables and annotations
  are deliberately omitted. PV/PVC capacity does not establish actual free space.
- `get_monitoring_metrics` accepts a named query: `filesystems`, `memory`, `cpu`,
  `volumes`, `requests`, `network`, or `disk_io`. Filesystem results retain device,
  mountpoint and instance labels. `avail_bytes` is available to non-root users;
  do not sum duplicate mounts/scrape targets. CPU is busy fraction per core over
  five minutes. Missing series mean unavailable, not zero. PVC usage requires
  kubelet/CSI volume metrics and is not guaranteed for every storage driver.
- `get_monitoring_alerts` reads active Prometheus alerts; it cannot silence them.

Monitoring and cluster-wide storage inventory require `readAllNamespaces: true`
in addition to the named tool grant. Monitoring has a configured origin and fixed
GET-only API routes and queries, refuses redirects, and bounds responses to 2 MiB
and requests to ten seconds. History requires both UTC timestamps, spans at most
24 hours and at most 1000 steps, with a minimum step of 60 seconds. No caller can
supply PromQL, a backend URL, shell command or administration API path.

The production values enable `mcp.monitoring` for the existing internal Prometheus
service. The chart default is disabled. The chart adds MCP egress only to the
selected monitoring pods and port; it does not introduce an ingress policy that
could isolate existing Prometheus consumers. If destination ingress is restricted,
its owner must add the corresponding MCP allow rule. Keep Prometheus private.

Rollout order: build and verify the new MCP image through the Ops image workflow,
promote its immutable receipt (image digest and chart revision together), regenerate
the Argo manifests, inspect the diff, then synchronize `codex-ops` during an agreed
window. Never synchronize the expanded tool policy against the previous image:
its parser does not know the new tool names. The child Application intentionally
has no automated sync. Refresh the connected MCP application's tool catalog after
rollout. A source change or successful local test is not a live acceptance result.

Live acceptance using the production Codex credential must confirm that `tools/list`
contains `exec_pod` and a harmless command such as `id` succeeds in the intended
workload container. System namespaces and system-priority pods remain excluded.
Filesystem/memory queries must return current node
series; pod/PVC inventory and pagination work; and logs/events remain readable.
Check that Nova/Buster still receive only their original tool/namespace scopes.
Do not test write denial by sending a real Kubernetes mutation to production.
