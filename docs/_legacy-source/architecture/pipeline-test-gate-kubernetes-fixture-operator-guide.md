# Kubernetes Fixture Operator Guide

Status: deployment configuration reference

Audience: KubeClaw operators
Purpose: configure and verify the Kubernetes fixture capability

## Required Platform Parts

Install the Buster namespace controller and its CRD. Install `kubectl` in the
Buster runtime image. Give Buster lease-client authority in the controller
namespace.

The namespace controller owns namespace creation and deletion. The Buster
runtime cannot create a namespace directly.

## Configure Buster

Add `kubernetes.fixture` to `allowedCapabilities`. Add this object to the
Buster remote runtime configuration.

```json
{
  "kubernetesFixture": {
    "kubectlExecutable": "/usr/local/bin/kubectl",
    "controllerNamespace": "kubeclaw",
    "leaseApiGroup": "kubeclaw.forgestack.ai",
    "leaseApiVersion": "v1alpha1",
    "allowedNamespacePrefixes": ["test"],
    "allowedRegistryPrefixes": ["registry-local.kubeclaw.svc.cluster.local:5001/apps"],
    "allowedSecretReferences": ["test-registry"],
    "allowedStorageClasses": ["fixture-storage"],
    "allowDefaultStorageClass": false,
    "maximumManifestBytes": 4194304,
    "maximumResources": 128,
    "maximumPersistentVolumeClaimBytes": 10737418240,
    "maximumPersistentVolumeTotalBytes": 21474836480,
    "maximumRetentionSeconds": 86400,
    "maximumExecutionMs": 300000,
    "pollIntervalMs": 1000
  }
}
```

PersistentVolumeClaims are admitted only when their requested storage is a
positive, whole-byte Kubernetes quantity within both configured byte limits.
Explicit `storageClassName` values must be allowlisted. A missing
`storageClassName` is accepted only when `allowDefaultStorageClass` is true.
The same policy applies to StatefulSet `volumeClaimTemplates`.

## Verify RBAC

The lease client needs create, get, and delete access for
`busternamespaceleases`. The controller needs authority for each permission
that it grants inside leased namespaces.

Set `busterNamespaceBroker.controller.allowedSourceSecrets` to the same approved names.
The default empty list denies all Secret copying.

Run the signed live check from the control node after each controller or RBAC
change.

```sh
./scripts/deploy.sh nova-kubernetes-fixture-preflight \
  registry-local.kubeclaw.svc.cluster.local:5001/kubeclaw/WORKLOAD@sha256:DIGEST \
  kubeclaw-fixture-preflight
```

The check sends signed source from Nova to Buster. It creates a retained real
lease and deploys a real local-registry image. It waits for a real pod and
Service endpoint. The control node verifies the approved Secret copy without
reading its value. It then deletes the lease and namespace. It stores
`dist/verification/kubernetes-fixture-production-receipt.json`. Install the
approved public key at
`/etc/kubeclaw/production-receipt-authority.pub` and supply the external
operator private-key file before the run.

## Handle Retained Fixtures

Set a finite `maximumRetentionSeconds`. The provider cannot exceed this
limit. The controller uses `cleanupPolicy: retain` for retained fixtures.

The provider keeps the lease after the run. The controller deletes the
namespace at expiry. Manual lease deletion releases it earlier.

## Inspect Failures

Read the provider log and the BusterNamespaceLease status. Check the namespace
controller log when the lease reports `Failed` or `Rejected`.

Do not bypass the broker by granting Buster direct namespace authority.
