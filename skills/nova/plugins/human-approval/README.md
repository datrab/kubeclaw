# Human approval

Deterministic v2 approval stage.

The package owns:

- strict approval input and configuration validation
- explicit `pending`, `approved`, and `rejected` guidance handling
- operator-issuer authentication for terminal guidance
- bounded expiry calculation with a 60-minute default
- canonical operator request construction
- canonical durable signal-wait construction and adapter-response validation
- canonical passed, blocked, and wait stage results

Pending approval intentionally uses both `operator.request` and `signal.wait`.
Approved and rejected resume guidance performs no capability calls.

Terminal guidance must contain:

```json
{
  "decision": "approved",
  "issuer": {
    "type": "operator",
    "id": "the-configured-issuer-id"
  }
}
```

`rejected` guidance may additionally contain a non-empty `reason`.

This extraction does not claim complete migration of the legacy signal
transport, persisted approval transitions, timeout resolution, or resume
orchestration. Those remain final-cutover dependencies.
