# Prism worker service lifecycle continuation

PCR-PRISM-WORKER-003 still had an executable root cause after the attempt-level cancellation fixes: the original worker entrypoint had no SIGTERM/SIGINT handling, no admission stop or active request drain, and never closed its WorkerNonceDatabase. A default Node signal exit could not run the shared Worker Core's termination path.

The service now owns every handler's signal and settlement. Shutdown closes admission synchronously, rejects queued requests with 503/Connection:close, interrupts incomplete request bodies, cancels admitted attempts, waits for handler settlement and closes the actual nonce pool. Active responses stop keepalive so a finished cancellation result cannot leave service shutdown waiting for a separate idle timeout. Both signals share one shutdown. Original Worker Core and Prism operation ownership are retained.

One absolute service deadline covers the complete drain. Configuration is captured once in worker-config.ts, with a separate 20000ms default and positive timer-safe integer validation; original trust/URL/port defaults and required credential errors remain. Only that exact configuration file is added to the existing lint environment boundary list, like Control/Studio config; no general rule is relaxed. Canonical lint passes for all changed production/test files.

Core fulfilled results are inspected: failed cleanup, WORKER_PHASE_UNRESOLVED and WORKER_TERMINATION_FAILED quarantine further admission and prevent a successful shutdown report. Deadline failure cuts HTTP connections and returns failure; the entrypoint exits1 without waiting for stderr flushing. A process cutoff is not asserted to reap arbitrary browser children or external side effects.

## Real evidence

`docs/review/evidence/resume-84-worker-shutdown/` retains:

- Six child-process tests fail against original7d172b6 (normal Node signal exits, missing drain response/explicit failure). The unchanged functional assertions pass against the lifecycle implementation: SIGTERM/SIGINT during input read, during full-log upload after actual input-auth rejection, and during native pg startup exceeding the service deadline.
- The log-upload process cases intentionally retain the original HMAC Control handler and original SPIFFE-mode worker. Without a deployed trust proxy, input GET is refused401 and Core starts a genuine persisted failure-log upload. Shutdown drains this real upload and preserves WORKER_ATTEMPT_ERROR/errored. This is explicitly **not** a successful process-level trust/render proof. An earlier test incorrectly expected cancelled for that pre-existing execution error; its failed output remains as process-after.txt. No producer/client/auth shim was introduced to turn it green.
- Six real in-process HTTP tests include normal completed render/full-log persistence, read/upload disconnects, read/upload service drain with bound cancelled results, and interruption of an incomplete request body.
- The original native pg client connects to an actual TCP peer that withholds PostgreSQL startup. With a sufficient deadline, the original connection settles and the original pool closes. With a short service deadline, shutdown fails while a real native connection is demonstrably still open; its later settlement cannot rewrite that failed outcome. No Pool/query replacement or running PostgreSQL service is claimed.
- Combined original/new regression: 31 passed,0 failed,1 explicit native PostgreSQL SQL-cancellation skip. Prism typecheck, changed-file canonical lint and unchanged ownership gate pass.

The separate code reviewer identified a failure-exit dependency on stderr.write's callback. The final code uses best-effort logging followed by immediate nonzero exit, removing that unbounded dependency. Native Chromium/process-tree reaping, per-attempt CPU attribution and actual PostgreSQL SQL/recovery remain open. No finding promotion.
