# Buster quality gate protocol

This Nova-owned gate evaluates Buster suite evidence and remediation decisions
independently from Buster execution. It owns exact run/gate/attempt identity,
a closed completion and failure-class contract, contradiction checks, issue
normalization, canonical result reduction, and immutable evaluation evidence.

It lives in the Nova role bundle because Nova consumes and decides the quality
gate. Buster task publication, completion races and tail recovery, active
session state, fix/retest orchestration, transcripts, and full suite execution
remain explicit system parity blockers.
