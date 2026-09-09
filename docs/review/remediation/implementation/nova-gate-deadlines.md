# Nova remote gate deadlines and restart proof

Scope: PCR-NOVA-GATE001, PCR-NOVA-GATE002, PCR-NOVA-GATE005. Existing PCR-NOVA-GATE003/004 loopback checks and aggregate archive/evidence quotas are preserved. No registry, admission policy, retention policy, or sandbox changes belong to this patch.

## Original reproduction

Before editing, `node docs/review/evidence/nova-remote-timeouts.mjs` passed its defect assertions:

```json
{"probe":"accepted-job-timeout","error":"Error: NOVA_REMOTE_PLAN_TIMEOUT","remoteStateAtTimeout":"running","remoteState":"running","deleteRequests":0}
{"probe":"import-timeout","timeoutMs":5000,"observedMilliseconds":6500,"resultRequests":1,"settled":false}
{"ok":true,"phase":"7-C","transport":"authenticated-http"}
```

This uses the original authenticated HTTP transport, durable Buster service and Nova stores, with a real loopback fault proxy. Its existing provider executor is synthetic; it is not the separate real-provider sandbox/process proof.

## Implementation

`ProductionNovaTestGate.execute` starts the deadline before source inspection and Git archive creation. Async `buildCommittedSourceSnapshot` uses actual spawned Git processes, counts output before retaining chunks, terminates its process group on abort/overflow and escalates to SIGKILL after 250 ms. The follow-up correction below bounds close/group acknowledgement within a 1,500 ms cleanup budget. Repository metadata IO is awaited. Every builder call site now awaits the asynchronous API; invalid-input assertions use `assert.rejects`. There is no synchronous compatibility implementation. The historical archive quota probe only receives the necessary `await` migration.

The same absolute budget is propagated through dispatch persistence, submission/status HTTP, result and evidence import, and completion persistence. Owned timers and abort listeners are disposed. Boundary checks also compare wall time, so delayed timer callbacks cannot turn expired work into successful completion.

The existing durable job record serves as submission intent. Every dispatch starts by querying status, including jobs persisted by earlier versions. No new marker is needed for ordinary successful jobs. Reconnect after uncertainty polls status; transient status failure does not trigger another submission. Only an actual 404 confirming absence permits submission. A single cancellation request followed by status-only reconciliation handles deadline/caller abort even when the original submit response was lost. Cleanup has its own bounded budget (10 seconds by default; constructor override used by focused tests). Durable interruption records retain job/request identity, timeout/cancellation reason, observed terminal/unknown state and the last cleanup error. A cleanup 404 is not treated as cancellation proof: a lost in-flight POST could still be accepted later, so unresolved reconciliation remains unknown. Errors include the remote disposition. A failed reconciliation write is explicitly reported; it is not silently treated as a durable cancellation. Repeated attempts consume the existing configured record quota and remain subject to it.

HTTP status/result/evidence reads share a streaming bounded reader. It cancels/releases bodies on every exit, normalizes native body and header failures as retryable transport errors, and preserves caller cancellation reasons. Import timeout returns the gate timeout reason and leaves no completed graph for an interrupted evidence transfer. A later call can reconnect and complete import.

The original process-restart proof now reads `FileNovaGateImportStore.readExecutionGraphs()` from the configured `nova-state/imports` store and checks the stored job, source revision, schema and node identity. It no longer opens the obsolete independent execution-graph JSON path; no obsolete writer was restored.

## Verification

Commands from repository root:

- `node tests/verification/contracts/check-pipeline-committed-source-snapshot.mts`: PASS, committed tree excludes working-tree changes, invalid revisions and archive bounds retained.
- `node tests/verification/contracts/check-pipeline-remote-plan-runtime.mts`: PASS, original authenticated HTTP suite plus new `nova-remote-faults.mts` checks. Real lost-submit job is cancelled with exactly one DELETE; a POST deliberately accepted after cleanup already observed 404 remains explicitly unknown; unavailable cancellation leaves durable unknown; fresh store reconnect does not issue a second POST; native response body reset is retryable; held result/evidence bodies time out and close; normal reimport passes.
- `node --test tests/verification/reliability/nova-source-deadline.test.mts`: PASS, 3 tests after the independent-review correction. Git's supported compressor configuration starts a real Python compressor sleeping 30 seconds; the production deadline returns at about 550 ms, compressor is no longer live, and no HTTP submission occurs. A real competing flock holder proves an already-started atomic record write is drained before returning timeout and remains recoverable.
- `node --test tests/verification/reliability/nova-store-boundaries.test.mts tests/verification/reliability/result-reservation.test.mts`: PASS, 4 tests, including existing IPv6/IPv4 loopback, aggregate archives/evidence and competing result reservation.
- `node tests/verification/contracts/check-pipeline-remote-result-import.mts`: PASS, 7 gate decisions, verified-before-import evidence.
- `node tests/verification/contracts/check-pipeline-remote-runtime-config.mts`: PASS.
- `npm run typecheck --prefix skills/nova`: PASS.
- `npx --no-install eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/nova/core/test-gates/{deadline,dispatch-operation,http-response,source-git,transport-error,source-snapshot,production}.ts tests/verification/reliability/nova-{source-deadline.test,remote-faults}.mts tests/verification/contracts/check-pipeline-{committed-source-snapshot,remote-process-restart,remote-plan-runtime}.mts tests/verification/reliability/{nova-store-boundaries,result-reservation}.test.mts`: PASS. No rule suppression added.
- Linting both existing full dispatch/import modules remains nonzero for baseline findings. Baseline via `git show HEAD:<file>` piped to ESLint `--stdin --stdin-filename <file>` has 13 dispatch and 5 import findings. Current dispatch retains only its pre-existing HTTP constructor complexity 16; import retains the same verifier length/complexity, decision complexity, record complexity 25 and file length findings (319 to 339 nonblank/comment lines). This is not a full-module lint PASS.
- `git diff --check -- skills/nova/core/test-gates tests/verification/contracts/check-pipeline-remote-process-restart.mts tests/verification/contracts/check-pipeline-remote-plan-runtime.mts tests/verification/contracts/check-pipeline-committed-source-snapshot.mts tests/verification/reliability/nova-store-boundaries.test.mts tests/verification/reliability/result-reservation.test.mts docs/review/evidence/nova-archive-budget.mjs`: PASS.

