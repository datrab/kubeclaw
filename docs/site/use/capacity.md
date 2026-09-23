# Capacity and Retention

Status: supported observation procedure; cleanup is limited to explicitly owned component controls
Audience: platform operator, data owner, incident responder
Owner: platform operations and each named data owner
Evidence: charts/prism/files/prism-backup.sh; skills/nova/core/state/read-run-evidence.ts
Applies to: the recorded cluster, namespace, source revision, and storage products
Last verified: 2026-09-21; no live capacity measurement or cleanup result is available

## Purpose

Measure pressure before it becomes data loss and apply retention only where an
authority defines eligible data and a safe deletion mechanism. This page is the
only canonical capacity and retention procedure.

## Canonical Capacity and Retention Procedure
<!-- operator-task: capacity-retention -->

### Supported start state, version, location, and authority

Start with an existing reachable cluster, an explicit context and namespace,
and independent access that does not depend on the workload being measured.
Use the versions recorded for the installed release. KubeClaw does not define a
Kubernetes, CSI, registry, Redis, PostgreSQL, or filesystem compatibility range.

Run cluster commands from the administration machine. Run product-specific
queries only through the owning product's documented administration surface.
The Kubernetes API is authoritative for requested PVC size and object state;
the CSI/storage product is authoritative for free bytes and expansion; each
application is authoritative for whether records are disposable.

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for the whole measurement or retention task. Every raw `kubectl`, Helm,
or `scripts/deploy.sh` command below must inherit its exported read-only
`KUBECONFIG`; every shown `<context>` must equal `EXPECTED_CONTEXT`. Run
`assert_cluster_binding` immediately before each command block. Stop on any
mismatch and follow the binding section's recovery; never fall back to the
default kubeconfig.

### Preconditions

- `<context>`, `<namespace>`, `<evidence-dir>`, and the observation window are
  recorded.
- `<evidence-dir>` is new, mode `0700`, and outside workload PVCs.
- Data owners are named for Nova runs, Buster jobs, Prism data and backups,
  Redis, LiteLLM, registry data, BuildKit cache, Ops data, and telemetry.
- No deletion, compaction, backup, restore, rotation, or release change is in
  progress.
- The storage owner has supplied a real free-space measurement method. PVC
  capacity alone is not free space.

Stop if any store has no owner, the context is unexpected, the evidence path is
inside disposable storage, or measuring a store would require an unapproved
credential.

### 1. Capture the cluster-side inventory

```bash
assert_cluster_binding
umask 077
mkdir "<evidence-dir>"
kubectl --context "<context>" -n "<namespace>" get pvc \
  -o custom-columns='NAME:.metadata.name,STATUS:.status.phase,CLASS:.spec.storageClassName,REQUEST:.spec.resources.requests.storage,CAPACITY:.status.capacity.storage' \
  > "<evidence-dir>/pvc.txt"
kubectl --context "<context>" -n "<namespace>" get pods -o wide \
  > "<evidence-dir>/pods.txt"
kubectl --context "<context>" -n "<namespace>" get events \
  --sort-by=.metadata.creationTimestamp > "<evidence-dir>/events.txt"
kubectl --context "<context>" -n "<namespace>" get cronjob,job \
  > "<evidence-dir>/jobs.txt"
```

Expected observation: every selected PVC is `Bound`; its class, request, and
capacity match the intended store; events contain no recurring mount,
provisioning, eviction, inode, or space failure. A successful command does not
prove free bytes inside the volume.

If Metrics Server is installed, capture workload usage separately:

```bash
assert_cluster_binding
kubectl --context "<context>" -n "<namespace>" top pods \
  > "<evidence-dir>/pod-usage.txt"
```

If this command reports that metrics are unavailable, record that observation.
Do not install Metrics Server as part of this task.

### 2. Measure each authority and calculate growth

For every store, record current bytes, free bytes, inode use where applicable,
oldest and newest retained item, and the same measurements from at least one
earlier point. Calculate the observed growth rate and exhaustion time outside
the target workload. Do not infer free space from a PVC request.

| Store | Measurement authority | Retention boundary |
| --- | --- | --- |
| Node image/filesystem | Node and container-runtime operator | KubeClaw has no node cleanup command |
| Registry and BuildKit | Registry/BuildKit administration | Stop writers before product-native garbage collection |
| Nova durable root | Filesystem plus Nova audit | No supported run-deletion CLI; retained state protects replay and effect reconciliation |
| Buster job/evidence roots | Buster records and filesystem | Do not remove accepted jobs, receipts, or uncertain cleanup evidence |
| Redis | Redis owner and configured persistence mode | No repository-wide cleanup rule |
| LiteLLM PostgreSQL | Database owner | No repository-wide row-retention rule |
| Prism database/artifacts | PostgreSQL and immutable artifact store | Authoritative revisions and baselines are not age-only cleanup candidates |
| Prism backups | `prism-backups` PVC and backup-group metadata | No automatic group expiry is implemented |
| Ops and telemetry | Their storage owners | Keep incident and access evidence for the assigned policy |

Set a warning threshold below the time needed to expand storage, stop writers,
or copy a verified backup. If that lead time is unknown, retention is not ready
for unattended operation.

### 3. Select a supported response

Use exactly one response owned by the affected layer:

1. Expand the storage through the storage product's procedure, if its class and
   workload support online expansion.
2. Move an already verified backup group to an independent destination.
3. Stop new admission and drain work before product-native compaction or garbage
   collection.
4. Remove a specifically identified temporary object only when its owning
   procedure provides a selector, receipt, and recovery boundary.

KubeClaw currently provides no general command to delete old Nova runs, Buster
evidence, Prism revisions, registry layers, Redis data, LiteLLM rows, or
telemetry. Age, a filename pattern, and low free space are not deletion
authority. Stop and escalate when the selected store has no narrow cleanup
surface.

For complete environment removal, use the
[canonical decommission procedure](maintenance.md#canonical-decommission-procedure),
not retention cleanup.

### 4. Verify and close

Repeat the same measurements after the owned response. Expected observation:
free capacity or forecast time increases, application readers still resolve
retained data, scheduled backups still complete, and no selected object loses
its authority or reference.

Stop admission and use the [symptom diagnosis procedure](diagnose.md#canonical-symptom-diagnosis-procedure)
if usage continues to grow unexpectedly, a reader fails, or deletion effect is
uncertain. Do not repeat a deletion. Reconcile the product receipt and storage
state first.

### Recovery, cleanup, and evidence

If an expansion or cleanup fails before mutation, retain its error and leave the
store unchanged. After a confirmed mutation, restore only through the
[canonical backup and restore procedure](recovery.md#canonical-backup-and-restore-procedure);
do not copy individual database files back into place.

Remove temporary measurement credentials and files when evidence capture is
complete. Retain the before/after inventory, native measurements, calculation,
threshold and owner, command output, deletion or expansion receipt, application
reader result, and any blocked unsupported action. Never retain secret values.

## Source Authority

Prism's chart bounds one backup and total retained bytes but does not expire old
groups automatically: [backup job settings](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/prism/templates/backup.yaml#L12-L58)
and [retained-capacity enforcement](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/prism/files/prism-backup.sh#L66-L84).
Nova's evidence reader rejects an unresolved effect rather than treating it as
cache ([implementation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/state/read-run-evidence.ts#L68-L95)).
