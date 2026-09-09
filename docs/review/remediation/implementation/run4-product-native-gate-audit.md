# Product/controller/chart: precise native gate

Read-only clarification, 2026-09-09. Fresh remote sources: controller
`e21a2998f8b0e39b60705dfd8bbd6855452a0395`, chart
`47b392dc2aa36cb37fdbd8f63b1a6f10a1823973`, Product-port review
`459eaf9779a6bf735a1420cc12b5d98f276f45b3`. No download, build, control-plane
launch, deployment, CI or operational context check was performed in this audit.

## What previously failed—and what was never run

The saved [native check](https://github.com/datrab/kubeclaw/blob/e21a2998f8b0e39b60705dfd8bbd6855452a0395/docs/review/evidence/wave48-product-controller/native-k8s-context.txt)
contains only `error: current-context is not set` from `kubectl config current-context`.
It is **not** a failed API-server start, permission failure, failed binary
download, CEL compile error or measured cost rejection.

The [controller report](https://github.com/datrab/kubeclaw/blob/e21a2998f8b0e39b60705dfd8bbd6855452a0395/docs/review/remediation/implementation/wave48-product-controller.md)
explicitly leaves native CRD installation/static-cost admission untested.
`go test ./cmd/buster-namespace-controller` passed 55 original groups; Product's
five groups use the existing labelled HTTP Kubernetes fixture and real Go/TS
signatures/CAS logic. `product-cel-boundary.txt` is another Product test run,
**not Go CEL evaluation**. `helm-cel-boundary.txt` checks rendered rule strings,
UUID bounds and list-map structure; its printed render errors are expected
negative configuration tests. No envtest integration target or Kubernetes CEL
dependency exists in the root's standard-library-only `go.mod`.

## Exact missing native operation

Render the actual coupled chart's `buster-namespace-lease-crd.yaml`, submit it to
an original kube-apiserver, and require successful CRD establishment. This runs
the server's structural-schema and CEL compile/static-cost admission. Then use
actual custom-resource `/status` writes to prove append-only history, immutable
correlated map entries, removal rejection, and valid extension at the supported
128-entry boundary. Raw responses/server logs must remain evidence; rendering
or standalone expression evaluation cannot replace installation acceptance.

There is presently **no existing exact one-command native test to rerun**.
After a scoped harness has started and returned its own loopback kubeconfig,
the essential original-client operations are:

```sh
kubectl --kubeconfig "$ISOLATED_TEST_KUBECONFIG" apply -f "$RENDERED_LEASE_CRD"
kubectl --kubeconfig "$ISOLATED_TEST_KUBECONFIG" wait --for=condition=Established --timeout=60s crd/busternamespaceleases.kubeclaw.forgestack.ai
```

The harness must reject non-loopback/existing contexts, own temporary etcd state,
collect native positive/negative status responses, and stop both child processes.
It need not install workloads or run a production controller/cluster.

## Newly identified safe local avenue—not yet proven available here

Official [envtest documentation](https://book.kubebuilder.io/reference/envtest)
describes real etcd and kube-apiserver processes without kubelet or
controller-manager. That meets the API-admission boundary; it does not prove
namespace garbage collection, CNI, TokenReview integration, Tailnet/browser or
full controller lifecycle. Docker, privileged containers and cgroup mutation
are not inherently required for this bounded API test.

Fresh official [release metadata](https://github.com/kubernetes-sigs/controller-tools/releases/tag/envtest-v1.35.0)
provides a pinned candidate:

- `envtest-v1.35.0-linux-amd64.tar.gz`, **52,314,948 bytes**.
- SHA-256: `5716719def14a3fec3ed285e5e8c4280e6268854039b5073a96e8c0adafb1c02`.
- Download: `https://github.com/kubernetes-sigs/controller-tools/releases/download/envtest-v1.35.0/envtest-v1.35.0-linux-amd64.tar.gz`.

This is a normal local test-binary acquisition, not a paid resource or deployment.
Download reachability, archive contents, execution permissions and local process
resources are **not yet tested**. Metadata lookup for `envtest-v1.35.6` returned
404; do not invent that asset. Repository `KUBECTL_VERSION=1.35.6` pins a client,
not the production API-server version. A 1.35.0 run must be labelled exactly as
such, not claimed to validate an unknown live K3s version.

Next: acquire/checksum the pinned asset in an isolated test-tools directory and
implement the narrow native harness, if root selects this bounded avenue. Keep
the coupled integration gate until it actually passes. No evidence currently
establishes an unavoidable privilege or authority blocker for this local test;
equally, this read-only proposal is not a successful native gate or T01-F02
completion. The original full Product/operator requirements remain separate.
