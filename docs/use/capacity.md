# Capacity and Retention

Status: supported observation procedure; cleanup is limited to explicitly owned component controls
Audience: platform operator, data owner, incident responder
Owner: platform operations and each named data owner
Evidence: charts/prism/files/prism-backup.sh; charts/prism/templates/backup.yaml; charts/prism/templates/ingestion.yaml; charts/prism/templates/jobs.yaml; charts/prism/values.yaml; gitops/platform/values/loki.yaml; gitops/platform/values/prometheus.yaml; gitops/platform/values/redis.yaml; my-values/infra/postgresql-recovery.yaml; my-values/infra/redis-values.yaml; scripts/compact-buster-job.mjs; scripts/native-worker-node-capacity.mjs; scripts/observability-retirement-plan.mjs; scripts/observability-retirement/dispatch.mjs; scripts/observability-retirement/operator-authority.mjs; scripts/postgresql-recovery.sh; scripts/retire-admission.mjs; scripts/retire-attempt-result.mjs; scripts/retire-nova-dispatch.mjs; scripts/retire-operator-request.mjs; scripts/retire-telemetry.mjs; skills/buster/engine/test-gates/remote-plan-compaction.ts; skills/buster/engine/test-gates/remote-plan-service.ts; skills/common/plugin-runtime/foundation/observability/attempt-projection.ts; skills/common/plugin-runtime/foundation/observability/durable-attempts.ts; skills/common/plugin-runtime/foundation/observability/durable-records.ts; skills/common/plugins/operator-messaging/src/delivery-projection.ts; skills/nova/core/state/read-run-evidence.ts; skills/prism/config/native-worker.ts; skills/prism/engine/execution-cache.ts; skills/prism/server/control-server.ts; skills/prism/server/ingestion.ts; skills/prism/server/native-worker-execution.ts; skills/prism/server/worker-config.ts; skills/prism/server/worker-lifecycle.ts; skills/prism/tests/engine-cache.test.mts; skills/prism/tests/worker-ingress-capacity.test.mts; skills/worker/core/worker/native-pool-policy.ts; tests/verification/deployment/prism-ingestion-resources.test.mjs; versions.json
Evidence revision: `ad312e3e4f15223809fadef90bd90e1f689ce941`
Applies to: the recorded cluster, namespace, source revision, and storage products
Last verified: 2026-10-12; deployment measurements and cleanup require the procedures below

## Purpose

Measure pressure before it becomes data loss and apply retention only where an
authority defines eligible data and a safe deletion mechanism. This page is the
only canonical capacity and retention procedure.

## Canonical Capacity and Retention Procedure
<!-- operator-task: capacity-retention -->

### Supported start state, version, location, and authority

