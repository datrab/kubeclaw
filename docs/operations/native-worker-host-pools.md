# Native worker host pools

D16 selects fixed host-managed role pools for Buster and Prism. Generic Core
owns process/resource accounting; Buster owns fixture policy. A host pool is
outside the supervisor Pod's resource hierarchy. Its capacity must therefore
be withheld separately from ordinary Kubernetes Pod allocation.

This document describes the implemented pool preparation and verification
contract. Production V3 startup/chart/runtime activation and Buster's complete
fixture/host integration are still being completed. Creating pools alone does
not activate native workers or close the original four findings.

## One source for this host policy

Edit `my-values/infra/native-worker-pools.yaml` (or its private selected copy).
The node name deliberately starts unset: no production host or available
capacity is inferred. The initial requested role ceilings are:

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
   The persistent node identity is bound to the actual `/etc/machine-id`.
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

The supervisor Pod still needs its own requests/limits for supervisor overhead.
A role-only writable cgroup mount and root-owned read-only policy do not prove
that the container runtime permits moving a pre-exec launcher into the host
pool. The production runtime/cgroup-namespace/UID/mount acceptance must be
completed explicitly. No entire-host cgroup mount or generic privileged fallback
is introduced by these files.

## Local and final live gates

```sh
npm run verify:worker-core:node-pools
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
