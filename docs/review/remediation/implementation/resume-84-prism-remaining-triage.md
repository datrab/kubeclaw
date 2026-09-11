# Remaining Prism triage at bc777cd

Source tree `d90200377036cd73d1048e1d206e66cc9e8fed40` (remote
`d22ee1d298aa63050673e075b363ae4c996008dc`). Independent inspection; no production
changes. The register still has Worker-001/002/003, Engine-001 and Studio-002
partially implemented. This triage identifies work beyond unavailable native
Chromium/PostgreSQL/host gates. It does not declare all remaining work blocked.

## Locally actionable: HTTP attempt disconnect authority

`skills/prism/server/worker-service.ts` creates a request AbortController and
aborts it on response close (lines 25–26), but only nonce-table check and
HMAC authentication receive its signal. The admitted operation call at line 65
omits it. `worker-attempt.ts` neither accepts a signal nor passes one to the real
`WorkerAttemptExecutor`, although that core already supports caller cancellation,
phase deadlines and bounded terminate/drain.

Consequently the existing HTTP close listener cannot cancel admitted input
reads, rendering, or uploads. This is a concrete source omission in the scope of
PCR-PRISM-WORKER-003, whose original requirement expressly includes disconnect
policy. Existing operation-level cancellation tests do not exercise this gap:
they invoke `operation.terminate()` or the engine signal directly.

No intentional detached execution policy was found. Original Control performs
worker fetch inside a transaction/advisory lock and saves an accepted result only
after the response (`control-server.ts`, dispatch near lines 135–201). The worker
has no durable result recovery record for a lost response. Retry constructs a
fresh execution/attempt identity in `worker-envelope.ts`. Thus cancelling the
single attempt owned by the disconnected authenticated HTTP request is the
appropriate boundary; cancelling the shared engine globally is not.

Suggested real local regression: actual worker HTTP handler plus original
engine, artifact client and real content-addressed artifact handler; disconnect
while its input response is streaming, observe actual artifact connection close,
no completed engine cache entry, then prove a later request remains usable.
Root is implementing that independent reproduction and fix. This report does not
claim its test has run. The fix should guard normal completed responses, pass
the signal through the existing core option, and retain honest semantics for
artifact bytes already persisted before acknowledgement was interrupted.

## Locally actionable follow-up: service shutdown/drain

`skills/prism/server/worker.ts` has no SIGTERM/SIGINT handling, active-attempt
registry or invocation of `WorkerNonceDatabase.close()`. Node's default signal
termination therefore cannot await Core's operation termination and phase drain.
This is separate from the already fixed operation-level terminate callback. The
Control entrypoint at least registers `server.close` and pool shutdown; Worker
currently does neither.

This is a static lifecycle gap, not a measured browser orphan claim. A meaningful
local test can start the original worker process with an actual active artifact
read, send SIGTERM, and measure orderly socket/attempt settlement before process
exit. Native browser reaping and pod behavior still require their own gates.
Any fix should stop new admission and mark readiness unavailable, cancel only
owned active attempts, await bounded settlement, and close the nonce pool. It
must not report unresolved work as successfully drained. Config-only lint
extraction would not fix this behavior.

## Other scoped findings

No additional local source defect was found in the bounded engine cache,
canonical preview asset resolver, or projection roundtrip while examining their
remaining requirements. This is a scoped negative finding, not proof that the
entire system is defect-free. Cache eviction/replay durability and real browser
heap/capture acceptance still require their original gates. Worker resource
measurements remain explicitly parent-process deltas/RSS, not isolated concurrent
attempt/child accounting; that atomic containment integration is already recorded.
Full original Control/Worker transaction success/rollback still needs native PG.

The unchanged `preview-assets.test.mts` and `studio-roundtrip.test.mts` pass
**37 tests, 0 failures, 0 skips** on this checkout. Evidence:
`docs/review/evidence/resume-84-prism-review/studio-triage-tests.txt`.
The asset test exercises real HTTP/content-addressed bytes, digest/size/load and
cancellation denials. The projection cases use actual original functions. These
are not browser image decode, CSP or human interaction proof.

No source fixes, register promotions, native installation retries, fake provider
proof, CI runs or deployments were performed by this triage.
