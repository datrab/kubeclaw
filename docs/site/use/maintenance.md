# Maintain and Retire

Status: implemented release and migration procedures with stated live-proof limits
Audience: release maintainer, platform operator, security operator
Owner: release engineering and platform operations
Evidence: versions.json; releases/ops-images.json; docs/operations/runtime-versions-and-images.md
Applies to: current release-selection and deployment contracts
Last verified: 2026-09-16, source inspection and local documentation checks

## Objective

Change software, data, credentials, certificates, or capacity without losing rollback evidence.
Remove KubeClaw only after data and access have named owners.

## Supported Versions

Use the [shared version rules](README.md#supported-versions-and-tools).
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

Run from a clean checkout:

```bash
git status --short
git rev-parse HEAD
npm ci --ignore-scripts
npm run versions:check
node scripts/updates/materialize-release.mjs --family=runtime --check
```

For Ops images, replace `runtime` with `ops`.

The current documentation branch has an Ops selection but no runtime selection.
The runtime check must fail until a reviewed promotion creates `releases/runtime-images.json`.

Do not create a replacement file by hand.
Run the promotion workflow with one successful same-commit build receipt set.

If version inputs change, use the controlled generation path:

```bash
npm run versions:sync
npm run versions:check
node --test tests/verification/deployment/versions.test.mjs
```

Review every generated diff with the version change.
Do not edit generated digests to make a check pass.

Keep promotion and receipt evidence with the version authorities in this section.

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

Render the actual selected configuration:

```bash
./scripts/deploy.sh render nova > "<evidence-dir>/nova.yaml"
./scripts/deploy.sh render buster > "<evidence-dir>/buster.yaml"
./scripts/deploy.sh render prism > "<evidence-dir>/prism.yaml"
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

Argo can own platform and runtime Applications after an explicit ownership transfer.
The Git repository remains the desired-state authority.

Before sync, inspect each selected Application:

```bash
kubectl -n argocd get applications.argoproj.io
kubectl -n argocd get application "<application>" -o yaml
```

Record `spec.source.targetRevision`, `status.sync.revision`, and the operation result revision.
Confirm that the resolved commit equals the intended immutable source.

The current platform health script can compare a branch name with a resolved commit.
That comparison can report a false unhealthy result.
[GITOPS-REVISION-001](../status/open-issues.md#gitops-revision-001) tracks the correction.

Do not bypass that gap by accepting any revision.
Resolve the branch to the intended commit and record both values.

For rollback, revert the reviewed Git change and sync the compatible prior state.
Do not use Argo history rollback while automatic sync can immediately reverse it.

Keep database rollback rules separate from manifest rollback.

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
12. Compare running image IDs and active bundle commits.
13. Reopen admission.
14. Retain the old release until the observation window ends.

Do not combine a CNI migration with an unrelated application upgrade.
[IFR-02-001](../status/open-issues.md#ifr-02-001) tracks the unproved CNI cutover and rollback.

## Stateless Role Upgrade

Upgrade one role first when compatibility permits:

```bash
./scripts/deploy.sh agent nova
./scripts/deploy.sh smoke-agent nova
```

Then inspect the running identity:

```bash
kubectl -n "<namespace>" get deployment agent-nova -o jsonpath='{.spec.template.spec.containers[*].image}{"\n"}'
kubectl -n "<namespace>" get pods -l app.kubernetes.io/instance=agent-nova -o jsonpath='{range .items[*]}{.status.containerStatuses[*].imageID}{"\n"}{end}'
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
./scripts/deploy.sh prism-status
kubectl -n "<namespace>" get cronjob,job,pvc
kubectl -n "<namespace>" get deployment,statefulset -o wide
```

After the change:

```bash
./scripts/deploy.sh prism-smoke
kubectl -n "<namespace>" get jobs -l app=prism-migrate
kubectl -n "<namespace>" logs job/prism-migrate --all-containers
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

Observe SVID and CA expiry before the maintenance window.
Verify SPIRE server persistence and CSI readiness.

Use the [Worker Trust runbook](worker-trust.md) for the detailed sequence.

The complete expiry and restore contract remains open.
[IFR-06-001](../status/open-issues.md#ifr-06-001) tracks that work.

## Registry and BuildKit Maintenance

Use the client and image-lifetime procedure in this section.

Before garbage collection:

1. Stop registry writers.
2. Record referenced manifests and release receipts.
3. Verify storage backup.
4. Use exclusive registry maintenance.
5. Pull every retained selected digest after collection.
6. Test cached and uncached client paths separately.

Do not claim an online cache miss proves outage behavior.

Long-lived rootless BuildKit isolation remains incomplete.
[IFR-10-001](../status/open-issues.md#ifr-10-001) tracks that boundary.

## Capacity and Retention

Monitor these stores independently:

- Node filesystem and image store.
- Registry blobs.
- BuildKit cache.
- Application PVCs.
- Nova and Buster durable roots.
- Prism database, artifacts, and backups.
- Ops Pod home and workspace.
- Telemetry, results, and evidence.

Do not use age alone to delete confirmed history.
Some history protects idempotency and external-effect reconciliation.

Follow only the implemented narrow cleanup procedures in this section.
Keep [PCR-OBS-002](../status/open-issues.md#pcr-obs-002) open for connected retirement.

## Security Rescan

Run the release security process against selected immutable digests.
Record scanner version and advisory database identity.

Do not classify every failed rescan as a confirmed vulnerability.
Scanner errors and missing release selections also fail the job.

[GITHUB-7](../status/open-issues.md#github-7) tracks the unresolved rescan result.

## Controlled Retirement

Retirement is a data and access operation, not only a Helm uninstall.

### 1. Stop New Work

Disable new admission through the owning operator boundary.
Record active, waiting, and uncertain runs.

Do not remove a workload while an external result remains uncertain.

### 2. Resolve Existing Work

Let safe work finish.
Reconcile external effects.
Record blocked work and its evidence.

The CLI has no separate cancel command.
Use the approved incident boundary for necessary containment.

### 3. Export and Back Up

Create final verified backups for every authoritative store.
Copy them to the retained independent destination.

Export release receipts, configuration digests, decisions, and audit records.
Keep credentials in their separate authority.

### 4. Remove Workloads by Scope

Choose one command for the intended scope.
Do not run these commands as a sequence.

| Command | Removes | Keeps | Required decision |
| --- | --- | --- | --- |
| `./scripts/deploy.sh teardown-agents` | Nova and Buster Helm releases | Infrastructure, namespace, Secrets, and PVCs | Confirm that no run or external effect remains active or uncertain |
| `./scripts/deploy.sh teardown-prism` | Prism and Prism-agent Helm releases | Namespace, Secrets, and kept Prism PVCs | Confirm that Prism admission and writes have stopped |
| `./scripts/deploy.sh teardown` | Agents, selected infrastructure, Prism when enabled, and **every PVC left in the application namespace** | Namespace and Secrets only | Confirm final verified backups and approve application-data deletion |
| `./scripts/deploy.sh teardown-all` | The complete application namespace and every resource in it | Nothing in that namespace | Approve final namespace, Secret, and remaining-state deletion |

`teardown` is destructive even though it keeps the namespace and Secrets.
It enumerates and deletes all remaining PVCs, including PVCs retained by a Helm keep policy.
Stop before confirmation if any PVC lacks a verified final backup and a named destruction approval.

After `teardown`, verify that no PVC remains and review the retained Secrets:

```bash
kubectl -n "<namespace>" get pvc
kubectl -n "<namespace>" get secrets
```

Run `teardown-all` only when final namespace deletion has separate explicit approval:

```bash
./scripts/deploy.sh teardown-all
```

That command destroys the namespace and included state.

> **Source evidence — teardown scopes**
>
> **Claim:** `teardown-agents` and `teardown-prism` remove bounded workload releases. `teardown` keeps the namespace and Secrets but deletes every remaining PVC. `teardown-all` deletes the namespace.
>
> **Implementation:** [The bounded agent teardown uninstalls only Nova and Buster](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L2718-L2738). [The destructive teardown enumerates and deletes all remaining PVCs](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L2806-L2864). [The namespace teardown deletes every resource in the namespace](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L2867-L2878).
>
> **Contract or setting:** [`KUBECLAW_DEPLOY_PRISM` decides whether the broad teardown first uninstalls Prism](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L2854-L2864).
>
> **Test evidence:** No repository test executes destructive PVC deletion against a live namespace. Source inspection covered the command paths, and a documentation regression check protects them.
>
> **Revision:** `85e73b1885f04a9494f388cf6622ad0bde2db447`.
>
> **Limit:** Source inspection does not prove successful cleanup, backup integrity, external-resource removal, or data-destruction approval in a live environment.

### 5. Remove External Resources

Remove retained resources only after backup verification:

- PVCs kept by a narrower command, external volumes, and snapshots.
- Tailnet Ingress, DNS, and OAuth grants.
- Registry repositories and BuildKit caches.
- GitHub Apps, deploy keys, and tokens.
- SPIRE registrations and service identities.
- External backup schedules and monitoring rules.
- Ops Pod PVCs and Secrets.

Revoke access before deleting its audit ownership record.

### 6. Verify Retirement

Confirm no workload, Service, Ingress, PVC, role binding, or external credential remains unowned.
Confirm retained backups still pass integrity checks.

Record the retention end date and destruction owner for remaining data.

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
