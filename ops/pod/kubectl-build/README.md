# Ops kubectl source build

The entry point is from Kubernetes v1.34.11 `cmd/kubectl/kubectl.go`, under
Apache-2.0. The client stays on the cluster's Kubernetes minor version. Building
with Go 1.26.8 removes the Go 1.26.5 vulnerabilities in the published binary.
The module graph also pins patched x/net, x/text and spdystream dependencies.

Update `KUBECTL_VERSION` in the Ops override in `versions.json`, the upstream
entry point and the `k8s.io` module versions together. Regenerate both module
locks with `go mod tidy`. The container build uses `-mod=readonly`.

The scoped Renovate rule pins the eight Kubernetes release modules to the exact
selected patch. Update that rule in the same change. Independently versioned
modules (such as klog, utils and x/net) remain eligible for dependency updates.
Before compilation, `verify-version.sh` checks the resolved Go module graph
against `KUBECTL_VERSION` and rejects mismatches or replacements.
