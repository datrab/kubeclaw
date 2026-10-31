# Maintain and Retire

Status: source-backed maintenance boundaries; no general runtime upgrade pair or generic rotation command is currently established
Audience: release maintainer, platform operator, security operator
Owner: release engineering and platform operations
Evidence: versions.json; releases/ops-images.json; scripts/deploy.sh
Upstream source scope: central Ops contract at `34cf38ef53ee41381543785d0ffae90a37fac9ca`; no runtime source adoption or live verification is established by this update
Applies to: current release-selection and deployment contracts
Last verified: 2026-10-11 prior local checks; local selection rejection and synthetic bundle-manifest reader checks on 2026-10-21; no live upgrade, rotation, retirement, or bundle observation

## Objective

Change software, data, credentials, certificates, or capacity without losing rollback evidence.
Remove KubeClaw only after data and access have named owners.

## Cluster Authority Binding for Every Maintenance Task

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for upgrade, rollback, rotation, GitOps, or decommission work. Every raw
`kubectl`, Helm, or `scripts/deploy.sh` command below must inherit its exported
read-only `KUBECONFIG`, `NAMESPACE`, and `PRISM_NAMESPACE`. The binding section
validates and freezes both namespace names before any command here; every shown
`<context>` must equal `EXPECTED_CONTEXT`.
Run `assert_cluster_binding` immediately before each command block. Stop on any
mismatch and follow the binding section's recovery; never fall back to the
default kubeconfig.

## Canonical Upgrade and Rollback Procedure
<!-- operator-task: upgrade-rollback -->

This section is the sole authority for `upgrade-rollback`. Start with a healthy
installed release, independent administration, a complete old/new version pair,
verified isolated restore media, enough capacity, and no uncertain external
effect. Run source planning from `<repository-root>` and deployment checks from
the administration machine. Release receipts, data-schema authorities, Helm or
Git desired state, running image IDs, and application readers are authoritative.

The current compatibility matrix is deliberately empty:

| Component | Supported old version | Supported new version | Data compatibility | Result |
| --- | --- | --- | --- | --- |
| Nova/Buster runtime release | None recorded | None recorded | Not established | Stop before mutation |
| Prism application and database | None recorded | None recorded | Not established | Stop before mutation |
| Shared Redis/PostgreSQL/LiteLLM | None recorded | None recorded | Component-specific proof absent | Stop before mutation |

An image, chart, or tool version in `versions.json` is not an upgrade-pair
claim. Until a row names and proves an exact pair, the commands later in this
page may verify or redeploy the currently selected release but must not be used
to claim an upgrade.

