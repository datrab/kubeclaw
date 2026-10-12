# Atomic Buster cancellation — 2026-09-21

Status: implemented and author-checked; fresh independent review pending. The preimplementation criteria below remain unchanged. This is a separate correctness slice from CONFIG admission; no deadline changes or overall CONFIG/native acceptance.

## Observed race and trust boundary

Before this change, `remote-plan-service.ts::cancel` read `status`, then called `PreparedBusterPlanJobStore.transition`. The latter acquires the existing outer admission lock, reads the current record again, and performs digest-CAS through the inner record store. Between those two former reads a real `complete` could commit `completed`; cancellation then raised `BUSTER_COMPACTED_JOB_TERMINAL`. A concurrent `failed`/`cancelled` transition similarly made the expected-state check fail. Cancellation should return an already-terminal record unchanged, rather than treating another valid terminal winner as failure.

The outer admission lock remains mandatory: source attachment, completion and state transitions share it. The inner record lock and digest CAS also remain mandatory. Public cancellation must neither abort an executor based on stale state nor overwrite a terminal result. No in-memory cached status or lock-free read is proposed.

## Smallest proposed change

Add `requestCancellation(jobId, now): Promise<RemotePlanStatusV1>` to the concrete prepared store. Under the existing admission lock, read and validate the current record once. Return completed/failed/cancelled unchanged; return already-cancelling unchanged; otherwise persist cancelling through the existing record CAS. Extract only the common private status-write tail from `#transitionStatus`, taking the already validated current record. Existing transition expected-state checks and same-state idempotency remain intact.

Service.cancel calls this atomic method and returns immediately unless the returned state is cancelling. Only then remove queued work and abort an actual active executor. The no-active final cancelling→cancelled transition retains existing same-state idempotency, so concurrent cancellation calls can converge without resetting a terminal record. No second implementation or generic transition callback framework.

## Preimplementation acceptance

- BC1: completed/failed/cancelled winners remain byte-identical and are returned without aborting an active handle based on a stale read. Missing jobs and invalid records still fail.
- BC2: actual durable completion versus cancellation is serialized at the existing admission fence; deterministic barriers demonstrate both winner orders. No double record read inside the new method.
- BC3: concurrent active and queued cancellations converge to cancelled using actual service/store paths, preserve original receipt/status semantics and do not restart execution.
- BC4: retain the original remote-runtime 600-ms dispatch/300-ms cleanup assertions unchanged; record every failure. Timing improvement is not assumed from source structure. Preserve original shutdown/reservation and admission cases.
- BC5: private restoration of the old split read/transition must fail a deterministic race assertion. Canonical lint/types and fresh nonauthor review required.
- BC-DOC: distinguish real store/fence proof from modeled preparation/native ownership, preserve failed latency evidence, record exact changed source and original test assertion membership. No CONFIG/native completion claim.

## Independent design check before implementation

Root independently read the current service `cancel`, store `get`,
`#transitionStatus` and `#complete` implementations. The completed-winner race
follows directly from the split read: `#complete` may persist its result after
the service observes running but before cancellation acquires the admission
lock. The later transition then raises `BUSTER_COMPACTED_JOB_TERMINAL`. Failed
and cancelled winners encounter the expected-state rejection instead.

BC1–BC5 remain required. Deterministic test barriers must surround actual store
reads and writes in both winner orders, with real result bytes and persistence.
The previous split service path must fail the completed-winner assertion in an
isolated mutant. This design check approves implementation after the frozen Wait
verification ends; it is not a reproduced failure, runtime acceptance or a claim
that the separate 300-ms response failure is fixed. Both durable locks, record
CAS, validators and the original timing assertion remain unchanged.

## Redundant-validation inventory (not part of this proposed patch)

`records` currently calls `assertPreparedPlanJobRecord` → `assertBusterInput` → `assertPreparedHeader`, then `validate` repeats that input/header check before source-attestation verification. When a source exists, `assertPreparedSource` independently validates the header as well. Public `validate` is also an admission boundary and cannot simply stop checking input. The existing `buster-preparation-identities.test.mts` tests valid references and malformed scalar/array input/source identities; its recovered-header case checks foreign job/request/header identities. Those decoder tests alone do not prove persisted-store attestation rejection. Any later removal of repeated checks needs actual persisted malformed header/input/source and cryptographic attestation negatives; no validation change is included here.


## Deterministic concurrency oracle

For completion-first, pause `store.get` only after the real completion operation
has acquired its admission fence and read the running record. Start actual
`service.cancel`. A test observer records entry into the new request method, or
into transition for the private old split-path mutant after its stale status
read. Release completion; real result storage and CAS commit completed before
the cancellation writer can acquire the fence. The corrected path must return
that exact completed status, preserve result bytes, and leave an observed live
executor signal un-aborted. The old split path must raise its actual terminal
conflict and fail that same positive oracle.

For cancellation-first, pause the real read under its admission fence, start
completion, then release cancellation. Completion must reject its current-state
conflict while cancellation converges to cancelled. Barriers coordinate actual
operations; they do not replace filesystem writes, validation, results or locks.
Existing test timeouts bound failed coordination; no elapsed sleep chooses the
winner. Concurrent queued cancellation and repeated terminal requests cover
the no-active second transition and same-state behavior.


The isolated proposal now contains five cases: the two fence winner orders,
parallel queued cancellation/terminal stability, parallel active cancellation,
and actual persisted malformed status/record rejection. The latter recomputes
the durable payload digest, so invalid data reaches the domain decoder instead
of failing only at a checksum; failed cancellation must leave those exact bytes
unchanged. The initial staged completion fixture incorrectly used empty node/attempt arrays.
The first run rejected those bytes before reaching the intended race because the
real schema requires at least one node. The failure is retained. The corrected
fixture reuses the existing completed(job, { outcome: passed }) helper with valid
node/attempt digests and receipts. It proves result-store/CAS behavior, not actual
execution of a test runner.


## Executed author checks

Evidence directory: `docs/review/evidence/buster-atomic-cancellation-20260921/`.
Filesystem tests use the existing private proot/GNU flock/GNU tar tools; native
preparation authority is explicitly modeled by the existing shared fixture.

- `cancellation-initial`: 4/6 passed; two invalid result-fixture failures above, retained.
- `cancellation-run2`: all five new cases plus the original source-attachment/cancellation case passed, 6/6; no skipped or cancelled cases.
- `split-path-mutant`: restoring the old service split path failed both winner assertions (terminal-winner rejection and missing expected completion conflict). This is an actual semantic negative control, not import/syntax failure.
- `original-remote-runtime`: the complete original script passed with unchanged 600-ms dispatch/300-ms cleanup assertions. Prior failures and exact boundary diagnostics remain in the separate admission evidence. No general latency guarantee is inferred.
- `original-shutdown-admission`: 6 original shutdown plus 4 admission cases passed, 10/10.
- `types-final` and `lint-final`: exit 0 for the maintained cancellation test scope and all three changed production/test files.

`final-source-identities.json` binds 501 source/test/config files to snapshots.
`source-comparison.json` identifies the sole post-initial-capture change: the new
result fixture correction; production remained unchanged. Both original remote
script and fault module match the pre-edit snapshots byte-for-byte.

`verify:buster:cancellation` is the maintained scoped type/test command; the
normal `verify:buster:preparation` also invokes it. Original verifier paths and
the separately corrected explicit Prism Helm namespace remain present. Final
independent verification and acceptance are still required.
