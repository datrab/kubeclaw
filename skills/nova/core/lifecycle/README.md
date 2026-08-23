# Lifecycle ownership

V2 core is the sole owner of canonical run, stage, attempt, wait, budget,
remediation, and transition state. Plugins return typed results; they never
select scheduler transitions directly.

## Result mapping

- `passed` completes the stage.
- `retry` creates a new attempt of the same stage while budget remains.
- `request_fix` traverses the stage's frozen `on.request_fix` edge, then
  schedules a new evaluation attempt after remediation succeeds.
- `wait` persists the plugin's typed wait.
- `orchestrator_required` persists a typed orchestrator wait. Resume creates a
  new attempt and preserves consumed attempt and remediation budgets.
- `rate_limited` pauses until the declared retry time.
- `blocked` stops the run. Ordinary resume is forbidden.
- `failed` and `timed_out` fail the run.
- `cancelled` cancels the run.

Every execution consumes an attempt. Remediation additionally consumes the
requesting stage's remediation-cycle budget. Exhausting either applicable
budget resolves to `blocked`.

## Administrative reopening

A blocked stage can only be reopened with an
`administrative-reopen.v2` decision containing immutable decision and
idempotency identities, actor, reason, target run/stage, timestamp, and one
continuation:

- `retry` authorizes exactly one additional attempt without resetting counters;
- `remediation` traverses the already-declared remediation edge;
- `cancel` records cancellation and terminates the run.

The full decision is appended to the run's administrative decision journal and
linked from lifecycle events by causation identity. Its actor must match the
principal returned by the trusted host authenticator and the operator-controlled
`administrativeDecisionIssuers` platform allowlist. The decision's caller-owned
actor field is never sufficient authorization by itself.
Phase 6 serializes administrative mutations within one host runtime; Phase 7
adds durable cross-process leases and fencing.

## Replay

Run initialization writes immutable registry and graph snapshots. Recovery
requires the same pipeline ID and graph digest, then folds the append-only
lifecycle journal into stage state. In-flight attempts consume budget and
return to pending. Remediation target/return state is reconstructed so a crash
cannot skip or duplicate the declared remediation path.
