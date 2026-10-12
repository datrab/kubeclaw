# Control logging failure counterexample

Root found a regression after the initial independent Control acceptance:
replacing `console.error` with direct `process.stderr.write(format(...))` changes
behavior when the child's stderr descriptor is closed. The original call permits
the process to continue; the replacement exits after the write. Preserving the
formatted text alone does not preserve error-handler availability.

Run `node docs/review/evidence/control-stderr-regression-20260921/probe.mjs`.
The actual Node runtime result is retained in `result.json`. Both cases close
only their own child-process descriptor; no host stream is changed. This minimal
counterexample deliberately expects the defective variant to exit 1. Its own
successful run proves the discrepancy, not acceptance of the Control server.

The author and independent reviewer were notified before this finding was
closed. The original accepted checkpoint must remain visibly superseded. A fix
requires an actual HTTP child-process regression, preservation of the original
logging semantics, an old-path negative control, appropriate original suites,
type/lint validation and renewed independent review. See the
[Control implementation](../../remediation/implementation/control-route-quality-20260921.md)
and [independent review](../../remediation/implementation/independent-control-listener-quality-20260921.md);
this evidence alone cannot establish their acceptance.

This counterexample does not cover every failed logging sink. The subsequent
independent review also tested a parent-closed stderr pipe: both the exact
original monolith and the corrected implementation terminate in that scenario.
That baseline limitation is retained in the independent report; it is not a
claimed fix or evidence that this extraction introduced that separate behavior.
