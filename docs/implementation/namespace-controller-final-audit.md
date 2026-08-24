# Namespace Controller Final Audit

Status: repository implementation complete; live acceptance requires deployment of this commit

## Result

The namespace controller is now a small test-environment broker. It creates and
deletes temporary namespaces. It grants one of two fixed access modes. It copies
only approved test Secrets. It can create or wait for a dedicated preview-login
Secret. It can create one Tailscale Ingress. It does not use port-forward.

## Access Model

- `deployer` can install namespaced workloads, Services, ConfigMaps, PVCs, Jobs,
  and ServiceAccounts.
- `tester` can inspect workloads and run bounded test workloads.
- Neither mode can read all Secrets, change RBAC, create an Ingress, manage a
  namespace, or use port-forward.
- ClusterRole names include the Helm release name.
- The controller can bind only the three fixed broker roles.

## Secret Model

- Source Secret names must be in the Helm allowlist.
- The allowlist contains test-only Secrets. It does not contain production Prism
  provider, runtime, or database credentials.
- The controller reads source Secrets through a namespaced Role with explicit
  `resourceNames`.
- Target Secret access exists only through a RoleBinding in the owned test
  namespace.
- Preview credentials use one dedicated Secret. Nova can read only that Secret.
- Secret values do not enter lease status, events, or logs.

## Namespace Safety

- Namespace ownership uses the lease name and UID.
- The controller does not adopt an existing namespace.
- Pod Security Admission uses the restricted profile.
- A ResourceQuota and LimitRange bound pods, CPU, memory, storage, and PVC use.
- A default NetworkPolicy permits only DNS, same-namespace traffic, approved
  Nova/Buster ingress, and the Tailscale proxy for the owned Ingress.
- Fixture manifests allow only approved resource kinds and digest-pinned images
  from approved registries.
- Fixture Services must stay internal with `ClusterIP`.
- Fixture pods must satisfy the restricted security profile.

## Lifecycle

- TTL cleanup applies to provisioning, ready, failed, and retained leases.
- Explicit lease deletion deletes the owned namespace.
- Cleanup is idempotent.
- Rejected legacy leases can remove their finalizer without deleting an unowned
  namespace.
- Existing CRD objects remain compatible during the chart upgrade.

## Prism And Pipeline Corrections

- Prism images require immutable SHA-256 digests.
- Control runs additive database migration in an init container before readiness.
- Baseline identity covers the approved manifest and all payload checksums.
- Engine retries reuse the exact stored Worker Core attempt.
- Document, approval, and baseline routes enforce project ownership.
- Artifact upload requires approval authority and has size and daily quotas.
- Persistent artifact and backup PVCs use the Helm keep policy.
- Backup restore proofs cannot overlap.
- CI pins the Trivy action to an immutable commit.

## Verification

The following checks passed:

- Namespace-controller Go tests with the official Go 1.22.12 toolchain.
- KubeClaw Helm lint and render checks.
- Prism Helm lint and render checks.
- Prism type checks and 29 unit/integration tests.
- Full `npm run verify:prism`, including real browser tests and a 10,000-row
  PostgreSQL/pgvector test.
- Kubernetes fixture implementation verification with zero mocks.
- Buster suite-runtime tests.
- Nova-to-Prism stage contract verification.
- Final structured Autoreview with no accepted or actionable findings.
- `git diff --check`.

The final live proof must use images and charts built from this commit. It must
create a new lease, install Prism through Service DNS, open Studio through
Tailscale, retrieve only the preview credential Secret, and prove full cleanup.
