# Plan and Install

Status: implemented repository deployment path; host bootstrap and complete live acceptance remain open
Audience: Kubernetes platform operator, security operator
Owner: platform operations
Evidence: scripts/deploy.sh; docs/generated/inventory/deploy-script.json
Applies to: current selected runtime release
Last verified: 2026-09-16, source inspection and local checks

## Objective

Prepare one KubeClaw environment without hiding a missing platform dependency.
Finish with ready workloads, smoke results, and an independent recovery route.

This procedure does not install a host, K3s, a storage driver, or a CNI.
It starts with an existing Kubernetes cluster.

## Supported Topology and Limits

The repository deploys one application namespace plus separate identity namespaces.
It can also deploy a separate Ops Pod namespace.

The default application namespace is `kubeclaw`.
SPIRE uses `spire-server` and `spire-system`.
The default Ops Pod namespace is `kubeclaw-ops`.

The deployment path can install these components:

- SPIRE and its CSI driver.
- Redis, PostgreSQL, Qdrant, and LiteLLM.
- Nova and Buster role deployments.
- Prism and its PostgreSQL, Control, Studio, Worker, and agent workloads.
- The Tailscale operator for the complete showcase baseline.

The deployment path does not establish these platform services:

- Host operating system and K3s installation.
- CNI installation or a CNI migration.
- StorageClass creation and external backup storage.
- An OCI registry or BuildKit client configuration for production use.
- Argo CD ownership transfer for existing Helm resources.
- Independent host, KVM, or SSH administration.

Stop if the environment depends on an item in the second list and no operator owns it.

| Platform layer | Repository role | Required operator proof |
| --- | --- | --- |
| Host and K3s | Existing prerequisite | Independent login, API recovery, version, and restart procedure |
| CNI | Existing cluster dependency; Flannel and Cilium are separate architecture choices | Selected implementation, DNS, policy enforcement, and rollback path |
| Argo CD | Optional deployment owner | Repository access, tracking mode, revision, health, and exclusive ownership |
| Storage | Existing StorageClass and CSI | Binding, reclaim behavior, capacity, snapshot or backup, and restore |
| Registry, mirror, and BuildKit | Required showcase services | Authenticated push, uncached pull, cache behavior, storage, isolation, and garbage collection |
| DNS and Tailscale | Required showcase access and exposure layers | Positive and negative identity checks plus independent recovery |
| Monitoring | Optional platform evidence layer | Metric retention, log delivery, dashboard access, capacity, and recovery |
| SPIRE | Installed by the infrastructure command when enabled | Server persistence, agents, CSI, SVID, and expiry ownership |

Use [Continuous GitOps](../../deployment/continuous-gitops.md) when Argo owns deployment.
Use [Registry Clients](../../operations/registry-clients.md) for registry and BuildKit preparation.

Helm and Argo must not manage the same resource at the same time.
Complete an explicit ownership transfer before enabling reconciliation.