After the initial cancellation repair, the unchanged historical timeout probe exited 1 at its defect assertion: expected `running`, actual `cancelled`. With the final status-first reconnect behavior, the same historical proxy hides the initial status response before a POST is allowed, so no job is submitted; its unconditional service cleanup exits with `BUSTER_REMOTE_JOB_NOT_FOUND`. The dedicated real-service regressions forward the initial status lookup, then lose the POST response or delay actual submission, and prove cancellation/unknown handling explicitly. Their body deadline assertions also pass. The historical defect assertions were not inverted to manufacture a green original report.

## Explicit limits

The operation deadline bounds cancellable Git/HTTP work and prevents subsequent work after expiry. Cancellation reconciliation can add up to its separate configured 10-second budget. Awaited durable filesystem operations are **not** raced or abandoned: an already-started atomic write can finish after the deadline, then report timeout. The shared foundation lock has its existing five-second acquisition bound, but kernel filesystem IO/fsync does not have a hard duration guarantee. The focused real-lock test deliberately verifies this overrun/drain behavior. Completion persistence that crosses the deadline can be durably complete while the caller receives timeout; restart recovers that identity, rather than duplicating writes.

Process-group acknowledgement is limited to the owned group. A compressor descendant that escapes that group can remain live. An inherited pipe can no longer hold settlement indefinitely: bounded disposal returns NOVA_SOURCE_CLEANUP_UNCONFIRMED, preserves the original timeout/cancellation cause, and closes local pipe ends. This is cancellation ownership for a local Git source builder, not a new sandbox boundary. Synchronous contract validation, archive hashing and signing are bounded by configured archive sizes but cannot be interrupted mid-call.

`node tests/verification/contracts/check-pipeline-remote-process-restart.mts` was attempted after the change and is **not green** in this environment: it exits at line 220, expecting the restarted Nova process code 0 but receiving code 1 and `test_gate.execution_error`. This occurs before the new graph assertions. The previously recorded real-provider proc/cgroup environment blocker remains outside this patch; the new public-reader assertion has not been reached in a successful full sandbox restart run. HTTP/durable restart checks are not substituted for that process proof.


## Independent review and bounded process follow-up

The independent reviewer reproduced the open sourceGit defect using actual Git's
archive compressor configuration, whose Python compressor spawned a separate
session retaining stdout. After abort and TERM/KILL, the promise was still pending
900 ms later and settled only after independent termination of the pipe owner.
Trust in the compressor does not supply a deadline or termination acknowledgement.

The parent assigned that narrow correction to the reviewer, so its implementation
requires a separate final review by the parent. `source-process-lifecycle.ts`
uses the existing foundation namespace-aware process-group capture/acknowledgement
primitives; it has no Nova-to-Buster dependency. Git completion, failure and abort
all await native close and owned-group acknowledgement, raced against 1,500 ms.
TERM has 250 ms before KILL. Missing acknowledgement produces an AggregateError
with `NOVA_SOURCE_CLEANUP_UNCONFIRMED`, retaining the original typed timeout or
cancellation cause and concrete cleanup/signalling errors. Local output pipes
are destroyed on incomplete cleanup, without claiming an escaped child was killed.

The new actual-Git escaped-compressor regression returns in about 2,017 ms for a
500 ms deadline and a 1,500 ms cleanup budget, checks the original NovaGateTimeoutError
cause and confirms the escaped pipe owner is still alive before explicit test
cleanup. The ordinary compressor deadline still passes at about 550 ms. All three
source/lock regressions, committed-source checks, Nova typecheck and changed-source
ESLint pass.

Separately, the reviewer independently reran the existing authenticated HTTP and
fault suites, all six original source/store/reservation regressions, and seven
verified-before-import decisions. Those passed. HTTP uncertainty remains explicit,
status-first reconnect avoids unconfirmed resubmission, body abort prevents a
completed import, and filesystem writes are deliberately drained with the documented
possible deadline overrun. No other scoped blocker was found in those paths.
PCR-NOVA-GATE005 still has no operational approval from this review: the complete
sandbox process-restart proof remains a separate required gate.
