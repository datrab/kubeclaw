# Back Up and Recover

Status: executable component backups and native restore primitives; no self-contained isolated LiteLLM, external Prism, or full-platform operator restore
Audience: platform operator, database operator, incident responder
Owner: platform operations and data owners
Evidence: charts/prism/files/prism-backup.sh; scripts/postgresql-recovery.sh; docs/status/open-issues.json
Applies to: current selected runtime and state formats
Last verified: 2026-10-12; local identity, selection, and snippet guards only; no live restore result is available

## Objective

Protect every authoritative state before loss and restore it without broken references.
Finish only after application readers verify the restored data.

The [recovery point objective (RPO)](../reference/glossary.md#rpo) is the maximum
data-loss time window that the data owner approves. The
[recovery time objective (RTO)](../reference/glossary.md#rto) is the maximum
recovery duration that the service owner approves. These are targets. Actual
data loss and elapsed recovery time are separate measurements from a recovery
exercise or incident. Compare those measurements with the approved targets;
a target alone does not prove recovery performance.

This page supplies no environment-wide target values or measured proof that
those targets can be met. Record owner decisions and execution results separately.

## Canonical Backup and Restore Procedure
<!-- operator-task: backup-restore -->

This page is the sole authority for `backup-restore`. Start with an owned
component, compatible source and target versions, complete independently held
credentials and keys, checksum-valid media, an empty isolated target, enough
capacity, and an unchanged source. Run cluster inspection from the independent
administration machine and restore tooling from the isolated recovery
environment named by the component procedure. Backup scripts, database-native
tools, immutable group metadata, and the original application reader are the
authorities.

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for the whole recovery task. Every raw `kubectl`, Helm, or
`scripts/deploy.sh` command below must inherit its exported read-only
`KUBECONFIG`, `NAMESPACE`, and `PRISM_NAMESPACE`. The binding section
validates and freezes both namespace names before any command here; every shown
`<context>` must equal `EXPECTED_CONTEXT`. Run
`recovery_assert_namespace` from [Bind Recovery Objects](#bind-recovery-objects)
immediately before each cluster command block. Stop on any
mismatch, leave media and targets unchanged, and follow the binding section's
recovery; never fall back to the default kubeconfig.

Complete [State Inventory](#state-inventory), [Define a Backup Set](#define-a-backup-set),
the six-step [Procedure](#procedure), [Choose Restore Scope](#choose-restore-scope),
the applicable component path or documented boundary, and [Verification](#verification). Stop on
a missing group member, checksum mismatch, wrong key or credential, unsupported
version pair, nonempty target, same-server target where forbidden, unclear
writer fence, or absent original application reader.

Final proof is a native integrity result plus a successful read through the
original application, with writers still fenced until cutover. Retain exact
commands, tool and source versions, group identity and checksums, encryption
and credential authorities, isolated target identity, native and application
results, measured loss/time, cutover, cleanup, and every failed attempt.

## Bind Recovery Objects

Use Bash, Python 3, and the selected `kubectl` on the independent
administration machine. Keep `set -euo pipefail` and `umask 077` in the bound
shell. Before a component Job, obtain its existing namespace UID from the
platform owner independently of this kubeconfig. Set
`EXPECTED_APPLICATION_NAMESPACE_UID` for LiteLLM and
`EXPECTED_PRISM_NAMESPACE_UID` for Prism. Set only the scopes used in this
incident. A shared namespace must have the same expected UID in both scopes.

The platform owner must exclude namespace replacement and competing changes to
these manual Jobs and their Pods until evidence and cleanup finish. A UID
comparison alone does not exclude a later replacement. The cluster identity
needs `get` on the named namespace and source CronJob, `create`, `get`, `watch`,
and `delete` on Jobs, `list` and `get` on Pods, and `get` on `pods/log` in the
selected namespace. The inventory blocks also need `list` on PVCs, CronJobs,
Jobs and Events in their selected namespaces. Check each required permission through
[Check authority for the selected scope](install.md#check-authority-for-the-selected-scope).
The evidence owner must keep these private files unchanged through capture
and cleanup. No component backup Pod supplies this administration identity.

Define these helpers in the same shell. Their evidence directory is the new
private directory created by the component procedure. A successful CREATE
response establishes the Job UID; a later same-name lookup does not.

```bash
if [[ -n ${EXPECTED_APPLICATION_NAMESPACE_UID:-} ]]; then
  readonly EXPECTED_APPLICATION_NAMESPACE_UID
fi
if [[ -n ${EXPECTED_PRISM_NAMESPACE_UID:-} ]]; then
  readonly EXPECTED_PRISM_NAMESPACE_UID
fi
recovery_assert_namespace() {
  local expected
  assert_cluster_binding || return 126
  if [[ $1 == "$NAMESPACE" ]]; then
    if [[ $NAMESPACE == "$PRISM_NAMESPACE" && -n ${EXPECTED_APPLICATION_NAMESPACE_UID:-} && -n ${EXPECTED_PRISM_NAMESPACE_UID:-} ]]; then
      test "$EXPECTED_APPLICATION_NAMESPACE_UID" = "$EXPECTED_PRISM_NAMESPACE_UID" || return 126
    fi
    if [[ $NAMESPACE == "$PRISM_NAMESPACE" ]]; then
      expected=${EXPECTED_APPLICATION_NAMESPACE_UID:-${EXPECTED_PRISM_NAMESPACE_UID:?}}
    else
      expected=${EXPECTED_APPLICATION_NAMESPACE_UID:?}
    fi
  elif [[ $1 == "$PRISM_NAMESPACE" ]]; then
    expected=${EXPECTED_PRISM_NAMESPACE_UID:?}
  else
    return 126
  fi
  test "$(kubectl --context "$EXPECTED_CONTEXT" get namespace "$1" \
    -o jsonpath='{.metadata.uid}')" = "$expected"
}
recovery_create_job() {
  local ns=$1 cron=$2 job=$3 evidence=$4
  [[ ${#job} -le 63 && $job =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || return 1
  test ! -e "$evidence/$job.create.json" || return 1
  recovery_assert_namespace "$ns" || return 126
  kubectl --context "$EXPECTED_CONTEXT" -n "$ns" create job \
    --from="cronjob/$cron" "$job" -o json > "$evidence/$job.create.json" || return 1
  python3 - "$evidence" "$ns" "$job" <<'PYTHON'
import json, pathlib, sys
root, ns, name = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
j = json.loads((root / (name + '.create.json')).read_text())
m = j.get('metadata', {})
if (j.get('kind') != 'Job' or m.get('namespace') != ns or
    m.get('name') != name or not isinstance(m.get('uid'), str) or not m['uid']):
    raise SystemExit('valid Job CREATE identity is required')
(root / (name + '.uid')).write_text(m['uid'] + '\n')
PYTHON
}
recovery_capture_job_logs() {
  local ns=$1 job=$2 container=$3 evidence=$4 log=$5 deadline pod
  recovery_assert_namespace "$ns" || return 126
  deadline=$(python3 - "$evidence/$job.create.json" <<'PYTHON'
import json, sys
j = json.load(open(sys.argv[1]))
deadline = j.get('spec', {}).get('activeDeadlineSeconds')
if type(deadline) is not int or deadline <= 0:
    raise SystemExit('positive Job deadline is required')
print(deadline + 30)
PYTHON
  ) || return 1
  kubectl --context "$EXPECTED_CONTEXT" -n "$ns" wait \
    --for=condition=complete "job/$job" --timeout="${deadline}s" || return 1
  kubectl --context "$EXPECTED_CONTEXT" -n "$ns" get pods \
    -l "job-name=$job" -o json > "$evidence/$job.pods.json" || return 1
  pod=$(python3 - "$evidence" "$ns" "$job" <<'PYTHON'
import json, pathlib, sys
root, ns, name = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
uid = (root / (name + '.uid')).read_text().strip()
items = json.loads((root / (name + '.pods.json')).read_text()).get('items', [])
if len(items) != 1: raise SystemExit('exactly one owned Pod is required')
p = items[0]; m = p.get('metadata', {})
if (m.get('namespace') != ns or not m.get('name') or not m.get('uid') or
    p.get('status', {}).get('phase') != 'Succeeded' or
    not any(o.get('kind') == 'Job' and o.get('uid') == uid and
            o.get('controller') is True for o in m.get('ownerReferences', []))):
    raise SystemExit('succeeded Pod with original Job ownership is required')
(root / (name + '.pod-uid')).write_text(m['uid'] + '\n')
print(m['name'])
PYTHON
  ) || return 1
  test "$(kubectl --context "$EXPECTED_CONTEXT" -n "$ns" get job "$job" \
    -o jsonpath='{.metadata.uid}')" = "$(cat "$evidence/$job.uid")" || return 1
  test "$(kubectl --context "$EXPECTED_CONTEXT" -n "$ns" get pod "$pod" \
    -o jsonpath='{.metadata.uid}')" = "$(cat "$evidence/$job.pod-uid")" || return 1
  kubectl --context "$EXPECTED_CONTEXT" -n "$ns" logs "$pod" -c "$container" \
    > "$evidence/$log"
}
recovery_delete_job() {
  local ns=$1 job=$2 evidence=$3
  recovery_assert_namespace "$ns" || return 126
  python3 - "$evidence" "$job" <<'PYTHON'
import json, pathlib, sys
root, name = pathlib.Path(sys.argv[1]), sys.argv[2]
uid = (root / (name + '.uid')).read_text().strip()
if not uid: raise SystemExit('original creating UID is required')
(root / (name + '.delete.json')).write_text(json.dumps({
    'apiVersion': 'v1', 'kind': 'DeleteOptions',
    'preconditions': {'uid': uid}, 'propagationPolicy': 'Foreground'}) + '\n')
PYTHON
  test "$?" -eq 0 || return 1
  kubectl --context "$EXPECTED_CONTEXT" delete --raw \
    "/apis/batch/v1/namespaces/$ns/jobs/$job" \
    -f "$evidence/$job.delete.json" > "$evidence/$job.delete-response.json" || return 1
  kubectl --context "$EXPECTED_CONTEXT" -n "$ns" wait \
    --for=delete "job/$job" --timeout=120s || return 1
  kubectl --context "$EXPECTED_CONTEXT" -n "$ns" get job "$job" \
    --ignore-not-found -o name > "$evidence/$job.after.txt" || return 1
  test ! -s "$evidence/$job.after.txt"
}
```

Expected result: namespace checks pass; each successful CREATE returns the exact
Job kind, name, namespace and nonempty UID. Failed or unreadable CREATE output
means uncertain ownership. Retain the response and stop. Ask the platform owner
to reconcile the API request and its audit record; do not adopt a UID from a
later lookup, retry the same name, or delete the object.

Cleanup sends the original Job UID as a server-side deletion precondition. It
then waits at most 120 seconds and records a successful empty named read. A
UID conflict, denied read, timeout, or present Job is a cleanup failure; retain
the operation for owner reconciliation. This deletion removes the owned Job
and its dependent Pods, so capture all required Pod evidence first. The
[UID precondition protects object identity](https://kubernetes.io/docs/reference/kubernetes-api/definitions/delete-options-v1-meta/),
but the owner exclusion still protects namespace identity and the evidence
window. Never infer absence from a failed read. Log capture requires one
succeeded Pod owned by the creating Job UID, checks both current UIDs, and
reads that exact Pod and container. Its wait uses the returned Job deadline
plus 30 seconds; it does not assume a default duration. A wait or capture
failure stops acceptance. Retain the CREATE response, collect available
status/events/logs read-only from those same identities, and let the owners
diagnose before retry or cleanup.

## Supported Versions

Use the [shared version rules](README.md#version-and-tool-boundary).
A restore supports only a source, application, schema, backup format, and database-client combination that the component procedure declares compatible.
If that declaration is absent, stop before restore. The component owner must
supply a versioned compatibility test procedure for an isolated target and
accept its results before authorizing restore or cutover.

## Prerequisites

- Independent administration works without the target application Pods.
- The operator knows the selected source, image, schema, and data versions.
- Backup credentials and decryption keys remain available outside the target namespace.
- The recovery target is isolated from current writers.
- The operator has enough capacity for source, restore target, and retained evidence.
- A named owner can approve cutover or stop recovery.

## Nonnegotiable Rules

- A PVC is not a backup.
- A backup on the same node is not independent recovery media.
- Database and referenced artifacts form one consistency group.
- Credentials and encryption keys need a separate recovery authority.
- Rebuildable indexes must never replace authoritative source data.
- Restore into an isolated target before destructive replacement.
- Preserve the old environment until application verification passes.
- Never use the failed Ops Pod as the only recovery tool.
- Repository-produced local Prism and LiteLLM archives are not encrypted by
  these scripts. Mode `0600` and checksums provide access restriction and
  integrity detection, not encryption. Store independent copies only in an
  encryption-at-rest authority with separately recoverable keys and record that
  authority with the group.

## State Inventory

Assign one owner and one protection method to every applicable row.

| State | Owner | Authority | Protection boundary | Current limit |
| --- | --- | --- | --- | --- |
| Kubernetes and K3s control state | Platform owner | Cluster objects and storage bindings | Host or cluster backup outside this repository | Complete host restore is open |
| Git and release selections | Repository owner | Desired configuration and immutable image choices | Independent Git remote and release receipts | Git does not contain live data or Secrets |
| SPIRE server and CA state | Security operator | Workload identity continuity | SPIRE server persistence plus separate key recovery | Expiry and restore proof remain open |
| Kubernetes Secrets | Secret owners | Credentials, signing keys, pull keys, provider keys | External secret authority and controlled export | Namespace copies alone share the cluster failure domain |
| Nova run storage | Nova operator | Journals, effects, waits, snapshots, and observer checkpoints | Quiesced filesystem backup of the configured `storageRoot` | No repository-wide backup scheduler exists |
| Buster job storage | Buster operator | Jobs, source archives, results, receipts, and evidence | Quiesced storage backup with ownership evidence | Orphan quiescence remains incomplete |
| Redis | Platform owner | Selected transport and service data | AOF-aware migration or storage backup | Role and authority depend on actual configuration |
| LiteLLM PostgreSQL | Database owner | LiteLLM relational state | Completed logical backup group plus credential authority | Backup and native test exist; isolated operator restore, application verification, and cutover are not supplied |
| Prism PostgreSQL and artifacts | Prism owner | Projects, designs, baselines, and referenced immutable objects | One matched database-and-artifact group | External failure-domain restore remains unproved |
| Prism derived data | Prism owner | Embeddings, indexes, thumbnails, projections | Rebuild from restored authority | Rebuild time has no accepted RTO |
| OpenClaw and role PVCs | Role owner | Gateway state, role configuration, and workspaces | Storage backup under a quiesced workload | Content and rebuildability differ by mount |
| Ops Pod PVCs | Operations owner | Codex account state and private workspaces | Existing storage backup process | Cluster loss also removes access to these PVCs |
| Registry storage | Release operator | OCI manifests and layers | Registry-native storage backup and protected receipts | Garbage collection needs exclusive maintenance |
| Build caches and temporary workspaces | Execution owner | Usually rebuildable data | Rebuild or narrow retained-state backup | Do not delete while ownership remains uncertain |
| Telemetry and observer projections | Observability owner | Diagnostic evidence, not lifecycle authority | Retention policy and receiver storage | Connected retirement remains incomplete |

The inventory must match the deployed values.
Disabled components need no backup, but the record must show that decision.

## Define a Backup Set

For each state owner, record:

- Source resource, namespace, PVC, database, or directory.
- Consistency group and required writer fence.
- Backup mechanism and exact tool version.
- Destination and its failure domain.
- Credential and key authority.
- Schedule, retention, size limit, and alert owner.
- Integrity check and application restore check.
- Last successful restore proof.

Record the owner-approved RPO and RTO targets, their scope, and the owner's
decision. If the owner has not approved a target, mark that target `undecided`.
Record actual data loss and elapsed recovery time separately. Mark each missing
measurement `not measured`, and record whether a completed restore met each
approved target. A measured result does not set the target, and a CronJob
schedule alone does not prove the actual data-loss window.

## Procedure

Use the next six steps for routine backups.

### 1. Confirm Target and Capacity

Run from the administration machine:

```bash
recovery_assert_namespace "$NAMESPACE"
kubectl config current-context
kubectl -n "$NAMESPACE" get pvc
kubectl -n "$NAMESPACE" get cronjob,job
kubectl -n "$NAMESPACE" get events --sort-by=.metadata.creationTimestamp
```

Confirm destination free space before starting a manual backup.
Keep the previous completed group when capacity is low.

### 2. Fence Administrative Changes

Stop migrations, deletion, compaction, key rotation, and artifact restoration.
Use the component-specific writer fence where required.

Do not stop normal writers unless the selected backup contract requires it.
If the component contract requires a stronger fence, follow that contract.
Record the exact fence and its start time.

### 3. Run the Owned Backup Mechanism

Use the service-owned paths on this page:

- [Single-Service Restore](#single-service-restore) for the LiteLLM PostgreSQL
  backup/restore boundary and explicit Redis limit.
- [Prism Restore](#prism-restore) for the Prism database and artifacts.
- [Recover Administrative Access](#recover-administrative-access) for the optional Ops Pod and independent access.

For Nova, Buster, and role PVCs, use the approved storage backup product.
The repository provides no universal backup command for those stores.

Quiesce the owning workload when that backup cannot provide a consistent snapshot.
Record any downtime and incomplete attempt before the snapshot.

### 4. Verify Integrity

A completed backup needs more than successful upload.
Check:

- Manifest and metadata exist.
- Every required group member exists.
- Checksums match actual bytes.
- Database archive listing succeeds.
- Artifact filenames match content digests.
- Backup identity matches source version and database.
- Required key authority remains available.

### 5. Copy to an Independent Destination

Copy or replicate the completed immutable group to a different failure domain.
Do not move an incomplete staging directory.

Verify checksums again at the destination.
Record destination object identity and retention policy.

### 6. Release the Fence

Release writers only after local and destination verification pass.
If verification fails, retain the previous completed group and failed evidence.

## Prism Backup Group

Prism treats its database and immutable artifacts as one group.
The backup script dumps the database first.
It then copies the immutable artifact superset.

This order depends on durable immutable artifact publication before database
references. The [artifact writer synchronizes bytes and their published path](https://github.com/datrab/kubeclaw/blob/8f10f6c8d1ae274efc1493cba739bec95fe833a1/skills/prism/storage/artifacts.ts#L43-L60),
and the [backup contract requires publication before a database reference](https://github.com/datrab/kubeclaw/blob/8f10f6c8d1ae274efc1493cba739bec95fe833a1/charts/prism/files/prism-backup.sh#L82-L88).
Administrative artifact deletion must not overlap the backup.

The chart creates these scheduled resources:

- `prism-backup`.
- `prism-backup-verification`.
- `prism-restore-proof`.

Each verification and database-proof invocation selects latest independently.
Use [Prism Restore](#prism-restore) to compare observable group identities and
recognize the unbound database-smoke limit. Inspect the three CronJob resources
and retained labelled Pods. The chart puts `app=prism-backup` on Pod templates;
it does not put that label on Jobs. This Pod observation can include both
scheduled and manual attempts and does not establish the last completed Job:

```bash
recovery_assert_namespace "$PRISM_NAMESPACE"
kubectl -n "$PRISM_NAMESPACE" get cronjob prism-backup prism-backup-verification prism-restore-proof
kubectl -n "$PRISM_NAMESPACE" get pods -l app=prism-backup --sort-by=.metadata.creationTimestamp
```

Expected observation: the three named CronJobs are returned. The Pod command
returns retained Pods with that label, or succeeds with an empty list when no
matching Pod is retained. An empty list does not prove that no scheduled Job
ran. A missing CronJob, denied lookup, or other nonzero command exit is a
failed observation: stop and retain the error before owner diagnosis. For
manual Job acceptance, use the original CREATE UID and owned-Pod checks in
[Prism Restore](#prism-restore), not this label alone.

The [backup PVC](https://github.com/datrab/kubeclaw/blob/8f10f6c8d1ae274efc1493cba739bec95fe833a1/charts/prism/templates/jobs.yaml#L59-L74)
and [artifact PVC](https://github.com/datrab/kubeclaw/blob/8f10f6c8d1ae274efc1493cba739bec95fe833a1/charts/prism/templates/workloads.yaml#L217-L229)
carry Helm keep policy and Argo CD prune/delete exclusions.
They remain in the same cluster failure domain until an operator copies them externally.

> **Source evidence — Prism consistency group**
>
> **Claim:** Prism protects one database snapshot and the immutable artifact superset as a single published group. Verification rebuilds the artifact index from the stored bytes.
>
> **Implementation:** [The backup script verifies an immutable database-and-artifact archive](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/prism/files/prism-backup.sh#L44-L64).
> It then [creates and publishes a complete group without replacing an existing group](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/prism/files/prism-backup.sh#L66-L117).
> [The database proof restores a temporary database and queries core tables](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/prism/files/prism-backup.sh#L126-L153).
>
> **Contract or setting:** [The chart defines the backup and verification schedules and commands](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/prism/templates/backup.yaml#L9-L47).
> It also defines [Secret inputs and volume mounts](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/prism/templates/backup.yaml#L52-L79).
> All three modes mount the backup PVC writable for the shared lock and
> verification scratch files. Only `backup` mounts the artifact source, and
> that source mount is read-only. `verify` receives no database credentials;
> `backup` and `database-proof` receive the selected database Secret.
>
> **Test evidence:** [Capacity failures do not publish partial groups](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/prism-backup.test.mts#L73-L84).
> [The rendered jobs preserve commands, database separation, and read-only artifact access](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/prism-backup.test.mts#L109-L125).
> [The SQL proof owns a new temporary database and cleans failed proof attempts](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/prism-backup.test.mts#L127-L150). The test failed on 2026-09-16 before positive backup proof because the host supplied BusyBox-incompatible utilities and the chart fixture failed its native-worker precondition. [Complete independent application recovery](../status/open-issues.md#complete-independent-application-recovery-is-not-yet-demonstrated) retains the required proof. No fresh backup success is claimed.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** The proof uses the same database service. It does not restore an external target or verify the complete application path.

## Recovery

Choose the smallest recovery scope that repairs the failed authority.

### Choose Restore Scope

Choose one scope before making changes:

| Scope | Use when | Keep untouched |
| --- | --- | --- |
| Single derived index | Authority is healthy, derived data is missing | Database and immutable artifacts |
| One service | One authoritative store failed | Other stores and original backup media |
| One consistency group | References cross a database and artifact store | Unrelated services and original group |
| Whole application namespace | Several application stores failed | Cluster control state and external authority |
| Whole cluster | Cluster or node state is lost | Original media, keys, Git, and independent access |
| Access only | Workloads run but administration is unavailable | Application data and active workloads |

Do not widen restore scope because diagnosis is incomplete.

## Single-Service Restore

### Starting Conditions

- The backup group passes integrity checks.
- Source and target versions are compatible.
- The target is isolated from current writers.
- Required credentials and keys come from external authority.
- The old service and media remain unchanged.

### Procedure

The following list is a restore qualification checklist, not a general restore
command or support claim. Continue only when the component subsection supplies
every item with an owned executable path. The current LiteLLM and Redis
subsections do not supply a complete isolated operator restore.

1. Record source version, target version, and migration state.
2. Create an empty isolated target.
3. Restore with the documented component tool.
4. Reject any missing, extra, corrupt, or wrong-key member.
5. Run native database or store checks.
6. Run the original application reader.
7. Compare expected records, references, and content digests.
8. Keep the restored target isolated until every check passes.
9. Plan cutover and rollback as separate reviewed actions.

Do not substitute a filesystem copy for a database restore.

### LiteLLM PostgreSQL Backup and Restore Boundary

The selected installation can create `cronjob/litellm-postgresql-backup` and
`pvc/litellm-postgresql-backup`. This is an executable backup and verification
path, not a complete isolated operator restore. Read the
[selected LiteLLM source and image boundary](../understand/data-and-state.md#selected-litellm-source-and-image-boundary)
and [rows and encryption inputs](../understand/data-and-state.md#rows-and-encryption-inputs)
before selecting the application image or recovering keys. Start with the
deployed source revision, its selected immutable LiteLLM image, externally owned
master/salt keys, a healthy LiteLLM PostgreSQL service, and enough backup-PVC
capacity.

Before creating the manual backup Job, fence LiteLLM writes as required by its
[backup-group contract](../understand/data-and-state.md#backup-groups).
This component contract requires a stronger fence than the generic routine
backup guidance. Use the database and LiteLLM owners' procedure for the deployed
service. Stop before creating the Job if that procedure is missing or does not
clearly specify how to apply and verify the writer fence. Record the fence and
its start time.

The storage owner must also supply an authorized way to read and export a
completed directory from `pvc/litellm-postgresql-backup` without changing its
bytes. It must bind the PVC UID and source directory to a private local copy,
exclude symlinks, preserve the four files, and keep the source group immutable
through the copy. A completed Pod cannot be assumed to support `exec` or
`kubectl cp`. This page creates no access Pod and supplies no generic PVC-mount
or encrypted-storage transfer command. Stop before Job creation if the actual
PVC access/export and encrypted independent-storage transfer procedures are
missing. Record their owner, version, access identity and destination authority.

Use Bash and Python 3 on the independent administration machine. Set
`set -euo pipefail` and `umask 077` in the bound administration
shell. Set `LITELLM_BACKUP_JOB` to `litellm-backup-manual-<unique-id>`, where
`<unique-id>` is a new lowercase DNS-label suffix. Set
`LITELLM_BACKUP_EVIDENCE` to a new private directory outside the backup PVC.
The cluster identity needs permission to create/read/delete this exact Job,
read its Pod identity/status and read its logs. Stop on any command failure;
keep the fence and all previous media while the owners diagnose the failure.

```bash
recovery_assert_namespace "$NAMESPACE" || exit 126
set -euo pipefail
umask 077
test ! -e "$LITELLM_BACKUP_EVIDENCE"
mkdir -m 0700 "$LITELLM_BACKUP_EVIDENCE"
recovery_create_job "$NAMESPACE" litellm-postgresql-backup \
  "$LITELLM_BACKUP_JOB" "$LITELLM_BACKUP_EVIDENCE"
LITELLM_BACKUP_JOB_UID=$(cat "$LITELLM_BACKUP_EVIDENCE/$LITELLM_BACKUP_JOB.uid")
test -n "$LITELLM_BACKUP_JOB_UID"
printf '%s\n' "$LITELLM_BACKUP_JOB_UID" > "$LITELLM_BACKUP_EVIDENCE/job-uid.txt"
recovery_capture_job_logs "$NAMESPACE" "$LITELLM_BACKUP_JOB" backup \
  "$LITELLM_BACKUP_EVIDENCE" backup.log
LITELLM_BACKUP_GROUP=$(python3 - "$LITELLM_BACKUP_EVIDENCE/backup.log" <<'PY'
import pathlib, re, sys
paths = [s for s in pathlib.Path(sys.argv[1]).read_text().splitlines()
         if re.fullmatch(r'/backups/litellm/backup-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8}', s)]
if len(paths) != 1: raise SystemExit('one exact completed group path is required')
print(paths[0])
PY
)
printf '%s\n' "$LITELLM_BACKUP_GROUP" > "$LITELLM_BACKUP_EVIDENCE/group-path.txt"
```

Expected observation: one succeeded Pod owned by the recorded Job UID, and one
exact completed `/backups/litellm/backup-*` path in that Pod's log. The rendered
Job runs `scheduled`: it can reuse a previously valid group younger than the
backup interval. Its completion does not necessarily mean a fresh dump or a
new consistency point. Preserve the recorded group name and metadata times;
stop if they cannot meet the owner's required backup point. Failed Jobs,
multiple Pods, missing paths, UID changes, capacity errors, or unavailable PVC
access do not authorize deletion or an automatic retry.

Use the storage owner's read-only export procedure to copy **that exact logged
group**, not the directory currently called latest. Record the PVC UID, source
path, copied path and receipt. The private export root must contain only that
one completed `backup-*` directory. The storage owner must prevent any other
process from publishing, editing or removing files there until verification
and transfer finish. Do not point this procedure at the live backup PVC.

Set and export `BACKUP_ROOT` as the absolute path of that private export root. Set
`LITELLM_LOCAL_GROUP` to `"$BACKUP_ROOT/${LITELLM_BACKUP_GROUP##*/}"`.
Set `LITELLM_RECOVERY_SCRIPT` to the absolute path of
`scripts/postgresql-recovery.sh` from the recorded, approved repository revision;
verify its SHA-256 against the owner's independent release record before use.
The shell must receive these actual script inputs from the database and secret
owners' private environment setup. Export every required input in the table
below before invoking the child verifier. Export `LITELLM_SALT_KEY` only when
the original key authority supplies it; leave it unset when originally absent.
Normal shell assignment alone does not pass a value to child Bash. Never source the copied `metadata.env` or
print environment contents, credentials, master keys or salt keys.

| Inputs | Required authority |
| --- | --- |
| `PGHOST`, `PGDATABASE`, `PGUSER`, `BACKUP_EXPECTED_SERVER_VERSION` | Recorded actual source profile/database and exact selected server version |
| `BACKUP_APPLICATION_IMAGE`, `BACKUP_CREDENTIAL_AUTHORITY_REF` | Deployed immutable LiteLLM image and original external key-authority reference |
| `LITELLM_MASTER_KEY`, optional `LITELLM_SALT_KEY` | Original independently recovered inputs; preserve absence versus presence of the salt key |
| `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_AGE_SECONDS`, `BACKUP_MAXIMUM_DURATION_SECONDS` | Selected recovery policy, in bytes and seconds |

The verifier requires `psql`, `pg_dump`, `pg_restore`, `flock`, `sha256sum`,
`stat`, `du`, `timeout`, and `sync` on `PATH`, even though `verify` makes no SQL
connection and does not restore data. These are the actual script prerequisites,
not a request to use database administrator credentials for an offline check.
For the supplementary checks below, also supply GNU `realpath`, `awk`, `cmp`,
and GNU Bash in a compatible glibc recovery environment. BusyBox tools and
Alpine/musl are not a supported substitute for these commands. Use the exact
owner-selected PostgreSQL tools.
The database owner must supply `EXPECTED_PG_RESTORE_VERSION` as the exact
approved output of `pg_restore --version`, `EXPECTED_DUMP_CLIENT_VERSION` as
its approved numeric dump version (major × 10000 + minor), and
`EXPECTED_SOURCE_SYSTEM_IDENTIFIER` from the source database's recorded
identity. Obtain these expectations independently of the copy. The owners must
bind the selected profile, schema-change history, all required roles and key
authority to this group. Metadata alone cannot establish that authority.

Run from the private offline verification machine in the same Bash shell with
`set -euo pipefail` and `umask 077`. The following checks freeze selection to the
sole exported group, add owner/privacy/source/tool checks, then run the existing
verifier:

```bash
set -euo pipefail
umask 077
shopt -s nullglob dotglob
export BACKUP_ROOT PGHOST PGDATABASE PGUSER BACKUP_EXPECTED_SERVER_VERSION
export BACKUP_APPLICATION_IMAGE BACKUP_CREDENTIAL_AUTHORITY_REF LITELLM_MASTER_KEY
export BACKUP_MAXIMUM_BYTES BACKUP_MAXIMUM_RETAINED_BYTES
export BACKUP_MAXIMUM_AGE_SECONDS BACKUP_MAXIMUM_DURATION_SECONDS
if [[ ${LITELLM_SALT_KEY+x} ]]; then export LITELLM_SALT_KEY; fi
test "$(realpath -e -- "$BACKUP_ROOT")" = "$BACKUP_ROOT"
test -d "$BACKUP_ROOT"
exported_entries=("$BACKUP_ROOT"/*)
test "${#exported_entries[@]}" -eq 1
test "${exported_entries[0]}" = "$LITELLM_LOCAL_GROUP"
test "${LITELLM_LOCAL_GROUP##*/}" = "${LITELLM_BACKUP_GROUP##*/}"
test -d "$LITELLM_LOCAL_GROUP"
for member in "$BACKUP_ROOT" "$LITELLM_LOCAL_GROUP" \
  "$LITELLM_LOCAL_GROUP/database.dump" "$LITELLM_LOCAL_GROUP/archive-toc.txt" \
  "$LITELLM_LOCAL_GROUP/metadata.env" "$LITELLM_LOCAL_GROUP/SHA256SUMS"; do
  test ! -L "$member"
  test "$(stat -c %u "$member")" = "$(id -u)"
  member_mode=$(stat -c %a "$member")
  (( (8#$member_mode & 077) == 0 ))
done
test "$(pg_restore --version)" = "$EXPECTED_PG_RESTORE_VERSION"
selected_group=$(bash "$LITELLM_RECOVERY_SCRIPT" verify)
test "$selected_group" = "$LITELLM_LOCAL_GROUP"
printf '%s\n' "$selected_group" > "$LITELLM_BACKUP_EVIDENCE/verified-group.txt"
read_metadata_field() {
  awk -F= -v key="$1" '$1==key {count++; value=substr($0,length(key)+2)}
    END {if(count!=1) exit 1; print value}' "$LITELLM_LOCAL_GROUP/metadata.env"
}
test "$(read_metadata_field source_system_identifier)" = "$EXPECTED_SOURCE_SYSTEM_IDENTIFIER"
test "$(read_metadata_field dump_client_version_num)" = "$EXPECTED_DUMP_CLIENT_VERSION"
test "$(read_metadata_field credential_authority_ref)" = "$BACKUP_CREDENTIAL_AUTHORITY_REF"
test "$(read_metadata_field schema)" = full-custom-archive
test "$(read_metadata_field credentials)" = external-authority-required
pg_restore --list "$LITELLM_LOCAL_GROUP/database.dump" \
  > "$LITELLM_BACKUP_EVIDENCE/archive-toc-verified.txt"
cmp "$LITELLM_LOCAL_GROUP/archive-toc.txt" \
  "$LITELLM_BACKUP_EVIDENCE/archive-toc-verified.txt"
sha256sum "$LITELLM_LOCAL_GROUP/SHA256SUMS" \
  > "$LITELLM_BACKUP_EVIDENCE/checksum-index-digest.txt"
```

Expected result: every command exits zero and `verified-group.txt` contains
exactly this copied group's absolute path. The native verifier checks the four
required regular, non-symlink, singly linked files: `database.dump`,
`archive-toc.txt`, `metadata.env`, and `SHA256SUMS`. The checksum index must have
exactly three lines, each with one SHA-256 and exactly one of `database.dump`,
`archive-toc.txt`, or `metadata.env`. It checks their bytes before accepting the
format, database, selected application image, original key binding, selected
server version, size and age. It also reads the archive catalogue.
Any failed command rejects this copy; preserve it and the previous media for
investigation. Do not retry with relaxed limits or different keys to obtain a
successful result.

The native CLI selects latest dynamically and cannot accept an explicit group
argument. This procedure controls that limitation only by using an owner-frozen
private root with one candidate and checking its returned identity. It is not
proof that a later `verify` on the production PVC checked this group. If the
copy cannot remain frozen or the candidate/path differs, stop before copy
acceptance, fence release or deletion.

Review the full archive listing with the database owner for the expected
schema, applied migration history, ownership and access-control evidence.
A readable catalogue and correct checksums do not prove that every SQL object
or ciphertext will restore. Application recovery still requires the separate
restore and application checks below. These offline steps have not been run
against deployed backup media.

> **Source evidence — copied group verification**
>
> **Claim:** the existing script verifies a dynamically selected group; the private
> single-group export and returned-path comparison bind this invocation.
> **Implementation:** [configuration/tools](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/scripts/postgresql-recovery.sh#L11-L35),
> [publication](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/scripts/postgresql-recovery.sh#L56-L95),
> [group verifier](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/scripts/postgresql-recovery.sh#L97-L129),
> [scheduled reuse and latest-only CLI](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/scripts/postgresql-recovery.sh#L166-L185).
> **Contract or setting:** the [rendered Job runs `scheduled`](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/scripts/render-postgresql-recovery.mjs#L63-L83).
> **Test evidence:** [The native harness asserts backup verification, scheduled
> reuse, secret exclusion and wrong-key rejection](https://github.com/datrab/kubeclaw/blob/ebcc04066d42c94b4a4e0fc85e3393dae3d61f78/tests/verification/deployment/postgresql-recovery-native.mts#L110-L117).
> Status: **SOURCE ONLY; NOT EXECUTED**. These assertions are not an observed
> native test result. The page's private-root copy-selection guards have no
> maintained repository test. Local syntax and synthetic subprocess
> inheritance checks passed; they do not verify PostgreSQL archives.
> The full offline check **FAILED** on BusyBox `realpath` options and musl
> regular-expression support. Native media verification, live Job execution
> and transfer remain **NOT EXECUTED**.
> **Revision:** KubeClaw `ebcc04066d42c94b4a4e0fc85e3393dae3d61f78`.
> **Limit:** offline integrity is not restore or application proof.

After local verification and owner approval of the group's backup point,
transfer the complete immutable group to encrypted independent storage with
the storage owner's mechanism. Verify the same three hashes at the destination,
using this exact group identity. If the destination can be read as a frozen
private root with only that one group, repeat the offline check with its
`BACKUP_ROOT` and `LITELLM_LOCAL_GROUP`, retaining the same owner inputs.
Set and export the destination `BACKUP_ROOT` before every repeated child
invocation; recompute `LITELLM_LOCAL_GROUP` under that root. Repeat the complete
block above, including its explicit exports. Otherwise require the storage owner's versioned verification
procedure and receipt for all four objects. Record encryption/key authority,
independent failure domain, exact destination object identities and retention.
Stop before fence release or deletion if destination proof is missing.

Retain the Job/Pod UIDs, log, exact group and PVC identity, source database and
server version, immutable application image/schema selection, owner input
record, checksum/archive/tool results, credential-authority references and
copy receipt. Follow the owners' verified fence-release procedure only after
all local and destination checks pass. Then remove only that manual Job with
its original CREATE UID:

```bash
recovery_assert_namespace "$NAMESPACE" || exit 126
set -euo pipefail
umask 077
recovery_delete_job "$NAMESPACE" "$LITELLM_BACKUP_JOB" "$LITELLM_BACKUP_EVIDENCE"
```

Confirm that this Job is absent after deletion. A cleanup failure remains an
open operation; do not remove backup groups, scheduled Jobs, the PVC, or the
namespace. Until fence release, a failed backup does not change the unchanged
source database. The owners decide whether to release a fence after an aborted
attempt; this page does not authorize bypassing its media checks.

The repository script is a restore primitive, not target provisioning. It
requires an already provisioned empty database, every dumped owner role,
compatible client/server versions, externally recovered database credentials,
and the original LiteLLM master/salt keys. It rejects same-server, nonempty,
wrong-version, wrong-key, stale, corrupt, and oversized inputs and restores in
one transaction
([configuration and identity gates](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/postgresql-recovery.sh#L8-L49);
[archive verification](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/postgresql-recovery.sh#L100-L138);
[restore gates](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/postgresql-recovery.sh#L150-L173)).

The native test requires two externally provisioned disposable PostgreSQL
servers. The caller supplies their private administrator connection URLs in
`POSTGRES_NATIVE_SOURCE_URL` and `POSTGRES_NATIVE_DESTINATION_URL`, the exact
selected PostgreSQL client directory in `POSTGRES_NATIVE_CLIENT_BIN`, and the
pinned LiteLLM Python source runtime in `LITELLM_NATIVE_PYTHON`. Keep the URLs and
credentials private. The harness creates roles and databases on those servers;
it does not provision or start the servers
([external prerequisites](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/postgresql-recovery-native.mts#L12-L19);
[role and database creation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/postgresql-recovery-native.mts#L32-L41)).
The harness checks schema, model/key rows, ownership, transactional failure,
SQL authentication, and legacy/AES credential decryption
([restore and data checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/deployment/postgresql-recovery-native.mts#L111-L137)).
Native test status: **SOURCE ONLY; NOT EXECUTED**. The linked assertions describe
what the harness attempts; no native execution result is available for this
check. Execution requires the two externally supplied disposable servers,
the selected PostgreSQL client directory and the pinned LiteLLM crypto runtime
listed above. Until those prerequisites are supplied, stop before running the
harness. Synthetic subprocess inheritance checks and the failed offline check
do not establish SQL, archive, decryption or application recovery results.

It does not start the selected LiteLLM image, call LiteLLM readiness or model
APIs, test valid and invalid API keys through LiteLLM, prove budgets, make a
real model request, perform client cutover, or roll that cutover back.

Therefore a self-contained isolated LiteLLM operator restore is not currently
supported. Stop before `restore`, application start, or cutover unless the
database and LiteLLM owners provide a versioned procedure that provisions the
compatible target and all roles, wires secrets without exposing them, starts
the recorded immutable image, performs the application checks listed above,
defines one cutover and rollback boundary, and removes only the isolated target
after retained proof. Until that product gap is closed, preserve the source,
independent backup, keys, and native-test result; do not report application
recovery from `POSTGRES_RECOVERY_RESTORED_APPLICATION_ACCEPTANCE_REQUIRED`.

Redis provides an [offline fenced-RDB-to-AOF preparation primitive](../understand/data-and-state.md#prepare-a-redis-rdb-as-a-fresh-aof-dataset),
with selected native tools, checksum/restart receipts and explicit failure boundaries.
It does not provide a complete cluster backup, target provisioning or cutover
command. Use the Redis owner's bound procedure for those steps or stop at that
missing prerequisite. Do not call an offline receipt or PVC copy a verified
live Redis restore.

## Prism Restore

A Prism recovery point is one database dump and artifact set from the same
immutable group. Never combine members from different groups. The current
commands accept only `backup`, `verify`, or `database-proof`; they have no
argument for a requested `<backup-group>`. Both checks independently select the
lexically last `backup-*` directory when they run. The database proof prints
its temporary database name, not the group it selected.

Each invocation holds the shared backup-PVC lock while it runs. That lock does
not bind separate Jobs to one group. `concurrencyPolicy: Forbid` prevents overlap
within each CronJob, but does not stop another CronJob or manual Job from
publishing a new group between commands. These are
[the latest-group selection and database proof](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/charts/prism/files/prism-backup.sh#L119-L154),
[the per-invocation lock and accepted commands](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/charts/prism/files/prism-backup.sh#L156-L169),
and [the three separate CronJobs](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/charts/prism/templates/backup.yaml#L9-L29).

Use the following bounded procedure to create a group and observe which group
verification actually checked. Start with the deployed Prism backup resources,
healthy source database, available artifact and backup PVCs, enough capacity,
and a private new `<evidence-dir>` outside those PVCs. Run in the bound
administration shell. `<unique-id>` is a new lowercase DNS-label suffix for
all three manual Job names. Each complete name must have at most 63 characters.
Do not reuse an existing Job. Use the namespace, CREATE identity, Pod ownership,
permissions and cleanup helpers in [Bind Recovery Objects](#bind-recovery-objects).
The Prism owner must record the deployed immutable Control image, PostgreSQL
server/client versions, backup-script revision, source database, PVC UIDs, and
external credential authority before the first Job. Stop if that record or the
verified administrative fence is missing. The storage owner must supply a
versioned read-only access/export method for the exact logged group on the
recorded backup PVC and an encrypted independent-copy method. These must
preserve the database dump, metadata, both checksum manifests, and artifact
bytes without symlinks or concurrent change. A completed Pod is not an access
method for its PVC. This page creates no media-access Pod and supplies no
generic storage transfer command. Stop before Job creation if either owned
method is missing. Use Node.js for the log comparison below. Normal immutable
artifact publication can continue; fence administrative deletion, restoration,
migration, and key rotation for the window. A new concurrent backup can make
verification select a different group; treat that mismatch as a stop. Record
the fence start time and keep it until media checks and owner-approved release.

```bash
recovery_assert_namespace "$PRISM_NAMESPACE"
export PRISM_BACKUP_EVIDENCE_DIR="<new-evidence-dir>"
test ! -e "$PRISM_BACKUP_EVIDENCE_DIR"
mkdir -m 0700 "$PRISM_BACKUP_EVIDENCE_DIR"
recovery_create_job "$PRISM_NAMESPACE" prism-backup \
  "prism-backup-manual-<unique-id>" "$PRISM_BACKUP_EVIDENCE_DIR"
recovery_capture_job_logs "$PRISM_NAMESPACE" "prism-backup-manual-<unique-id>" backup \
  "$PRISM_BACKUP_EVIDENCE_DIR" backup.log
recovery_create_job "$PRISM_NAMESPACE" prism-backup-verification \
  "prism-verify-manual-<unique-id>" "$PRISM_BACKUP_EVIDENCE_DIR"
recovery_capture_job_logs "$PRISM_NAMESPACE" "prism-verify-manual-<unique-id>" verify \
  "$PRISM_BACKUP_EVIDENCE_DIR" verify.log
node - "$PRISM_BACKUP_EVIDENCE_DIR/backup.log" \
  "$PRISM_BACKUP_EVIDENCE_DIR/verify.log" > "$PRISM_BACKUP_EVIDENCE_DIR/group-comparison.json" <<'NODE'
const fs = require('node:fs');
const paths = process.argv.slice(2).map(file => {
  const groups = fs.readFileSync(file, 'utf8').split(/\r?\n/u)
    .filter(line => /^\/backups\/backup-[^/\s]+$/u.test(line));
  if (groups.length !== 1) throw new Error('one observed group path is required per Job');
  return groups[0];
});
if (paths[0] !== paths[1]) throw new Error('verification selected a different latest group');
console.log(JSON.stringify({ createdGroup: paths[0], verifiedGroup: paths[1],
  scope: 'group-integrity-only' }));
NODE
```

Expected observation: both Jobs complete and their logs name the same exact
`/backups/backup-*` path. Retain the comparison output with the two logs. A
failed Job, missing path, or mismatch forbids acceptance of the created group's
verification. Keep all media and failed evidence. Diagnose capacity, mounts,
checksums, database access, or concurrent publication from the specific Job
log; do not retry until that cause is understood. A later check still selects
latest and can therefore check a different group.

The available same-server database smoke test is a separate observation:

```bash
recovery_assert_namespace "$PRISM_NAMESPACE"
recovery_create_job "$PRISM_NAMESPACE" prism-restore-proof \
  "prism-proof-manual-<unique-id>" "$PRISM_BACKUP_EVIDENCE_DIR"
recovery_capture_job_logs "$PRISM_NAMESPACE" "prism-proof-manual-<unique-id>" database-proof \
  "$PRISM_BACKUP_EVIDENCE_DIR" database-proof.log
cat "$PRISM_BACKUP_EVIDENCE_DIR/database-proof.log"
```

Expected smoke output starts with `PRISM_DATABASE_RESTORE_SMOKE_PASSED:`. It
shows that the internally selected latest dump restored into a temporary
database on the source PostgreSQL service and that three core tables were
queried. It does **not** identify the restored group, prove a requested-group
restore, or establish original-application-reader acceptance. Even when the
first two logs match, do not attribute this smoke result to that group.
Requested-group native restore proof is **NOT PROVEN** by these Jobs.
Stop before external restore or cutover.

The [selected capacity and schedule settings](https://github.com/datrab/kubeclaw/blob/8f10f6c8d1ae274efc1493cba739bec95fe833a1/charts/prism/values.yaml#L64-L73)
limit a group, total retained bytes, and operation duration. Inspect the deployed
values; these defaults do not establish an owner-approved RPO or retention
period. The [publication path](https://github.com/datrab/kubeclaw/blob/8f10f6c8d1ae274efc1493cba739bec95fe833a1/charts/prism/files/prism-backup.sh#L74-L117)
retains incomplete attempts and never expires completed groups automatically.
A new group includes a UTC timestamp and random suffix; latest is lexical name
order, not a requested consistency point. The lock is nonblocking: another
active invocation can make a Job fail instead of wait. Do not remove old or
incomplete media to make capacity pass without the storage owner's retained
evidence and expiry procedure. The chart's successful/failed Job history limits
remove Job history, not backup groups. Keep the independent encrypted copy and
its owner-approved retention receipt separately.

The Prism data owner and chart maintainer must supply an explicit group
selection for verification and proof, expose that selected identity in the
proof result, and test a newer group arriving between commands before this
boundary can be removed. External recovery also requires the isolated database,
artifact, application-reader, cutover, and rollback procedure below.

Use the storage owner's method to copy the exact group named in both backup
and verification logs. Recheck the three `SHA256SUMS` members and the complete
`ARTIFACTS.sha256` index against actual artifact bytes at the independent
destination. Retain the exact source PVC UID, group path, destination object
identities, manifests, encryption/key authority and copy receipt. Stop on any
missing member, changed bytes, identity mismatch or absent destination proof.
Do not select latest again as a substitute for that group's transfer. Release
the administrative fence only through the owner's verified procedure after
these checks pass. After an aborted attempt, the owner must decide whether
release is safe; retain previous media and failed evidence.

Retain all attempted Job logs, CREATE responses, Job and Pod UIDs,
source/image versions, the observed
group identities, checksum manifests, external copy receipt, and separate
integrity and unbound database-smoke results. After evidence capture, remove
only the manual Jobs with valid retained CREATE responses. Omit the proof Job
if that step was never attempted. Reconcile any uncertain CREATE first:

```bash
recovery_assert_namespace "$PRISM_NAMESPACE"
for manual_job in "prism-backup-manual-<unique-id>" "prism-verify-manual-<unique-id>" \
  "prism-proof-manual-<unique-id>"; do
  recovery_delete_job "$PRISM_NAMESPACE" "$manual_job" "$PRISM_BACKUP_EVIDENCE_DIR"
done
```

Scheduled Job history, backups, and PVCs are retained state. A failed cleanup
is an open incident; it does not authorize namespace deletion or backup removal.

The following sequence is the required design for external Prism recovery, but
it is **not currently an executable supported restore** because no owned command
restores the matched database-and-artifact group into an external target:

1. Stop Prism writes and scheduled administrative jobs.
2. Create an empty PostgreSQL target and empty artifact target.
3. Verify the group before restore.
4. Restore the database with the matching supported client.
5. Restore artifact bytes without changing their digest paths.
6. Start Prism Control in the intended recovery configuration.
7. Verify project, design revision, and baseline references.
8. Read every sampled artifact through the real artifact reader.
9. Rebuild embeddings, indexes, thumbnails, and projections.
10. Run `./scripts/deploy.sh prism-smoke`.
11. Open one real project and its exact baseline in Studio.
12. Enable writes only after every check passes.

The current same-server database proof is not a disaster-recovery proof. Stop
after it; do not claim Prism recovery or application-reader acceptance.
[Complete independent application recovery](../status/open-issues.md#complete-independent-application-recovery-is-not-yet-demonstrated) remains open.

## Pipeline State Recovery

Use the original platform file, run ID, graph or project, package snapshot,
storage root, and configuration from the retained start record. Run the
inspection and recovery commands from the original Nova repository with the
[shared version and tool prerequisites](README.md#version-and-tool-boundary).
The Nova operator and each adapter-store owner must establish and verify the
writer fence. Stop if ownership or the original identity is unknown.

Do not restore one journal file without its related effects, waits, artifacts,
and snapshots. Restore the complete run root from one consistent point. Keep
Nova and the owning adapter writers stopped after restoration.

Audit can change storage: it creates an append-lock file and can truncate an
incomplete journal tail before parsing. Recovery and resume also open these
journals. Backup checksums and the resulting audit JSON do not preserve the
restored raw bytes.

After filesystem restoration:

1. Verify file ownership, permissions, backup checksums, and the original run
   and platform identities.
2. Complete [Inspect a Run](operate.md#inspect-a-run) before audit, recovery,
   or resume. Preserve and verify a new raw copy of the restored run and the
   owning adapters' stores while their writers remain stopped. Keep partial
   journal bytes, signals, effects, snapshots, and lock files.
3. Require successful strict parsing of every copied run journal. On a copy,
   identity, sequence, hash, or incomplete-record failure, retain the raw copy
   and manifest and stop. Do not run audit to make the journal pass.
4. Only after those checks, capture the canonical audit and its exit status
   through [Inspect a Run](operate.md#inspect-a-run). Stop on audit failure or
   changed graph identity; retain both raw bytes and command output.
5. Reconcile every accepted external effect without a terminal receipt through
   its owning contract. Stop while an outcome is unknown or no supported
   reconciliation method exists.
6. Use [Recover After Interruption](operate.md#recover-after-interruption)
   only when its original-identity and reconciliation checks pass. That
   command reopens the original run; starting a new run is not recovery.
7. After the command exits and writers are stopped, repeat raw preservation
   and strict inspection before the final audit. Compare the original and
   final state and retain recovery output, external receipts, and cleanup.

If the owning incident procedure later authorizes canonical tail repair,
retain the verified original raw bytes first, reconcile external effects, and
record the authorized command and its actual file changes. The automatic
truncation is not proof that recovery succeeded.

Do not recover a terminal run. Do not resume a wait with a signal from before
the restored point. Retain the writer-fence record and all failed attempts;
release writers only through the owners' verified recovery procedure.

## Node or Cluster Loss

The repository cannot rebuild a bare host or K3s cluster completely.
Use the platform-owned host restore procedure first.

Required order after platform recovery:

1. Restore independent administration and verify the API.
2. Restore DNS, CNI, storage classes, and volume access.
3. Restore secret authority and SPIRE server state.
4. Restore registry access and selected release manifests.
5. Restore stateful services and verify native data.
6. Restore Nova, Buster, Prism, and role PVCs.
7. Deploy workloads without changing image or schema versions.
8. Verify mTLS, role smoke, and Prism application data. For Nova, complete
   [Pipeline State Recovery](#pipeline-state-recovery), including raw
   preservation and strict inspection before pipeline audit.
9. Rebuild derived data.
10. Reopen admission only after verification.

Stop when any prerequisite lacks an owned restore method.
Record that point with the [host bootstrap and restore prerequisites](../status/open-issues.md#automated-host-bootstrap-and-restore-prerequisites-are-incomplete).

## Recover Administrative Access

Use the existing host, KVM, or control-plane identity.
Do not require the failed Ops Pod, cluster DNS, or in-cluster Tailscale route.

After access returns:

1. Verify context and server certificate.
2. Use read-only cluster checks first.
3. Repair CNI, DNS, storage, or API reachability at its owning layer.
4. Restore the Ops Pod only after the cluster can schedule and mount it.
5. Rotate every emergency credential used during recovery.
6. Remove temporary kubeconfig files and verify revocation.

The repository documents this boundary but has not demonstrated the complete path.
[Independent recovery outside the Ops Pod](../status/open-issues.md#independent-recovery-outside-the-ops-pod-is-unproved) remains open.

## Expected Result

The restored authority matches one verified backup point.
Every original consumer can read its required state and referenced content.

No writer uses the restored target before verification and cutover approval.
The operator records any measured data loss and recovery time.

## Verification

Verify each restored layer through its original consumer. A
[SPIFFE Verifiable Identity Document (SVID)](../reference/glossary.md#svid) is a
workload credential. These deployed identity paths use a short-lived X.509
certificate that contains the workload's SPIFFE identity. Verify that identity,
then check application permission separately; a valid credential alone does
not authorize the request.

| Layer | Required check |
| --- | --- |
| Cluster | API, DNS, CNI, scheduling, and PVC mount |
| Identity | Expected SVID passes identity verification and the intended application request succeeds; a wrong identity is denied |
| Database | Native integrity plus application query |
| Artifacts | Digest verification plus application reader |
| Nova | [Pipeline State Recovery](#pipeline-state-recovery): stopped writers, verified raw run and adapter copies, strict copied-journal inspection, then audit projection and legal recovery decision |
| Buster | Existing job, result, evidence, and receipt readers |
| Prism | Real project, design revision, baseline, and Studio open |
| Ops Pod | Login state, MCP verification, workspace, and independent management path |
| External access | Intended identity succeeds and unapproved identity fails |

A successful `pg_restore --list` is not application verification.
A ready Pod is not restored product behavior.

## Common Failures

| Failure | Meaning | Response |
| --- | --- | --- |
| Missing group member | The backup is incomplete | Reject the group and keep prior completed media |
| Checksum or digest mismatch | Stored bytes changed or the group is mixed | Stop and investigate storage integrity |
| Wrong database client | Tool and server formats can be incompatible | Use the selected supported client image |
| Missing key or credential | Data exists but its authority is unavailable | Recover authority independently; do not replace the key |
| Restore succeeds but references fail | Related stores came from different points | Restore one matched consistency group |
| Pod is ready but application reads fail | Infrastructure health is not application recovery | Keep writers fenced and inspect the original reader |
| Old image fails on restored schema | Application and data versions differ | Deploy the compatible release or use the reviewed migration |
| Ops Pod is unavailable | Cluster-dependent access also failed | Use the recorded host or control-plane route |

## Rollback Boundary

Before cutover, rollback means returning clients to the unchanged old service.
After new writes, that rollback can lose accepted data.

Do not use an old application image against a migrated incompatible database.
Do not downgrade data through an image rollback.

At the irreversible point, record:

- Last old write.
- First new write.
- Backup group.
- Schema and application versions.
- Operator and approval.
- Recovery choice if verification later fails.

## Evidence to Retain

- Complete state inventory and owners.
- Backup job logs and exit status.
- Group metadata, checksums, tool versions, and destination identity.
- Restore commands and isolated target identity.
- Native and application verification results.
- Owner-approved RPO and RTO targets, or explicit `undecided` targets.
- Actual data loss and elapsed recovery time, or explicit `not measured` results, plus comparison with each approved target.
- Cutover and irreversible-point record.
- Failed restore evidence and retained original media.
- For Nova, original run/platform identities, writer-fence proof, verified raw
  run and adapter copies, manifests, strict inspection results, and every
  authorized repair command with its actual changes.
