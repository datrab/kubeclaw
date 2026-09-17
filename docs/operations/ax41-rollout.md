# AX41 rollout and future installer contract

This runbook records the selected single-node configuration and the migration
sequence. It is not evidence that the native host setup has been activated.
Last reviewed: 2026-09-16.

## Configuration sources

### NRI launcher identity repair (2026-09-16)

The live reservation preflight passed after removing the legacy K3s command-line
reservation arguments. Containerd subsequently discovered `10-kubeclaw-native`,
but reported `failed to register plugin, connection closed`. The NRI SDK reads
the launcher-provided name and index from environment variables before applying
options; passing the same identity through options again causes stub creation
to fail. The plugin now retains and validates the launcher identity, supplying
defaults only when those variables are absent. A regression test exercises the
real SDK with launcher, standalone, partial and mismatched identities.

On AX41, with the pool service and reservations already active:

```bash
cd /root/kubeclaw-native-build.SyUV3D/repo
git pull --ff-only &&
bash scripts/repair-native-nri-launch.sh
```

This repair refuses an already-running plugin, checks capacity, backs up the
installed executable and runs the Go tests before replacing it. It restarts K3s
and checks readiness, reservations and the plugin process. Keep SSH access open.
Inspect the displayed containerd registration/configuration messages; process
presence alone does not prove successful adjustment of a real worker container.
The original executable is retained in the printed repair directory. Containerd
logs are at `/var/lib/rancher/k3s/agent/containerd/containerd.log`.

The next live attempt registered successfully but failed runtime validation:
containerd reported `v2.3.4-k3s1.36`, while the selected policy contained
`2.3.4-k3s1.36`. The comparison now removes a single optional leading `v` on
each side, retaining exact patch and K3s build matching. Regression cases cover
both spellings and reject changed versions, suffixes and malformed prefixes.
Run the same repair command after pulling this fix; it runs the Go tests before
replacement and restarts K3s. Do not edit the installed policies to work around
the version spelling, because they are generated from the selected node profile.

- `my-values/infra/native-worker-pools-ax41.yaml`: native pool limits, host
  identity, exact containerd version, daemon reservations and safety buffer.
- `my-values/nova-values.yaml`: Nova container requests and limits.
- `versions.json`: selected build tool versions; do not install unpinned latest
  Node or Go as part of host preparation.
- `gitops/platform/bootstrap` and `gitops/platform/values`: platform Application
  definitions and values. Infrastructure and Codex Ops remain manually synced.
- `gitops/production/config.json`: runtime GitOps configuration. Runtime release
  selection, host binding and deployment preflight are separate required steps.

Generated host files are derived from the YAML profile, not another editable
source of truth. Never commit credentials, kubeconfigs, host backups, pairing
codes or generated machine/boot identity files.

## Selected resource plan

| Scope | CPU ceiling/budget | RAM ceiling/budget |
| --- | ---: | ---: |
| Nova main container | 4 | 16 GiB |
| Buster native worker pool | 1.5 | 8 GiB |
| Prism native worker pool | 2 | 16 GiB |
| Existing host/Kubernetes daemon budget | 1 | 1.5 GiB |
| Additional host safety buffer | 0.5 | 2 GiB |
| Remaining planning budget for other containers | 3 | approximately 19 GiB |

The last row is arithmetic headroom on the observed 12-CPU, approximately
62.7-GiB host, not an enforced namespace quota or a capacity guarantee. It
includes all agent sidecars/supervisors, pipeline services and databases,
monitoring, Argo, Tailscale, Ops, future Cilium, websites and HomeOS. Paperless
belongs to the future HomeOS budget; do not count it again as an extra system.
Nova's main-container request remains 1 CPU / 12 GiB; its limit is not a
reservation of four CPUs. Whole-Pod requests include additional containers.

The native pools are outside Kubernetes Pod accounting. Together with daemon
reservations and the extra buffer, the profile withholds 5 CPUs / 27.5 GiB from
Pod allocation. The resulting Pod budget is approximately 7 CPUs / 35 GiB,
including Nova. The buffer is folded into `systemReserve`; it is not a separate
cgroup guaranteed to remain physically idle. Both native pools currently admit
one active scope per role. Pool limits are not measured workload requirements.
Native pool swap is disabled; the host's swap must not be added to RAM capacity.

