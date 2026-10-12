# Report adapter deadline classification — 2026-09-21

Criteria recorded before production edits. Running the original report-adapter
contract directly with the actual sandbox exposes a deadline reported as
`REPORT_ADAPTER_CANCELLED`, with `REPORT_ADAPTER_TIMEOUT` only in its cause.
The original timeout assertion remains unchanged. This is a separate correction
from the Buster specialist extraction; no native ownership completion is claimed.

| Criterion | Required observation |
| --- | --- |
| RD1 | The adapter's own total deadline remains a timeout after an actual running child is terminated and drained; original contract assertion passes. |
| RD2 | Caller cancellation is not reclassified as the adapter deadline, even if the caller uses the same error text. |
| RD3 | Cleanup failure retains its distinct failure and retained snapshot; no broad abort catch masks unrelated errors. |
| RD4 | Existing original adapter and JUnit tests, appropriate typecheck/lint and a meaningful old-defect negative control run on the changed source. Environmental or unrelated failures remain explicit. |
| RD-DOC | Runtime documentation states timeout/cancellation classification and cleanup precedence; evidence and fresh independent review identify this bounded correction. |

Implementation and bounded [independent review](independent-report-adapter-deadline-20260921.md) complete.
The broader runtime lint cleanup remains separate.

The small catch in `RegisteredReportAdapterRuntime.adapt` translates only an
Error with message `REPORT_ADAPTER_CANCELLED` whose cause is the exact internal deadline
reason, with that same reason winning the combined abort signal. It rethrows all
other errors unchanged. In particular, `ProcessInputCleanupError` has the distinct
`REPORT_ADAPTER_CLEANUP_FAILED` message and remains subject to the existing
snapshot-retention behavior. No generic process helper, timeout, resource budget
or original timeout assertion was changed.

The original report-runtime and JUnit adapter tests now pass **2/2** directly with
Node and the actual sandbox, without proot. New assertions check snapshot removal
after settled timeout/cancellation and a caller cancellation whose reason has the
same text as the internal deadline. Buster engine TypeScript passes. The original
pre-edit test failure is retained. Raw logs and source snapshots are in
`docs/review/evidence/report-adapter-deadline-20260921/`.

Canonical lint is **not green**: the runtime file has the same five pre-existing
rule violations before and after (depth, reader complexity, long/complex inner
adapt method and file length). The original file-length count grows from 345 to
350 logical lines with this fix; this is not described as a clean-lint result.
The changed contract test adds no lint violations. A separate structural cleanup
is still required to make the whole runtime file pass its existing rules.

The runtime architecture document now describes internal deadline identity,
caller cancellation and cleanup-failure precedence. This bounded correction does
not establish native Buster ownership or close the full finding.



Subsequent maintenance: the [independently reviewed runtime extraction](independent-buster-report-runtime-extraction-20260921.md)
now resolves all five historical lint violations while preserving this deadline
correction. Its original adapter and cleanup tests pass on the extracted source.
The earlier lint logs above remain the truthful baseline of this correction.
