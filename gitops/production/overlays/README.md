# AX41 rollout overlays

Status: partial configuration, not deployment approval. GitOps publication must
remain disabled until resource accounting and ownership adoption are complete.

- Nova: agreed main-container ceiling 4 CPU / 16 GiB; requests remain 1 CPU /
  12 GiB. Sidecars and init containers still contribute to Pod accounting.
- Prism: binds the native worker to ax41-production and the installed policy
  digest. The host pool limits native tasks to 2 CPU / 16 GiB. Those are not
  the budgets of Control, Studio, PostgreSQL, the agent or worker supervisor.
- Buster: the browser child is inside the 1.5 CPU / 8 GiB host pool. The NRI
  annotations select only buster-v2-runtime for the host cgroup namespace.
  The role pool remains host-owned; the entrypoint may delegate the browser
  child to its builder identity. The mount uses Directory, never DirectoryOrCreate.
  Gateway requests/limits are 250m/1Gi and 1 CPU/2Gi; runtime requests/limits are
  500m/2Gi and 1.5 CPU/8Gi. These Pod budgets are additional to the host pool;
  this is not an 8Gi total Buster ceiling. Init and proxy budgets are additional.
  Initial sizing is provisional until real workload measurements establish it.
  HTTP registry routing is explicit and retains the existing image authority.

`busterRuntimeResources` is interpreted by `scripts/deploy.sh` through
`buster-resource-overlay.mjs` as a resource-only Helm argument. It avoids copying
the selected image and environment list into the site overlay. Direct Helm calls
must include that helper's `--set-json` argument; simply adding the values file
does not apply the runtime resource override. The Argo exporter uses deploy.sh.

Prepare the host once before starting Buster, from the Controlnode:

```sh
ssh deploy@ax41 'sudo -n bash -s' <<'BASH'
set -euo pipefail
cd /root/kubeclaw-native-build.SyUV3D/repo
git pull --ff-only
bash scripts/prepare-ax41-buster-browser.sh
BASH
```

This requires stopped Buster replicas and a successful existing host preflight.
The live operation uses `--browser-only`: it verifies the running pool service,
its main process in the setup subgroup, host cgroup namespace and both existing
pool limits. It does not invoke full initialization from the administrator shell;
full initialization still requires membership in the delegated service subgroup.
It creates the browser child, backs up the installed pool preparation script,
and updates it for subsequent service starts without restarting K3s or the pool
service. It does not change pool limits. Linux host execution and browser jobs
still need live verification. The native fixture library is not wired by these
browser changes; do not claim every Buster task now executes in the host pool.

Before rollout, render every component and account for all existing Pods,
sidecars, init containers and rollout surge against Node Allocatable. Review
the Buster resource override mechanism without copying stale image digests into
an overlay. Keep PVC names/data and external Secret references intact. Argo
adoption must not use Helm uninstall as an ownership transfer.

The observed registry is HTTP. BuildKit/containerd HTTP configuration is already
supported, but the image scanner explicitly rejects `http-lab`. HTTP scanning
requires a separately tested implementation; never bypass the scan or change
the error to a passing result. Envoy/mTLS remains on the roadmap.

The initial AX41 manifests are exported under
`releases/gitops/ax41-initial-35208467907`. They are review inputs, not a live
Application selection; no automatic sync is enabled by adding that directory.
Generated bundle archive URLs must be parsed as YAML (including folded strings),
not extracted as single lines.

Before adoption, from the Controlnode run:

```sh
python3 scripts/check-runtime-adoption-live.py releases/gitops/ax41-initial-35208467907
```

This checks Secret objects and required key presence without printing their
contents, then asks the API to dry-run each manifest. It applies nothing and
continues across groups to collect failures. It does not validate available disk,
Pod scheduling, native execution or transfer of ownership. Existing Helm releases
must not be uninstalled. Buster adds a new 64Gi runtime-state PVC; Nova requires
`nova-archviewer-auth` with an `htpasswd` key in addition to existing credentials.
Resolve reported prerequisites before creating or syncing worker Applications.

The follow-up export `releases/gitops/ax41-adoption-35208467907-v2` addresses
the observed adoption failures: absent probe handlers are explicit nulls so old
TCP handlers do not survive a merge, and Argo lifecycle annotations are kept off
immutable StatefulSet claim templates. StatefulSets instead receive Argo deletion
protection and explicit PVC retention on deletion/scaling. Storage sizes and names
remain unchanged. Use this export for subsequent API dry-runs; neither export
directory is automatically selected for live sync.

Prepare missing Archviewer credentials with
`bash scripts/prepare-nova-archviewer-auth.sh` on the Controlnode (requires
`htpasswd`, supplied by `apache2-utils` on Debian/Ubuntu). This is create-only and
prompts locally; do not paste credentials into deployment logs or chat.

The archived exports above include a CiliumNetworkPolicy for Nova Archviewer.
The AX41 Nova overlay now selects `archviewer.networkPolicyProvider: kubernetes`
so a new export can use the current cluster without installing Cilium first.
The standard NetworkPolicy combines the Tailscale namespace and the dedicated
Ingress proxy labels in a single peer and permits TCP 3456 only. The ClusterIP
Service, Tailscale Ingress and existing HTTP-auth Secret remain required.
The chart default remains `cilium` for existing deployments; unknown providers
fail rendering. Do not edit archived exports: select a code release containing
the chart change, materialize it and render a new export before live adoption.

Before starting Nova, verify that the cluster actually enforces NetworkPolicy
and inspect all policies selecting the Nova Pod. Allow rules are additive;
another broad policy can allow access that this policy does not. Verify allowed
Tailscale access and denied ordinary Pod access to port 3456 after startup.
Rendering and API dry-run alone do not prove network isolation. A future Cilium
migration can also enforce the standard policy; it does not require changing
this provider simply because Cilium is installed.