Start with an existing reachable cluster, an explicit context and namespace,
and independent access that does not depend on the workload being measured.
Apply the [shared version and tool boundary](README.md#version-and-tool-boundary)
before measuring. Record the actual `kubectl` client and Kubernetes server
versions, selected Helm version when used, and each storage or product query
tool/server pair. Record the installed release, immutable images, data formats,
and the platform and component owners' acceptance of these actual combinations.
Stop until they accept the combination. Build inputs in `versions.json` do not
establish compatibility: [general build tools](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/versions.json#L19-L23)
and [Ops image overrides](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/versions.json#L65-L72)
select different clients. KubeClaw does not define a Kubernetes, CSI storage-driver
implementation, registry, Redis, PostgreSQL, or filesystem compatibility range.

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

Use Bash for the command blocks. Replace every placeholder before execution.
Freeze the recorded context, namespace list, evidence directory and observation
window for this task; a changed target requires a new binding and inventory.
Keep credentials outside both the evidence directory and the command output.

Kubernetes RBAC (API authorization) must permit `get` on the named
`kube-system` namespace for its UID, and `get` on each independently supplied
service namespace for its UID. Record those namespace UIDs before inventory.
The inventory requires `list` on core `persistentvolumeclaims`, `pods`, and
`events`, and on `batch` `cronjobs` and `jobs` in each exact namespace.
Metrics capture additionally requires `list` on `pods.metrics.k8s.io` there.
Client discovery/version requests need the applicable non-resource `get`
permissions on `/version`, `/api`, `/api/*`, `/apis`, and `/apis/*`.
If a selected owner method reads a named StorageClass, PV, Node, or kubelet
configuration, include its exact `get` permission separately. The
[installation access inventory](install.md#check-authority-for-the-selected-scope)
explains cluster versus namespace and native-node access; its installation
write grants are not measurement prerequisites.

Before a product query, its owner must supply the exact read-only method,
identity, tool/version, endpoint or filesystem, selector, and permissions.
Examples are a database role's approved read queries, Redis ACL commands, or
host-file read access; Kubernetes access does not grant them. Record only
non-secret identity and permission evidence. Permission denial stops the
affected measurement. Ask that owner to correct access or supply an authorized
read-only observation; do not select a more privileged credential.

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

Record every namespace that the selected services use. Include the bound
application and Prism namespaces, and each infrastructure namespace supplied
by its owner. Run the block below once per recorded namespace. Replace
`<namespace>` with that namespace; keep the bound cluster context unchanged.
Use a separate output prefix for each namespace. An access failure leaves that
service's budget incomplete and requires its owner to supply the measurement.

Create the evidence directory once before the first capture:

```bash
umask 077
mkdir "<evidence-dir>"
```

For each namespace, first read its UID and compare it with the identity
independently supplied by the platform owner. Stop on a missing or different
UID; a recreated namespace is a new target even when its name is unchanged.

```bash
assert_cluster_binding
kubectl --context "<context>" get namespace "<namespace>" \
  -o jsonpath='{.metadata.uid}{"\n"}' > "<evidence-dir>/<namespace>-uid.txt"
```

For each recorded namespace whose UID matches, capture its inventory:

```bash
assert_cluster_binding
kubectl --context "<context>" -n "<namespace>" get pvc \
  -o custom-columns='NAME:.metadata.name,STATUS:.status.phase,CLASS:.spec.storageClassName,REQUEST:.spec.resources.requests.storage,CAPACITY:.status.capacity.storage' \
  > "<evidence-dir>/<namespace>-pvc.txt"
kubectl --context "<context>" -n "<namespace>" get pods -o wide \
  > "<evidence-dir>/<namespace>-pods.txt"
kubectl --context "<context>" -n "<namespace>" get events \
  --sort-by=.metadata.creationTimestamp > "<evidence-dir>/<namespace>-events.txt"
kubectl --context "<context>" -n "<namespace>" get cronjob,job \
  > "<evidence-dir>/<namespace>-jobs.txt"
```

Expected observation: every selected PVC is `Bound`; its class, request, and
capacity match the intended store; events contain no recurring mount,
provisioning, eviction, inode, or space failure. A successful command does not
prove free bytes inside the volume.

If Metrics Server is installed, capture workload usage separately:

```bash
assert_cluster_binding
kubectl --context "<context>" -n "<namespace>" top pods \
  > "<evidence-dir>/<namespace>-pod-usage.txt"
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

### Connect each budget to its selected controls

For the Prism backup row, the generated reference is [Helm values](../reference/helm-values.md):
select `charts/prism` and the `backup` and `artifactStorage` field families.
Check those settings against the pinned consumers in [Backup headroom](#backup-headroom)
and the applied release. A generated row alone does not prove a loaded limit.

For each budget row above, retain a non-secret effective-configuration record.
Identify direct deployment or GitOps ownership, the applied values and overrides,
rendered resource limits, image/version, storage class and mounted configuration.
A checked-in default is a starting point, not evidence of a running value.
Use [configuration precedence](../reference/configuration-precedence.md) and
[host and Prism configuration](../reference/host-and-prism-configuration.md).
A process can retain startup configuration after its producer changes.
Resolve that difference before treating a current ConfigMap as a loaded limit.

A projection is a copy made for delivery or diagnosis. It does not replace the
original journal, result or evidence. Admission is the decision to accept new
work and its resource liability. A fence prevents a competing writer from
changing the authority while a control checks or mutates it.

The following map selects the controls to connect to each active budget. Add
other discovered services to the same record. For an absent service, keep the
`not deployed` evidence. The pressure column names observations to obtain
through the recorded owner method; it does not claim built-in alerts or expose
a new query command.

| Service or store | Effective control and canonical authority | Pressure and consequence | Owner response, retry and cleanup boundary |
| --- | --- | --- | --- |
| Node filesystems and image store | [Deployment and operations stores](../understand/data-and-state.md#deployment-and-operations-stores); actual node/runtime configuration | Free bytes, inodes, image growth and eviction events; exhaustion can stop Pods or discard unread source logs | Node/runtime owner stops affected writers and supplies expansion or exact collection procedure. No KubeClaw node-cleanup command; retain media and logs until ownership and exclusions are proved. |
| Registry | [Registry and BuildKit maintenance](maintenance.md#registry-and-buildkit-maintenance), deployed registry storage and clients | Native storage usage, push errors, missing digest/layer; a healthy mirror does not prove a published image is complete | Registry owner fences writers and active consumers, then uses the canonical maintenance boundary. Stop release use of an incomplete digest; never substitute a mutable tag. |
| BuildKit cache and worker | [Client and image-lifetime controls](maintenance.md#preserve-image-lifetime-during-collection), actual worker/cache configuration | Native cache bytes, worker resources and build backlog; collection can remove inputs still needed by builds | Build owner drains work and qualifies the exact native collection method. Retain referenced images and source; no broad filesystem deletion. |
| Nova | [Nova run state](../understand/data-and-state.md#nova-run-state) and selected remote-gate configuration | Run-root bytes/inodes, record/blob limits, append/import errors; canonical append failure blocks progress | Nova owner stops new admission, retains journals, effects and referenced results, and adds capacity. Only the local copies listed below have narrow controls; no complete run deletion. |
| Buster | [Buster state](../understand/data-and-state.md#buster-state) and [runtime limits](../reference/buster-runtime-configuration.md) | Job/result/evidence bytes, reserved result liability, admission errors and cleanup uncertainty | Buster owner rejects new jobs that cannot retain results. Completed-job archive compaction keeps result/source/evidence authority; uncertain execution blocks it. Full job/evidence deletion is unavailable here. |
| Redis | [Profile and persistence distinction](../understand/data-and-state.md#deployment-profiles-are-not-the-same-capacity-contract) and [Redis authority](../understand/data-and-state.md#redis-durable-delivery-not-product-authority) | Native memory, persistence bytes, stream/key growth and write errors; no-eviction pressure rejects writes | Redis owner records actual memory/persistence policy and stream/dedup settings. Restore connectivity or capacity before bounded consumer recovery; do not clear keys or streams to release authority. |
| LiteLLM gateway | [Selected source/image boundary](../understand/data-and-state.md#selected-litellm-source-and-image-boundary) and [retention input acquisition](../understand/data-and-state.md#read-retention-inputs-without-changing-the-service) | Request rate, concurrency, route failures and process resources; provider limits differ from local limits | Gateway/model-route owner supplies actual loaded limits and bounded consumer policy. Do not restart or change retention to make conflicting observations agree. |
| LiteLLM PostgreSQL | [Database and row retention](../understand/data-and-state.md#litellm-postgresql) and [recovery boundary](recovery.md#litellm-postgresql-backup-and-restore-boundary) | Database bytes/inodes, row growth and native query errors; scheduled row deletion can change present diagnostics while an old dump retains them | Database and gateway owners identify policy with the canonical read procedure. Unknown effective policy blocks retention changes; preserve dumps and keys through their separate authority. |
| Prism Control and Studio | [Control and request flow](../understand/prism-runtime.md#1-control-the-durable-authority), [configuration](../reference/host-and-prism-configuration.md#prism-control-process) | Process usage, requests and durable operation/replay growth; HTTP readiness does not prove retained operation readers | Prism owner records each workload separately, stops new work at its approved limit and checks durable readers before resuming. Do not use RAM-cache eviction as Control retention. |
| Prism ingestion | [Quarantine contract](../understand/data-and-state.md#prism-acquisition-quarantine) and the bounds below | Quarantine bytes/inodes/age, acquisition size and I/O failures; loss or expiry requires reacquisition | Ingestion owner uses publication-triggered exact-digest cleanup or the TTL reaper. An independent manual DELETE procedure is not supplied here; retain the error and stop before guessing a request or credential. |
| Prism Worker and native host | [Native execution](../understand/prism-runtime.md#4-native-worker-and-engine-execution), [supervisor configuration](../reference/host-and-prism-configuration.md#prism-worker-and-native-supervisor), [host preparation](install.md#check-authority-for-the-selected-scope) | HTTP admission, connection/body limits, native CPU/memory/tasks, scope reservations, ownership/journal bytes and `503`; Pod usage omits host liability | Native-pool owner keeps admission closed on failed identity, recovery or capacity fences. Do not kill scopes or delete journal files to create headroom; recover within the original attempt authority before retry. |
| Prism agent | [Agent admission and probes](../understand/prism-runtime.md#agent-bridge-admission-and-probes) | Process usage, active jobs, bounded ingress and model-route limits; probe capacity differs from work capacity | Prism/model-route owners distinguish rejection from uncertain accepted work. Resume only through the durable operation and recorded route policy. |
| Prism PostgreSQL and artifacts | [Prism database](../understand/data-and-state.md#prism-postgresql), [artifacts](../understand/data-and-state.md#prism-artifacts) and [Prism data architecture](../understand/prism-data.md) | Separate database/artifact bytes, inodes and reference failures; artifact publication precedes database reference | Database/artifact owners fence administrative changes and retain matched groups. Revisions, baselines, logs and published artifacts are not quarantine or cache deletion candidates. |
| Prism and LiteLLM backups | [Backup headroom](#backup-headroom) and [canonical recovery](recovery.md#canonical-backup-and-restore-procedure) | Retained groups, incomplete attempts, free bytes/inodes and last verified group; a ceiling can reject backup before physical exhaustion | Each backup owner records a separate budget. Verify and copy a complete group through the canonical procedure; no automatic group expiry or guessed failed-stage deletion. |
| SPIRE, Cilium/Hubble and Tailscale | [Deployment and operations stores](../understand/data-and-state.md#deployment-and-operations-stores), effective selected manifests and owner-native methods | Per-service resources, retained state, identity/route failures; one service's readiness does not establish another's budget | Each selected operator supplies its exact observation and stop/recovery method. Missing method blocks that row and retention mutation. |
| Ops and telemetry | [Telemetry pressure](../understand/telemetry.md#retention-capacity-and-backpressure), [monitoring retention](../understand/telemetry.md#retention-backpressure-and-failure), and owned workspace stores | File/stream limits, checkpoint age, queue drops, scrape/log gaps and disk growth; diagnostic retention can discard projections | Observability/Ops owners preserve incident and access evidence. Add capacity or use an explicitly qualified local projection control; monitoring horizon is not a capacity guarantee. |

#### Prism temporary and native limits

Ingestion uses a quarantine-only `emptyDir` (Pod-local temporary volume) limited to 4 GiB. Its TTL (time to
live) defaults to one hour and clamps to one minute–one day; reaping runs at
startup and at intervals of at most one minute. Requests are limited to
2,000,000 bytes and acquired content to 6,000,000 bytes. The authenticated
`DELETE /v1/acquisitions/<digest>` accepts one exact 64-character lowercase
hexadecimal digest and returns `204`, including when already absent.
Control attempts exact-digest deletion after acquisition processing, including
when publication failed. It reports publication and cleanup failures rather
than treating a probe as evidence of cleanup. These controls expire
acquisition bytes, not durable logs, reports, artifacts or Control replay.
A Pod loss or expiry requires a new bounded acquisition.

> **Source evidence — quarantine**
>
> Claim: only temporary digest-named acquisitions have these size, TTL and DELETE controls.
> Implementation: [Control publication/cleanup ordering](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/server/control-server.ts#L810-L842), [TTL and reaper](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/server/ingestion.ts#L12-L20), [size and exact DELETE handling](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/server/ingestion.ts#L36-L79).
> Contract or setting: [selected quarantine volume and required sizing](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/charts/prism/templates/ingestion.yaml#L23-L40).
> Test evidence: [rendered quarantine and size prerequisites](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/tests/verification/deployment/prism-ingestion-resources.test.mjs#L31-L64); inspected, not executed for this page.
> Revision: `ad312e3e4f15223809fadef90bd90e1f689ce941`.
> Limit: no manual API execution, credential qualification or live loss/reacquisition proof is established here.

The engine's RAM (process-memory) capture cache defaults to four in-flight executions, 32
completed entries and 16 MiB of completed bytes. It rejects excess in-flight
work and evicts only completed reconstructible cache entries. Durable replay
belongs to Control; clearing this cache releases no authoritative artifact.
The [cache contract and defaults](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/engine/execution-cache.ts#L1-L15)
and [admission and completed-entry eviction](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/engine/execution-cache.ts#L33-L79)
define that distinction. The [cache pressure and retained-artifact tests](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/tests/engine-cache.test.mts#L41-L99)
were inspected, not executed for this page.

Worker ingress defaults to 16 active requests, four extra probe requests,
128 connections, 16 MiB input and a 120-second body timeout. The separate probe
reserve applies only to bodyless GET probes. Capacity rejection returns `503`
with `PRISM_WORKER_CAPACITY_EXCEEDED`; stopping or unsafe work can also return
`503`, so inspect the code and retained attempt state before choosing retry.
Native defaults include 60,000 ms CPU time, 8 GiB memory and 2,048 Linux tasks (processes and threads). CPU time measures
processor use; it is separate from the request and operation deadlines.
They do not enlarge the [root-owned native-pool policy](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/worker/core/worker/native-pool-policy.ts#L17-L30). Budget ownership records,
input/output/result liability, total journal bytes and active scopes separately.
The host owner must confirm current node/boot/runtime identity and CPU, memory
and task reservations. Pod CPU and memory measurements alone cannot establish
those reservations. The [native host authority](../understand/worker-core.md)
and canonical installation access/preparation boundaries remain prerequisites;
this measurement task does not install or repair a host.

> **Source evidence — Worker admission**
>
> Claim: HTTP capacity and native attempt/storage capacity are separate fences.
> Implementation: [request/probe rejection](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/server/worker-lifecycle.ts#L41-L69), [native journal and accepted budgets](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/server/native-worker-execution.ts#L12-L46), [node reservation validation](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/native-worker-node-capacity.mjs#L54-L72).
> Contract or setting: [ingress settings](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/server/worker-config.ts#L17-L29), [native policy](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/config/native-worker.ts#L25-L35), [supervisor/store limits](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/config/native-worker.ts#L50-L84).
> Test evidence: [reserved-probe HTTP test](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/prism/tests/worker-ingress-capacity.test.mts#L21-L55) inspected, not executed; we ran no native-host or live admission check for this page.
> Revision: `ad312e3e4f15223809fadef90bd90e1f689ce941`.
> Limit: source defaults and an HTTP probe do not prove accepted host reservations or successful attempt recovery.

#### Redis profile and diagnostic horizons

The direct Redis values select AOF (append-only persistence), `appendfsync always`, 1 GiB `maxmemory`, `noeviction`, and a 20 GiB PVC. The GitOps values
select a 2 GiB PVC and 256 MiB Pod memory limit; they do not themselves select
that direct-profile memory/persistence policy. Record actual applied policy
instead of assigning the direct default to both profiles. Stream approximate
`MAXLEN` and deduplication TTL are separate from server memory and AOF space.
Expiry or trimming can remove projections even while memory remains available;
`noeviction` instead rejects new writes at its memory boundary.

[Direct Redis selection](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/my-values/infra/redis-values.yaml#L7-L29)
and [GitOps selection](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/gitops/platform/values/redis.yaml#L7-L21)
are the profile authorities. Read the [canonical telemetry sink contract](../understand/telemetry.md#redis-telemetry-adapter)
for stream and deduplication consequences.

The selected monitoring values request Prometheus retention of 15 days on
20 GiB and Loki retention of 720 hours on 20 GiB, with a 721-hour query-length
limit. These requested horizons do not prove that live traffic fits, that all
logs were collected, or that the oldest required evidence remains queryable.
Record measured growth and actual oldest/newest results separately.
[Prometheus settings](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/gitops/platform/values/prometheus.yaml#L39-L50)
and [Loki settings](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/gitops/platform/values/loki.yaml#L5-L30)
do not govern Nova journals or product-required evidence.

#### Backup headroom

Keep separate budgets for live data, completed backup groups, incomplete
attempts, and an independent destination. Headroom is unused capacity reserved
for the next operation. Measure both free bytes and inodes; configured byte
ceilings do not prove actual filesystem space.

Prism defaults to 80 GiB per group, 90 GiB retained bytes and a one-hour
operation ceiling. Its allowance is the lesser of the per-group ceiling and
`retained ceiling - current backup-root bytes - 1 MiB`. Copy accounting also
reserves per-object overhead and final metadata. The backup PVC requests
100 GiB; its storage class follows `artifactStorage.storageClass` when set,
otherwise the cluster default. Verify the resulting bound class and usable
capacity. No complete or incomplete group expires automatically.

LiteLLM recovery selects a separate 64 GiB dump ceiling, 90 GiB retained ceiling,
100 GiB PVC and 1,800-second dump timeout. Its allowance subtracts 64 MiB from
`retained ceiling - current backup-root bytes` before applying the dump ceiling.
An interrupted dump remains `.incomplete-*` and consumes capacity. Neither
script removes the last completed group to admit the next attempt. Preserve
failed staging and its error until the owning backup procedure qualifies exact
cleanup; this page supplies no stage-deletion command.

> **Source evidence — separate backup liabilities**
>
> Claim: both components retain failed staging and enforce different allowances; neither expires groups automatically.
> Implementation: [Prism allowance and staging](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/charts/prism/files/prism-backup.sh#L66-L117), [LiteLLM allowance and staging](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/postgresql-recovery.sh#L56-L95).
> Contract or setting: [Prism ceilings](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/charts/prism/values.yaml#L62-L74), [Prism claim/class](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/charts/prism/templates/jobs.yaml#L61-L74), [LiteLLM policy](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/my-values/infra/postgresql-recovery.yaml#L1-L15).
> Test evidence: we ran no backup, restore, copy or cleanup for this page.
> Revision: `ad312e3e4f15223809fadef90bd90e1f689ce941`.
> Limit: scheduled resources and ceilings do not establish off-node recovery, a measured budget, or an isolated application restore. Use [canonical recovery](recovery.md#canonical-backup-and-restore-procedure) for integrity, encryption, credential and original-reader boundaries.

#### Narrow local projection controls

The implementation has the local controls below. They do not implement full
history or evidence deletion. Their caller is a local operator with filesystem
access, not an authenticated remote user. An `actor` or `owner` field in JSON
is audit data; it does not grant permission. Before any mutation, the named
component owner must approve the operator and exact protected roots, and provide
a versioned procedure that derives real identities and digests from the
original authorities, holds the listed fences, reads back the retained readers
and receipt, and distinguishes a committed effect from a pre-mutation failure.
The CLI source alone does not qualify that procedure. No such complete mutation
procedure is published on this page. Stop before constructing or applying a
scope file; keep all data, add capacity or stop admission through the recorded
owner procedure. Do not infer safe cleanup from age, a glob or terminal status.

| Local control and responsible owner | Eligible copy and actual authority/fences | Retained readers and limit |
| --- | --- | --- |
| [Telemetry retirement](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/retire-telemetry.mjs#L24-L60); observability and Nova owners | Exact `telemetry/plugin-events` records for one run; run mutation lock, snapshot/journal heads and inventory checked again inside the durable store writer fence | Original run logs, effects, decisions, results and continuation remain; store retains tombstones and retirement receipt. No canonical history deletion. |
| [Admission completion compaction](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/retire-admission.mjs#L26-L64); observability and Nova owners | Duplicate completion in the run's admission root; run and attempt-store fence, complete evidence/closure, no missing ranges or unresolved admission, exact record digest | Original attempt completion/evidence and run readers remain. No raw-ingress or evidence-tree deletion permission. |
| [Imported attempt-result compaction](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/retire-attempt-result.mjs#L25-L58); observability and Nova owners | Duplicate result already durably imported; full current import journal, exact store/result digest, run mutation and import-journal append fences | Import-backed result reader, full completion/evidence/closure authority and run remain. Corrupt or incomplete later journal tail blocks mutation. |
| [Nova dispatch projection](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/retire-nova-dispatch.mjs#L75-L94); Nova/remote-gate owner | Inline archive copy after original completed import and causal Core decision proof; canonical run, import writer and distinct dispatch writer fences in that order | Original archive blob, retained source, verified import/result/evidence, decision artifact and dispatch header/receipt remain. No archive-blob deletion. |
| [Operator request projection](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/retire-operator-request.mjs#L58-L77); operator-messaging and Nova owners | Completed JSON human-approval outbound request; canonical run and original wait store, exact effect/receipt and delivery writer checks; original approval/resume/terminal causal sequence required | Original waits, signals, effects, terminal delivery receipt and projected replay remain. It performs no network lookup and cannot resolve a lost acknowledgement. |
| [Buster completed-job compaction](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/compact-buster-job.mjs#L28-L46); Buster and source-repository owners | Inline source archive only; admission lock, exact payload, completed result with no uncertain cleanup, verified result artifacts and explicitly retained Git tag whose revision/tree/archive bytes match | Job/status/result/evidence, source attestation, retained Git source and compaction receipt remain. It does not remove a job or its evidence. |

> **Source evidence — retained authority**
>
> Claim: mutation callbacks check original authorities under writer fences; projection reduces only redundant bytes.
> Implementation: [durable retirement and receipt](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/common/plugin-runtime/foundation/observability/durable-records.ts#L137-L176), [attempt/admission source checks](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L531-L584), [Buster completed result/evidence/source checks](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/buster/engine/test-gates/remote-plan-service.ts#L262-L289).
> Contract or setting: [Buster retained-source intent](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/buster/engine/test-gates/remote-plan-compaction.ts#L28-L66), [operator projection and receipt binding](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/common/plugins/operator-messaging/src/delivery-projection.ts#L96-L151).
> Original authority: [Core dispatch causal proof](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/observability-retirement/dispatch.mjs#L191-L203), [approval/effect/wait causal proof](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/observability-retirement/operator-authority.mjs#L131-L153), [import-backed attempt reader](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/common/plugin-runtime/foundation/observability/attempt-projection.ts#L89-L104).
> Required observations: qualify the selected local projection against its retained readers and reconciled receipts before permitting cleanup.
> Test evidence: no focused test is identified for this claim. Status: source-only; no execution result is asserted.
> Revision: `ad312e3e4f15223809fadef90bd90e1f689ce941`.
> Limit: closure requires each owner to publish and qualify the exact scope acquisition, operator access, fenced mutation, retained-reader, receipt reconciliation and retry procedure. Keep [data retention rules](../understand/data-and-state.md#deletion-and-retention-rules) and [telemetry retirement](../understand/telemetry.md#retirement) as the protection boundary until then.

The connected retirement planner explicitly returns `executable: false` and
zero released bytes. It reports unproved scope completeness, consumer
checkpoints, retained archives and an unimplemented safe release operation.
Its report is inventory evidence, never deletion authorization
([planner state and blockers](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/scripts/observability-retirement-plan.mjs#L83-L125)).
Nova, Buster and observability maintainers own closure: implement the missing
release authority, prove every retained consumer/reference and execute isolated
success, rejection, interruption and replay checks before publishing a full
history/evidence-deletion procedure. Until then retain all connected state.

The historical reason for these particular capacity defaults is unknown.
Inference: rejecting admission before resource liability exceeds a limit and
retaining uncertain attempts preserve the evidence needed for recovery. The
cost is reserved headroom, growing retained state and operator work when a
limit is reached. Component owners must reassess sizing when traffic, payloads,
retention obligations or recovery requirements change; they must qualify new
limits before enabling more work.

#### Distinguish pressure from missing authority

Use the [canonical symptom diagnosis](diagnose.md#canonical-symptom-diagnosis-procedure)
for the affected service after recording these distinctions:

| Observation | Distinguishing read-only check | Safe stop and recovery boundary |
| --- | --- | --- |
| Inventory or owner query returns permission denied | Compare the rejected resource/query and exact scope with the accepted access record | Stop that measurement. Correct access with its owner; do not label usage zero or switch credentials. |
| `top` has no metrics | Record API/metrics availability separately from Pod state; use the owner's recorded resource method if available | Leave the reading unavailable until an authorized method exists. Do not install monitoring during this task. |
| Prism Worker returns `503` | Read the error code, current ingress limits and retained attempt/ownership state; distinguish capacity rejection from stopping or unresolved execution | Keep admission closed for unsafe or uncertain work. Retry a read after capacity recovers; retry work only within its original owner and durable replay policy. |
| Backup reports retained-capacity or incomplete-stage failure | Compare backup-root usage and component allowance with real free bytes/inodes and retained group identity | Preserve both complete groups and failed staging. Do not repeat a backup until its owner proves capacity, no overlapping operation and the original backup fence. |
| Redis write fails | Owner distinguishes memory/no-eviction rejection, persistence failure, authentication and connectivity through its recorded native read method | Stop the affected consumer according to observer policy. Fix the observed layer; never flush state or infer a safe replay from Redis readiness. |
| Quarantine acquisition is missing or cleanup failed | Compare exact digest and publication result; keep acquisition I/O error separate from durable publication/activation state | Reacquire missing temporary bytes only through the bounded product path. Uncertain publication needs original-reader reconciliation before another request; no guessed manual DELETE retry. |
| Metrics/log horizon is shorter than required, or sink has gaps | Compare measured oldest/newest data, collector/checkpoint observations and actual store growth with configured retention | Preserve canonical events and incident evidence. Owner decides capacity or collection recovery; a longer configured window cannot recreate lost samples. |
| Projection control rejects stale digest, reference, fence or receipt | Compare original authorities and retained readers without changing files | Retain all copies and the rejection. Stop mutation until the component owner qualifies the missing authority; a terminal run or actor string is insufficient. |

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
telemetry history. The narrow local projection controls above do not provide
that general deletion capability. Age, a filename pattern, and low free space
are not deletion authority. Stop and escalate when the selected store has no
qualified cleanup procedure.

For complete environment removal, use the
[canonical decommission procedure](maintenance.md#canonical-decommission-procedure),
not retention cleanup.

### 4. Verify and close

Repeat read-only measurements only against the unchanged recorded identities,
selectors, units and windows. If the target changed, restart binding and inventory.
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

Release temporary measurement access through its issuing authority. Remove
only explicitly identified disposable local files after their evidence is
retained. Do not remove workload files or a backup staging directory as evidence
cleanup. Retain the before/after inventory, native measurements, calculation,
threshold and owner, command output, deletion or expansion receipt, application
reader result, and any blocked unsupported action. Never retain secret values.

## Source Authority

Prism's chart bounds one backup and total retained bytes but does not expire old
groups automatically: [backup job settings](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/charts/prism/templates/backup.yaml#L12-L58)
and [retained-capacity enforcement](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/charts/prism/files/prism-backup.sh#L66-L84).
Nova's evidence reader rejects an unresolved effect rather than treating it as
cache ([implementation](https://github.com/datrab/kubeclaw/blob/ad312e3e4f15223809fadef90bd90e1f689ce941/skills/nova/core/state/read-run-evidence.ts#L68-L95)).
