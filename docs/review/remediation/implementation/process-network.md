# WP03 — Command termination and HTTP response boundaries

Local remediation for PCR-COMMAND-001, PCR-NETWORK-001 and PCR-NETWORK-002.
Baseline reviewed product source: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
This is process/loopback evidence, not a deployed pipeline or delegated cgroup
acceptance claim. Original review reports and evidence remain unchanged.

## Implementation

`CommandRunner` now tracks an execution until its stream close and cleanup
complete. Its process-group owner tracks TERM/KILL independently of leader exit,
with one grace deadline shared by termination and cleanup. A leader that already
exited cannot suppress signalling descendants holding the pipes. Repeated abort,
limit and shutdown triggers cannot restart grace. Shutdown awaits the tracked
cleanup promise, including already-exited leaders. A configured cgroup receives
its kill request at force escalation as well as the retained close cleanup.

The first command error disposition is preserved; `CommandRunError` keeps its
partial-output shape and now retains the underlying error chain. Already-aborted
and stopped direct runner calls cannot spawn work. Existing nonzero-exit and
shutdown exit-result behavior, native argv/environment handling, sandbox options,
resource calculations and public runner exports remain intact. The existing
oversized runner was separated into execution, process-group, resource sampling,
cgroup and type helpers to satisfy canonical lint without disabling rules.
The package-boundary test now scans all source files, including these helpers.

HTTP response handling reads Fetch's decompressed chunks and checks each chunk
before retaining bytes over `maxResponseBytes`. It cancels and releases readers
on success and on redirect, declared-size, streaming-size, status or abort error.
The timeout/caller-signal wrapper now covers both headers and the entire body.
`NETWORK_TIMEOUT` and `ADAPTER_CANCELLED` no longer depend on whether headers
arrived; the first aborting signal supplies the disposition and original cause.
Status, response header and JSON/text return shapes and confidential invocations
remain compatible with existing consumers.

D08 boundary: neither implementation retries an external operation. Cancellation
or timeout is not evidence that a remote mutation or command side effect did not
happen. Callers must reconcile uncertain outcomes using their existing remote
identity/idempotency/receipt contracts.

## Before evidence actually rerun

- Original runner, real `/bin/sh` exiting after starting `/bin/sleep 1.2` with
  inherited pipes: a 200 ms execution limit plus 25 ms grace returned
  `COMMAND_TIMEOUT` after **1206 ms**. The same call after remediation completed
  after **206 ms**. This is actual process execution, not mocked child events.
- The new process-group test first ran against the unchanged runner and failed
  its bounded timeout assertion: a SIGTERM-resistant pipe-holding descendant
  was allowed to reach its five-second self-exit. The unchanged runner did not
  reach that test's later abort/shutdown cases; no baseline passes are claimed.
- The new HTTP regression first ran against unchanged adapter code. Real chunked
  and gzip streams reached end-of-stream before size rejection; declared-size
  and redirect rejection failed prompt-close checks. Header timeout retained
  its code, but body timeout was native `TimeoutError`; active body abort exposed
  the caller's error directly. Header abort lost the caller reason. The run
  reported seven failing cases, rather than concealing them after the first one.

## Current local verification

Node v24.19.0, actual local processes and actual loopback HTTP:

- `npm test && npm run build` in both `command-runner` and `network-http` passed,
  including unchanged original functional assertions plus the new regressions.
- Process-group tests require the leader to exit first, confirm its descendant
  is alive with inherited pipes, and exercise timeout, active abort and shutdown
  against a SIGTERM-resistant descendant. All three finish promptly and confirm
  the descendant is dead before test cleanup. A representative current run was
  650 ms for a 600 ms execution limit plus 40 ms grace, 118 ms for abort, and
  128 ms for shutdown (the latter two include fixture startup).
- HTTP tests verify early connection close for chunked overflow, decompressed
  gzip overflow, declared oversize and redirect; timeout and active cancellation
  both before headers and during body streaming; cancellation cause identity;
  valid compressed UTF-8 and a response exactly at the 128-byte budget.
- Runtime-dispatch's existing `npm test` passed, including its original native
  HTTP/confidential consumer path. Canonical ESLint on all source/test JS/TS
  files of the two modified packages passed. Package TypeScript builds passed.
- Independent reviewer reran both complete package suites and additionally used
  real processes for pre-aborted invocation, invocation after shutdown, missing
  executable plus shutdown completion, and five abort/shutdown races. Those
  probes passed; no scoped blocker was identified.

## Remaining integration and environment limits

The existing Buster direct-command integration gate did **not** pass. Its first
positive invocation in the fixes checkout returned a missing generated
`foundation/isolation/plugin-sandbox` executable (`ENOENT`). The same gate in
the untouched review checkout has that binary but returned exit 70 at the same
first assertion. Neither run proves later sandbox assertions; canonical sandbox
build/runtime work is coordinated separately, and its tests were not weakened.

POSIX groups do not contain independently created sessions. The stronger Buster
sandbox/cgroup boundary, cgroup delegation, hard resource enforcement and complete
orphan reaping are not established by these local tests. Cgroup cleanup remains
best effort. Resource sampling semantics were retained; this execution environment
uses process-namespace PIDs distinct from the proc mount IDs, so the regression
records each process's `/proc/self/stat` ID for liveness inspection and its native
PID for signalling. It does not treat sampled resource figures as hard-limit proof.

HTTP retained payload bytes are bounded before chunk retention. This is not a
literal process-heap limit: Fetch/decompression may hold an incoming chunk, chunk
metadata has overhead, and final concatenation, decoding and JSON parsing create
bounded copies. No unbounded full-response `arrayBuffer()` remains. No production
endpoint, TLS/auth infrastructure, OOM stress, deployment or operator acceptance
is claimed here.
