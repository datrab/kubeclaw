# Back Up and Recover

Status: partial implementation; complete independent environment recovery remains open
Audience: platform operator, database operator, incident responder
Owner: platform operations and data owners
Evidence: charts/prism/files/prism-backup.sh; scripts/postgresql-recovery.sh; docs/site/status/open-issues.json
Applies to: current selected runtime and state formats
Last verified: 2026-09-16, source inspection and local documentation checks

## Objective

Protect every authoritative state before loss and restore it without broken references.
Finish only after application readers verify the restored data.

This page does not declare an environment-wide RPO or RTO.
Those targets lack complete measured evidence.

## Supported Versions

Use the [shared version rules](README.md#supported-versions-and-tools).
A restore supports only a source, application, schema, backup format, and database-client combination that the component procedure declares compatible.
If that declaration is absent, restore into an isolated target and stop before cutover until the data owner accepts the tested combination.

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
| LiteLLM PostgreSQL | Database owner | LiteLLM relational state | Completed logical backup group plus credential authority | Off-node replication remains operator work |
| Qdrant | Search-data owner | Vector collections and aliases | Full snapshot and verified restore | Snapshot destination independence remains operator work |
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

Mark RPO and RTO as `undecided` until a measured restore proves them.
Do not derive an RPO from a CronJob schedule alone.

## Procedure

Use the next six steps for routine backups.

### 1. Confirm Target and Capacity

Run from the administration machine:

```bash
kubectl config current-context
kubectl -n "<namespace>" get pvc
kubectl -n "<namespace>" get cronjob,job
kubectl -n "<namespace>" get events --sort-by=.metadata.creationTimestamp
```

Confirm destination free space before starting a manual backup.
Keep the previous completed group when capacity is low.

### 2. Fence Administrative Changes

Stop migrations, deletion, compaction, key rotation, and artifact restoration.
Use the component-specific writer fence where required.

Do not stop normal writers unless the selected backup contract requires it.
Record the exact fence and its start time.

### 3. Run the Owned Backup Mechanism

Use the existing procedures for supported stateful services:

- [LiteLLM PostgreSQL Recovery](../../operations/litellm-postgresql-recovery.md).
- [Redis Migration](../../operations/redis-migration.md).
- [Qdrant Migration](../../operations/qdrant-migration.md).
- [Prism recovery details](../../runbooks/prism-recovery.md).
- [Ops Pod backup and restore](../../ops/ops-pod.md#backup-and-restore).

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

Move or replicate the completed immutable group to a different failure domain.
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

This order is safe because artifact publication precedes database references.
Administrative artifact deletion must not overlap the backup.

The chart creates these scheduled resources:

- `prism-backup`.
- `prism-backup-verification`.
- `prism-restore-proof`.

Inspect their last execution:

```bash
kubectl -n "<namespace>" get cronjob prism-backup prism-backup-verification prism-restore-proof
kubectl -n "<namespace>" get jobs -l app=prism-backup --sort-by=.metadata.creationTimestamp
```

The backup and artifact PVCs survive Helm removal through keep policy.
They remain in the same cluster failure domain until an operator copies them externally.

> **Source evidence — Prism consistency group**
>
> **Claim:** Prism protects one database snapshot and the immutable artifact superset as a single published group. Verification rebuilds the artifact index from the stored bytes.
>
> **Implementation:** [The backup script creates and verifies the immutable database-and-artifact group](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/charts/prism/files/prism-backup.sh#L44-L117). [The database proof restores a temporary database and queries core tables](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/charts/prism/files/prism-backup.sh#L126-L153).
>
> **Contract or setting:** [The chart runs separate backup, verification, and database-proof CronJobs against the backup PVC](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/charts/prism/templates/backup.yaml#L1-L80).
>
> **Test evidence:** [The backup test checks publication limits, rendered commands, read-only artifact access, and the database proof](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/tests/verification/deployment/prism-backup.test.mts#L100-L135). The AP07 follow-up ran it on 2026-09-16. It failed before a positive backup proof because this host supplied BusyBox-incompatible utilities and the current chart fixture failed its native-worker precondition. [IFR-26-001](../status/open-issues.md#ifr-26-001) retains the required independent recovery proof. No fresh backup success is claimed.
>
> **Revision:** `85e73b1885f04a9494f388cf6622ad0bde2db447`.
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

1. Record source version, target version, and migration state.
2. Create an empty isolated target.
3. Restore with the documented component tool.
4. Reject any missing, extra, corrupt, or wrong-key member.
5. Run native database or store checks.
6. Run the original application reader.
7. Compare expected records, references, and content digests.
8. Keep the restored target isolated until every check passes.
9. Plan cutover and rollback as separate reviewed actions.

Use the stateful guides linked above for exact tool commands.
Do not substitute a filesystem copy for a database restore.

## Prism Restore

Use one matched `<backup-group>`.
Do not combine a database dump and artifacts from different groups.

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

The current same-server database proof is not a disaster-recovery proof.
[IFR-26-001](../status/open-issues.md#ifr-26-001) tracks complete independent application recovery.

## Pipeline State Recovery

Do not restore one journal file without its related effects, waits, artifacts, and snapshots.
Restore the complete run root from one consistent point.

After filesystem restoration:

1. Keep Nova stopped.
2. Verify file ownership, permissions, and backup checksums.
3. Read the audit for `<run-id>`.
4. Reject journal corruption or changed graph identity.
5. Reconcile every accepted external effect without a terminal receipt.
6. Start Nova only after reconciliation.
7. Use the supported recovery command from [Configure and Operate](operate.md).

Do not recover a terminal run.
Do not resume a wait with a signal from before the restored point.

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
8. Verify mTLS, role smoke, pipeline audit, and Prism application data.
9. Rebuild derived data.
10. Reopen admission only after verification.

Stop when any prerequisite lacks an owned restore method.
Document that point against [IFR-01-001](../status/open-issues.md#ifr-01-001).

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
[IFR-28-001](../status/open-issues.md#ifr-28-001) remains open.

## Expected Result

The restored authority matches one verified backup point.
Every original consumer can read its required state and referenced content.

No writer uses the restored target before verification and cutover approval.
The operator records any measured data loss and recovery time.

## Verification

Verify each restored layer through its original consumer:

| Layer | Required check |
| --- | --- |
| Cluster | API, DNS, CNI, scheduling, and PVC mount |
| Identity | Expected SVID succeeds and wrong identity fails |
| Database | Native integrity plus application query |
| Artifacts | Digest verification plus application reader |
| Nova | Audit projection and legal recovery decision |
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
- RPO and RTO measurements, or explicit `undecided` values.
- Cutover and irreversible-point record.
- Failed restore evidence and retained original media.
