# Maintain and Retire

Status: source-backed maintenance boundaries; no general runtime upgrade pair or generic rotation command is currently established
Audience: release maintainer, platform operator, security operator
Owner: release engineering and platform operations
Evidence: versions.json; releases/ops-images.json; scripts/deploy.sh
Applies to: current release-selection and deployment contracts
Last verified: 2026-09-21; no fresh live upgrade, rotation or retirement result is available

## Objective

Change software, data, credentials, certificates, or capacity without losing rollback evidence.
Remove KubeClaw only after data and access have named owners.

## Cluster Authority Binding for Every Maintenance Task

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for upgrade, rollback, rotation, GitOps, or decommission work. Every raw
`kubectl`, Helm, or `scripts/deploy.sh` command below must inherit its exported
read-only `KUBECONFIG`; every shown `<context>` must equal `EXPECTED_CONTEXT`.
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
kubectl --context "<context>" -n "<namespace>" get secrets \
  -o custom-columns='NAME:.metadata.name,TYPE:.type,CREATED:.metadata.creationTimestamp'
kubectl --context "<context>" -n "<namespace>" get deploy,statefulset,cronjob \
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
`teardown-all`; use separately approved resource-specific removal instead.
Retain the pre-removal inventory, final backup group, access revocation
receipts, command confirmations and output, post-removal inventory, retained
audit location and retention end date, and every failed cleanup. There is no
automatic rollback after PVC or namespace deletion; recovery is from the final
verified media through the canonical restore procedure.

## Supported Versions

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

Run from a clean checkout:

Complete the canonical
[Locked Dependency Installation](quickstart.md#locked-dependency-installation)
first. Retain its sanitized registry, lock digest, output, exit status, and
worktree proof with the release record.

```bash
git status --short
git rev-parse HEAD
npm run versions:check
node scripts/updates/materialize-release.mjs --family=runtime --check
```

For Ops images, replace `runtime` with `ops`.

The current source tree has an Ops selection but no runtime selection.
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
assert_cluster_binding
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
assert_cluster_binding
kubectl -n argocd get applications.argoproj.io
kubectl -n argocd get application "<application>" -o yaml
```

Record `spec.source.targetRevision`, `status.sync.revision`, and the operation result revision.
Confirm that the resolved commit equals the intended immutable source.

The current platform health script can compare a branch name with a resolved commit.
That comparison can report a false unhealthy result.
[The continuous GitOps revision mismatch](../status/open-issues.md#continuous-gitops-health-compares-a-branch-name-with-resolved-commit-ids) tracks the correction.

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
[Single-node CNI cutover and rollback](../status/open-issues.md#concrete-single-node-cni-cutover-and-independent-rollback-remain-unproved) tracks the missing proof.

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
assert_cluster_binding
./scripts/deploy.sh prism-status
kubectl -n "<namespace>" get cronjob,job,pvc
kubectl -n "<namespace>" get deployment,statefulset -o wide
```

After the change:

```bash
assert_cluster_binding
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
[SPIRE persistence, certificate lifetime and recovery](../status/open-issues.md#spire-persistence-certificate-lifetime-and-recovery-contract-is-incomplete) tracks that work.

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
kubectl --context "<context>" -n "<namespace>" get \
  deploy,statefulset,daemonset,job,cronjob,svc,ingress,pvc,configmap,secret,serviceaccount,role,rolebinding,networkpolicy \
  -o name > "<evidence-dir>/namespaced-resources-before.txt"
helm list -n "<namespace>" > "<evidence-dir>/helm-before.txt"
```

Add cluster-scoped SPIRE registrations, admission policy, DNS, Tailnet, OAuth,
registry, GitHub, backup, monitoring, external volumes, Ops namespace, and
credential identities to the inventory using each owning authority. Confirm the
application namespace is dedicated. Preserve audit records and their reader,
location, retention end date, and destruction owner before revoking access.

Stop if a resource is unregistered, shared, ownerless, or selected evidence
depends on the namespace that would be deleted.

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
| `./scripts/deploy.sh teardown` | Agents, selected infrastructure, Prism when enabled, and **every PVC left in the application namespace** | Namespace and Secrets only | Confirm final verified backups and approve application-data deletion |
| `./scripts/deploy.sh teardown-all` | The complete application namespace and every resource in it | Nothing in that namespace | Approve final namespace, Secret, and remaining-state deletion |

`teardown` is destructive even though it keeps the namespace and Secrets.
It enumerates and deletes all remaining PVCs, including PVCs retained by a Helm keep policy.
Stop before confirmation if any PVC lacks a verified final backup and a named destruction approval.

Reassert the bound cluster and freeze the exact namespace immediately before
the command. Do not change the kubeconfig's current context here:

```bash
assert_cluster_binding
test "<context>" = "$EXPECTED_CONTEXT"
if [[ ${NAMESPACE+x} ]]; then
  test "$NAMESPACE" = "<namespace>"
else
  export NAMESPACE="<namespace>"
fi
readonly NAMESPACE
assert_cluster_binding
kubectl -n "$NAMESPACE" get pvc
```

Expected observation: the binding assertion succeeds and PVC names exactly
match the signed inventory.
Abort the prompt on any difference. A prompt protects only against accidental
invocation; it does not prove ownership or backup.

After `teardown`, verify that no PVC remains and review the retained Secrets:

```bash
assert_cluster_binding
kubectl -n "<namespace>" get pvc
kubectl -n "<namespace>" get secrets
```

Run `teardown-all` only when final namespace deletion has separate explicit approval:

```bash
assert_cluster_binding
./scripts/deploy.sh teardown-all
```

That command destroys the namespace and included state.

> **Source evidence — teardown scopes**
>
> **Claim:** `teardown-agents` and `teardown-prism` remove bounded workload releases. `teardown` keeps the namespace and Secrets but deletes every remaining PVC. `teardown-all` deletes the namespace.
>
> **Implementation:** [The bounded agent teardown uninstalls only Nova and Buster](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L2692-L2699). [The destructive teardown enumerates and deletes all remaining PVCs](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L2780-L2825). [The namespace branch deletes the complete namespace](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L2806-L2817).
>
> **Contract or setting:** [`KUBECLAW_DEPLOY_PRISM` decides whether broad teardown first uninstalls Prism](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L2828-L2838).
>
> **Test evidence:** No repository test executes destructive PVC deletion against a live namespace. The documented command paths are protected by a regression check.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** The available static evidence does not prove successful cleanup, backup integrity, external-resource removal, or data-destruction approval in a live environment.

### 7. Verify retirement and cleanup

```bash
assert_cluster_binding
kubectl --context "<context>" get namespace "<namespace>" --ignore-not-found
kubectl --context "<context>" -n "<namespace>" get \
  deploy,statefulset,daemonset,job,cronjob,svc,ingress,pvc,serviceaccount,role,rolebinding,networkpolicy \
  --ignore-not-found
helm list -n "<namespace>"
```

For `teardown-all`, expected namespace output is empty. For a narrower command,
expected retained objects must match its `Keeps` column and the signed retained
inventory. Verify external DNS/exposure is absent, revoked identities are
denied, monitoring and backup schedules have the selected retained/removed
state, and retained backups still pass integrity and reader checks.

Record the retention end date and destruction owner for remaining data.
Remove temporary administration credentials only after final verification.
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