> **Source evidence — deployment ownership**
>
> **Claim:** `setup` owns application namespace creation, Helm repository preparation, and optional Secret preparation. `infra` owns the ordered identity and stateful-service deployment.
>
> **Implementation:** [`cmd_setup()` creates the namespace, prepares chart repositories, and selects Secret setup](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L884-L965). [`cmd_infra()` installs SPIRE and the selected stateful services in dependency order](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L1107-L1207).
>
> **Contract or setting:** [Deployment variables select the namespace, optional components, Secret mode, and partial-infrastructure behavior](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L48-L68).
>
> **Test evidence:** [The deployment truth check inspects the real deployment script and its required safety properties](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/tests/verification/deployment/check-deployment-truth.mjs#L41-L66). The AP07 follow-up ran this check successfully on 2026-09-16. This was a source check, not a cluster deployment.
>
> **Revision:** `85e73b1885f04a9494f388cf6622ad0bde2db447`.
>
> **Limit:** These commands do not install or prove the host, K3s, CNI, durable storage, or independent external access.

## Execution Locations

Use two separate administration locations.

| Location | Purpose | Required access |
| --- | --- | --- |
| Existing administration machine | First install, cluster recovery, and lockout recovery | Repository, `kubectl`, `helm`, Node.js, npm, and cluster bootstrap rights |
| Ops Pod | Routine observation and reviewed Git changes | Running cluster, its PVCs, and configured observer rights |

The Ops Pod is not an independent recovery path.
It depends on cluster scheduling, networking, DNS, storage, and the API.

Keep the existing host or KVM path before installation.
[IFR-28-001](../status/open-issues.md#ifr-28-001) tracks proof of independent recovery.

## Planning Record

Create an operator record before any mutation.
Record these values:

| Subject | Record |
| --- | --- |
| Source | Full repository commit and clean-worktree result |
| Release | Runtime selection file and every selected image digest |
| Cluster | Context, server endpoint, Kubernetes version, nodes, and CNI |
| Storage | StorageClass, binding mode, reclaim policy, free capacity, and backup destination |
| Network | Cluster DNS, service ranges, egress route, Tailnet owner, and recovery route |
| Identity | Cluster administrator, SPIRE owner, service-account owner, and emergency credential owner |
| Data | Existing PVCs, databases, queues, journals, artifacts, and their owners |
| Change | Maintenance window, rollback owner, evidence directory, and stop decision owner |

Do not invent capacity values.
[IFR-16-001](../status/open-issues.md#ifr-16-001) tracks the missing combined capacity proof.

## Supported Versions

Use the [shared version rules](README.md#supported-versions-and-tools).
This procedure has no accepted Kubernetes or K3s compatibility range.
Record the actual server, kubectl, and Helm versions and obtain platform-owner acceptance before the first mutation.
Use only the selected runtime receipt and generated values for workload images.

## Prerequisites

Run these read-only checks from `<repository-root>` on the administration machine:

```bash
git status --short
git rev-parse HEAD
node --version
npm --version
helm version
kubectl --context "<context>" version
kubectl --context "<context>" get nodes -o wide
kubectl --context "<context>" get storageclass
kubectl --context "<context>" cluster-info
kubectl --context "<context>" -n kube-system get pods
kubectl --context "<context>" -n argocd get applications.argoproj.io --ignore-not-found
```

Expected observations:

- The worktree has no unreviewed change.
- The commit equals `<release-commit>` or an approved documentation-only successor.
- Every required node reports `Ready`.
- The selected StorageClass exists.
- Cluster DNS and the API respond through the intended context.

Stop for any unexpected context, missing node, unknown StorageClass, or unowned existing data.

## Select Configuration

Repository values are examples and public defaults.
Private operator values must use separate files.

Use these references before editing values:

- [Environment Variables](../../reference/environment-variables.md).
- [Helm Values](../../reference/helm-values.md).
- [Secrets](../../reference/secrets.md).
- [Runtime Versions and Images](../../operations/runtime-versions-and-images.md).

The effective order for runtime role values is:

1. Chart defaults.
2. Source-bound generated release values.
3. Role-specific repository values.
4. Private operator overlay.
5. Supported command overrides.

Do not select a different image in a private overlay.
Image identity belongs to the reviewed release receipt.

Set the explicit application namespace before every deployment command:

```bash
export NAMESPACE="<namespace>"
kubectl config current-context
kubectl get namespace "$NAMESPACE" --ignore-not-found
```

The last command may return no namespace before the first setup.
It must not return an unexpected environment with the same name.

## Preflight Without Mutation

Install repository dependencies from the lockfile.
Then run the source checks:

```bash
npm ci --ignore-scripts
npm run versions:check
npm run docs:check:generated
npm run verify:prism:deploy-script
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

The Prism source check currently stops at a stale prompt-ownership assertion.
[DOC-AP07-PRISM-CHECK-001](../status/open-issues.md#doc-ap07-prism-check-001) tracks that exact check repair.
Do not report the Prism preflight as passed until the unchanged command exits with status zero.

Render each selected role before mutation:

```bash
./scripts/deploy.sh render nova
./scripts/deploy.sh render buster
./scripts/deploy.sh render prism
```

Runtime rendering requires `releases/runtime-images.json` and its generated values.
The current documentation branch does not contain that runtime selection.

If the selection is absent, stop before deployment.
Use the reviewed promotion workflow to create it from successful build receipts.
Never invent the file or substitute mutable image tags.

Treat rendered output as sensitive configuration.
Review images, Secrets, service accounts, PVCs, ports, and network policies.

Stop if the selected release is absent or the render changes an unowned resource.

## Prepare Independent Access

Before setup, prove that the administration machine can reach the cluster API.
Record a second route to the host or control plane.

Do not count Tailscale inside the target cluster as the only second route.
A CNI or cluster failure can remove that route.

The optional Ops Pod supports routine operations after cluster readiness.
Follow the [Ops Pod runbook](../../ops/ops-pod.md) for its separate deployment.

[IFR-01-001](../status/open-issues.md#ifr-01-001) tracks missing host bootstrap and restore prerequisites.

## Install in Dependency Order

### 1. Create Namespace and Secrets

Interactive installation:

```bash
export KUBECLAW_RUN_SECRET_SETUP=true
export KUBECLAW_SECRET_SETUP_MODE=interactive
./scripts/deploy.sh setup
```

Noninteractive installation must pre-create or copy every required Secret.
Then use:

```bash
export KUBECLAW_RUN_SECRET_SETUP=true
export KUBECLAW_SECRET_SETUP_MODE=noninteractive
./scripts/deploy.sh setup
```

Expected observation: `setup` reports the namespace and Helm repositories as ready.
Secret setup must report no missing required value.

Do not replace `setup` with `secrets` on a new administration machine.
The `secrets` command prepares Secrets but does not prepare Helm repositories.

Never save Secret contents in the change record.
Record names, key names, owners, and creation times only.

### 2. Install Infrastructure

```bash
./scripts/deploy.sh infra
```

The command installs SPIRE before protected workloads.
It then installs Redis and selected stateful services.
It applies network policies after the service setup.

Expected observation: every selected Helm operation and rollout completes.
The command fails closed by default.

Do not set `ALLOW_PARTIAL_INFRA=true` for acceptance.
That option changes required failures into warnings during diagnosis.

### 3. Verify Infrastructure

```bash
./scripts/deploy.sh status
kubectl -n "$NAMESPACE" get pods,svc,pvc
kubectl -n spire-server get pods
kubectl -n spire-system get pods
```

Expected observation: selected workloads run, PVCs bind, and SPIRE agents are ready.

Check events before continuing:

```bash
kubectl -n "$NAMESPACE" get events --sort-by=.metadata.creationTimestamp
```

Stop for recurring mount, scheduling, image, DNS, or readiness failures.

### 4. Install Nova and Buster

```bash
./scripts/deploy.sh agents
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
```

The deploy command uses atomic Helm upgrades.
It waits for both role deployments.

The smoke commands check the gateway, startup state, readiness, skills, and runtime configuration.

> **Source evidence — role readiness**
>
> **Claim:** A role deployment renders the selected immutable release before mutation. It uses an atomic Helm change, waits for readiness, and supports a role-specific smoke check.
>
> **Implementation:** [`deploy_agent()` uses atomic upgrades and waits for the selected role](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L1453-L1481). [`cmd_smoke_agent()` checks the deployed gateway and runtime health](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/deploy.sh#L1583-L1606).
>
> **Contract or setting:** [The release materializer binds role values to a selected runtime receipt](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/scripts/updates/materialize-release.mjs#L1-L35).
>
> **Test evidence:** [The deployment release test exercises render and fail-closed selection paths](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/tests/verification/deployment/deployment-release.test.mjs#L45-L80). The follow-up did not rerun that test. It ran the deployment truth check successfully on 2026-09-16. [DOC-AP07-PRISM-CHECK-001](../status/open-issues.md#doc-ap07-prism-check-001) records the failed Prism command check. No Prism test success is claimed.
>
> **Revision:** `85e73b1885f04a9494f388cf6622ad0bde2db447`.
>
> **Limit:** Source tests do not prove image pulls, scheduling, dependencies, or readiness in the target cluster.

### 5. Install Prism When Selected

```bash
./scripts/deploy.sh prism
./scripts/deploy.sh prism-status
./scripts/deploy.sh prism-smoke
```

Expected observation: Prism PostgreSQL, Control, Studio, Worker, and agent become ready.
The smoke command checks Control, Worker, OpenClaw, and PostgreSQL.

Do not treat smoke as browser, recovery, provider, or human acceptance.

### 6. Prove Worker Trust

Run local contract checks first:

```bash
npm run verify:worker-core:trust
```

Run the live proof only in an approved cluster:

```bash
export PRISM_NAMESPACE="$NAMESPACE"
npm run verify:worker-core:trust:live
```

The live proof must include permitted and denied paths.
Use [Worker Trust](worker-trust.md) for the complete failure order.

### 7. Record the First Verification

Capture these nonsecret outputs in `<evidence-dir>`:

```bash
git rev-parse HEAD
./scripts/deploy.sh status
helm list -n "$NAMESPACE"
kubectl -n "$NAMESPACE" get pods,svc,pvc -o wide
kubectl -n "$NAMESPACE" get events --sort-by=.metadata.creationTimestamp
```

Also record each image from Pod status.
Compare its `imageID` with the selected digest.

## Failed First Installation

Use this order after the first failing command:

| Observation | Check | Action |
| --- | --- | --- |
| API or authorization error | Current context and `kubectl auth can-i` | Correct the context or obtain the required operator right |
| Pod remains Pending | Events, node selectors, taints, requests, PVC binding | Correct capacity or scheduling before retry |
| PVC remains Pending | StorageClass, binding mode, provisioner events | Repair storage outside KubeClaw |
| `ImagePullBackOff` | Selected digest and `ghcr-secret` | Repair pull identity; do not replace the digest |
| Init container fails | Init logs, code bundle commit, Secret mounts | Correct the named input and redeploy the affected role |
| SPIFFE mount fails | CSI driver and SPIRE agents | Repair identity infrastructure before agents |
| Readiness fails | Pod logs, dependency endpoints, runtime health | Repair the first failing dependency |
| Helm reports pending operation | Helm status and local Helm owners | Finish or roll back the existing operation first |

Use [Observe and Diagnose](diagnose.md) for evidence commands and symptom details.

## Recovery and Rollback

Do not run `teardown-all` to repair a failed first install.
It destroys the namespace and its retained state.

For a failed atomic agent upgrade, inspect Helm history:

```bash
helm history agent-nova -n "$NAMESPACE"
helm history agent-buster -n "$NAMESPACE"
```

Use a Helm rollback only when the previous release matches current data formats.
Do not roll back a database after an incompatible migration.

For a platform access failure, leave the cluster-dependent Ops Pod path.
Use the previously recorded host or control-plane route.

If the cluster itself is absent, stop here.
The repository has no complete host bootstrap procedure.

## Acceptance Boundary

This procedure establishes a source-backed installation path.
It does not claim a production-ready environment.

G01 through G03 and G11 through G13 remain live acceptance work.
See [Operational and Live Acceptance](../status/acceptance.md).

## Evidence to Retain

- Source commit and selected release manifests.
- Private overlay digest, without secret values.
- Context, namespaces, cluster version, CNI, and StorageClass facts.
- Rendered manifests in protected storage.
- Helm history, Pod image IDs, events, and smoke output.
- Failed output and the successful retry as separate records.
- Independent access owner and the last successful access check.
