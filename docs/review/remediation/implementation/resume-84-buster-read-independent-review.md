# Independent final Buster status-read failure review

Source `6b49d130ecc9b29bd77cdaddb437e487073925a1`, compared with reviewed36e2027.
No production edits by reviewer. Bounded correction approved.

The previous status-read suppression is now removed: failed reading of terminal
state throws AggregateError containing both original execution and read errors.
The existing owned catch retains it, closes readiness/admission and makes shutdown
fail. Actual known completed/failed/cancelled states still return as before.
No unknown state is converted to a terminal record or a successful shutdown.

Independent final original-store suite plus competing-process reservation test:
**7 passed, 0 failed, 0 skipped**. Buster engine typecheck exits0. The new actual
fsync corruption test preserves both SyntaxErrors, corrupt record bytes and
runtime file, and verifies readinessfalse/shutdown rejection. There is no mocked
store or native-provider invocation. This resolves the specific residual noted
in the previous independent Buster report; broader native recovery/ownership
requirements remain open.

Raw tests/types: `docs/review/evidence/resume-84-buster-read-independent/`.
Initial command redirection named the prior review directory after switching to
the new source; it failed before either command ran. The corrected invocations
created a new evidence directory and both ran successfully on the exact source.
No deployment, CI, blocked native gate or finding promotion occurred.
