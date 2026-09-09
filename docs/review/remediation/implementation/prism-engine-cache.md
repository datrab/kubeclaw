# Bounded Prism engine memory cache

PCR-PRISM-ENGINE-001: the original engine retained every fulfilled Promise,
including capture screenshots and ARIA, for the lifetime of the worker. The
engine now separates active ownership from a bounded completed-result LRU.

Defaults are four simultaneous distinct operations, 32 completed entries and
16 MiB of completed serialized content, including key/fingerprint bytes. Four
limits local concurrent render admission; 32 allows a small recent retry window;
16 MiB matches the existing Prism envelope's maximum individual result size as
an aggregate retained-cache budget. These are memory policy defaults, not claims
about measured peak RSS or exact JavaScript heap size. Active operation input,
browser memory, serialization temporaries and caller-owned results are outside
that completed-byte metric. Constructor limits must be positive safe integers.

The engine snapshots the request before fingerprinting and scheduling execution.
Immediate caller mutation, including nested document content, therefore cannot
change the render cached under the original fingerprint. Existing operation input
validation remains in the original execution path.

Active entries are never evicted. Same-key concurrent calls share the original
execution, even when admission is full; a different request under an active or
retained key is rejected. Distinct new operations fail explicitly at the active
limit. Completion and failure always release active ownership. Completed results
are retained as serialized snapshots so later caller mutation cannot grow the
cache or corrupt replay. Oversized successful results are returned intact but
not retained. Read hits update LRU recency; count or byte pressure evicts only
completed entries. `cacheUsage()` returns a frozen snapshot of active/completed
counts, total entries and retained serialized bytes.

## Durable ownership remains unchanged

This RAM cache is an optimization, not an indefinite idempotency ledger. A call
whose completed entry has been evicted can execute again; callers needing durable
replay must use the existing authority. In the actual worker path,
`server/worker-operation.ts` uses `executionId` for the engine key and uploads
screenshots/ARIA as artifacts before returning the bounded worker result.
Control persists `request_digest`, `attempt_id` and `result` in
`prism.engine_operation` and checks that binding before replay. No alternative
replay store, server/storage change or weakening of worker evidence validation
is introduced by this slice.

RAM eviction removes no artifact, log, Git record or database row. D07 retention
is unchanged; no log TTL or seven-day demo policy is introduced.

## Local evidence and remaining gates

Passed: eight new tests plus all seven existing engine tests (15/15, zero skips).
They exercise the original Prism engine and renderer for 100 successful unique
renders, accumulated byte pressure, oversized success, concurrent coalescing,
admission/conflicts, caller mutation, failure cleanup and actual content-addressed
artifact storage. Artifact bytes remain readable after RAM eviction and after
reconstructing the real artifact store and engine. This last proof is filesystem
persistence, not a complete Control/database restart test.

Command: `node --test skills/prism/tests/engine-cache.test.mts skills/prism/tests/engine.test.mts`.
Prism TypeScript checking and canonical ESLint for the new helper/regressions pass.

The explicit native gate is
`node --test skills/prism/integration/engine-cache-capture.mts`. It performs 20
original Chromium captures and persists screenshots/ARIA with the real artifact
store. Locally it fails at original `chromium.launch`: the required executable is
absent. An official Playwright browser-install attempt could not complete because
the tool reported that network approval was cancelled before a decision returned.
No replacement browser, simulated capture or skipped prerequisite was used.

Actual long-lived capture/retained-heap measurements and complete Control-backed
restart replay remain open. No external model calls, CI, deployment or commit
was performed by the implementation agent.
