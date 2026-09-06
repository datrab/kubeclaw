# Persistent Codex Ops Pod

Status: implementation; live deployment and mobile pairing still require verification.
Audience: operator

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

Default CPU/memory requests total 125m/320Mi; limits total 2.5 CPU/3456Mi without
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