## Last observed state

- K3s was upgraded to `v1.36.4+k3s1`, with containerd `2.3.4-k3s1.36`.
- Flannel remains the active CNI. Cilium has not been deployed.
- Node and Go were installed and the native NRI executable was built on the
  host. An earlier generated policy passed `--check-policy`.
- Updated resource settings are committed. Activation of the final profile,
  pool service, NRI plugin and new Nova limit has not been confirmed.
- The latest Pod inventory requested 8.478 CPUs / 41389 MiB before migration.
  Old Buster and Nova Pods accounted for 3.05 CPUs / 20544 MiB and
  1.1 CPUs / 12416 MiB respectively. Re-read live state before using these figures.
- Buster's full native startup/chart/fixture integration remains unfinished,
  as documented in [the host pool contract](native-worker-host-pools.md).
  Preparing the host does not establish agent readiness.

## Repeatable preparation

Run from the repository on the selected host after fetching the intended main
revision and installing its pinned Node/Go dependencies. Existing scripts resolve
the repository themselves; no temporary checkout name is required.

```bash
set -euo pipefail
umask 077

npm ci --ignore-scripts --no-audit --no-fund
bundle="$(mktemp -d /root/kubeclaw-native-rollout.XXXXXX)"
git rev-parse HEAD > "$bundle/source-commit.txt"

node scripts/render-native-worker-node.mjs \
  my-values/infra/native-worker-pools-ax41.yaml "$bundle/generated"
node scripts/build-native-worker-nri.mjs "$bundle/10-kubeclaw-native"
"$bundle/10-kubeclaw-native" --check-policy "$bundle/generated/native-nri.json"

cat "$bundle/generated/kubelet-reservations.json"
printf '\nPrepared bundle: %s\n' "$bundle"
```

This produces a fresh private bundle and validates its policy. It does not
install host files, restart K3s, scale workloads or apply Kubernetes resources.
Do not reuse a previously rendered bundle after changing the selected profile.

### Initial host-file installation stage

After preparing a fresh reviewed bundle, run on AX41 as root:

```bash
bash scripts/install-native-worker-pools-stage.sh "$bundle"
```

This initial-install helper refuses existing destination files and an active
pool service. It installs the generated policies, NRI binary and pool setup
program, pins the service executable to the verified `/usr/local/bin/node`,
and starts the pools for the current boot. It does not enable the service for
boot, edit kubelet/containerd configuration, restart K3s or deploy workers.
Inspect its printed limits and complete the activation stages below before
enabling any native worker. On failure, retain the bundle and installed files
for diagnosis; do not remove policy files or restart a running pool blindly.
Installing the binary puts it on the NRI discovery path, so coordinate any
subsequent containerd/K3s restart with the remaining activation steps.

The helper has a shell syntax check locally; actual systemd/cgroup behavior
must be verified on the production host. It is not yet a tested one-click
installer with rollback or interrupted-install recovery.

#### Pool lifetime correction

On AX41 the initial oneshot service exited successfully, then systemd removed
its empty delegated cgroup. `active (exited)` with an empty ControlGroup is not
a prepared pool. The corrected service uses Type=notify: after verifying both
pools, the Node setup process signals readiness via systemd-notify and remains
in the delegated setup subgroup. NotifyAccess=all permits that notification
helper; the service is root-owned. It has no automatic restart policy because
restarting it would kill the complete worker subtree.

For this exact initial failure, with no workers running and no service cgroup:

```bash
bash scripts/repair-native-worker-pools-lifetime.sh
```

The repair refuses a populated/running service, checks generated policies
against installed copies, backs up the old setup and unit, and replaces only
those two files. It starts the corrected service and requires `running`, the
expected ControlGroup and readable pool limits. It does not restart K3s or
enable native workloads. If it fails, retain the printed backup and inspect the
service journal; do not rerun the initial installation or delete policies.

## Migration and activation stages

For the inspected AX41 state (only the K3s default kubelet drop-in, no containerd
template, old Buster/Nova scaled to zero, native pools running), the initial
activation helper implements the reservation/template transition:

```bash
bash scripts/activate-native-worker-ax41.sh
```

