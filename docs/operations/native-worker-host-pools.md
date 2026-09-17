# Native worker host pools

For the selected production sizing, rollout state and future installer stages,
see the [AX41 rollout runbook](ax41-rollout.md).

D16 selects fixed host-managed role pools for Buster and Prism. Generic Core
owns process/resource accounting; Buster owns fixture policy. A host pool is
outside the supervisor Pod's resource hierarchy. Its capacity must therefore
be withheld separately from ordinary Kubernetes Pod allocation.

This document describes the implemented pool preparation and verification
contract. Prism now has an explicit native V3 startup/chart/runtime selection.
Buster's complete fixture/host integration is still being completed. Creating pools alone does
not activate native workers or close the original four findings.

## Tool-independent resource contract

Operator requirement confirmed 2026-09-17: role pools limit aggregate CPU,
memory and Linux tasks, not executable names, browser vendors or versions.
Changing a browser within an existing task adapter must not require changing
host pool policy, reinstalling NRI or creating a vendor-specific host service.
The Buster `browser` child is a delegation boundary for task execution, not a
Chromium allocation. Per-run descendants inherit the enclosing role ceiling;
they must not grant each browser an additional copy of the role's budget.

Keep executable installation, supported engines and invocation rules in the
image/task adapter configuration. Existing visual/axe adapters name Chromium,
Firefox and WebKit; Lighthouse has a Chrome-specific executable interface.
The resource layer does not remove those tool compatibility requirements or
promise support for arbitrary browsers without an adapter. New tools must keep
the same accounting, sandbox, descendant cleanup and admission requirements.

The current Playwright path creates per-run groups under the browser delegation.
This does not demonstrate that all browser capabilities or all Buster tasks use
the host pool. Before claiming general production coverage, exercise the actual
adapter paths, process-tree accounting and cleanup. Browser replacement tests
must keep the host policy unchanged and demonstrate that aggregate limits still
hold. Do not loosen executable, filesystem or network permissions merely to
make the resource pool generic.

## One source for this host policy

Edit `my-values/infra/native-worker-pools.yaml` (or its private selected copy).
The node name and exact containerd runtime version deliberately start unset:
no production host, installed runtime or available capacity is inferred. Set
`runtime.containerdVersion` to the exact containerd/NRI-reported version, including
its K3s build suffix. The selected profile requires containerd 2.2+ with NRI
namespace adjustment support. The two role namespaces are explicit policy fields;
only trusted deployment authors may create Pods in those namespaces. The initial requested role ceilings are:

| Pool | CPU bandwidth ceiling | Memory ceiling | Linux tasks | Concurrent scopes |
| --- | --- | --- | --- | --- |
| Buster | 4 CPUs | 32 GiB | 8,192 | 4 |
| Prism | 4 CPUs | 16 GiB | 4,096 | 2 |

These are proposed capacity settings, not measured calibration. Task counts
include threads. The host additionally reserves 1 CPU/4 GiB/2,048 tasks for
non-worker system services and 1 CPU/2 GiB/2,048 tasks for Kubernetes daemons.
Other ordinary Pods, including Paperless, need their own remaining allocatable
capacity. For example, these defaults withhold 10 CPUs and 54 GiB; they must
be reduced or placed on suitable capacity if the actual host cannot provide
that allocation. Do not reduce individual limits simply to force admission.

The CPU pool ceiling is bandwidth (`cpu.max`); an attempt's CPU-time budget is
cumulative work. They are different units and are never converted implicitly.
Memory/tasks are reserved in full before asynchronous ownership allocation.
Pending launches count. A failed admission consumes no owner identity; a
journal-accepted attempt is sealed as an explicit never-launched failure.
Release happens only after durable quiescence and scope disposal. An unresolved
cleanup fences the supervisor instead of making its capacity reusable.

## Generate and review host preparation

```sh
bash scripts/deploy.sh native-node-render "$NEW_OUTPUT_DIRECTORY" "$SELECTED_POLICY_YAML"
```

The output directory must not exist. The generated files are derived artifacts;
do not edit them as an additional policy authority. They contain separate
Buster/Prism policies, exact shared policy digest, selected setup runtime,
systemd service, standalone setup program and a **kubelet configuration
fragment**. The repository-wide `swarm.config.json` consolidation remains the
separate approved roadmap item; version selection remains in `versions.json`.

The generated service requires systemd 254 or newer (`DelegateSubgroup=setup`).
The exact Node version is derived from `versions.json`'s `NODE_BASE`; the setup
program rejects a different runtime before changing anything. This does not
install a runtime or upgrade the host. The local test uses systemd 255's actual
unit parser; it does not start that service.

