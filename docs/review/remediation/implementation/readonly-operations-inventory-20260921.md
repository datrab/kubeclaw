# Read-only operations inventory — 2026-09-21

This dated observation supplies part of the C1/D1/H1 input inventory. It is not
an implementation acceptance, an outage experiment, a capacity measurement or
a deployment of this working tree. Only the connected read-only Kubernetes/Argo
MCP queries were used; no pod/node command or mutation ran.

The [recorded projection](../../evidence/readonly-operations-inventory-20260921/observations.json)
retains query names, returned completeness flags and observed state. Machine,
system and boot identifiers and unrelated detailed workload specifications are
omitted. The projection was recorded at 12:21 UTC; node heartbeats in the response
were around 12:17 UTC. This is a point-in-time observation, not a continuing
health assertion.

- The node query returned one Ready amd64 node, `ax41-production`, with no memory,
  disk or PID pressure reported. It reports Ubuntu 24.04.5, kernel
  `6.8.0-139-generic`, Kubernetes `v1.36.4+k3s1` and containerd
  `2.3.4-k3s1.36`. Capacity is 12 CPU and `65765232Ki` memory. Allocatable,
  actual usage, filesystem/inode free space, Kubelet reservations and competing
  workload totals were not returned; no D1–D3 capacity conclusion follows.
- Argo returned twenty applications with no pagination remainder. The application
  `kubeclaw-prism` is Synced/Degraded; `kubeclaw` is OutOfSync/Degraded with a
  failed synchronization; `platform` is OutOfSync/Healthy. Other listed
  applications report Synced/Healthy. These are reported states only; their
  causes were not diagnosed in these three inventory queries.
- The relevant kubeclaw applications report revision
  `6f6fe343dd85bf52a0a79f4e8d4a412057c2401b`, which differs from this task's
  baseline and uncommitted changes. Their live status cannot prove or disprove
  this implementation's behavior.
- The complete returned kube-system DaemonSet list contains the Linux and Windows
  SMB CSI node drivers, with one Linux replica ready and no Windows replica
  scheduled. No Cilium DaemonSet appears in this returned namespace list. This
  alone is not proof of the effective CNI or of cluster-wide Cilium absence.

C1 remains open: this API view is not a full namespace/application/endpoint
inventory and does not identify every non-Argo workload or resolve the historical
Paperless/HomeOS question. Tailnet grants/test clients, independent management
access, off-cluster backups and failure/restore measurements remain separate
inputs or live gates. Existing local GitOps closure is not reopened merely by
the reported live sync state. No automatic repair or deployment was authorized
or attempted as part of this read-only inventory.
