# Human approval

Deterministic v2 approval package with two independently granted stage
registrations:

- `approval` is the ordinary explicit approval gate.
- `architecture-approval` is conditionally activated only when the architecture
  result publishes `architecture.review=approval_required`. It reads the latest
  run-scoped architecture artifact and delegates to the same durable operator
  request and wait implementation. A defensive clean-artifact check remains,
  but the canonical graph skips the stage without creating an attempt.

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

Both registrations use only the canonical v2 signal, wait, and resume
contracts. They contain no legacy transport or compatibility fallback.

Architecture approval additionally requires `git.repository.read` and
`artifacts.write` (namespace `kubeclaw.human-approval`). It rechecks the report's
source subject at the initial request and resumed decision and stores a report-
bound approval artifact. The wait's report digest binds the subject transitively;
changed source or plan revisions invalidate that authority. Source-less report
approval is retained as report-only evidence and cannot authorize Blueprint/Forge.
The generic human-approval registration and blocking-finding policy are unchanged.
