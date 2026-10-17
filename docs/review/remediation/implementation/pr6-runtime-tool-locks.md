# Runtime installer checkpoint — IFR-21-001 remains open

The software installer gaps have a tested partial fix. The finding is not
closed: independently checked browser archives and complete image rebuild
comparison remain unfinished. Trivy refresh data must also be preserved as an
explicit input to a repeatable build. Counts remain 139/154 locally verified.

Nova and Buster use full version/hash Python wheel locks, including transitive
dependencies and the existing separate Semgrep selections. Source distributions
are refused. The resolver confirms identical AMD64/ARM64 Debian12 Python3.11
resolution. Go tools use go.mod/go.sum, read-only module resolution, a selected
local toolchain and trimmed build paths. Ops and Prism final-stage apt sources
use the selected Debian snapshot. Nova/Ops binary downloads use committed
architecture hashes rather than fetching checksum files during the build.

The central generator owns all direct requirements. A hash receipt binds them
to the resolved outputs; checking never repairs drift. The trusted updater now
refreshes these locks and all nine binary-tool checksum families, including Ops
overrides. Its read-only mount includes the actual dependency modules. Pure
chart-lock validation was separated from the YAML/archive runtime so version
generation remains usable without npm dependencies in that trusted mount.

## Actual evidence

All logs are under `docs/review/evidence/pr6-runtime-tool-locks/`:

- `python-native.txt`: two passing native tests, no skips. Each of common,
  Nova Semgrep and Buster is installed twice into independent environments:
  respectively 35, 66 and 89 identical package versions/metadata hashes. Real
  Ruff and mypy reject actual defective Python. Tool CLIs execute. A real wheel
  install with a deliberately wrong hash fails before publishing Ruff.
- `go-native.txt`: one passing native test, no skips. Two fresh module/build
  caches produce identical staticcheck, govulncheck and gocyclo bytes using
  Go1.26.5. Module verification passes; an actual wrong Go sum is rejected.
  The first run reached identical binaries but failed during cleanup of Go's
  read-only module cache. The corrected test uses `go clean -modcache`; its full
  rerun passes. No production permission or verification rule was relaxed.
- `arm64-wheels.txt`: real hashed ARM64 wheel installation into a foreign target,
  not ARM64 execution. The updater also resolves all three locks for both
  architectures and refuses different selections.
- `downloads.txt`: actual bytes for all twelve newly pinned Nova/Ops artifacts
  match the committed AMD64/ARM64 hashes.
- `upstream-refresh.txt`: the actual updater verifies all nine central binary
  families and both Ops overrides against real upstream bytes, then regenerates
  versions/locks and compares with independently committed selections.
- `drift.txt`: three passing central-generation/lock regressions.
- `chart-lock.txt`: four passing actual archived Helm/chart validation tests.
- `trusted-updater.txt`: the genuine updater executes from an isolated trusted
  tool root without node_modules. Deliberately throwing workspace copies are
  never executed; generated selections remain unchanged. One test passes.
- `lint.txt`: canonical lint exits zero without diagnostics.

The attempted Playwright CDN downloads returned 195-byte HTML error pages.
They were not accepted as browser binaries or committed as archive identities.
The experimental browser download wrapper was removed. No complete Docker image,
browser launch, ARM64 runtime or deployed acceptance is claimed here. The
[historical operating contract](../../../_legacy-source/operations/runtime-versions-and-images.md#rebuild-contract-and-remaining-inputs)
describes those remaining inputs and the exact local reproduction commands.
