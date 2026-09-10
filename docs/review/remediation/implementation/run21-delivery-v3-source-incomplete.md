# Delivery-manifest v3 coupled source checkpoint

Status: INCOMPLETE, SOURCE IMPLEMENTED FOR BOUNDED REVIEW. This checkpoint is
not independently accepted, not native acceptance, not PCR-SDK-001 closure,
not a register update and not all-47 completion.

The exact source parent remains semantic checkpoint
`15f6a808ed1666c3b7a2a3909749e3d4ee377904`. Its tree was verified against the
current remote source checkpoint. MAIN advanced by documentation only after
this run began; eventual integration must compose this reviewed source onto the
then-fresh MAIN and repeat every affected gate.

## Coupled implementation now present

- public `@kubeclaw/delivery-manifest-contract` v3 package, public closed schema,
  portable create/parse/read owner and explicit legacy-v2 reader branch;
- creator rejects a caller-supplied digest before constructing the digest;
  portable serialization is the first observation of caller values, with
  getter/Proxy negatives;
- original Summary builder and registered stage select v3 only from the exact
  finite stage config, keep the two-argument builder and absent selector on v2,
  and add the portable write encoding only to a new v3 write;
- original evidence adapter retains its existing latest-read, complete ref and
  bytes checks, then delegates the semantic version map to the public reader;
- product compiler appends the delivery choice after source/report/Review
  choices. Existing arities default to delivery legacy; the genuine fresh CLI
  explicitly selects v3; legacy authoring import is explicit delivery legacy;
- recovery obtains the delivery mode only from the one exact Summary node,
  rejects selector placement on foreign nodes and recompiles all four identity
  dimensions before existing whole-graph pin verification;
- lockfile changes relative to the source parent are limited to the new
  workspace/link and the three explicit workspace dependency entries. Existing
  package pins and platform entries are unchanged.

Bounded results are preserved in
`docs/review/evidence/run21-delivery-v3-source-bounded.txt`: public contract
5/5 (including external-schema/runtime parity for evidence media type), all
affected TypeScript gates, original project-summary package tests and
the source compiler/legacy-import test passed with zero skips. The unchanged
remote-test-gate package suite did not complete because its original
demo-auth-smoke prerequisite requires an unavailable `go` binary; the exact
blocker is retained in `run21-delivery-v3-go-blocker.txt` and is not treated as
product failure or acceptance.

## Still open

The registered real-Core/disk-store v3 producer-consumer test now passes in
en/cs/da/tr/sv through the honest missing-import boundary. It preserves the
complete unsigned manifest, refs, writer request/receipt and disk effect and
lifecycle JSONL under `docs/review/evidence/run21-delivery-manifest-v3-stage`;
it is upstream-contract-fixture evidence and not provider/import success. The
independent compiler/recovery matrix covers 48 source/report/Review/delivery
and topology combinations plus missing, swapped, junk, unknown and foreign
selector negatives; raw output is
`docs/review/evidence/run21-delivery-manifest-v3-compiler.txt`.

Still open are full v2
corpus parity, the complete
schema/runtime bounds matrix, actual SIGKILL durability prefixes, genuine
FileNovaGateImportStore success, consumer negative matrix, repository package/
discovery/sandbox/pin/schema/lint checks and fresh-head bounded regression remain
required. The Go-dependent original suite remains blocked until that native
prerequisite exists. No provider, deployment, CI or third-party action ran.

Next action: freeze this expanded source remotely for independent review,
resolve review findings, then add/run the remaining schema/consumer/native
durability and repository matrices without altering native gates or the v2
compatibility domain.
