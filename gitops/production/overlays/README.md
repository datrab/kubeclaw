# AX41 rollout overlays

Status: partial configuration, not deployment approval. GitOps publication must
remain disabled until resource accounting and ownership adoption are complete.

- Nova: agreed main-container ceiling 4 CPU / 16 GiB; requests remain 1 CPU /
  12 GiB. Sidecars and init containers still contribute to Pod accounting.
- Prism: binds the native worker to ax41-production and the installed policy
  digest. The host pool limits native tasks to 2 CPU / 16 GiB. Those are not
  the budgets of Control, Studio, PostgreSQL, the agent or worker supervisor.
- Buster: host pool is 1.5 CPU / 8 GiB, but production Pod values are not yet
  reconciled. Existing gateway requests are 1 CPU / 12 GiB and runtime requests
  are 2 CPU / 8 GiB. Do not claim these fit just because the host pool does.
  The chart still mounts a separate browser cgroup path; prove its relationship
  to the installed host pool before rollout. No Buster overlay is selected yet.

Before rollout, render every component and account for all existing Pods,
sidecars, init containers and rollout surge against Node Allocatable. Review
the Buster resource override mechanism without copying stale image digests into
an overlay. Keep PVC names/data and external Secret references intact. Argo
adoption must not use Helm uninstall as an ownership transfer.

The observed registry is HTTP. BuildKit/containerd HTTP configuration is already
supported, but the image scanner explicitly rejects `http-lab`. HTTP scanning
requires a separately tested implementation; never bypass the scan or change
the error to a passing result. Envoy/mTLS remains on the roadmap.
