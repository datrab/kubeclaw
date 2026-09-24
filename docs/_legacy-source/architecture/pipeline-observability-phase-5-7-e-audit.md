# Pipeline Observability Phase 5.7-E Audit

Status: complete

## Outcome

Nova now has an idempotent observability reconciliation loop.

## Reconciliation rules

- Import a durable result only for the expected attempt and claim generation.
- Record each import once in the chained Nova journal.
- Reconnect to a claim that has not expired.
- Requeue an expired claim with the next generation.
- Reject and requeue a result that became durable after its claim expired.
  A result stored before expiry can still be imported after Nova restarts.
- Reject a result from a generation newer than Nova expects.
- Read durable closure completeness before it accepts a gate result.
- Continue an earlier development stage with a visible degraded state when it
  is safe.
- Stop a safety-critical or final authoritative gate when required evidence is
  incomplete.
- Keep raw logs and evidence bytes outside Nova.
- Serialize the latest-claim check, completion admission, and closure commit.
  An older worker cannot close an attempt after a newer claim is durable.
- Match the durable plan and node owner before importing a result.

## Proof

The focused proof stores 20 worker results in mixed completion order. It then
restarts Nova after the first 10 imports. The restarted Nova maps all results
to the correct nodes and does not import any result twice.

The same proof covers reconnect, requeue, degraded development work, and strict
final-gate behavior. This matches Decisions D-106 and D-107.

The Buster restart proof also skips stale generations and hands an accepted,
durable completion to Nova. It does not run the provider a second time.
