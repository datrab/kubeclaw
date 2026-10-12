# Independent review scope declared before author freeze

Reviewer did not implement closure projection. Criteria AC1–AC7/AC-DOC read before
final source review. No operational deletion or host mutation authorized here.

Inspect both directions of V3 encoding: only validated imported result projections
may source full closure data; regular writes must preserve compact references.
Quota counts must distinguish resident closure payload from all retained reference
and receipt bytes. Positive release requires actual net persisted bytes, not a
fabricated padding fixture. No-saving failure must preserve state across reopen and
a subsequent regular write. Duplicate intent releases zero; changed intent conflicts.

Additional adversarial cases: mixed reference/payload object; unknown reference
version/extra fields; missing result projection while retaining full completion;
cross-run resultKey or digest swap; duplicate projected or mixed full/projected
closure; stripped completion; corrupted/missing checkpoint; stale CAS; metadata
exhaustion. Recheck Admission duplicate ACK and pending-delivery preservation,
Clawdeck/completeness and reconciliation replay, finalized generation guard.

Use original store/CLI/FileJournal with actual GNU flock and filesystem. Review
real competing writer and SIGKILL old/new-state evidence without claiming every
power-loss instruction window. Global planner must remain non-executable; retained
completion intents, history, evidence and D07 protection must remain intact.
