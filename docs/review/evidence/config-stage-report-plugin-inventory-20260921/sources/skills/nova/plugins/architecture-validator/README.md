# Architecture validator plugin

Owns the deterministic architecture-review instruction protocol, strict closed
output parser, contradiction checks, canonical result reduction, and immutable
report artifact. Agent judgment remains legitimate and is deferred to final
E2E; package tests exercise the complete v2 dispatch and artifact path locally.

Architecture has only two outcomes: `passed` and `blocked`. Non-blocking
findings are persisted with a `passed` result and evaluated by the separate
architecture instance of `kubeclaw.human-approval`. The passed result publishes
the immutable `architecture.review` fact as `clean` or `approval_required`, so
core skips the approval stage entirely for a clean review. A `blocking` finding
blocks the architecture stage directly. Architecture never emits `request_fix`.

Source-bound workflows supply `source: { projectId, repositoryRoot, architectureRef,
paths }`. The existing repository adapter resolves source HEAD and the architecture
ref, reads the declared files at that immutable revision, and passes their actual
bytes, regular-file modes and digests to the reviewer. Declared review inputs must
be regular Git files; symlinks are rejected. The trusted stage attaches this subject to the
stored report and rechecks both revisions before publishing it. A dirty source,
missing declared review coverage or moved ref blocks. Configure
`git.repository.read` with the existing `kubeclaw.repository-adapter:repository`
provider and narrowly appropriate `allowedPrefixes` alongside the existing grants.
Source-less reporting remains possible, but its report cannot authorize Blueprint
sync or implementation. This does not enable acceptance of blocking findings.
