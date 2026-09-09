# Nova dispatch projection: incomplete source checkpoint

The original Store/dispatch/import/operator path now implements the versioned
archive projection described in `run5-nova-dispatch-projection-design.md`.
Three actual storage regressions passed at the initial source checkpoint:
real Git source and original Core terminal snapshot/journal, original Buster
HTTP/service actual errored non-null result, original Nova completed import,
small metadata quota release, exact retained logical job/decision, fresh
dispatcher replay without an additional POST, legacy blob repair versus strict
projected missing/corrupt-blob rejection, stale and aliased scope/fence checks.

The actual native provider reports `TEST_PROVIDER_SANDBOX_NOT_BUILT`, zero
native target HTTP requests. This result is preserved as failed execution
history, not replaced by a successful result. The real dispatch POST count is
one; after projection exact original replay does not post again. This narrow
storage proof does not establish native provider execution or PCR-OBS-002 closure.

The checkpoint is incomplete and not approved for integration. Remaining work:
factor expanded original store/import code within canonical source discipline,
test evidence-bearing corruption and incomplete-import vectors, active/waiting
and uncertain histories, exact two-store/process races and actual SIGKILL,
bounded oversize record snapshots, independent review, root recheck. New original
RecordStore reads now use its declared maximum with the existing bounded
snapshot reader; regression coverage for that addition is still pending here.

The separate bounded BlobStore reader source and review are tracked in
`run5-blob-reader-boundary.md`; they must not be confused with acceptance of
this larger unreviewed projection. No finding status is changed by this checkpoint.
