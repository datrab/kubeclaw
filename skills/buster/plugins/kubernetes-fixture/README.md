# Kubernetes Fixture Provider

`kubeclaw.kubernetes-fixture@1` prepares an isolated Kubernetes deployment.

The provider consumes checked Kubernetes YAML and one immutable local-registry
image reference. It creates a bounded namespace lease through the
`kubernetes.fixture` capability. It returns typed internal endpoints and
Secret references. It does not build, expose, test, or reveal Secret values.

The default cleanup mode deletes the lease after dependent tests finish.
Retained fixtures use a bounded lease expiry. The controller deletes the
namespace at expiry.
