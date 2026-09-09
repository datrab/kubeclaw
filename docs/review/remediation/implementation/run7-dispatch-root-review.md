# Root review: bounded causally owned Nova dispatch projection

Approved author source `4d44983` was reconciled with current repair head
`4f70d8f13e282e01d014fe82557d37c90d52cb71`. Final author checkpoint `2b9074b`
is backed at `ccdea8e3e57904202d73b92dade8a2f90a655df5`; independent approval
`2294fb2` is backed at `5db3cedc8520d9d9c1be3aee27dcaae2c22a4a04` on that exact
parent. Root integrated only the reviewed net delta, not the author's older
intermediate Reader implementations. All production/test sources at root
`9e3caa9f5440268f18db30cee0dd240fbb1eb338` match the independently reviewed tree.

Root inspected the original importer factoring, full canonical selected request/
receipt validation, original requested/accepted equality, exact Core stage/attempt/
effect/decision-artifact ownership, immutable archive reconstruction and three
distinct run/import/dispatch fences. The previously reproduced cross-Core and
canonical malformed-date holes are rejected. No manual receipt creates ownership
for an unrelated run. Final dispatch authorization is synchronous under CAS;
the fenced import read never recursively acquires its held writer lock.

Root reran **73/73** actual combined projection, bounded BlobStore, ArtifactStore,
source snapshot, admission, Attempt-v2 result projection, telemetry retirement,
inventory, Git/HTTP, competing process and SIGKILL cases; no skips. The original
remote-import/JUnit and authenticated remote-runtime/deadline commands passed,
including full shared-runtime/Nova type checks and unchanged canonical focused
lint. Raw commands and complete output:

- `docs/review/evidence/run7-root-dispatch-integrated.txt`
- `docs/review/evidence/run7-root-dispatch-original-gates.txt`

The root built the original native sandbox helper once from this checkout.
Its actual execution still fails EPIPE/initialization70. The genuine positive
therefore remains original Core quality stage → actual Buster HTTP non-null
errored result → original complete import/artifact → blocked Core → authenticated
original administrative cancellation. That is confirmed failed-history storage,
not successful native provider execution. Missing/corrupt evidence tests also use
explicit contract vectors and original stores; they do not simulate engine success.

The bounded operation removes only duplicate base64 archive bytes from dispatch
metadata. Every logical original job field and its immutable archive blob remain;
loads reconstruct the exact job. Exact duplicate persistence/replay does not
reinsert the full metadata or redeliver HTTP. Projected missing/corrupt archive
bytes fail closed; legacy full-record crash repair remains available. Actual byte
release is measured under unchanged quotas; record count and unique archive bytes
are not released. No logs, results, imports, sources or artifacts are deleted.

**PCR-OBS-002 remains incomplete.** This slice requires explicit original
providerPlan.revision. Derived sourceStageId needs the original pre-quality source
artifact selection/read/producer/commit→merge authority and a genuine original
implementation-session fixture; it is currently refused. Coordinated replacement
of every trusted local journal/store is not authenticated by a plain hash chain,
and this slice does not claim a new archive signature verification authority.
Broader original retention and required native workload acceptance remain open.
The frozen register stays eight verified and 39 incomplete; no all-47 completion.
