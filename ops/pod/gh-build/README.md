# GitHub CLI dependency lock

The Dockerfile verifies the GitHub CLI source archive using `GH_SOURCE_SHA256`
from `versions.json`, then overlays these module locks. The CLI remains version
2.100.0; `golang.org/x/mod` is raised to 0.40.0 to address CVE-2026-56864 and
CVE-2026-56865 in the upstream release binary.

To update, extract the selected source archive, change the module requirement,
run `go mod tidy` with the pinned Go 1.26.8 toolchain, and copy both locks here.
The container build uses `-mod=readonly` and retains the upstream command and
authentication implementation. Its complete image must pass the security scan.
