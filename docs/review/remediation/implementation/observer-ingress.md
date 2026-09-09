# WP09 — Observer identity and bounded source ingress

Scope: PCR-HOSTOBSERVER-001/002 and PCR-AGENTSOURCE-001. Actual packages are
`skills/common/plugins/openclaw-agent-observer` (host extension) and
`skills/common/plugins/openclaw-agent-events` (v2 source). No registry edits,
production activation, additional central log store or retention changes.

## Behavior corrected

The host observer no longer suppresses events by run/type alone or by a truncated
128-character runtime text prefix. Runtime dedupe requires run, stream and source
sequence. LLM cross-hook matching requires model-call identity and a canonical
fingerprint of the complete normalized identity/payload. One hook/runtime pair
is matched; distinct runtime sequences remain distinct even for identical text.
An event without sufficient identity is retained. Dedupe entries are recorded
only after writer queue admission, with bounded expiring caches; a rejected
queue entry may be retried after capacity returns. Cache eviction is not log
or evidence deletion.

Array and record traversal share an active-path cycle set; cycles produce the
explicit `[Circular]` marker and shared acyclic references preserve each copy.
Normalization enforces the delivered contract's depth/node bounds and absolute
byte ceiling before constructing an unbounded normalized value. Ordinary
accessors and proxies are rejected explicitly. BigInt, Date, native Error and
normal model/tool output retain their established diagnostic representations.
Oversized/deep inputs produce an explicit normalization error, not hidden text
truncation. The test preserves a full 100,000-character tool result and a
pipeline-generated demo credential. Existing platform-secret policy and the
v2 source's deliberate metric-only projection remain unchanged; this does not
claim a new host raw-channel secret classifier.

The v2 source now has an explicit queue including the in-flight event in both
count and byte budgets. Defaults: 256 events, 1 MiB, 5-second drain deadline;
config schema and runtime validate `maxQueueEvents`, `maxQueueBytes` and
`drainTimeoutMs`. Overflow throws `AGENT_EVENT_INGRESS_CAPACITY` synchronously,
counts rejected events and exposes the reason. This is rejection/backpressure,
not an invented upstream acknowledgement. Status retains its default drain
behavior; `payload.waitForDrain=false` reads queue/gap/limit status immediately.
Status drain and shutdown respond to caller abort and the configured deadline.
Subscriptions stop before shutdown drain.

The activation API's `emit` callback has no cancellation argument. Aborting a
wait therefore leaves already admitted events in the bounded queue and allows
the existing emit to finish; a subsequent drain can observe completion. It does
not discard accepted events or create an unsafe automatic retry of an uncertain
emit. Emission failures remain counted with their concrete cause. Before the
actual `context.emit` journal commit, the queue is volatile and process death
can still lose it. No durable outbox or native host ACK/replay guarantee is
claimed. Clawdeck remains the intended log collection system; no automatic
local log deletion or new central storage was introduced.

## Evidence

Before changes, original functions produced the same key for two different
model outputs and a self-referential array raised RangeError. An actual original
source burst queued 1,000 events behind a held emit with zero admission rejection;
shutdown remained pending after signal abort. A temporary copy with original
HEAD host implementation and the new host regression suite failed all four tests.

After changes, four original-host regression tests and three root integration
tests pass. Host tests exercise actual normalization, observer, dedupe and writer
queue, with an injected recording Redis client: this proves admission behavior,
not Redis delivery. Root source integration uses the actual adapter and original
FileJournal: a 100-event burst admits three/rejects 97, aborts status/shutdown
promptly, then commits all three admitted events after the held emit resumes.
Byte overflow, deadline and concrete emit-failure diagnostics are covered.

Both existing package suites and typechecks pass. Canonical changed-source/test
ESLint passes. The original contract sync script supplies the generated host
contract copy; no contract shim or shared API change was needed. Root integration
lives outside the plugin package to preserve dependency boundaries.

Commands:

- `npm test --prefix skills/common/plugins/openclaw-agent-observer`
- `npm test --prefix skills/common/plugins/openclaw-agent-events`
- `node --test tests/verification/reliability/agent-source-ingress.test.ts`
- `npm run build --prefix skills/common/plugins/openclaw-agent-events`

Actual OpenClaw host integration and host→Redis→consumer delivery remain
unverified here. No `redis-server` is available on current PATH; the optional
PCR-REDISTRANSPORT-001/002 scope was not changed or claimed verified.
