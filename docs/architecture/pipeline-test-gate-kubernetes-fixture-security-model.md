# Kubernetes Fixture Security Model

Status: authoritative security boundary

Audience: security reviewers and operators
Purpose: define authority, data access, and cleanup controls

## Authority

The isolated provider receives only `kubernetes.fixture`. It cannot execute an
arbitrary command or contact an arbitrary network origin.

The trusted Buster engine invokes `kubectl`. The provider sends a bounded
request through the capability boundary.

## Namespace Boundary

The provider requests a broker-owned namespace. It cannot select a production
namespace. The operator allowlist restricts namespace prefixes.

The namespace controller creates the namespace and a namespace-scoped runner
role. Buster receives no direct namespace-creation authority.

## Manifest Boundary

The manifest file must remain inside the run-owned root. The engine reads the
file without following its final symbolic link. It verifies size and digest.

The engine rejects explicit namespaces and cluster-scoped resources. It also
rejects mutable workload images.

The engine accepts ConfigMap, CronJob, Deployment, Endpoints, Ingress, Job,
PersistentVolumeClaim, Pod, ReplicaSet, Service, and StatefulSet objects. It
rejects all other resource kinds.

The engine applies the exact checked bytes. It does not rewrite namespace or
image fields.

PersistentVolumeClaims and StatefulSet claim templates must select an
operator-approved storage class (or an explicitly allowed default class) and
request a positive whole-byte quantity. Per-claim and aggregate byte limits
bound storage consumption before any cluster request is made. StatefulSet
template storage is multiplied by the requested replica count.
Generic ephemeral volumes are denied; use an explicit bounded claim instead.

## Image Boundary

The operator allowlist restricts registry repositories. Each image must use a
SHA-256 digest. The selected image digest must match its reference.

## Secret Boundary

The lease can copy declared and operator-approved test Secrets. The engine and
controller enforce the same name allowlist. The fixture returns Secret names.
It does not read or return Secret values.

## Cleanup Boundary

The runner calls fixture cleanup after dependent work. Cleanup deletes the
lease in the default mode.

A retained fixture keeps the lease until manual release or expiry. The
controller deletes its namespace at either event. An expired lease cannot
create the namespace again.

## Limits

The operator limits manifest bytes, resource count, per-claim and aggregate
persistent storage, retention, and execution time. The plan also limits
provider memory, CPU, processes, logs, and evidence.
