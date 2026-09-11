# Independent review of worker shutdown ownership

Reviewed local source commit `58790e7ac6cf40d5416caada8347697115efcf47`, exact tree
`71234293d4480e110f0850a56c7597889c6516a6`, against `7d172b6`.
Isolated checkout `/workspace/scratch/a51d993d444b/review-prism-shutdown`.
No production modifications by the reviewer.

## Result

No blocking defect found in the reviewed request ownership, admitted Core signal,
incomplete-body interruption, admission stop, dependency drain or unresolved-result
quarantine. The shutdown lifecycle uses one shared promise and one absolute
service deadline. Source review is conditional on addressing or explicitly
accepting the logging-dependent process-cutoff issue described below; this report
predates any subsequent correction and the separate child-process tests.

- Each HTTP invocation owns its controller; the signal reaches the original
  executor, which retains existing terminate/phase-drain semantics. Normal
  completed responses do not trigger cancellation.
- Shutdown synchronously closes admission before closing the listener and
  aborting requests. New requests including readiness/bootstrap are refused.
  Pending incomplete request bodies are destroyed, so their async iterator
  cannot silently outlive shutdown while waiting for more client bytes.
- Active handlers are removed only on promise settlement. Result codes for
  unresolved phases/termination failures and failed cleanup set an unsafe flag;
  subsequent requests are rejected and successful drain is not claimed.
- Nonce database closure happens after handler settlement and shares the service
  deadline. HTTP connection cutoff at timeout is explicitly distinguished from
  browser/external-process reaping. Multiple shutdown calls share one promise.
- Configuration captures existing auth/URL/port inputs once and validates the
  separate shutdown timeout before listening. The new 20-second default is an
  implementation choice, not an existing attempt timeout or a verified chart/pod
  grace budget. Actual pod shutdown ordering and browser reaping remain open.

## Follow-up concern: failure exit depends on stderr drainage

In `worker.ts`, the failure branch calls `process.exit(1)` only from the callback
of `process.stderr.write`. If the receiving log pipe is blocked, that callback
can wait beyond the service shutdown deadline. This could defeat the intended
hard process cutoff after an unresolved drain. Source-derived risk, not a
claimed measured pipe stall in this review. Root was advised to keep diagnostics
best-effort while ensuring a separate bounded failure-exit path. A subsequent
commit should record the chosen correction and its own review evidence.

## Independent verification

The following unchanged test files ran together on the reviewed source:
`worker-http-cancellation.test.mts`, `worker-service.test.mts`,
`worker-cancellation.test.mts`, and `engine-cache.test.mts`.
**24 tests passed, 0 failed, 0 skipped.** This includes actual HTTP caller
read/upload cancellation, normal completion with the real stored full log,
service shutdown for both I/O phases, incomplete body interruption, repeated
shutdown identity, and original engine/cache/resource tests.

`tsc --noEmit -p skills/prism/tsconfig.json` passed. Configured ESLint passed for
`worker.ts`, `worker-service.ts`, `worker-lifecycle.ts`, and `worker-config.ts`,
using the original repository config. Raw test output and command exit metadata
are under `docs/review/evidence/resume-84-prism-shutdown-review/`.

Tests use the original engine, artifact client, Core and real disk artifacts.
Explicit HTTP streaming stalls are fault injection and do not substitute a
browser or a successful PostgreSQL service. This review did not run root's later
child-process signal/deadline tests and makes no claim about those results.
Neither this report nor the passing checks close the native requirements of the
original 154 findings. No deployment, CI or installation retry was performed.
