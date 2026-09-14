# Ops Hubble CLI

This module builds the Cilium 1.20.1 Hubble CLI with patched gRPC and x/text
dependencies. The entry point is copied from `cilium/cilium/hubble/main.go`
under Apache-2.0; the command implementation remains the upstream module.
It changes the client shipped in the Ops image, not the cluster's Cilium version.

`go.mod` and `go.sum` lock the complete module graph. Use Go 1.26.8, matching
the digest-pinned `OPS_TOOLS_GO_BASE` in `versions.json`, when updating them:

```sh
go mod tidy
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -mod=readonly -trimpath -o /tmp/hubble .
```

The Docker build uses `-mod=readonly`; dependency resolution changes must be
reviewed in these lock files. Both Ops image builds must pass the HIGH/CRITICAL
image scan and the container smoke tests before their release receipts are accepted.