This **restarts K3s**. Keep host SSH access open. It refuses existing target
files, unexpected config authorities, runtime/policy differences and current
Pod memory usage above the new allocation. It merges reservations from configz,
preserving larger existing values and other reservation keys, and leaves the
default kubelet file intact. An etcd snapshot and private config backup precede
the writes. A K3s service dependency starts the pool service first on boot.
The containerd template extends the K3s `base` template with the generated NRI
fragment; no CNI setting is changed. Kubelet enforces aggregate Pod PIDs from
the configured PID reservations, rather than an independent systemd override.

After restart the helper waits for the API and Node, runs the actual host
capacity preflight and looks for the NRI process. A plugin process is not proof
that a real worker received the correct namespace adjustment: that smoke test
and worker readiness remain separate. Local validation covers shell syntax;
this host transition still requires observing the actual command result.

If startup fails, preserve the printed `/root/kubeclaw-native-activation.*`
directory and inspect `journalctl -u k3s -b --no-pager -n 100`. Configuration
recovery consists of moving these three newly created files into that private
backup, running `systemctl daemon-reload`, and restarting K3s:

- `/var/lib/rancher/k3s/agent/etc/kubelet.conf.d/90-kubeclaw-native.conf`
- `/var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.tmpl`
- `/etc/systemd/system/k3s.service.d/90-kubeclaw-native.conf`

If the NRI executable itself prevents startup, move
`/opt/nri/plugins/10-kubeclaw-native` into the private backup before restarting.
Do not restore etcd or delete PVCs for a configuration failure. Leave the pool
service running; stopping it is not part of this recovery. Inspect actual
configuration and reservations again before any subsequent activation attempt.

The first AX41 activation exposed legacy `--kubelet-arg` CPU/memory reservation
flags in `/etc/systemd/system/k3s.service`. These overrode the new drop-in maps
and removed their PID reservations from effective configz. Inspecting only
`/proc/<k3s-pid>/cmdline` missed them; inspect systemd ExecStart and the logged
kubelet arguments as well. The initial activation helper now rejects these
legacy unit arguments before changing configuration.

For the observed old values (system 500m/1024Mi, kube 500m/512Mi), with the
complete native reservation drop-in already installed:

```bash
python3 scripts/repair-k3s-reservation-arguments.py
```

This narrowly removes both complete kubelet-arg options from ExecStart, retaining
all other bytes/arguments and saving the original unit in a private root backup.
Unexpected values or ambiguous matches stop the repair. It validates the unit
but does not restart K3s. Follow with `systemctl daemon-reload` and
`systemctl restart k3s`, wait for API/node readiness, then rerun host preflight.
Do not rerun the initial activation helper. Restoring the backed-up unit and
reloading/restarting K3s restores the previous arguments if recovery is needed;
native workers must remain disabled until effective reservations pass preflight.

1. Read actual Node capacity, effective kubelet configuration, Pod requests,
   kernel task limits and current K3s configuration sources. Preserve K3s
   configuration, binary and an etcd snapshot before the host transition.
   Etcd snapshots do not back up PVC data.
2. Reconcile old workload reservations before reducing Node Allocatable. The
   migration plan retires the old broken Buster/Nova Deployments by saving their
   manifests privately and scaling them to zero; it does not delete their PVCs.
   This is a migration action, not something a future installer should repeat
   on every run. Confirm replica changes and actual remaining requests.
3. Install the generated root-owned files and NRI executable at the paths
   specified in [the host pool contract](native-worker-host-pools.md). Merge
   reservations into the effective kubelet configuration, preserving unrelated
   settings and larger existing reservations. Configure persistent aggregate
   Pod PID enforcement as required by the preflight.
4. Extend the supported K3s containerd template with the NRI fragment; never edit
   generated `config.toml` as the configuration authority. Preserve networking
   and existing validators. Perform the planned K3s transition and start the
   pool service in the required order. Exact installation/rollback commands
   remain to be recorded after inspecting the host configuration.
5. Run on the actual host with its kubeconfig:

   ```bash
   node scripts/native-worker-node-preflight.mjs \
     my-values/infra/native-worker-pools-ax41.yaml
   ```

   Require Node Ready, actual reserved capacity, exact runtime/host identity,
   correctly enforced pool limits and successful NRI integration. A rendered
   manifest or NRI policy syntax check alone is insufficient.
6. Select verified runtime images, wire the generated Prism overlay into the
   production configuration, and finish the agent Argo handover. Only the
   KubeClaw runtime is intended to auto-sync. Check Pod readiness and real work.