In a separately planned maintenance window, an operator must:

1. Preserve the effective K3s/kubelet configuration and independent recovery
   access. Review and merge the generated reservation fragment into the actual
   supported configuration path. Preserve larger existing reservations, storage
   and eviction policy, networking, credentials and unrelated flags. Do not
   replace the complete kubelet configuration with the fragment. Allow ordinary
   workloads enough remaining capacity; do not assume changing a reservation
   automatically makes existing overcommitted workloads safe.
2. Install the selected Node runtime and root-owned generated files:
   `/etc/kubeclaw/native-node-policy.json`, `buster-pool.json`, `prism-pool.json`,
   `/opt/kubeclaw/native/prepare-native-worker-pools.mjs` and the generated
   `kubeclaw-native-pools.service` under the host's systemd unit directory.
   Policy files must not be group/world-writable. Prepare private root-owned
   `/var/lib/kubeclaw/native/buster` and `/var/lib/kubeclaw/native/prism` directories.
3. Review the actual merged configuration and perform the planned K3s transition.
   The service uses a dedicated delegated subtree under `kubeclaw.slice` and
   places setup in its own child. It changes only its two designated role
   subtrees. Existing changed limits or unknown children stop preparation;
   preparation does not adopt/reconfigure running pools or remove old scopes.
   The persistent node identity is bound to the actual `/etc/machine-id`. Setup
   also writes root-owned `native-runtime-identity.json`, binding the host cgroup
   namespace inode/device to this boot. A new boot replaces that runtime identity;
   conflicting evidence within the same boot stops setup.
4. Start the reviewed host service and perform the read-only check below before
   allowing native worker activation. Service stop/restart kills its complete
   subtree: drain/fence both roles first and retain their final observations.
   Never use restarting this service as ordinary worker supervisor recovery.

No host installation, service start, kubelet edit or deployment has been executed
as part of this local implementation.

## Verify actual capacity on the selected host

Run from the matching repository environment on the actual host with read-only
access to the Node and kubelet configz API:

```sh
bash scripts/deploy.sh native-node-preflight "$SELECTED_POLICY_YAML"
```

The checker reads the real Node, actual kubelet configz and real cgroup-v2 files.
It binds Node name, UID, machine ID and boot ID. Effective system/kube reservations
must withhold at least the requested pool and daemon capacity. The Node's actual
CPU/memory Allocatable must reflect that withholding. A label, annotation,
prepared file or successful render cannot satisfy these checks.

Linux-task reservation additionally requires the generated `pid` reservations
and a finite aggregate `kubepods.slice/pids.max`, below the smaller of actual
kernel `pid_max`/`threads-max` after the required host reservation. Per-Pod
limits and periodic PID-pressure eviction alone are insufficient. This initial
implementation supports the normal systemd kubelet root layout; a custom
`cgroupRoot` is explicitly refused. If kernel task limits are lower than the
kubelet's effective aggregate ceiling, correct the actual configuration in
maintenance; the checker does not raise sysctls or hide the mismatch.

Installed role policies must exactly match the selected source policy. Each
real role root must be empty at its top, delegated, and have the exact requested
memory/swap/task/CPU ceilings. Node/configz/host identity changes during checking
invalidate the check. The result describes that current snapshot, not a durable
permission to change kubelet settings later. Reservation or hierarchy changes
require fencing workers, maintenance and a new check. Runtime workers recheck
the actual role limits before allocations and readiness.

## Runtime and Prism activation

The supervisor Pod still has ordinary requests/limits for its own overhead.
containerd adds a private cgroup namespace to non-privileged cgroup-v2 containers;
a base OCI runtime spec or a hostPath mount alone is insufficient. The versioned
`tools/native-worker-nri` plugin uses the supported NRI adjustment after CRI spec
construction. It removes **only** the selected supervisor's cgroup namespace.
The supervisor inherits the host cgroup namespace, while PID/network/mount
namespaces, OCI resources and other containers remain unchanged.

The plugin uses NRI v0.10.0 and its upstream-required runtime-tools replacement,
both pinned with Go module checksums. Build the original static executable with
the `versions.json` Go version available on PATH:

```sh
node scripts/build-native-worker-nri.mjs "$NEW_BINARY_PATH"
"$NEW_BINARY_PATH" --check-policy "$GENERATED_BUNDLE/native-nri.json"
```

During reviewed host maintenance, install the root-owned executable as
`/opt/nri/plugins/10-kubeclaw-native` and the generated root-owned policy as
`/etc/kubeclaw/native-nri.json`. Merge `containerd-nri.toml` into the actual
supported containerd/K3s configuration template; it is a fragment, not a full
replacement. Preserve existing validators and restrictions. If an existing
validator rejects namespace adjustments, activation must remain blocked until a
reviewed compatible policy is provided; do not globally disable that validator.
No plugin, service, containerd configuration or binary has been installed here.