For a future supported pair, complete [Prepare a Release Change](#prepare-a-release-change),
[Change Plan](#change-plan), [Render and Compare](#render-and-compare),
[Upgrade Order](#upgrade-order), the component section, and
[Rollback Decision](#rollback-decision). Gate every step on the expected native
and application observation. Abort before the irreversible point on a failed
gate. After an incompatible data write, image rollback is forbidden; use the
declared data recovery or forward repair.

Expected completion is the intended immutable release, compatible data,
four-level readiness, functional reader success, and reopened admission. Retain
old/new receipts, pair proof, backup and restore evidence, rendered diff,
commands and output, each health gate, irreversible point, running identities,
rollback or forward-repair result, cleanup, and final acceptance.

## Canonical Rotation Procedure
<!-- operator-task: rotation -->

This section is the sole authority for `rotation`. Start with a healthy system,
complete producer/consumer inventory, credential or trust authority access, an
authority-specific issue and revoke operation, a maintenance window, and a
tested emergency route. Run cluster observation from the administration
machine and issuance/revocation only through the external owning authority.

Before changing trust, capture non-secret references and consumers:

```bash
assert_cluster_binding
kubectl --context "<context>" -n "$NAMESPACE" get secrets \
  -o custom-columns='NAME:.metadata.name,TYPE:.type,CREATED:.metadata.creationTimestamp'
kubectl --context "<context>" -n "$NAMESPACE" get deploy,statefulset,cronjob \
  -o yaml > "<evidence-dir>/credential-consumers.yaml"
```

Do not store Secret data. Use [Credential Rotation](#credential-rotation) for
the ordered transition and [Certificate and SPIRE Rotation](#certificate-and-spire-rotation)
for its current limit. Stop before issuance if the authority-specific command,
dual-trust capability, full consumer list, positive/negative check, expiry, or
rollback owner is absent. The repository provides no generic rotation command.

Expected completion is new-identity success, unrelated-identity denial,
old-identity denial after revocation, all consumers healthy, temporary material
removed, and an independent recovery path retained. Recovery before revocation
is to restore the exact old consumer configuration; after revocation, follow
the external authority's recovery process. Retain only names, versions,
timestamps, consumer rollout identities, positive/negative observations,
revocation receipt, cleanup, and blocked boundary.

### Rotation Failure Distinction

| Observation | Cause class | Safe response |
| --- | --- | --- |
| Old identity works and new identity fails | New issuance, distribution, mount, or consumer reload | Keep old trust active and repair the named new path |
| Both intended identities fail | Authority, shared trust root, or consumer configuration | Stop the rotation and use independent access |
| New identity works and old identity still works after recorded revocation | Revocation or cache propagation | Keep the window open and reconcile the external authority |
| Unrelated identity works | Grant, allowlist, or peer-verification failure | Restrict access and treat the result as a security incident |
| Service is ready but protected data is unreadable | Encryption-key or data-version mismatch | Keep writers fenced and restore the exact prior key/configuration set |

## Canonical Decommission Procedure
<!-- operator-task: decommission -->

This section and [Controlled Retirement](#controlled-retirement) are the sole
authority for `decommission`. Start only after new admission is disabled,
external exposure is restricted, active and uncertain work is reconciled,
final backups and isolated restore proof pass, and every Kubernetes and external
resource has an owner and retain/delete decision. Run from independent
administration, not the target Ops Pod.

The application namespace must be dedicated before broad teardown. If any
resource in it is shared or unregistered, do not run `teardown` or
`teardown-all`; use separately approved resource-specific removal instead. Before broad removal, establish the complete
[deletion window](#establish-the-complete-deletion-window) and compare the original
and current object identities. Keep the exclusion through final verification.
Retain the pre-removal inventory, final backup group, access revocation
receipts, command confirmations and output, post-removal inventory, retained
audit location and retention end date, and every failed cleanup. There is no
automatic rollback after PVC or namespace deletion; recovery is from the final
verified media through the canonical restore procedure.

### Retire the Former Qdrant Installation

Use this procedure only for the former `qdrant` release in namespace `kubeclaw`.
Qdrant is not a current platform dependency. A PersistentVolumeClaim (PVC) is a
namespaced request to use storage. A PersistentVolume (PV) is the cluster-wide
record of a volume. Its `claimRef` identifies the claim by namespace, name, and
UID. A UID identifies one lifetime of an object. `resourceVersion` is an opaque
version of the object. The reclaim policy selects the action after claim release.
This procedure sets `Delete` on selected bound PVs and deletes selected PVCs.
It is not a general storage cleanup command.

Run from an independent administration host and the pinned source checkout.
Use Bash, Python 3, Helm, kubectl, and the
[shared version and tool boundary](README.md#version-and-tool-boundary).
Record actual client, server, and storage-driver versions. The platform owner
must accept that combination; the repository supplies no compatibility matrix.
Complete [Bind Cluster Authority](install.md#bind-cluster-authority) with
`NAMESPACE=kubeclaw`. Keep that bound shell and its read-only `KUBECONFIG`.

The authenticated administrator needs PVC get/list/watch/delete access in
`kubeclaw` and PV get/list/watch/patch access at cluster scope. Deletion waits first get the object. If it remains present, positive-timeout
waits list/watch that resource with a name selector. Named StatefulSet deletion and Helm release removal also need
the relevant dependent-workload get/list/watch permissions in `kubeclaw`, plus
Helm release-record reads/deletion and removal permissions for the installed
release resources. The platform owner must verify the exact resource/verb
combinations for the installed release and selected clients before any
destructive request; use scoped grants where the authority supports them.
The script deletes StatefulSet `qdrant`, Services `qdrant` and `qdrant-headless`, Secrets
`qdrant-auth` and `qdrant-tls`, and NetworkPolicy `kubeclaw-qdrant-ingress`.
It attempts to delete the same-named CiliumNetworkPolicy only when its own API
discovery succeeds and matches `ciliumnetworkpolicies.cilium.io`. Successful
discovery before invocation does not guarantee successful discovery inside
the script. Confirm removal later through a successful named read-back.
Inventory and diagnosis need discovery, workload/event reads, and, when used,
StorageClass, CSIDriver, VolumeAttachment, and controller-log reads. Confirm
these permissions with the platform owner before starting. Do not grant broader
access merely to make a failed command succeed. Namespace selection does not
limit PV authority.

#### Establish the deletion window

Complete the [decommission prerequisites](#canonical-decommission-procedure)
and [retained evidence decisions](#controlled-retirement) first. Stop former
Qdrant consumers and writers. The storage owner must approve each selected
claim and backing volume for deletion. Record the data owner, backup location,
retention end date, disposal owner, and isolated restore result if the data must
remain recoverable. Keep backups and audit evidence outside the target storage.
Stop on shared storage, uncertain ownership, incomplete backup, or missing
required restore proof.

**Before any destructive operation, the platform and storage owners must
confirm a window that excludes concurrent PVC replacement, PV recreation under
a reused name, rebinding, and competing policy edits.** Identify and suspend
competing administrators and desired-state controllers through their owning
authorities. Keep the exclusion in effect until all uncertain results are
reconciled. Storage deletion controllers must remain available. Stopping
consumers alone does not establish this window. Stop before running the script
if the owners cannot establish or maintain it.

The script has no concurrency fence. Its initial read compares only the PV
`claimRef` namespace/name/UID with the selected PVC. Its later JSON Patch tests
those same three fields before adding `persistentVolumeReclaimPolicy=Delete`.
It does not test PV UID, `resourceVersion`, or the prior policy. The later PVC
delete uses the captured **name without a UID precondition**. The external window
and the original/current comparisons below are required because these guards
do not exclude replacement objects or competing edits.

#### Capture and compare the exact storage inventory

1. Select a new private evidence directory outside Git, disposable project
   storage, and the target volumes. `<evidence-dir>` is an absolute directory
   owned by the operator and retained by the audit owner. Do not store Secret
   values, kubeconfig contents, volume credentials, or unfiltered annotations.
   Capture versions and the release/resource names:

   ```bash
   assert_cluster_binding || exit 126
   test "$NAMESPACE" = kubeclaw || exit 126
   export KUBE_CONTEXT="$EXPECTED_CONTEXT"
   export QDRANT_EVIDENCE="<evidence-dir>"
   case "$QDRANT_EVIDENCE" in /*) ;; *) exit 126 ;; esac
   umask 077
   test ! -e "$QDRANT_EVIDENCE" || exit 126
   mkdir -m 0700 -- "$QDRANT_EVIDENCE"
   git rev-parse HEAD > "$QDRANT_EVIDENCE/source.txt"
   kubectl --context "$KUBE_CONTEXT" version -o json > "$QDRANT_EVIDENCE/versions.json"
   helm version --short > "$QDRANT_EVIDENCE/helm-version.txt"
   python3 --version > "$QDRANT_EVIDENCE/python-version.txt"
   helm --kube-context "$KUBE_CONTEXT" --namespace kubeclaw list --all \
     > "$QDRANT_EVIDENCE/releases-before.txt"
   kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw get \
     statefulset/qdrant service/qdrant service/qdrant-headless \
     secret/qdrant-auth secret/qdrant-tls networkpolicy/kubeclaw-qdrant-ingress \
     --ignore-not-found -o name > "$QDRANT_EVIDENCE/resources-before.txt"
   kubectl --context "$KUBE_CONTEXT" api-resources -o name \
     > "$QDRANT_EVIDENCE/api-resources.txt"
   ```

   If `ciliumnetworkpolicies.cilium.io` is present in the discovery file, also
   capture the named policy. If discovery is denied or fails, stop; absence
   from failed discovery is not proof that the API is absent.

   ```bash
   assert_cluster_binding || exit 126
   kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw get \
     ciliumnetworkpolicy/kubeclaw-qdrant-ingress --ignore-not-found -o name \
     > "$QDRANT_EVIDENCE/cilium-policy-before.txt"
   ```

2. Set `QDRANT_SNAPSHOT=before` and run this read-only capture. Python uses only
   its standard library. It retains selected identity fields, not Secret data
   or arbitrary metadata. It reads each selected full PV response in memory
   and writes the fields needed for comparison. The storage handle is the
   identifier used to locate the backing volume; keep it private.

   ```bash
   assert_cluster_binding || exit 126
   export QDRANT_SNAPSHOT=before
   ```

   ```bash
   assert_cluster_binding || exit 126
   case "$QDRANT_SNAPSHOT" in before|current) ;; *) exit 126 ;; esac
   mkdir -m 0700 -- "$QDRANT_EVIDENCE/$QDRANT_SNAPSHOT" || exit 126
   kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw get pvc -o json |
     python3 -c '
   import json, pathlib, sys
   directory = pathlib.Path(sys.argv[1])
   selected = []
   for claim in json.load(sys.stdin)["items"]:
       m, s = claim["metadata"], claim["spec"]
       labels = m.get("labels", {})
       known = m["name"] in ("qdrant-storage-qdrant-0", "qdrant-snapshots-qdrant-0")
       owned = (labels.get("app.kubernetes.io/instance") == "qdrant" and
                labels.get("app.kubernetes.io/name", labels.get("app")) == "qdrant")
       if known or owned:
           selected.append({"name": m["name"], "uid": m["uid"],
               "resourceVersion": m["resourceVersion"], "volumeName": s.get("volumeName", "-"),
               "storageClassName": s.get("storageClassName"),
               "deletionTimestamp": m.get("deletionTimestamp"), "finalizers": m.get("finalizers", [])})
   with (directory / "claims.json").open("x") as stream:
       json.dump(selected, stream, indent=2)
   with (directory / "claims.tsv").open("x") as stream:
       for claim in selected:
           print(claim["name"], claim["uid"], claim["volumeName"], sep="\t", file=stream)
   ' "$QDRANT_EVIDENCE/$QDRANT_SNAPSHOT"
   while IFS=$'\t' read -r claim uid volume; do
     test "$volume" != - || continue
     assert_cluster_binding || exit 126
     kubectl --context "$KUBE_CONTEXT" get pv "$volume" -o json |
       python3 -c '
   import json, sys
   pv = json.load(sys.stdin)
   m, s = pv["metadata"], pv["spec"]
   csi = s.get("csi", {})
   print(json.dumps({"name": m["name"], "uid": m["uid"], "resourceVersion": m["resourceVersion"],
       "claimRef": {key: s.get("claimRef", {}).get(key) for key in ("namespace", "name", "uid")},
       "policyPresent": "persistentVolumeReclaimPolicy" in s,
       "policy": s.get("persistentVolumeReclaimPolicy"), "storageClassName": s.get("storageClassName"),
       "driver": csi.get("driver"), "storageHandle": csi.get("volumeHandle"),
       "sourceTypes": sorted(set(s) - {"capacity", "accessModes", "claimRef", "persistentVolumeReclaimPolicy",
           "storageClassName", "mountOptions", "volumeMode", "nodeAffinity", "volumeAttributesClassName"}),
       "deletionTimestamp": m.get("deletionTimestamp"), "finalizers": m.get("finalizers", []),
       "phase": pv.get("status", {}).get("phase")}, indent=2))
   ' > "$QDRANT_EVIDENCE/$QDRANT_SNAPSHOT/pv-$volume.json"
   done < "$QDRANT_EVIDENCE/$QDRANT_SNAPSHOT/claims.tsv"
   ```

   The selector is exactly the two known names **OR** instance label `qdrant`
   **AND** name label `qdrant`. The legacy `app` label is used only when
   `app.kubernetes.io/name` is absent, not when that label is empty, null, or a
   different value. Known names are selected even without labels; selection
   alone is not ownership approval. Review every row with the storage owner.

3. For each bound claim, require PV `claimRef` to equal `kubeclaw`, the captured
   PVC name, and its UID. Record PVC name/UID/volumeName, PV name/UID/version,
   all three reference values, original policy presence/value, storage class,
   driver, storage handle, and the storage owner's authority reference. A
   non-CSI source requires the owner to identify its actual plugin, backing
   location, and disposal procedure from the recorded source type; missing
   CSI fields are not proof of missing storage. For a CSI volume, inspect the
   exact discovered driver and class names with the read-only queries below.
   If the class is absent, ask the owner to resolve the actual provisioning
   authority. Never substitute today's default class for a captured volume.

   The script records `-` for an unbound selected claim (`volumeName` absent). It has
   no PV patch and no PV wait, but the script still deletes the PVC by name.
   The owner must confirm that no allocation or provisioning is in progress
   and no binding will occur during the window. Stop on incomplete identity,
   changed binding, missing PV, deleting object, mismatched reference, unknown
   driver/backend owner, or inability to retain the inventory. An empty
   selection does not prove earlier storage was erased; reconcile known former
   volumes with the owner before treating absence as completion.

4. Immediately before invocation, set `QDRANT_SNAPSHOT=current` and repeat the
   capture block in step 2, without changing or overwriting `before`. Compare
   selected row sets and every recorded field. PVC/PV names and UIDs, bound
   volume, reference triplet, storage class/source/driver/handle, and original
   policy must match. Review any `resourceVersion` change with the platform
   owner against current state, even if the visible fields match; version
   changes can come from controllers. Do not silently accept a changed policy,
   null or absent value. The script always writes `Delete`, replacing an
   existing member or adding an absent member after its guards pass. Stop and
   establish a new reviewed plan on a difference. These reads are observations,
   not an atomic guard; the external exclusion remains mandatory.

   ```bash
   assert_cluster_binding || exit 126
   export QDRANT_SNAPSHOT=current
   ```

#### Run once and read back the result

After both owners confirm the unchanged inventory and active exclusion, run
one destructive command. Capture its output and status; do not pipe it through
a command that loses the script's exit status.

```bash
assert_cluster_binding || exit 126
if KUBE_CONTEXT="$EXPECTED_CONTEXT" bash scripts/remove-qdrant.sh --delete-data \
  > "$QDRANT_EVIDENCE/retirement-output.txt" 2>&1; then
  qdrant_status=0
else
  qdrant_status=$?
fi
printf '%s\n' "$qdrant_status" > "$QDRANT_EVIDENCE/retirement-status.txt"
```

The script prechecks all selected bound PV references, then uninstalls Helm and
removes the named remaining workload/access resources. Only then does it patch
each PV, delete its PVC, wait up to 180 seconds for that PVC, and wait up to
180 seconds for PV API deletion. A later failure can leave earlier claims or
resources removed. A stored `Delete` policy permits irreversible storage
removal after release. Neither a patch response nor a wait duration proves
storage deletion. Review output for the last completed operation, but reconcile
current state even on exit zero.

The script runs its Cilium API-discovery pipeline inside an `if`. Bash does
not stop the script when that pipeline fails. For example, a discovery
`Forbidden` error can skip Cilium policy deletion, permit later PV patches and
PVC deletions, and still produce exit zero. Output is redirected during this
invocation; the operator inspects it after the script returns. This procedure
does not provide an automatic stop before those later writes. Review both
standard output and standard error in the captured file, and perform the
full original-identity and named-resource read-back even after exit zero. A
discovery error or missing Cilium removal observation leaves cleanup uncertain.
Stop further operator writes, retain the exclusion, and have the platform and
storage owners reconcile all preceding and later effects. If successful
discovery shows the API, require a successful named policy read-back; absence
from a failed discovery or a failed read is not proof of removal.

Deletion-wait access can fail after the server accepted a deletion. In the
pinned kubectl source, `delete --wait` can tolerate a Forbidden or unsupported
wait result and return success. Thus an exit status alone cannot prove that
the object is gone. The separate PV `wait` also needs list/watch access while
the object remains present. Read back the original identities and deletion
state through the owning authority before any continuation on a denied wait.

For **each original row**, copy `<claim-name>`, `<pv-name>`, and
`<original-pvc-uid>` from `before`, not from a new selection. Run the PVC query
for all rows; run the PV and PV-event queries only for bound rows. These queries
show identities, policy, deletion state, and finalizers (entries that delay API
removal until required cleanup completes). Save their output and status in new
private observation files; do not overwrite the originals. `--ignore-not-found`
permits a successful empty result, but an API error does not prove absence.

```bash
assert_cluster_binding || exit 126
kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw get pvc "<claim-name>" \
  --ignore-not-found -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,VERSION:.metadata.resourceVersion,PV:.spec.volumeName,DELETING:.metadata.deletionTimestamp,FINALIZERS:.metadata.finalizers'
kubectl --context "$KUBE_CONTEXT" get pv "<pv-name>" --ignore-not-found \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,VERSION:.metadata.resourceVersion,CLAIMNS:.spec.claimRef.namespace,CLAIM:.spec.claimRef.name,CLAIMUID:.spec.claimRef.uid,POLICY:.spec.persistentVolumeReclaimPolicy,DRIVER:.spec.csi.driver,HANDLE:.spec.csi.volumeHandle,CLASS:.spec.storageClassName,PHASE:.status.phase,DELETING:.metadata.deletionTimestamp,FINALIZERS:.metadata.finalizers'
kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw get events \
  --field-selector 'involvedObject.uid=<original-pvc-uid>' --sort-by=.metadata.creationTimestamp
kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw get pods \
  -o custom-columns='NAME:.metadata.name,PHASE:.status.phase,CLAIMS:.spec.volumes[*].persistentVolumeClaim.claimName'
```

For a bound row, `<original-pv-uid>` is the original PV UID. Inspect cluster
attachments and the discovered storage authority. Replace `<storage-class>`
and `<driver>` only with present, verified values from the inventory. Omit a
class or CSI-driver query when that field is absent; the owner must identify
the applicable non-CSI or migrated provisioner instead.

```bash
assert_cluster_binding || exit 126
kubectl --context "$KUBE_CONTEXT" get events --all-namespaces \
  --field-selector 'involvedObject.uid=<original-pv-uid>' --sort-by=.metadata.creationTimestamp
kubectl --context "$KUBE_CONTEXT" get volumeattachments.storage.k8s.io \
  -o custom-columns='NAME:.metadata.name,PV:.spec.source.persistentVolumeName,DRIVER:.spec.attacher,NODE:.spec.nodeName,ATTACHED:.status.attached,ATTACHERROR:.status.attachError.message,DETACHERROR:.status.detachError.message'
kubectl --context "$KUBE_CONTEXT" get storageclass "<storage-class>" \
  -o custom-columns='NAME:.metadata.name,PROVISIONER:.provisioner,POLICY:.reclaimPolicy'
kubectl --context "$KUBE_CONTEXT" get csidriver "<driver>" \
  -o custom-columns='NAME:.metadata.name,ATTACHREQUIRED:.spec.attachRequired'
```

The class policy is a provisioning setting, not proof of the current PV policy.
Match attachment rows by the original PV name and verify its UID separately.
A missing attachment does not prove backend deletion. Event retention is
limited; no event is not proof of success. The provisioner is the component
that creates or deletes backing storage; the backend is the storage system it
uses. The storage owner must identify the actual controller namespace, workload,
and container, including migration if present. Inspect that exact controller:

```bash
assert_cluster_binding || exit 126
kubectl --context "$KUBE_CONTEXT" --namespace "<controller-namespace>" get \
  "<controller-kind>/<controller-name>" \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,READY:.status.readyReplicas,DESIRED:.spec.replicas'
kubectl --context "$KUBE_CONTEXT" --namespace "<controller-namespace>" logs \
  "<controller-kind>/<controller-name>" -c "<controller-container>" --since=30m
```

Use a time range that covers the recorded attempt. Inspect logs privately and
retain only sanitized lines for the original handle/UID and deletion result.
Do not publish credentials or backend configuration. For a controller managed
outside Kubernetes, obtain equivalent health and deletion observations from
its owner. This repository does not supply a driver-specific backend command.
Stop until the owner supplies its read-only lookup and disposal audit for the
original handle, including retained snapshots, replicas, exports, and backups.

#### Distinguish failure before another write

On any failed or uncertain operation, stop further writes, retain the exclusion,
and preserve output, status, original policy, current stored policy, identities,
deleting state, events, and owner observations. Use the queries above before
choosing a continuation. The following observations require different actions:

| Observation | Distinguishing check | Safe action |
| --- | --- | --- |
| Binding, tool, read, or initial ownership precheck fails | Check exit/output; compare current PVC UID/volume and PV reference with `before` | No script removal precedes a failed initial precheck. Correct access or tools through their owners; on identity mismatch stop and obtain a new plan. A pre-existing deletion remains possible. |
| `Forbidden` or `Unauthorized` | Identify the denied request/resource/verb in output; ask the authority to verify that exact permission and read back earlier resources | Stop. A denial of one request does not undo earlier removals. Do not widen grants or rerun blindly. |
| Discovery fails inside the script, including `Forbidden`, even with exit zero | Review captured stderr and the named Cilium policy; read back every original PVC/PV and named release/access resource | Cilium deletion can have been skipped while later storage writes completed. Stop further operator writes and require platform/storage-owner reconciliation. No automatic interruption prevented those effects. |
| Later patch rejects a test, reports 422, validation failure, admission denial, conflict, or NotFound | Read the same PV name and compare original UID/reference/policy/version; inspect the returned error | Earlier Helm/access removal can already be complete. Preserve both states; resolve ownership or admission with the platform owner. Matching claimRef alone is insufficient. |
| Patch response is lost or interrupted | Read original PV/PVC identities, policy and deletion state; ask the storage owner for the original handle's result | No response does not mean no write. `Delete` may already be stored and deletion may have started. Stop until reconciled; do not resend the patch. |
| PVC deletion fails, loses its response, or times out | Query the original name; distinguish absence, original UID with deletion timestamp/finalizers, and a different UID; inspect using Pods/events | A different UID is a replacement: stop. An original terminating claim needs the owner to resolve remaining consumers/protection. Absence permits only owner reconciliation of PV/backend state. Do not delete the name again. |
| PV wait times out | Query original PV UID/reference/policy/phase/deleting state, attachments, events, and controller health/logs | A retained original PV can be waiting for claim release, controller work, finalizer cleanup, attachment release, or backend deletion. Keep writes stopped while the platform/storage owners identify that path. |
| Protection/finalizers, attachments, volume-in-use or `VolumeFailedDelete` errors remain | Compare remaining Pod claim use, attachment state/errors and provisioner/backend receipt | Owners resolve the actual consumer, detach, controller, authorization or storage failure. Do not force-delete objects or remove finalizers; backend removal can precede failed API cleanup. |
| Original PVC/PV APIs are absent, but backend outcome is unknown | Require successful API reads plus the owner's lookup/audit for the original storage handle | Record API absence only. Stop disposal acceptance until storage evidence distinguishes removed data from retained/unknown data. |

Controllers can continue deletion while the script is stopped. A controller
retry is not authority for an operator retry. Any continuation requires owners
to reconcile each original resource and backend effect, confirm the exclusion,
and specify the exact remaining operation and new evidence. There is no general
partial-resume command. Do not blindly repeat the script or change the policy
back as rollback. A policy change cannot recover erased data. After storage
removal, recovery requires retained verified media and the storage owner's
restore procedure.

#### Verify completion and retain evidence

Repeat the release, named workload/access, and original PVC/PV observations.
Repeat successful API discovery through the platform authority, and read back
the named Cilium policy if the API is present. If discovery fails, keep Cilium
cleanup unresolved; do not treat the script's skipped branch as API absence. Expected Kubernetes result: the former release and named
resources are absent, each original selected claim is absent, and each bound
original PV is absent, with successful reads and no replacement UID. An unbound
row has only a claim-removal result. Record unexpected new selected claims and
stop; do not expand removal scope. Obtain separate storage-owner disposal
receipts for each original handle and the selected retention decisions. API
absence and the script's completion message do not prove backend erasure.
Roll out updated agents through their approved deployment procedure to remove
former Qdrant health probes.

Retain the owners' approvals and window record, actual versions, source commit,
original/current inventories, original policy and storage identity, sanitized
output/status/timestamps, observations, backend receipts, backup/restore proof,
retention end date, recovery owner, and unresolved cleanup. The script deletes
its temporary claim inventory on exit; that inventory is not retained evidence.
Release the exclusion only after owner reconciliation. Dispose of temporary
administration access through its credential owner after verification; retain
required audit and recovery data until its recorded retention end. No live
retirement, backend erasure, or restore result is established by this guide.

> **Source evidence — bounded Qdrant retirement**
>
> **Claim:** The script's fixed selector captures claim name/UID/volumeName. The script prechecks the reference and removes release/access resources. It then applies three reference tests plus `add Delete`, deletes PVCs by name, and waits for PVC/PV API deletion.
>
> **Implementation:** [Intent, context, tools, and temporary inventory](https://github.com/datrab/kubeclaw/blob/51975b92ed5154b76c65793e55933b4d8659d05d/scripts/remove-qdrant.sh#L6-L18). [Exact selection](https://github.com/datrab/kubeclaw/blob/51975b92ed5154b76c65793e55933b4d8659d05d/scripts/remove-qdrant.sh#L20-L30). [Precheck](https://github.com/datrab/kubeclaw/blob/51975b92ed5154b76c65793e55933b4d8659d05d/scripts/remove-qdrant.sh#L35-L43). [Release/resource removal](https://github.com/datrab/kubeclaw/blob/51975b92ed5154b76c65793e55933b4d8659d05d/scripts/remove-qdrant.sh#L46-L55). [Patch and waits](https://github.com/datrab/kubeclaw/blob/51975b92ed5154b76c65793e55933b4d8659d05d/scripts/remove-qdrant.sh#L57-L77).
>
> **Contract or setting:** [The seven selected existing-PV receiving contracts](https://github.com/datrab/kubeclaw/blob/0403b262df2dba24747a19d1f8f42ef3334ef779/scripts/docs-kubernetes-pv-selected-receiver-contracts.mjs#L13-L29) explain the ordered patch, guard limits, and controller/backend boundary. These source expectations use Kubernetes v1.35.0, not a live compatibility claim. [The API server rejects malformed or failed JSON patches](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/apiserver/pkg/endpoints/handlers/patch.go#L403-L417). [Deletion reconciliation is separate](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/controller/volume/persistentvolume/pv_controller.go#L1321-L1389), and [backend removal can precede finalizer failure](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/controller/volume/persistentvolume/pv_controller.go#L1495-L1540).
>
> **Wait permissions and limit:** [Positive-timeout deletion waits get, then list/watch the named resource](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/kubectl/pkg/cmd/wait/delete.go#L45-L51), with [the selected list/watch calls](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/kubectl/pkg/cmd/wait/delete.go#L79-L89). [The delete command invokes that wait and can tolerate a denied or unsupported wait](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/kubectl/pkg/cmd/delete/delete.go#L460-L477). These pinned client expectations do not prove the operator's actual permissions.
>
> **Reason:** The [producer comment](https://github.com/datrab/kubeclaw/blob/51975b92ed5154b76c65793e55933b4d8659d05d/scripts/remove-qdrant.sh#L33-L34) says PVC deletion alone can leave retained PVs and data. Inference: setting `Delete` connects approved claim retirement to storage disposal. The historical reason for these specific incomplete concurrency guards is unknown. Platform operations owns reassessment when ownership, drivers, or retention requirements change.
>
> **Test evidence:** Local command syntax, synthetic exact selection, sanitized capture, read-only observation, discovery-denial and binding-refusal checks do not execute retirement against Kubernetes.
>
> **Revision:** Product sources checked at `51975b92ed5154b76c65793e55933b4d8659d05d`; KubeClaw receiving descriptions at `0403b262df2dba24747a19d1f8f42ef3334ef779`; selected upstream expectations at `66452049f3d692768c39c797b21b793dce80314e`.
>
> **Limit:** No live authorization, admission, controller, driver, data-disposal, or recovery result is established. External exclusion and owner-supplied backend observations remain mandatory prerequisites.

## Supported Versions

Use `versions.json` for the selected Ops Pod Codex CLI version; it also drives
`ops/pod/package.json` and `charts/ops-pod/Chart.yaml`. A selected version is not
an accepted upgrade pair or proof of a running installation.

Use the [shared version rules](README.md#version-and-tool-boundary).
Every maintenance plan must name the old and new source, image, chart, configuration, schema, and data versions.
An absent compatibility statement means that rollback or mixed-version operation is not approved.

## Maintenance Principles

- Change one governed release set, not isolated image tags.
- Use immutable image and code-bundle identities.
- Back up before stateful migration.
- Rehearse restore before the production change.
- Define the irreversible point before starting.
- Keep the previous compatible release and recovery media.
- Rotate credentials by consumer group.
- Never use image rollback to downgrade incompatible data.
- Preserve failed evidence separately from later success.

## Version Authorities

| Authority | Purpose | Does not prove |
| --- | --- | --- |
| `versions.json` | Reviewed build inputs and tool versions | A published or deployed image |
| `releases/runtime-images.json` | Selected runtime image receipts and digests | Live Pod identity or data compatibility |
| `releases/ops-images.json` | Selected Ops image receipts and digests | Mobile pairing or cluster access |
| `releases/values/*.yaml` | Source-bound generated image values | Private setting correctness |
| Private overlays | Environment settings without alternate first-party images | Schema migration safety |
| Pod `imageID` | Actual pulled image identity | Active code-bundle identity by itself |
| Database migration table | Applied schema state | Application compatibility by itself |

Use all applicable authorities in one change record.

## Prepare a Release Change

### Acquire a reviewed runtime selection

A receipt is the build's stored record of its source commit, workflow run and
attempt, and immutable image digests. Promotion selects that record; it does
not rebuild the images. The selection commit is the Git commit that contains
the accepted receipts and generated values. It is usually later than the
image-build commit. Record both. If `releases/runtime-code.json` is selected,
record its separate code-bundle commit and run/attempt too. Code bundles are
archives loaded by the agent; they are not container images.

The current checkout contains runtime image and code receipts and generated values.
The read-only selection check rejects their current configuration at
`RELEASE_CONFIGURATION_CHANGED: charts/kubeclaw/files/config/knip.json`.
This first failure does not establish whether later checks would pass.
Stop runtime installation and resolve the selection through the release owner.
Do not rewrite the receipts or weaken the configuration check.
The release maintainer performs this task in `github.com/datrab/kubeclaw`, or the
explicitly approved repository whose receipts and image references the environment uses:

1. Open **Actions → Build Runtime Images And Skill Bundles**. Select one
   [successful run on `main`, triggered by `push` or `workflow_dispatch`](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/.github/workflows/promote-runtime.yaml#L43-L53). Record
   its numeric run ID, attempt and full source commit. Confirm the durable
   release `runtime-images-<run-id>-<attempt>` contains exactly the intended
   `runtime-images.json` receipt and images. A successful code-only build can
   have no image receipt; it is not sufficient for this manual image promotion.
2. Confirm that **Actions → Promote image release** is enabled and the maintainer
   can dispatch it. The workflow reads Actions, release contents and packages.
   The repository administrator must configure `DEPENDENCY_APP_ID` and
   `DEPENDENCY_APP_PRIVATE_KEY` for a GitHub App installed on this repository.
   [The workflow creates its App token from those configured inputs](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/.github/workflows/promote-runtime.yaml#L77-L86).
   Its token must be authorized to push the `release/runtime-<run-id>` branch
   and create a pull request (Contents write and Pull requests write). Reviewers need the repository's review and merge
   authority under branch protection. Stop if the app or authority is absent;
   do not use an operator's cluster credentials as a substitute.
3. Choose **Run workflow**, branch `main`, `family=runtime`, and
   [`source_run_id=<run-id>`](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/.github/workflows/promote-runtime.yaml#L1-L14). Record the promotion run ID. Wait for its source
   verification, materialization, immutable-image scan, and PR creation to
   finish. The [scan and artifact steps](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/.github/workflows/promote-runtime.yaml#L65-L76) run before the
   [branch push and PR creation](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/.github/workflows/promote-runtime.yaml#L107-L113). On success, retain the `proposed-runtime-release` artifact and the
   PR **Select runtime release <run-id>**, branch `release/runtime-<run-id>`,
   base `main`. An artifact or a partially pushed branch without that accepted
   PR does not authorize installation. If a run fails, retain its failed step;
   check whether the branch or PR already exists before deciding to retry.
4. Review the receipt's source run/attempt, source commit and image digests,
   the scan outcome, generated `releases/values/*.yaml`, selected code receipt
   if present, and every other changed file. Stop on stale chart/value bytes,
   missing images or bundles, incompatible private settings, or an unexplained
   change. Obtain the change and data-compatibility approvals before merge.
   With `GITOPS_ENABLED=true`, this workflow also proposes production Argo
   [manifests](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/.github/workflows/promote-runtime.yaml#L101-L111): after continuous GitOps is bootstrapped, merging can authorize
   automatic deployment. Obtain that environment owner's approval before
   merge. The separate **Publish production deployment** workflow can push
   compatible selections to `main` when GitOps is enabled; do not treat that
   [automatic path](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/.github/workflows/auto-promote-runtime.yaml#L14-L18) as completion of this manual promotion task.
5. Merge the approved selection PR. Record the full accepted checkout commit
   on `main`, PR URL, review approvals, promotion run and artifact. This is
   `<selection-commit>` below. Do not check out only the image-build commit:
   that commit need not contain the later selection files.

No workflow was dispatched for this page, and no successful promotion,
scan or merge is claimed.

### Obtain and verify the selected checkout

Run on the administration machine. `<new-checkout-path>` is a new disposable
absolute directory; `<selection-commit>` is the reviewed 40-character checkout
commit from the preceding step. Git read access is required. The checkout may
contain production GitOps files, but these commands do not sync or deploy them.

```bash
export SELECTED_CHECKOUT_COMMIT="<selection-commit>"
export SELECTED_REPOSITORY_URL="https://github.com/datrab/kubeclaw.git"
export SELECTED_CHECKOUT_PATH="<new-checkout-path>"
[[ $SELECTED_CHECKOUT_COMMIT =~ ^[a-f0-9]{40}$ ]] || exit 1
case "$SELECTED_CHECKOUT_PATH" in /*) ;; *) exit 1 ;; esac
test ! -e "$SELECTED_CHECKOUT_PATH"
git clone --no-checkout "$SELECTED_REPOSITORY_URL" "$SELECTED_CHECKOUT_PATH"
cd "$SELECTED_CHECKOUT_PATH"
git checkout --detach "$SELECTED_CHECKOUT_COMMIT"
test "$(git rev-parse HEAD)" = "$SELECTED_CHECKOUT_COMMIT"
test -z "$(git status --porcelain)"
test -f releases/runtime-images.json
```

Complete [Locked Dependency Installation](quickstart.md#locked-dependency-installation)
in this disposable checkout. Follow its locked installation and retain the
registry identity, lock digest, tool versions and installation result. The repository administrator supplies a read-only GitHub identity in
`GITHUB_TOKEN` for the verification below; do not put it in arguments or logs.
`GITHUB_REPOSITORY` is the owner/repository whose stored receipts you accepted.
The verifier checks every selected runtime/code/Ops receipt present in the
checkout, so that identity must be able to read each corresponding run and
release. Stop if the identity or receipt access is unavailable.

```bash
export GITHUB_REPOSITORY="datrab/kubeclaw"
: "${GITHUB_TOKEN:?Read-only GitHub receipt-verification identity required}"
export GITHUB_TOKEN
node scripts/updates/verify-release-source.mjs
node scripts/updates/materialize-release.mjs --family=runtime --check
npm run versions:check
node --input-type=module <<'NODE'
import { selectedRelease } from './scripts/updates/deployment-release.mjs';
const release = selectedRelease(process.cwd(), 'runtime');
console.log(JSON.stringify({ imageCommit: release.commit,
  imageRun: release.sourceRunId, imageAttempt: release.sourceRunAttempt,
  codeCommit: release.code?.commit ?? null,
  codeRun: release.code?.sourceRunId ?? null,
  codeAttempt: release.code?.sourceRunAttempt ?? null }));
NODE
test -z "$(git status --porcelain)"
unset GITHUB_TOKEN
```

Expected observation: each command exits zero; the identity report matches
the reviewed receipt(s), and the worktree stays clean. `--check` compares the
existing generated values without replacing them. If values are absent or
stale, stop. In a separate disposable repair checkout, the release maintainer
may run `node scripts/updates/materialize-release.mjs --family=runtime`, review
its exact generated diff and commit it through another selection PR. Resume
only from that accepted clean commit and repeat these checks. Do not repair
values in the installation checkout, invent a receipt, or replace a digest
with `latest`.

The [local release boundary rejects absent selection](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/scripts/updates/deployment-release.mjs#L33-L43).
The [configuration verifier requires the exact source file set and bytes](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/scripts/updates/release-configuration.mjs#L25-L38)
from the [selected code commit, or image commit when no code receipt is selected](https://github.com/datrab/kubeclaw/blob/b6e4a0d774434b8c39b2575322436e3fba708914/scripts/updates/materialize-release.mjs#L5-L9).
A later documentation-only checkout is eligible only when the release owner
explicitly accepts its commit and these same checks pass. The checks establish
configuration equality, not that owner's approval, data compatibility or live
readiness. Record the checkout commit separately from the receipt commits.

Retain the review/merge references, run and attempt identities, artifact and
receipt digests, scan status, checkout commit, sanitized check outputs and
exit statuses. Ops uses a different write and authorization boundary; follow
[Acquire an Ops selection](#acquire-an-ops-selection), not the runtime PR steps.

If version inputs change, use the controlled generation path in a separate
reviewed change:

```bash
npm run versions:sync
npm run versions:check
node --test tests/verification/deployment/versions.test.mjs
```

Review every generated diff with the version change. Do not edit generated
digests to make a check pass.

### Acquire an Ops selection

Use this procedure only for Ops images. The release maintainer and environment
owner must approve the exact source run and the direct `main` write **before
dispatch**. Unlike runtime promotion, this branch does not open a selection PR.
It updates the Ops receipt, generated values and Argo bootstrap selection, then
pushes directly to `main`. A configured controller can reconcile that change.
Do not rely on a later PR review to prevent deployment.

1. Select a successful `main` run of **Build Ops Images**
   (`.github/workflows/build-ops-mcp.yaml`), triggered by `push` or
   `workflow_dispatch`. Record its numeric run ID, attempt and full source commit.
   Confirm the release `ops-images-<run-id>-<attempt>` contains `ops-images.json`
   and the intended immutable images. Review their configuration and compatibility
   with the target environment before authorization.
2. Confirm **Promote image release** is enabled and the maintainer may dispatch
   it. Its `github.token` needs Actions/package reads and Contents write for
   the direct push. The runtime GitHub App and selection-PR permissions are not
   this branch's authority. Stop if repository protection rejects that write;
   do not bypass protection.
3. After the owners authorize the write and possible reconciliation, dispatch
   on `main` with `family=ops` and `source_run_id=<run-id>`. Retain the promotion
   run. Require source verification, materialization, bootstrap selection update,
   immutable-image scan, artifact upload and **Select Ops release on main**
   to finish successfully. The artifact is named `proposed-runtime-release`
   even for this family; upload alone is not a successful push.
4. Read back the pushed `main` commit and review every changed release and
   `gitops/platform/bootstrap/codex-ops.yaml` file against the approved plan.
   Record that selection commit separately from the image-build commit.
   On failure or an uncertain push response, inspect both the run and remote
   state before retrying. Do not interpret an absent PR as failed Ops promotion.
5. Obtain a clean disposable checkout of that exact selection commit using the
   preceding checkout block, requiring `releases/ops-images.json` instead of the
   runtime receipt. Complete locked dependency installation and receipt-source
   verification with the approved read identity. Run
   `node scripts/updates/materialize-release.mjs --family=ops --check` and
   `npm run versions:check`. Require zero exits and an unchanged checkout.
   Stop on any failed prerequisite or check; do not repair deployment inputs
   silently. Actual rollout, running image identity and Ops readiness remain
   separate observations.

Retain the prior selection, approvals, run/attempt, receipt and artifact digests,
scan result, direct-push commit, sanitized checks and any controller observations.
This procedure has no observed Ops workflow dispatch, push or deployment result.

**Source:** [family-specific source-run validation](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/.github/workflows/promote-runtime.yaml#L37-L53),
[materialization, scan and artifact](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/.github/workflows/promote-runtime.yaml#L61-L79),
and [Ops direct push versus runtime App and PR](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/.github/workflows/promote-runtime.yaml#L80-L131).

## Change Plan

Record this plan before deployment:

| Item | Required decision |
| --- | --- |
| Scope | Exact roles, charts, data stores, configuration, and credentials |
| Compatibility | Old and new image, contract, schema, and data versions |
| Backup | Completed group and successful isolated restore proof |
| Capacity | Space for old data, new data, backup, migration, and image pulls |
| Order | Infrastructure, migrations, applications, and access changes |
| Stop point | Last condition where no production data changed |
| Irreversible point | First incompatible schema or first accepted new-format write |
| Rollback | Exact compatible release and client routing action |
| Verification | Native checks, application checks, and negative security checks |
| Owner | Operator for execution, rollback, data, security, and acceptance |

Do not start with an undecided irreversible point.

## Render and Compare

Before rendering, [select Prism and check the trust boundary](install.md#select-prism-and-check-the-trust-boundary).
Keep the reviewed exported `KUBECLAW_DEPLOY_PRISM` value in the bound shell.
Render the actual selected configuration:

```bash
assert_cluster_binding
case "$KUBECLAW_DEPLOY_PRISM" in true|false) ;; *) exit 1 ;; esac
./scripts/deploy.sh render nova > "<evidence-dir>/nova.yaml"
./scripts/deploy.sh render buster > "<evidence-dir>/buster.yaml"
if [[ $KUBECLAW_DEPLOY_PRISM == true ]]; then
  ./scripts/deploy.sh render prism > "<evidence-dir>/prism.yaml"
fi
```

Protect rendered files because they can reveal private configuration.

Compare these subjects:

- Image repository and digest.
- Code-bundle commit and contract.
- Service accounts and RBAC.
- Secret references.
- Ports, Services, and network policies.
- PVC names, size, access mode, and StorageClass.
- Resource requests, limits, and scheduling constraints.
- Migration and backup Jobs.
- ConfigMap and Pod-template checksums.

Stop if ownership moves between Helm and Argo without a reviewed transfer.
Two controllers must not manage the same resource.

## GitOps Operation

This section starts with healthy, already Argo-owned Applications. The Git
repository remains the desired-state authority. Treat transfer from an existing
Helm installation as a separate change with a retained resource and data
inventory. The current activation preflight [rejects existing Helm releases,
Helm-owned resources, and unmanaged existing resources](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/scripts/gitops.mjs#L123-L145).
The imperative [ownership guard also rejects claimed namespaces and retained
Argo tracking metadata](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/scripts/gitops-owner.mjs#L14-L27).
Deleting an Application without its workloads does not transfer ownership.

The repository supplies no supported in-place Helm-to-Argo takeover procedure.
Stop before sync or imperative deployment when ownership is mixed or the
platform owner has not supplied a versioned transfer procedure. That procedure
must retain the old desired state and data, stop competing reconciliation,
identify every transferred resource, verify one resulting owner, define the
rollback boundary, and prove health plus application reads. Do not remove Helm
or Argo ownership metadata merely to make a preflight pass.

Before sync, inspect each selected Application:

```bash
assert_cluster_binding
kubectl -n argocd get applications.argoproj.io
kubectl -n argocd get application "<application>" -o yaml
```

Record `spec.source.targetRevision`, `status.sync.revision`, and the operation result revision.
Confirm that the resolved commit equals the intended immutable source.

The current health source handles `targetRevision=main` separately from resolved commit IDs.
It retains source, destination, successful-operation and workload-health checks.
Reuse across different `main` revisions requires the marked immutable bundle path and matching applied-source provenance.

[The continuous GitOps rollout evidence gap](../status/open-issues.md#continuous-gitops-health-still-needs-installed-branch-to-commit-rollout-evidence) remains open.
Source-only reading and declared test cases do not prove the installed rollout, its subsequent wave or stale-operation rejection.

Do not bypass a failed health check by accepting any revision.
Resolve the branch to the intended commit and record both values.

For rollback, revert the reviewed Git change and sync the compatible prior state.
Do not use Argo history rollback while automatic sync can immediately reverse it.

Keep database rollback rules separate from manifest rollback.

### Select a previous GitOps release

The **Roll back production deployment** workflow proposes a selection change;
it does not restore data or prove that the target was healthy. Its `target`
is `previous` or the full 40-character **deployment-selection commit**, not an
image-build commit. `previous` searches first-parent history for a different
`gitops/production/selection.json` directory. The planner rejects an absent
previous selection, the current selection, or a non-ancestor explicit target.
See the [target and history checks](https://github.com/datrab/kubeclaw/blob/557bab463b9ca9a897ea094a86640eacb05090c7/scripts/gitops-rollback.mjs#L14-L29).

Before dispatch, the release owner must verify retained immutable images and
code bundles, compatible data and schema state, unchanged historical bundle
bytes, and the same deployment scope. Complete the release-selection checks
above; their current configuration stop is not cleared by a rollback plan.
The maintainer needs Actions dispatch authority. The repository administrator
must supply the same GitHub App inputs used for promotion, with Contents and
Pull requests write access. Cluster credentials do not supply that authority.

1. In Actions, select **Roll back production deployment**, branch `main`, and
   the reviewed target. Record the run URL and target commit. The workflow
   prepares the plan, verifies release provenance, commits a proposed selection,
   and checks the continuous files before pushing a branch or opening a PR.
   Retain the first failed step; check for an existing branch or PR before retry.
2. Review the proposed `release/rollback-<run-id>-<attempt>` branch against
   `main`. The planner can restore image and code receipts, four
   `releases/values/*.yaml` files, and three production GitOps files. Compare
   every planned member with the committed diff, including a required deletion
   of `releases/runtime-code.json` when the target has no code receipt.
3. **Current workflow limitation:** its [explicit staging list](https://github.com/datrab/kubeclaw/blob/557bab463b9ca9a897ea094a86640eacb05090c7/.github/workflows/rollback-runtime.yaml#L47-L64)
   omits `releases/runtime-code.json`, although the
   [planner can write or remove it](https://github.com/datrab/kubeclaw/blob/557bab463b9ca9a897ea094a86640eacb05090c7/scripts/gitops-rollback.mjs#L45-L51).
   When the target requires a different code receipt or its removal, stop:
   the workflow is not a complete code-selection rollback path. A plan or
   provenance check against uncommitted files does not prove that the proposed
   commit contains them. The release owner must correct and validate that
   publication path before using it for this case; do not bypass the check or
   merge a partial selection.
4. Only after the complete reviewed PR passes its checks may an authorized
   reviewer merge it. Then observe Argo's resolved revision, operation result,
   workload ownership, active image and code identities, and application reads.
   A merged selection is desired state, not proof of completed recovery.

The local checks did not run a rollback workflow, merge a PR, sync Argo or
perform live recovery. A local plan with unchanged code-receipt bytes does not
test the changed-code publication limitation.

## Upgrade Order

Use this order unless a component guide requires a narrower sequence:

1. Verify independent administration and backup access.
2. Complete and verify backups.
3. Rehearse restore with the target tools.
4. Confirm storage and node capacity.
5. Update cluster-level prerequisites before dependent workloads.
6. Update identity, registry, and stateful infrastructure.
7. Run required data migrations.
8. Deploy Nova and Buster role images.
9. Deploy Prism database and application changes in their declared order.
10. Run component smoke and native data checks.
11. Run worker-trust positive and negative checks when trust changed.
12. Compare running image identities and the [observed bundle-manifest identity](#observe-active-role-bundle-manifest-identity) with the accepted receipts.
13. Reopen admission.
14. Retain the old release until the observation window ends.

Do not combine a CNI migration with an unrelated application upgrade.
[Single-node CNI cutover and rollback](../status/open-issues.md#concrete-single-node-cni-cutover-and-independent-rollback-remain-unproved) tracks the missing proof.

## Observe Active Role Bundle-Manifest Identity

Use this read-only observation after the selected deployment, before reopening
admission. Complete [release acquisition](#acquire-a-reviewed-runtime-selection)
and the separate [container identity check](diagnose.md#bind-the-fault-window-to-object-lifetimes) first.
The current checkout's stored selection fails configuration verification, so the
reader stops before any cluster operation here. The procedure does not repair it.

This reader supports only the `kubeclaw` chart's role-gateway profile:
`nova` uses the Nova image, `buster` uses the Buster gateway image, and `prism`
uses the Prism agent image. It does not identify code bundles in Prism Control,
Prism Worker, arbitrary Pods, or an unsupported manifest mount.

Use one explicit kubeconfig, context, namespace, Pod UID, and named container.
Get those identities from the prior independent observation; do not choose a
replacement Pod automatically after a failure. The credentials must permit
Pod reads and execution of the fixed reader in that container. The procedure
runs only `kubectl get` and `kubectl exec`; it does not apply, delete, or restart resources.

Use the already acquired local role archive, not an unverified download.
The program checks its hash against the selected code receipt. It then reads
that archive's manifest without extracting files. It checks the Pod's selected
image, main/init configuration, completed init, and read-only manifest mount.
It hashes the actual manifest in the named container and compares it with the
accepted archive. The same Pod and container lifetime must remain before and
after that read. A container `imageID` remains a recorded runtime identity,
not a universal OCI digest normalization.

The result deliberately distinguishes three facts: the local archive hash,
the init's configured archive hash, and the observed manifest's byte hash.
The init checks the downloaded archive hash and copies the manifest into the
shared runtime-config volume. The main container mounts that volume read-only.
The reader does not observe the old compressed archive inside the running
container, verify every active payload file, or prove which modules the process
loaded. Those result fields stay `false`; do not turn this observation into
runtime, rollout, security, or application acceptance.

Run from the accepted selection checkout with Node, GNU tar, and the selected
kubectl available. The local reader caps its in-memory archive snapshot at
256 MiB and the manifest at 2 MiB. These are reader budgets, not bundle-format limits.
Use a fresh private result directory. Keep raw Pod configuration out of shared logs.

```bash
set -euo pipefail
assert_cluster_binding || exit 126
umask 077
bundle_role='<nova|buster|prism>'
bundle_archive='<absolute-path-to-reviewed-role-archive>'
bundle_kubeconfig="$KUBECONFIG"
bundle_context="$EXPECTED_CONTEXT"
case "$bundle_role" in
  nova|buster) bundle_namespace="$NAMESPACE" ;;
  prism) bundle_namespace="$PRISM_NAMESPACE" ;;
  *) exit 126 ;;
esac
bundle_pod='<observed-pod-name>'
bundle_container='<named-role-gateway-container>'
bundle_uid='<previously-observed-pod-uid>'
bundle_observation_dir=$(mktemp -d)
node --input-type=module - "$bundle_role" "$bundle_archive" "$bundle_kubeconfig" \
  "$bundle_context" "$bundle_namespace" "$bundle_pod" "$bundle_container" "$bundle_uid" \
  > "$bundle_observation_dir/bundle-manifest-identity.json" <<'ACTIVE_BUNDLE_READER'
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const requireObservation = (condition, code) => {
  if (!condition) throw new Error(`ACTIVE_BUNDLE_${code}`);
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function observeActiveRoleBundle({ selection, role, archive, kubeconfig,
  context, namespace, podName, containerName, expectedUid, kubectl = 'kubectl' }) {
  const slot = new Map([['nova', 'nova'], ['buster', 'buster-gateway'], ['prism', 'prism-agent']]).get(role);
  requireObservation(slot && selection?.images?.[slot], 'ROLE_IMAGE_SELECTION_REQUIRED');
  const code = selection.code, bundle = code?.bundles?.[role];
  requireObservation(/^[a-f0-9]{40}$/u.test(code?.commit ?? '')
    && /^[a-f0-9]{64}$/u.test(bundle?.sha256 ?? '')
    && bundle?.contractVersion === 'v2', 'CODE_SELECTION_REQUIRED');
  requireObservation(kubeconfig && context && expectedUid, 'EXPLICIT_AUTHORITY_REQUIRED');
  for (const value of [namespace, podName, containerName]) {
    requireObservation(typeof value === 'string' && /^[a-z0-9][a-z0-9.-]*$/u.test(value), 'EXPLICIT_TARGET_REQUIRED');
  }
  // Hash and inspect the same in-memory archive, not two mutable file reads.
  requireObservation(fs.statSync(archive).size <= 256 * 1024 * 1024, 'LOCAL_ARCHIVE_READER_LIMIT');
  const archiveBytes = fs.readFileSync(archive);
  requireObservation(sha256(archiveBytes) === bundle.sha256, 'ACCEPTED_ARCHIVE_HASH_MISMATCH');
  const expectedBytes = execFileSync('tar', ['-xOzf', '-', `${role}-${code.commit}/manifest.json`],
    { input: archiveBytes, maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  const expected = JSON.parse(expectedBytes.toString('utf8'));
  requireObservation(expected.schemaVersion === 'pipeline-runtime-bundle.v1'
    && expected.bundleKind === 'app-skills-package-set'
    && expected.role === role && expected.commit === code.commit
    && expected.contractVersion === bundle.contractVersion, 'ACCEPTED_MANIFEST_MISMATCH');

  const prefix = [`--kubeconfig=${path.resolve(kubeconfig)}`, `--context=${context}`, `--namespace=${namespace}`];
  const read = args => execFileSync(kubectl, [...prefix, ...args],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const literalEnvironment = (container, name) => {
    const entries = (container.env ?? []).filter(entry => entry.name === name);
    requireObservation(entries.length === 1 && typeof entries[0].value === 'string'
      && !entries[0].valueFrom, 'LITERAL_PROFILE_ENV_REQUIRED');
    return entries[0].value;
  };
  const snapshot = () => {
    const pod = JSON.parse(read(['get', 'pod', podName, '-o', 'json']));
    requireObservation(pod.metadata?.uid === expectedUid && pod.metadata?.name === podName
      && pod.metadata?.namespace === namespace && !pod.metadata.deletionTimestamp, 'POD_IDENTITY_CHANGED');
    const mains = (pod.spec?.containers ?? []).filter(item => item.name === containerName);
    const inits = (pod.spec?.initContainers ?? []).filter(item => item.name === 'init-setup');
    const statuses = (pod.status?.containerStatuses ?? []).filter(item => item.name === containerName);
    const initStatuses = (pod.status?.initContainerStatuses ?? []).filter(item => item.name === 'init-setup');
    requireObservation(mains.length === 1 && inits.length === 1
      && statuses.length === 1 && initStatuses.length === 1, 'EXACT_CONTAINERS_REQUIRED');
    const main = mains[0], init = inits[0], status = statuses[0], initStatus = initStatuses[0];
    requireObservation(main.image === selection.images[slot] && init.image === selection.images[slot], 'REQUESTED_IMAGE_MISMATCH');
    requireObservation(status.state?.running && status.containerID && status.imageID
      && Number.isSafeInteger(status.restartCount) && initStatus.state?.terminated?.exitCode === 0
      && initStatus.containerID && initStatus.imageID, 'RUNNING_CONTAINER_AND_COMPLETED_INIT_REQUIRED');
    for (const [name, value] of Object.entries({ KUBECLAW_CODE_BUNDLE_ENABLED: 'true',
      KUBECLAW_CODE_BUNDLE_AGENT: role, KUBECLAW_CODE_BUNDLE_EXPECTED_COMMIT: code.commit,
      KUBECLAW_CODE_BUNDLE_CONTRACT_VERSION: bundle.contractVersion,
      KUBECLAW_CODE_BUNDLE_MANIFEST: '/runtime-config/code-bundle-manifest.json' })) {
      requireObservation(literalEnvironment(main, name) === value, 'MAIN_PROFILE_MISMATCH');
    }
    for (const [name, value] of Object.entries({ CODE_BUNDLE_ENABLED: 'true', CODE_BUNDLE_ARCHIVE_URL: bundle.url,
      CODE_BUNDLE_SHA256: bundle.sha256, CODE_BUNDLE_EXPECTED_COMMIT: code.commit,
      CODE_BUNDLE_CONTRACT_VERSION: bundle.contractVersion, AGENT_NAME: role })) {
      requireObservation(literalEnvironment(init, name) === value, 'INIT_PROFILE_MISMATCH');
    }
    const manifestMount = (main.volumeMounts ?? []).filter(item => item.mountPath === '/runtime-config');
    const initMount = (init.volumeMounts ?? []).filter(item => item.mountPath === '/runtime-config');
    requireObservation(manifestMount.length === 1 && initMount.length === 1
      && manifestMount[0].readOnly === true && manifestMount[0].name === initMount[0].name
      && !manifestMount[0].subPath && !initMount[0].subPath, 'READONLY_SHARED_MANIFEST_PROFILE_REQUIRED');
    const volume = (pod.spec.volumes ?? []).filter(item => item.name === manifestMount[0].name);
    requireObservation(volume.length === 1 && volume[0].emptyDir, 'INIT_MANIFEST_VOLUME_REQUIRED');
    return { uid: pod.metadata.uid, podName, namespace, containerName, requestedImage: main.image,
      imageID: status.imageID, containerID: status.containerID, restartCount: status.restartCount,
      startedAt: status.state.running.startedAt ?? null, initContainerID: initStatus.containerID, initImageID: initStatus.imageID,
      initFinishedAt: initStatus.state.terminated.finishedAt ?? null };
  };
  const before = snapshot();
  const remoteProgram = `
    const fs = require('node:fs'), crypto = require('node:crypto');
    try {
      const file = process.argv[1];
      if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()
        || fs.statSync(file).size > 2 * 1024 * 1024) throw new Error();
      const bytes = fs.readFileSync(file), manifest = JSON.parse(bytes.toString('utf8'));
      process.stdout.write(JSON.stringify({ schemaVersion: manifest.schemaVersion,
        bundleKind: manifest.bundleKind, role: manifest.role, commit: manifest.commit,
        contractVersion: manifest.contractVersion,
        manifestSha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
    } catch { process.stderr.write('ACTIVE_BUNDLE_MANIFEST_READ_FAILED'); process.exitCode = 1; }
  `;
  const observed = JSON.parse(read(['exec', podName, '-c', containerName, '--', 'node', '-e', remoteProgram,
    '/runtime-config/code-bundle-manifest.json']));
  requireObservation(observed.schemaVersion === expected.schemaVersion && observed.bundleKind === expected.bundleKind
    && observed.role === role && observed.commit === code.commit && observed.contractVersion === bundle.contractVersion
    && observed.manifestSha256 === sha256(expectedBytes), 'OBSERVED_MANIFEST_MISMATCH');
  const after = snapshot();
  requireObservation(JSON.stringify(before) === JSON.stringify(after), 'CONTAINER_CHANGED_DURING_OBSERVATION');
  return { schemaVersion: 'kubeclaw-active-bundle-manifest-observation.v1', context, ...after,
    role, codeCommit: code.commit, contractVersion: bundle.contractVersion,
    sourceRunId: code.sourceRunId, sourceRunAttempt: code.sourceRunAttempt,
    acceptedArchiveSha256: bundle.sha256, localArchiveHashVerified: true,
    initConfiguredArchiveHashMatches: true, observedManifestSha256: observed.manifestSha256,
    manifestMatchesAcceptedArchive: true, liveArchiveBytesObserved: false,
    fullActivePayloadVerified: false, loadedModuleIdentityProven: false };
}

if (process.argv[1] === '-') {
  try {
    const [role, archive, kubeconfig, context, namespace, podName, containerName, expectedUid] = process.argv.slice(2);
    const { selectedRelease } = await import(pathToFileURL(path.resolve('scripts/updates/deployment-release.mjs')).href);
    const selection = selectedRelease(process.cwd(), 'runtime');
    const observation = observeActiveRoleBundle({ selection, role, archive, kubeconfig,
      context, namespace, podName, containerName, expectedUid });
    console.log(JSON.stringify(observation, null, 2));
  } catch (error) {
    const message = typeof error?.message === 'string' && /^ACTIVE_BUNDLE_[A-Z_]+$/u.test(error.message)
      ? error.message : 'ACTIVE_BUNDLE_SELECTION_OR_READER_FAILED';
    console.error(message); process.exitCode = 1;
  }
}
ACTIVE_BUNDLE_READER
```

On exit zero, retain the result with the change record and the accepted receipt's
source run and attempt. The report contains only selected identities and hashes,
not the complete Pod environment or bundle manifest. A changed UID, container,
restart count, requested image, reserved configuration, or manifest causes rejection.
Do not reopen admission on a rejected observation or rerun against another Pod
without establishing that new identity separately.

`ACTIVE_BUNDLE_SELECTION_OR_READER_FAILED` does not prove a missing receipt.
It can also mean configuration drift, an unavailable tool, malformed input, or
another local reader failure. Recheck the read-only selection and tool prerequisites.
A specific `ACTIVE_BUNDLE_*_MISMATCH` or profile failure identifies the failed
comparison; it does not authorize changing the selected receipt or live workload.

> **Source evidence — bundle identity observation boundaries**
>
> **Claim:** The reader compares one observed role manifest with the locally accepted archive and records the same container lifetime on both sides.
>
> **Implementation:** [The init checks the archive hash and copies the manifest](https://github.com/datrab/kubeclaw/blob/2384072a8103b187a588862b90784868ce3661b2/charts/kubeclaw/templates/deployment.yaml#L1090-L1157); [the main container mounts runtime-config read-only](https://github.com/datrab/kubeclaw/blob/2384072a8103b187a588862b90784868ce3661b2/charts/kubeclaw/templates/deployment.yaml#L1485-L1495).
>
> **Contract or setting:** [selectedRelease preserves configuration and code-selection checks](https://github.com/datrab/kubeclaw/blob/2384072a8103b187a588862b90784868ce3661b2/scripts/updates/deployment-release.mjs#L32-L44). [The code receipt binds role, archive hash, contract, and source run](https://github.com/datrab/kubeclaw/blob/2384072a8103b187a588862b90784868ce3661b2/scripts/updates/code-release.mjs#L6-L18).
>
> **Test evidence:** Local synthetic fixture checks cover all three roles, identity changes, incorrect manifests, input/configuration failures, and selection stops. No cluster result follows from those fixtures.
>
> **Revision:** `2384072a8103b187a588862b90784868ce3661b2`.
>
> **Limit:** Manifest identity is not active archive-byte observation, a full payload check, or loaded-module identity. The current release-configuration rejection remains a stop.

## Stateless Role Upgrade

Upgrade one role first when compatibility permits:

```bash
assert_cluster_binding
./scripts/deploy.sh agent nova
./scripts/deploy.sh smoke-agent nova
```

Then inspect the running identity:

```bash
assert_cluster_binding
kubectl -n "$NAMESPACE" get deployment agent-nova -o jsonpath='{.spec.template.spec.containers[*].image}{"\n"}'
kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/instance=agent-nova -o jsonpath='{range .items[*]}{.status.containerStatuses[*].imageID}{"\n"}{end}'
```

Repeat for Buster after Nova verification.

Use atomic Helm deployment results as one signal.
Still verify application health and durable state.

## Stateful Service Upgrade

Each stateful service requires its own recorded plan. Apply the common sequence below, then use the service-specific verification and rollback boundary in [Recovery](recovery.md).

The common safe sequence is:

1. Inventory every writer and reader.
2. Back up and verify the source.
3. Restore into an isolated target.
4. Verify native and application reads.
5. Fence source writes and drain connections.
6. Apply the declared migration.
7. Switch clients once.
8. Verify data and application behavior.
9. Record the first new-format write.
10. Keep the old store read-only until rollback expiry.

Never run old and new writers against one store unless the contract permits it.

## Prism Upgrade

Prism separates application rollback from database rollback.
An application rollback is safe only while its schema remains compatible.

Before the change:

```bash
assert_cluster_binding
./scripts/deploy.sh prism-status
kubectl -n "$PRISM_NAMESPACE" get cronjob,job,pvc
kubectl -n "$PRISM_NAMESPACE" get deployment,statefulset -o wide
```

After the change:

```bash
assert_cluster_binding
./scripts/deploy.sh prism-smoke
kubectl -n "$PRISM_NAMESPACE" get jobs -l app=prism-migrate
kubectl -n "$PRISM_NAMESPACE" logs job/prism-migrate --all-containers
```

The Helm hook can delete the successful migration Job.
Capture its logs during deployment when migration evidence is required.

Open one real project and baseline before accepting the upgrade.

## Rollback Decision

Choose by data state:

| State | Permitted response |
| --- | --- |
| No mutation began | Return to previous manifests or images |
| Compatible additive migration | Roll back only when both versions support the schema |
| Incompatible migration, no new writes | Restore the verified pre-change backup or follow declared reverse migration |
| Incompatible migration with new writes | Do not image-roll back; use forward repair or an approved data-loss decision |
| External effect accepted | Reconcile the effect before retry or rollback |
| Credential rotation partly complete | Finish dual-trust transition or restore the exact old trust set |

Record why the selected path preserves accepted data.

## Credential Rotation

Inventory every producer and consumer before rotation.
Group credentials by purpose:

- Kubernetes administrator and emergency access.
- GitHub and registry access.
- Git deploy keys and code-bundle reader.
- OpenClaw gateway and provider tokens.
- PostgreSQL roles and database URLs.
- Tailscale OAuth and auth keys.
- Pipeline source-attestation keypair.
- Prism runtime and database credentials.
- Ops Pod MCP bearer and optional GitHub token.

Use this sequence:

1. Create the new credential in its external authority.
2. Add dual trust only when the consumer supports it.
3. Update one consumer group.
4. Verify positive access with the new identity.
5. Verify denied access for an unrelated identity.
6. Move every remaining consumer.
7. Revoke the old credential.
8. Verify old access now fails.
9. Remove temporary files and old Secret keys.
10. Record rotation time and affected workloads.

Do not rotate the one-active-key source-attestation pair during active dispatch.
The current design needs a maintenance window.

## Certificate and SPIRE Rotation

An [SVID (SPIFFE Verifiable Identity Document)](../reference/glossary.md#svid)
is a workload credential. These deployed paths use a short-lived X.509
certificate that contains the workload's SPIFFE identity. Observe its expiry
and the certificate authority (CA) expiry before the maintenance window.
Verify SPIRE server persistence and CSI readiness.
After rotation, verify identity and application permission separately. A valid
SVID does not grant application permission; retain both the positive authorized
request and the negative wrong-identity result.

Use the [Worker Trust runbook](worker-trust.md) for the detailed sequence.

The complete expiry and restore contract remains open.
[SPIRE persistence, certificate lifetime and recovery](../status/open-issues.md#spire-persistence-certificate-lifetime-and-recovery-contract-is-incomplete) tracks that work.

## Registry and BuildKit Maintenance

Prepare BuildKit, the Buster runtime, and Kubernetes node pulls from the same
registry contract. A projection is a client configuration file derived from
that contract. Different endpoint, trust, or credential choices between clients
can let a build succeed while the node cannot pull its result.

### Prepare the client projections

Start in `<repository-root>` on the administration machine after locked
installation of repository dependencies and successful release/configuration
preflight. Use the reviewed Buster render from [Render and Compare](#render-and-compare)
or the install render. `<buster-render-file>` is that protected YAML file.
`<new-registry-preparation-dir>` is a new private directory outside Git and the
incident evidence directory. It will contain a node file with credentials.

The registry owner must first supply a node-reachable origin, DNS, HTTPS, the
credential authority, and an owned storage/backup process. Select these inputs
in `runtimeInfrastructure.registry`: `endpoint`, `transport`, `authSecretName`,
`usernameKey`, and `passwordKey`. A private CA also needs `caSecretName`,
`caSecretKey`, and the absolute host path `nodeCaFile`. The render maps the
worker's CA path separately. Configure `runtimeInfrastructure.dockerHubMirror`
only when the cache owner supplies its distinct origin, transport, and trust.
An omitted or explicitly empty mirror disables that route. The writable
registry and the mirror must have different hosts. Credentials require HTTPS;
`http-lab` permits anonymous access only in the controlled lab.

The [chart builds `registry-clients.v1` and credential references from these
settings](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/charts/kubeclaw/templates/_registry-clients.tpl#L15-L44).
It rejects unsafe transport, incomplete trust, and competing sidecar settings.
Ask the credential authority to inject the same selected username and password
into `KUBECLAW_REGISTRY_USERNAME` and `KUBECLAW_REGISTRY_PASSWORD` in this
restricted shell, without placing values in command arguments, Git, or logs.
Do not retrieve or print Kubernetes Secret contents for this task.

Extract the contract from exactly one rendered Buster runtime container and
produce three new files. These commands write local files only:

```bash
umask 077
export BUSTER_RENDER_FILE="<buster-render-file>"
export REGISTRY_PREP_DIR="<new-registry-preparation-dir>"
test -f "$BUSTER_RENDER_FILE" && test ! -L "$BUSTER_RENDER_FILE"
test ! -e "$REGISTRY_PREP_DIR"
mkdir -m 0700 "$REGISTRY_PREP_DIR"
node --input-type=module - "$BUSTER_RENDER_FILE" \
  "$REGISTRY_PREP_DIR/registry-clients.json" <<'NODE'
import fs from 'node:fs';
import { parseAllDocuments } from 'yaml';
const [renderFile, outputFile] = process.argv.slice(2);
const documents = parseAllDocuments(fs.readFileSync(renderFile, 'utf8'));
if (documents.some(document => document.errors.length)) throw new Error('rendered YAML is invalid');
const containers = documents.map(document => document.toJSON())
  .filter(document => document?.kind === 'Deployment')
  .flatMap(document => document.spec?.template?.spec?.containers ?? [])
  .filter(container => container.name === 'buster-v2-runtime');
if (containers.length !== 1) throw new Error('one rendered Buster runtime is required');
const entries = (containers[0].env ?? []).filter(entry => entry.name === 'KUBECLAW_REGISTRY_CONFIG');
if (entries.length !== 1 || typeof entries[0].value !== 'string') {
  throw new Error('one literal rendered registry contract is required');
}
const contract = JSON.parse(entries[0].value);
if (contract.schemaVersion !== 'registry-clients.v1') throw new Error('wrong registry contract version');
fs.writeFileSync(outputFile, `${JSON.stringify(contract)}\n`, { flag: 'wx', mode: 0o600 });
NODE
for registry_output in buildkit runtime node; do
  node scripts/registry-client-config.mjs "$REGISTRY_PREP_DIR/registry-clients.json" \
    "$registry_output" "$REGISTRY_PREP_DIR/$registry_output.config"
done
node --input-type=module - "$REGISTRY_PREP_DIR" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { registryClientConfig } from './scripts/registry-client-config.mjs';
const directory = process.argv[2];
const bytes = name => fs.readFileSync(path.join(directory, name));
const contract = JSON.parse(bytes('registry-clients.json'));
const expected = registryClientConfig(contract, process.env);
assert.equal(bytes('buildkit.config').toString(), expected.buildkit);
assert.deepEqual(JSON.parse(bytes('runtime.config')), expected.runtime);
assert.deepEqual(JSON.parse(bytes('node.config')), expected.node);
const files = ['registry-clients.json', 'buildkit.config', 'runtime.config', 'node.config'];
for (const name of files) {
  const file = fs.lstatSync(path.join(directory, name));
  assert.ok(file.isFile() && !file.isSymbolicLink());
  assert.equal(file.mode & 0o777, 0o600);
}
console.log(JSON.stringify({ registryOrigin: expected.runtime.registryBaseUrl,
  registryReference: expected.runtime.registryReference,
  mirrorOrigin: contract.dockerHubMirror?.endpoint || null,
  contractDigest: 'sha256:' + crypto.createHash('sha256').update(bytes('registry-clients.json')).digest('hex'),
  projectionDigests: Object.fromEntries(files.slice(1).map(name =>
    [name, 'sha256:' + crypto.createHash('sha256').update(bytes(name)).digest('hex')])),
  privateModesVerified: true, scope: 'local-client-generation' }));
NODE
```

Expected observation: every command exits zero, all four files have mode
`0600`, and the final non-secret report identifies the selected origin,
reference, optional mirror, contract digest, and projection digests. Retain
that report, tool versions, render digest, command exit statuses, and the
external credential-authority reference. Store the generated node file only
with its credential authority; never copy its contents into evidence.
The [generator validates clients and authentication](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/scripts/registry-client-config.mjs#L23-L54)
and [writes private new files without overwriting them](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/scripts/registry-client-config.mjs#L98-L118).

Stop on a missing release/render, absent or duplicate runtime container,
invalid JSON/YAML, implicit or contradictory transport, missing credential,
incomplete trust pair, shared writable/cache host, existing output, or differing
projection. Preserve only the sanitized failure and input digest. Correct the
owned Helm input or credential source, render again, and start in a new output
directory. Do not patch the generated files.

### Install and prove the selected clients

| Client | Implemented configuration path | Remaining operator proof |
| --- | --- | --- |
| BuildKit and Buster | The deployed entrypoint regenerates its BuildKit TOML and runtime JSON from the same rendered contract, then starts BuildKit with that TOML. | Verify the selected immutable workload and CA mount, authenticated build/push, manifest digest read, and Buster evidence import. |
| Kubernetes node/K3s | The generator produces `node.config` as JSON, which is also valid YAML. It contains registry routing, node CA paths, and credentials. | The platform owner must install it on every selected node, install matching CA bytes, perform the platform's reload/restart, and prove an uncached CRI pull of the selected digest. |
| Mirror | Client generation routes `docker.io` to the optional selected cache. | Separately prove warm pull, cold pull, cache storage/retention, and the selected outage policy. |

The [entrypoint creates and consumes the worker projections](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/docker/buster-runtime-entrypoint.sh#L11-L31).
The [node example explicitly selects no registry or mirror and states the
installation limit](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/my-values/infra/k3s-registries.yaml#L1-L7).
Local generation does not install a node configuration, provision its DNS,
TLS, or authentication, or prove a cold pull. This repository supplies no
complete node installation, restart, rollback, or uncached-pull procedure.
Stop before node installation or new runtime deployment when the platform owner
has not provided a versioned procedure for those steps. It must name each node,
existing configuration backup, destination, CA authority, restart effect,
immutable test image, cold-pull observation, rollback, and cleanup. This limit
must be removed by a maintained node procedure and a recorded per-node cold
pull; changing the generator alone does not remove it.

After all platform prerequisites pass, use the healthy and recovery
[Registry/BuildKit exercise](diagnose.md#registry-endpoint-unavailable-during-buildkit-push)
to prove the runtime build path. Its receipt verifies push and manifest identity;
retain a separate node pull result. Neither `/v2/` nor a cached pull proves the
complete path. Before activation, recovery is to discard only the new local
projection directory and retain the previous client configuration. After node
activation, use the platform's exact prior configuration and restart procedure;
reconcile a possibly completed push before another build.

After retained proof or a safe stop, unset the injected registry credentials
and remove only `$REGISTRY_PREP_DIR` through the credential owner's disposal
policy. Confirm that directory is absent. Do not delete the reviewed render,
registry data, image receipts, or existing node configuration as preparation
cleanup.

### Preserve image lifetime during collection

Before garbage collection:

1. Stop registry writers.
2. Record referenced manifests and release receipts.
3. Verify storage backup.
4. Use exclusive registry maintenance.
5. Pull every retained selected digest after collection.
6. Test cached and uncached client paths separately.

Do not claim an online cache miss proves outage behavior.

Long-lived rootless BuildKit isolation remains incomplete.
[The BuildKit job-specific process boundary](../status/open-issues.md#long-lived-rootless-buildkit-lacks-a-job-specific-process-boundary) remains open.

## Capacity and Retention

Use the [canonical capacity and retention procedure](capacity.md#canonical-capacity-and-retention-procedure).
This page defines no second cleanup path.

## Security Rescan

Run the release security process against selected immutable digests.
Record scanner version and advisory database identity.

Do not classify every failed rescan as a confirmed vulnerability.
Scanner errors and missing release selections also fail the job.

[The release security rescan issue](../status/open-issues.md#release-security-rescan-needs-attention) tracks the unresolved result.

## Controlled Retirement

Retirement is a data and access operation, not only a Helm uninstall.

### 1. Inventory ownership and retained evidence

Capture the exact local scope before changing access:

```bash
assert_cluster_binding
kubectl --context "<context>" -n "$NAMESPACE" get \
  deploy,statefulset,daemonset,job,cronjob,svc,ingress,pvc,configmap,secret,serviceaccount,role,rolebinding,networkpolicy,ciliumnetworkpolicy \
  -o name > "<evidence-dir>/namespaced-resources-before.txt"
helm list -n "$NAMESPACE" > "<evidence-dir>/helm-before.txt"
```

Add cluster-scoped SPIRE registrations, admission policy, DNS, Tailnet, OAuth,
registry, GitHub, backup, monitoring, external volumes, Ops namespace, and
credential identities to the inventory using each owning authority. Confirm the
application namespace is dedicated. Preserve audit records and their reader,
location, retention end date, and destruction owner before revoking access.

Stop if a resource is unregistered, shared, ownerless, or selected evidence
depends on the namespace that would be deleted.

#### Establish the complete deletion window

Before any removal, the platform and storage owners must establish and verify
an externally enforced exclusion for the complete deletion window. It must
prevent recreation of the original namespace, replacement of a PVC or PV under
a reused name, new PVC creation, new provisioning, rebinding, and competing
configuration or retention changes. Identify every administrator, controller,
operator and desired-state reconciler that can make those changes. Their owners
must restrict or suspend those actions and reconcile in-progress provisioning
before approving removal. Keep storage deletion controllers available to
complete approved disposal. Record the enforcement method, owners, affected
identities, start time, checks that prove exclusion, and loss-of-exclusion stop
condition. Stopping application writers alone does not establish this window.

Preserve an independently approved original inventory outside the target
namespace and storage. For each namespace, retain its name and UID. For every
PVC, retain its name, namespace, UID, bound PV name and storage class. For each
bound PV, retain its name, UID, complete claim reference (namespace/name/UID),
reclaim policy, driver and provider asset identity. The storage owner supplies
non-CSI and Pending-claim identities, reconciliation of in-progress allocation,
and exact provider observation procedures; an absent PV does not prove that no
asset exists. Retain provider snapshots, replicas and backup/export identities
with each data owner's separate retain/delete approval and recovery scope.
The names-only resource listing above is discovery, not this identity record.

Immediately before removal, capture current identities in new evidence files
through the owning authorities. Compare the full namespace/PVC/PV sets, UIDs,
bindings, policies and provider assets with the approved original inventory.
Review controller-driven version or disposition changes with both owners.
Stop for a new or replacement object, changed binding, incomplete inventory,
failed read, missing provider proof, or any unapproved data scope. Require a new
reviewed plan rather than expanding the deletion set. These comparisons are
non-atomic observations: they do not make a later name-based delete safe by
themselves. The externally enforced exclusion must remain proven during all
removal, uncertain-result reconciliation and final independent verification.

If either owner cannot prove or maintain that exclusion, do not run `teardown`
or `teardown-all`. Keep the data and evidence. The owners must supply a separate
exact-resource procedure that protects each original identity at the destructive
request, covers backing assets and dependent resources, states required rights,
and provides independent read-back and recovery. There is no universal fence
or provider cleanup command in this repository. Broad removal can resume only
after both owners qualify the exclusion and unchanged approved identities;
an alternative can proceed only after its own identity and recovery proof.

### 2. Restrict exposure and stop new work

Disable public or Tailnet admission, new pipeline/project admission, scheduled
jobs, and external writers through their owning authorities. Revoke interactive
access that is no longer needed, while retaining one independent emergency
administrator until verification finishes.

The repository has no generic command for DNS, OAuth, Tailnet, GitHub, registry,
backup, or monitoring authorities. Record each authority's exact command and
receipt in the plan. Stop if any required authority-specific operation is
missing; do not delete workloads first and leave reachable unmanaged access.

### 3. Resolve existing work

Let safe work finish.
Reconcile external effects.
Record blocked work and its evidence.

The CLI has no separate cancel command.
Use the approved incident boundary for necessary containment.

### 4. Export and back up

Create final verified backups for every authoritative store.
Copy them to the retained independent destination.

Export release receipts, configuration digests, decisions, and audit records.
Keep credentials in their separate authority.

Re-run integrity and the supported isolated component restore before deletion.
Stop if a final group or its encryption/key authority is incomplete.

### 5. Revoke workload identities and external resources

After work is quiescent and evidence is independently readable, revoke workload
credentials, SPIRE registrations, deploy keys, provider tokens, registry write
access, and application-specific DNS or exposure. Remove external resources only
through their owners. Keep backup-reader identity until retention ends.

Verify each revoked identity is denied and every intentionally retained reader
still works. An unknown revocation result is a stop condition.

### 6. Remove workloads by scope

Choose one command for the intended scope.
Do not run these commands as a sequence.

| Command | Removes | Keeps | Required decision |
| --- | --- | --- | --- |
| `./scripts/deploy.sh teardown-agents` | Nova and Buster Helm releases | Infrastructure, namespace, Secrets, and PVCs | Confirm that no run or external effect remains active or uncertain |
| `./scripts/deploy.sh teardown-prism` | Prism and Prism-agent Helm releases | Namespace, Secrets, and kept Prism PVCs | Confirm that Prism admission and writes have stopped |
| `./scripts/deploy.sh teardown` | Agents, selected infrastructure, Prism when enabled, and **every PVC left in the application namespace** | Namespace, Secrets, and separately applied PostgreSQL recovery CronJob, ConfigMaps and CiliumNetworkPolicies; other objects outside the removal list can also remain | Confirm final verified backups, approve application-data deletion, and approve removal or explicit retention of remaining objects |
| `./scripts/deploy.sh teardown-all` | The complete application namespace and every resource in it | Nothing in that namespace | Approve final namespace, Secret, and remaining-state deletion |

`teardown` is destructive even though it keeps the namespace and Secrets.
After other removals, `cleanup_leftover_pvcs()` enumerates and deletes all remaining PVCs
by name without a UID precondition, including claims retained by
a Helm keep policy. A new claim can enter that later set; a replacement with
the same name can pass a names-only precheck. `teardown-all` deletes the
namespace by name without a UID precondition. Freezing shell namespace strings
and kubeconfig does not freeze object lifetimes. Both broad commands require
the complete deletion-window exclusion and original/current comparisons above.
Stop before confirmation if any PVC lacks a verified final backup and a named destruction approval.

When PostgreSQL recovery was installed, `teardown` does not remove these
separately applied objects:

| Kind | Name | Consequence of retention |
| --- | --- | --- |
| CronJob | `litellm-postgresql-backup` | The backup schedule remains; suspension does not delete it |
| ConfigMap | `litellm-postgresql-backup-settings` | Recovery configuration remains |
| ConfigMap | `litellm-postgresql-backup-script` | Recovery script remains |
| CiliumNetworkPolicy | `litellm-postgresql-backup` | Backup-workload network rules remain |
| CiliumNetworkPolicy | `litellm-postgresql-backup-database` | Database ingress rules remain |

A ConfigMap stores workload configuration. A CiliumNetworkPolicy selects
Cilium network access rules. These objects are applied separately from the
PostgreSQL Helm release. Uninstalling that release does not remove them. The
backup PVC `litellm-postgresql-backup` is still included in the remaining-PVC
deletion. A retained schedule cannot continue backup work after its volume and
database are removed.

Before approving that PVC deletion, the database and platform owners must
record the recovery objects' actual names, namespaces, creating UIDs, ownership,
suspension state and dependent Jobs/Pods in the signed inventory. Complete the
final independent backup, export, integrity and restore proof in step 4 first.
Choose explicit retention or owner-approved removal for each object. For
retention, record the purpose, suspended schedule, reader, deadline and eventual
removal owner. For removal, the owners must supply the exact identity-checked
commands, required rights and independent named read-back procedure. Stop if
that procedure or any ownership decision is missing; this page supplies no
unconditional name-based deletion command. Reconcile existing backup Jobs and
Pods before removal and verify their selected retained or absent state.

After `teardown`, use that approved procedure to remove only the recorded
remaining objects, or verify their explicit retained state. A denied read,
timeout, changed UID or unexpected object stops verification. Preserve the
inventory and failed output for the owner; do not repeat `teardown` to remove
objects that it does not select.

Before selecting the command, both owners must confirm the active exclusion,
current identity comparison and independently approved data/backup scope.
Reassert the bound cluster and exact namespace values immediately before the
command. Do not change the kubeconfig's current context here:

```bash
assert_cluster_binding
test "<context>" = "$EXPECTED_CONTEXT"
test "$NAMESPACE" = "<namespace>"
test "$PRISM_NAMESPACE" = "<prism-namespace>"
assert_cluster_binding
kubectl -n "$NAMESPACE" get pvc
```

Expected observation: the binding assertion succeeds and PVC names agree with
the signed inventory. This listing supplements the mandatory UID, binding and
provider-asset comparison; it cannot authorize deletion by itself. Abort the
prompt on any difference or loss of exclusion. A prompt protects only against
accidental invocation; it does not prove identity, exclusion, ownership or backup.

After `teardown`, verify that no PVC remains and review the retained Secrets
and recovery objects:

```bash
assert_cluster_binding
kubectl -n "$NAMESPACE" get pvc
kubectl -n "$NAMESPACE" get secrets
kubectl -n "$NAMESPACE" get cronjob,job,pods,configmap,ciliumnetworkpolicy
```

Run `teardown-all` only with separate final namespace deletion approval, the
unchanged original namespace UID and the still-proven complete exclusion:

```bash
assert_cluster_binding
./scripts/deploy.sh teardown-all
```

That command destroys the namespace and included state.

> **Source evidence — teardown scopes**
>
> **Claim:** `teardown-agents` and `teardown-prism` remove bounded workload releases. `teardown` keeps the namespace, Secrets and separately applied PostgreSQL recovery CronJob, ConfigMaps and CiliumNetworkPolicies, but deletes every remaining PVC, including the backup PVC. `teardown-all` deletes the namespace.
>
> **Implementation:** [The bounded agent teardown uninstalls only Nova and Buster](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L2692-L2699). [The cleanup helper re-enumerates remaining PVC names and deletes without UID preconditions](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L2780-L2791). [The namespace branch deletes the complete namespace](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L2806-L2817).
>
> [Infrastructure removal selects specific releases and manifests](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/scripts/deploy.sh#L2749-L2778); [installation applies recovery resources separately](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/scripts/deploy.sh#L1151-L1162).
>
> **Contract or setting:** [`KUBECLAW_DEPLOY_PRISM` decides whether broad teardown first uninstalls Prism](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L2828-L2838).
>
> [The recovery renderer defines the CronJob](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/scripts/render-postgresql-recovery.mjs#L61-L81), [both policies](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/scripts/render-postgresql-recovery.mjs#L84-L97), and [both ConfigMaps plus the backup PVC](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/scripts/render-postgresql-recovery.mjs#L116-L120).
>
> **Test evidence:** Local synthetic execution of the exact teardown helpers issues backup-PVC deletion and no deletion of these five recovery objects. No repository test executes destructive PVC deletion against a live namespace. The documented command paths are protected by a regression check.
>
> **Revision:** Checked at `430633accc4a374a740b5f12f384eeeb9dce228d`; `2a8558d795054d25aa4b72dbdc296c9321ba38f6`; the older deploy links contain the same complete file.
>
> **Limit:** The available static evidence does not prove successful cleanup, backup integrity, external-resource removal, or data-destruction approval in a live environment.

### 7. Verify retirement and cleanup

```bash
assert_cluster_binding
kubectl --context "<context>" get namespace "<namespace>" --ignore-not-found
kubectl --context "<context>" -n "$NAMESPACE" get \
  deploy,statefulset,daemonset,job,cronjob,svc,ingress,pvc,configmap,secret,serviceaccount,role,rolebinding,networkpolicy,ciliumnetworkpolicy \
  --ignore-not-found
helm list -n "$NAMESPACE"
```

Keep the exclusion active. Read back every original namespace/PVC/PV identity,
binding and provider asset through successful independently retained owner
observations. Distinguish original absence, an original terminating object and
a replacement UID; any replacement or unexpected claim is a stop, not a new
removal target. Kubernetes absence does not prove provider erasure. Obtain the
storage owner's disposal or retention receipt for every original asset and
reconcile in-progress provisioning before accepting completion.

For `teardown-all`, expected namespace output is empty. For a narrower command,
expected retained objects must match its `Keeps` column and the signed retained
inventory, including all ConfigMaps and CiliumNetworkPolicies and the recovery
CronJob and its Jobs/Pods. A resource-list error does not establish absence.
Verify external DNS/exposure is absent, revoked identities are
denied, monitoring and backup schedules have the selected retained/removed
state, and retained backups still pass integrity and reader checks.

Record the retention end date and destruction owner for remaining data.
Both owners may release the exclusion only after final independent verification
and all uncertain outcomes are reconciled. Remove temporary administration
credentials only after that verification.
If local deletion fails partially, do not repeat the broad command blindly;
compare actual state with the before inventory and remove only an owned exact
resource. Deleted PVC or namespace state is recoverable only from verified
backup media.

## Evidence to Retain

- Change plan and approvals.
- Old and new release selections.
- Rendered diff and private-overlay digest.
- Completed backup and restore proof.
- Migration output and irreversible-point record.
- Running image IDs and active bundle commits.
- Positive and negative credential checks.
- Rollback decision and result.
- Final data export and retirement inventory.
- Revocation and cleanup verification.

## Central Ops MCP Maintenance Update

For the 2026-10-22 central service, follow the [MCP provisioning and rotation contract](../understand/ops-mcp.md#provisioning-rotation-and-gitops).
Ops chart/image selection and Nova/Buster runtime-bundle selection are separate.
The `codex-ops` child Application keeps manual sync to protect the active
workspace; a runtime rollout does not imply that the Ops application was synced.
Use a full Ops sync for provisioning hooks, then verify the separate MCP Pod.

Maintain distinct client tokens and the retained private CA. Daily leaf renewal
is separate from bearer revocation and coordinated CA replacement. The native
adapter rereads token/CA files per call; the MCP rereads policy/token files.
Refresh Codex processes or shells that inherited an old bearer environment.
Do not record token values in a change record.

After runtime promotion, verify each application and Pod, then native tool
discovery and a denied out-of-scope call. A healthy Pod alone is insufficient.
Inspect startup Doctor diagnostics, progress and restart counts before
classifying a slow startup as a connector failure. No measured database-size
or rollout-time observation is established here; do not infer a timeout or
skip integrity checks.
