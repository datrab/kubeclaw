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