Selection binds exact trusted Kubernetes namespace, role, container name and
policy digest, plus the runtime-supplied Pod UID/sandbox/container relationship.
Other containers, including the trust proxy, receive no adjustment. NRI does
not expose an authenticated service-account/image identity in this API, so the
annotation is **not** a substitute for namespace RBAC. Untrusted fixture authors
must not be able to create supervisor Pods in either selected namespace. The
plugin accepts only the exact configured containerd version and refuses a
second NRI-supplied configuration authority.

Use the generated `prism-native-values.yaml` as the selected private Prism
overlay. It switches Control's envelope producer and the worker command together;
a native request is never retried through the legacy executor. Both bind the
engine profile to the selected immutable worker image digest. Historical V1
results remain readable. The native worker requires one replica with Recreate,
scheduler affinity to the selected Node, its own writable role/ownership paths,
and read-only root-managed identity/policy files. Its supervisor runs as root
with only SETUID, SETGID and KILL; the non-setuid launcher attaches before exec,
drops to UID/GID 1000, clears supplementary groups and enables no-new-privileges.
No privileged Pod, host PID/network namespace or complete writable host cgroup
mount is introduced. The proxy stays unprivileged.

Before HTTP admission the native process checks real namespace/boot identity,
required effective capabilities, trusted launcher, exact role limits and durable
ownership/journal recovery. A missing NRI plugin or a wrong namespace prevents
startup. Failed capacity/ownership readiness also fails bootstrap readiness.
The `prism` deploy command checks the actual rendered producer/worker policy and
runs the real node preflight **before** applying a native deployment. Run that
native deployment command on the selected host; set `NATIVE_WORKER_NODE_POLICY_FILE`
when using a private source policy. Render-only remains render-only. Manual Helm
execution still requires the same host preflight; a chart render cannot certify
host state. Native activation is opt-in during this migration and is not claimed
to be deployed. Buster's equivalent startup/chart/fixture wiring remains open.

## Local and final live gates

```sh
npm run verify:worker-core:node-pools
npm run verify:worker-core:native-runtime
```

The filesystem authority tests require a root-owned test environment; they do
not weaken the production owner check for an unprivileged runner. The suite
uses actual source modules, concurrent reservations, durable files, kernel
flock and child-process death, the real deployment CLI and systemd unit parser.
Capacity protocol vectors test the checker algorithm; they are not a fake
Kubernetes API or a claim of live Node verification.

The native live gate now also requires `KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE`,
a JSON file containing the prepared pool's `memoryBytes`, `tasks`,
`cpuQuotaMicroseconds` and `cpuPeriodMicroseconds`. It must refer to a dedicated
test pool with matching actual ceilings, alongside the existing delegated-root,
trusted-node-identity and production-launcher variables. It fills a real pool
reservation, rejects excess admission before persisting an owner, drains it,
and verifies that capacity can be reused. It also retains the original real
whole-process accounting/launcher/recovery cases. No missing-kernel mock or
successful skip exists.

Final live acceptance additionally covers the selected production runtime,
aggregate enforcement under load, supervisor replacement, retained fixtures,
Node reservation drift, and capacity for other host services. The current local
cgroup filesystem is read-only; these positive kernel/cluster gates are prepared,
not recorded as passed. No new finding is closed by this intermediate change.

## References

Kubernetes documents [Node Allocatable and daemon reservations](https://kubernetes.io/docs/tasks/administer-cluster/reserve-compute-resources/)
and [PID limits and reservations](https://kubernetes.io/docs/concepts/policy/pid-limiting/).
The Linux kernel specifies [cgroup delegation and non-migrating memory charges](https://docs.kernel.org/admin-guide/cgroup-v2.html).
Systemd documents [delegation ownership](https://systemd.io/CGROUP_DELEGATION/)
and introduced DelegateSubgroup in [systemd 254](https://lists.freedesktop.org/archives/systemd-devel/2023-July/049310.html).

The runtime integration was checked against containerd's
[2.2 CRI spec construction](https://github.com/containerd/containerd/blob/v2.2.0/internal/cri/server/container_create.go),
[NRI configuration defaults](https://github.com/containerd/containerd/blob/v2.2.0/internal/nri/config.go),
and NRI's pinned [namespace adjustment implementation](https://github.com/containerd/nri/blob/a2eea2bc19ada59eafdb1237a4720ef8ab11e5b1/pkg/api/adjustment.go).
