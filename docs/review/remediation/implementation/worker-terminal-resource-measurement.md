# Worker completion resources: implemented causal slice

Base `a8cf34f`, 2026-09-09. This change repairs the shared Core's premature
resource observation and the affected adapters' snapshot lifecycle. It does not
close PCR-PRISM-WORKER-002/-003 or PCR-BUSTER-ENGINE-001/-004 as complete findings.
Their missing whole-attempt isolation, native proof and restart ownership remain
explicit code/runtime work, as described in the existing ownership reports.

## Implementation

`WorkerAttemptExecutor` keeps its initial resource assessment, so an execution
overrun still prevents optional report finalization. It now measures again after
cleanup, evidence collection, full-log storage and result finalization. The
terminal receipt uses this last observation rather than the early snapshot.
Both Core admission and Buster's claim issuer reserve the additional phase.
The operation interface explicitly requires cumulative observations.

Invalid or missing final observations remove numeric resource fields. V2 also
invalidates the entire observation batch to `unavailable`; otherwise an earlier
observed value and an absent terminal numeric field would create an inconsistent
receipt. Exact accepted budgets/profile binding remain unchanged. Existing
execution/cancellation/quarantine errors retain their original diagnostic cause;
a failed final observation cannot overwrite the error that explains unresolved
work. A successful attempt with missing final observations fails.

Any CPU total or memory/process peak that decreases between two valid
observations is rejected. Taking a lower terminal value, silently adding peaks,
or keeping an earlier value as if it covered finalization would be incorrect.
Available-to-unavailable V2 observations never become invented numeric zeros.

Prism's operation now retains the maximum of its actual RSS observations, so
the second call cannot replace a previously observed larger value with a lower
current RSS. **This is still shared-parent sampled RSS.** Its CPU remains the
existing frozen execution-window measurement and its process count still omits
browser children. No complete attempt attribution or enforced peak is claimed.

Buster `IsolatedLoadedProvider` retains samples through native termination and
does not overwrite them when `terminate()` is called again. Recovery cleanup
occurs after the original session stops: its sampled CPU is added to the prior
session, while memory/process peaks use the maximum of those sequential
sessions. Recovery no longer replaces all preceding usage. Failed termination
still prevents snapshot deletion. Closed sessions return retained samples rather
than resampling a potentially reused PID. Sampling still misses short-lived
children and parent-side capability/report work; it is not kernel accounting.

## Verification

- Seven new tests execute actual local CPU work and file I/O through the
  original executor: cleanup-only and finalization-only CPU overruns, retained
  early rejection, absent final observation, successful terminal observation,
  V2 late CPU overrun and V2 invalid-final receipt binding. The workload uses one
  serial test process and does not impersonate a production provider/cgroup.
- The original deadline suite, original V1 executor/local-runtime contract gates,
  and actual Prism renderer/artifact-client/AgentProcess resource and cancellation
  tests are retained. The deadline order assertion now requires the second
  measurement. The old contract assertion that ignored a changed measurement
  during full-log storage now requires a CPU failure and retains the immutable
  receipt assertion.
- Three explicitly labelled contract vectors reject decreasing CPU, memory and
  process observations. They are contract vectors, not native attribution proof.
- The original committed executor fails the new native completion tests; the
  adjacent temporary baseline source was removed afterward. No production source
  was swapped or provider/browser replaced for this countercheck.
- Core, owning executor-test, plugin-runtime/Buster and Prism typechecks are
  required. Canonical lint results are preserved, including existing large-file
  and complexity debt; no baseline, rule or threshold is weakened.

Evidence: `worker-terminal-resources-before.txt`,
`worker-terminal-resources-after.txt`, `worker-terminal-resources-lint.json`,
and `worker-resource-native-gates.txt` in `docs/review/evidence/`.

Final serial verification: completion/deadline tests 17/17, Prism consumer tests
10/10, both original Core contract gates and all four owning typechecks pass.
The five original countercheck cases fail against the pre-change executor.
Canonical lint stays at 18 existing errors in the executor, 7 in the provider
loader and 30 in the Buster runner, with the same rule categories. The resource
assessor, Prism operation and changed/new test files have zero lint errors.
Existing complexity/length debt remains visible; this is not a clean repo-wide
lint claim.

## Native gates and finding disposition

The original C launcher builds locally. The original full process-restart gate
still fails before the successful Nova reconnect assertion, with the remote
attempt reported as `execution_error`. It does not reach the full Buster restart
proof. PCR-NOVA-GATE-005's obsolete-store read is already corrected to the public
import-store graph API; the native end-to-end proof remains open.

The original isolation-kernel gate reports blocked prerequisites: unavailable
`/proc/<pid>/task/<pid>/children`, no explicitly delegated cgroup root, and no
configured native credential-drop proof. The exposed cgroup2 mount is read-only.
PCR-ISOLATION-002/-004 native tests therefore remain open; no substitute cgroup
or host changes were used. Both original Chromium cancellation tests fail at
launch because the pinned executable is missing. No browser close/reaping pass
is inferred from renderer or HTTP cancellation tests.

The provider cleanup/recovery snapshot integration has source review and owning
typechecks, but its original sandboxed success path remains blocked on this
host. Do not count that as a passed native recovery test. The new generic tests
prove completion-phase accounting behavior for truthful operations, not full
Prism/Buster process attribution. Local late termination, escaped descendants,
all parent-side RPC/adapter work and durable post-crash quiescence still require
the complete attempt owner. No input cleanup is authorized by a terminal job
status alone, and no restart deletion policy changed in this slice.
