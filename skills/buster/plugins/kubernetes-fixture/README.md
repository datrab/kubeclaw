# Kubernetes Fixture Provider

`kubeclaw.kubernetes-fixture@1` prepares an isolated Kubernetes deployment.

The provider consumes checked Kubernetes YAML and one immutable local-registry
image reference. It creates a bounded namespace lease through the
`kubernetes.fixture` capability. It returns typed internal endpoints and
Secret references. It does not build, expose, test, or reveal Secret values.

The default cleanup mode deletes the lease after dependent tests finish.
Retained fixtures use a bounded lease expiry. The controller deletes the
namespace at expiry.
# Generated demo credential output

When `testCredentials.mode` is `generate`, the controller creates an immutable
Secret bound to the lease UID. Existing key-only or foreign Secrets do not acquire
generated provenance. The runtime reads the exact Secret only after verifying
the controller's source record, then checks its UID, resource version and value
digest. Only those verified values appear in the optional
`kubeclaw.generated-demo-credentials@1` output with deployment image/manifest
identity. This output does not prove application login or operator delivery.