7. Migrate Flannel to Cilium in its own maintenance step after host/runtime
   checks. Merely syncing a Cilium Application is not the migration procedure.

## Requirements for a future one-click installer

Operator requirement confirmed 2026-09-17: one entry point runs on the Controlnode,
including adding subsequent nodes. The current commands below are rollout and
repair procedures, not that completed installer.

The installer must use the selected kubeconfig for cluster operations and explicit
SSH/sudo access for host preparation. Reuse tested implementation steps without
requiring an interactive host shell, temporary build-directory paths or manual
Node/Go installation on every worker. Versioned native binaries should be built
centrally and verified before installation on matching node architectures.

First support a compatible existing cluster; later provide explicit creation and
join modes for supported distributions. Failed detection must never be treated as
permission to overwrite a cluster. Detect unsupported runtime/NRI arrangements
before changing the node; managed Kubernetes without host access may not support
this native execution architecture.

Adding a node must consume inventory and role assignments, validate its independent
capacity, prepare only required native pools, and generate node-specific policy
bindings. Reconcile Kubernetes placement through Git/Argo after verification.
Joining an ordinary application node must not install Buster/Prism host pools.
Do not automatically move local-path PVCs, expand task concurrency, restart existing
nodes or rebalance workloads as a side effect of adding capacity. Those require
explicit placement, storage and workload policies.

Keep authored inventory aligned with the planned central operator configuration
audit and selected software versions in `versions.json`; generated identities and
credentials stay outside Git. Completion requires successful fresh setup, rerun,
interruption recovery and second-node onboarding tests, plus a real workload test.

Use the existing renderer and preflight instead of duplicating their policy
logic. Expose explicit prepare, inspect, apply, verify and recovery stages.
Record source revision and completed stages on the host, and inspect actual
state before resuming. Refuse incompatible existing files or runtime versions.
Save original configuration before mutation and define recovery for each
changed file/service. Never reset PVCs or credentials to make a rerun succeed.

Restarting the native pool service kills its worker subtree: drain/fence active
work first. Do not claim idempotent host installation until reruns, interrupted
installation and recovery have been exercised on a host. Capture the verified
activation commands here as this rollout progresses.

## Retire unused vector database

Qdrant was removed from active deployment, agent probes, dependency packages,
network policies and version/update inputs on 2026-09-16. The owner explicitly
approved deletion of its cluster data. It must not be adopted into Argo.
Historical review evidence remains historical; it is not an installation input.

After pulling main on the control node, run:

```bash
export KUBE_CONTEXT="$(kubectl config current-context)"
bash scripts/remove-qdrant.sh --delete-data
```

The command is specific to the former `kubeclaw/qdrant` release. It verifies
bound PV claim identities, removes the Helm release and known residual
resources, deletes selected claims, and waits for the provisioner to remove
their PVs using the Delete reclaim policy. This deletes storage; it is not a
backup or a secure-erasure guarantee. A timeout must be investigated before
claiming completion. Updated agent manifests remove the old health checks on
the next rollout. Successful cluster removal has not yet been observed.

For the next Argo adoption, the observed LiteLLM PostgreSQL release is
`postgresql-18.5.15` in `kubeclaw`: standalone, database/user `litellm`, existing
Secret `postgresql-secrets` (keys `postgres-password` and `litellm-password`),
1-GiB PVC, requests 50m/128Mi, limits 250m/256Mi. This is observed configuration,
not permission to overwrite the separate desired infrastructure defaults.

## Inspect the remaining platform services together

Before adopting LiteLLM, SPIRE, SPIRE CRDs and SMB CSI, run on the control node:

```bash
export KUBE_CONTEXT="$(kubectl config current-context)"
python3 scripts/inspect-platform-adoption.py
```

The command reads the three Helm releases, LiteLLM workload/service references,
a hash of its configuration, SPIRE PVC bindings and installed CSI driver names.
It does not query Secret objects or mutate the cluster. Common credential fields
in Helm values are redacted, and multiline values and literal container environment
values are omitted. ConfigMap content is hashed rather than printed. The output
is an adoption inventory, not a deployable manifest. All four Applications will
remain manually synced, and SPIRE CRDs must be established before the SPIRE chart
is synced. Do not mix the storage/identity handover with the Cilium migration.
