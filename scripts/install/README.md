# Installer step catalog

Stable step names for composing the future Controlnode installer. This is an
implementation inventory, not an executable installation sequence or a completed
installer. Existing script paths remain compatible; their `Installer-Step`
header maps them to this catalog. Do not concatenate these scripts blindly.

## Preparation and installation

| Step ID | Existing implementation (relative to repository root) | Runs on | Inputs / prerequisites | Effect and completion evidence |
| --- | --- | --- | --- | --- |
| `native.render` | `scripts/render-native-worker-node.mjs` | Preparation machine with selected Node runtime | Selected node policy YAML, new output directory | Generates policy, service and configuration files; does not install them. |
| `native.build` | `scripts/build-native-worker-nri.mjs` | Build machine with selected Go toolchain | New output binary path | Verifies modules and builds NRI; current build targets the build environment, so target OS/architecture must match. |
| `native.install` | `scripts/install-native-worker-pools-stage.sh` | Target node, root | Reviewed bundle containing generated files and NRI binary; selected Node executable at expected path; no existing installation | Installs files and starts pool service for this boot; prints pool limits. Not rerunnable on an installed node; does not activate NRI/reservations. |
| `native.activate` | `scripts/activate-native-worker-ax41.sh` | AX41, root | Installed running pools and matching policy; inspected K3s layout; stopped old agents | Backs up configuration, snapshots etcd, installs runtime/reservation configuration, enables service and restarts K3s. Checks readiness, capacity and NRI process; no workload smoke proof. |
| `native.verify-capacity` | `scripts/native-worker-node-preflight.mjs` | Target node with local host access and kubeconfig | Selected policy YAML and effective node configuration | Read-only reservation/identity validation; prints evidence. Does not prove task execution or isolation. |
| `native.prepare-browser-delegation` | `scripts/prepare-ax41-buster-browser.sh` | AX41, root | Active matching pools; Buster stopped; capacity preflight passes | Backs up installed preparation code, creates browser delegation and updates persistent setup; no restart. Compatibility maintenance for the existing install; current fresh pool preparation already creates this child. |

Fresh native pool setup uses `scripts/prepare-native-worker-pools.mjs` internally
through the generated systemd service. It is a service implementation, not an
extra administrator-shell installation step. The renderer must package the
current implementation; do not invoke its full initialization from SSH directly.

The dependencies are render/build -> install -> activate -> verification, but
activation also has live migration prerequisites that cannot be reduced to an
exit-code chain. SSH invocation originates on the Controlnode; host access is
still required for systemd, cgroups and runtime configuration. The AX41-specific
steps must be parameterized and validated before use on another node.

## Historical repairs: not part of every installation

`runtime.register-argo` (`scripts/install/register-runtime-argo.mjs check|apply`)
runs on the Controlnode with Node, dependencies, Helm, Git and kubectl. It requires
an explicit `KUBE_CONTEXT`, committed production selection/definitions, and
`runtimeAutoSync: false`. Check performs only reads and API dry-run; apply repeats
the checks and registers the root, workload Project and three manual children.
Reruns reconcile matching definitions but refuse conflicting owners or children
with active/automatic sync. No host restart, Helm uninstall or workload mutation
is performed. Postcondition is registration only; inspect diffs and separately
verify workload adoption before enabling automatic runtime sync.

`runtime.configure-prism-job-cleanup` (`scripts/configure-prism-job-cleanup.sh`)
runs on the Controlnode using kubectl and the selected context. It updates only
history limits on the three named Prism CronJobs that already exist: retain zero
successful jobs and three failed jobs. Reruns converge on the same values; missing
CronJobs are skipped. Kubernetes cleans up completed Job/Pod objects, not backup
PVC contents. The chart carries the same policy for future deployments. Already
exported immutable release directories retain their old settings and must be
superseded before Argo adoption; do not sync an old export over this maintenance.

Runtime prerequisite step `runtime.prepare-archviewer-auth` is implemented by
`scripts/prepare-nova-archviewer-auth.sh` on the Controlnode. It requires kubectl,
Python and `htpasswd` (Debian/Ubuntu package `apache2-utils`). It interactively
creates the missing `kubeclaw/nova-archviewer-auth` Secret with a bcrypt htpasswd
entry, without printing credentials. Existing nonempty credentials are retained;
an existing malformed Secret stops the step. It does not deploy Nova or an ingress.

| Step ID | Existing implementation | Apply only when | Effects |
| --- | --- | --- | --- |
| `repair.native-pool-lifetime` | `scripts/repair-native-worker-pools-lifetime.sh` | Observed active/exited service with missing pool cgroups and no main process | Replaces the old service/setup and restarts pool service; saves a backup. |
| `repair.native-nri-launch` | `scripts/repair-native-nri-launch.sh` | Activated AX41 installation with failed NRI launch and no running plugin | Rebuilds/tests/replaces NRI and restarts K3s; saves a backup. |
| `repair.k3s-reservation-arguments` | `scripts/repair-k3s-reservation-arguments.py` | Exact legacy reservation arguments in the K3s unit override selected configuration | Backs up and repairs the unit. Does not reload systemd or restart K3s itself. |

The installer must incorporate corrected implementations for fresh installs.
Existing installations require explicit detected migrations, not replaying all
historical repairs. A successful earlier run does not authorize a service restart
on every later reconciliation.

## Contract for further steps

- Add an `Installer-Step` identifier and catalog entry when creating a new
  installation script. Separate prepare, inspect/verify, apply and repair work.
- Record inputs, execution location, privilege requirements, prerequisites,
  modified files/services, restart impact, outputs and postconditions.
- State rerun behavior explicitly. Current initial-install scripts refuse existing
  state; that is not a complete idempotent installer. Future orchestration must
  inspect state and skip verified completed work or select an explicit migration.
- Preserve backups, credentials and PVC data. A later failure does not roll back
  earlier successful shell commands automatically; recovery must be designed and
  tested per step, including interrupted runs.
- Keep stable IDs independent of host names and browser vendors. Site-specific
  implementations may carry `ax41` in their current filenames without making it
  a universal installer default.

See [AX41 rollout and installer requirements](../../docs/operations/ax41-rollout.md)
and [the roadmap](../../docs/ROADMAP.md). No new execution wrapper or supported
one-command installation is introduced by this catalog.
