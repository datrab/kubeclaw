# Logger correction evidence

The first acceptance missed the raw-stream error behavior. Root discovered the
closed-descriptor regression; this review reopened rather than attributing its
discovery to the original passing ordinary-HTTP checks.

`closed-stderr-child.mts` uses actual Control HTTP/configuration/crypto with a
rejecting database stub (no SQL claim). It initializes stderr and closes actual
fd2 only after the server receives the first request. Closing it before the HTTP
connect was an insufficient trigger: a subsequent socket can reuse the descriptor.
The preliminary pass logs are retained as inconclusive, not used for acceptance.

`closed-stderr-final.json` compares the corrected source, the exact retained
original monolith and the exact first-review source hash 5d2f664e… . Corrected and
original serve422, malformed JSON400, then health200 and remain alive. The regressed
raw writer exits1 without completion. The uncaughtExceptionMonitor only writes
failure diagnostics to stdout; it neither handles errors nor prevents termination.

`closed-pipe-baseline.json` and `closed-pipe-original-monolith.json` separately
close the parent read end of an actual stderr pipe after a READY handshake.
Corrected, global-console control and exact original monolith all exit1 with
EPIPE in this probe. That remains a baseline behavior, not a corrected or newly
introduced behavior claimed by this extraction. No universal broken-log-sink
availability guarantee is made.

The original accepted source snapshots remain intact under `source/` and its
manifest; corrected snapshots have a separate `corrected-source/` manifest.
