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

### Complete the service-budget record

Create `<evidence-dir>/service-budgets.md` outside workload storage. Inventory every
selected workload and store, including optional services that this release enables.
Add a row for every discovered service. A fixed list does not prove completeness.
Mark an absent service `not deployed`, with its release or inventory evidence.
Do not omit a service because its measurements are unavailable.

For each active service, create one record per limiting resource. Storage bytes,
inodes, memory, CPU, queue length, and request rate have different units and limits.
Use the same unit and observation window for a metric's readings and thresholds.
The following record is a template, not a measured result:

| Field | Required value |
| --- | --- |
| Service and resource | Exact workload or store identity, namespace, release, and metric. |
| Measurement method | Owning tool or query, its version, execution location, permissions, and concrete selector. |
| Evidence | Output path and collection time for each reading. Exclude credentials. |
| Unit and window | Bytes, inodes, cores, requests/second, or the owner's defined unit; record the sampling window. |
| Previous reading | Measured value and time `t0`. |
| Current reading | Measured value and later time `t1`. |
| Effective capacity | Real usable capacity or configured limit, with its authority. A PVC request is insufficient. |
| Growth | `(current - previous) / (t1 - t0)`, in resource units per second. |
| Warning boundary | Owner-approved value, comparison direction, reason, and approval date. |
| Stop boundary | Owner-approved value, comparison direction, reason, and approval date. |
| Response lead time | Measured or owner-approved time to finish the selected response, including a safety margin. |
| Forecast | Time until warning and stop at the observed positive growth rate; otherwise state that no positive growth was observed. |
| Owner and responder | Named data or service owner, on-call contact, and person authorized to execute the response. |
| Warning action | Exact owned observation or expansion procedure and expected result. |
| Stop action | Exact admission-stop or escalation procedure, affected work, and safe recovery condition. |
| Retention boundary | Disposable object criteria, reference protection, receipt, and recovery authority; otherwise record that deletion is unsupported. |

The required service coverage starts with the selected release's inventory:

| Service or store | Measurement authority and response boundary |
| --- | --- |
| Node filesystems and image store | Node/container-runtime owner measures usable bytes and inodes; KubeClaw supplies no node cleanup command. |
| Registry storage | Registry owner measures stored data and capacity; stop writers before owned garbage collection. |
| BuildKit cache and worker | BuildKit owner measures cache, worker resources, and backlog; use its supported cache controls after draining builds. |
| Nova process and durable root | Measure workload resources plus filesystem usage; protect run journals, effects, and audit evidence. No run-deletion CLI exists. |
| Buster process, jobs, and evidence | Measure workload resources, jobs, and stored bytes; retain accepted jobs, receipts, and uncertain cleanup evidence. |
| Redis | Redis owner measures memory, persistence storage, and client pressure; no repository-wide cleanup rule exists. |
| LiteLLM | Service owner measures request rate, concurrency, failures, and process resources; record the configured provider limits separately. |
| LiteLLM PostgreSQL | Database owner measures database growth and usable storage; no repository-wide row-retention rule exists. |
| Prism Control, Studio, and ingestion | Record each active workload separately, including process resources, request rate, and any bounded queue. |
| Prism Worker and native host | Record worker/native-host resources and admission limits separately; use the native-pool owner for host measurements. |
| Prism agent | Record process resources and external model-route limits; the model-route owner supplies those limits. |
| Prism PostgreSQL and artifacts | Database/artifact owners measure separate stores; authoritative revisions and baselines are not age-only cleanup candidates. |
| Prism backups | Measure the backup PVC and retained groups; read configured limits from the generated reference. No automatic group expiry exists. |
| SPIRE, Cilium/Hubble, and Tailscale | Record each selected workload and its owned stores; their operators supply resource, request, and retention limits. |
| Ops and other telemetry | Record each active service and store separately; retain incident/access evidence according to its owner's policy. |

For a growing usage metric, use `warning < stop <= effective capacity`.
Compute `seconds to stop = (stop - current) / growth` only when growth is positive.
A zero or negative growth observation does not guarantee future capacity.
For free-space metrics, the comparison direction reverses; record that direction explicitly.

Choose boundaries that leave enough time for the approved response before the
stop limit. Use the shortest applicable forecast when bytes, inodes, or another
resource can exhaust first. Explain any owner-defined relation that differs
from the usage formula above.

**Stop conditions:** An active service with a missing reading, owner, method,
warning value, stop value, or response has no complete budget. Stop this procedure
before retention mutation and do not enable unattended cleanup or new admission.
If the stop boundary is already crossed, invoke the recorded owning-layer stop
or escalation action. An undefined forecast or an unavailable metric requires
owner review; it is not a zero-use result.

Retain the completed records and owner approval with both measurement outputs.
The repository defines no universal production thresholds. Do not substitute
invented values for measured budgets or owner-approved limits.

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
