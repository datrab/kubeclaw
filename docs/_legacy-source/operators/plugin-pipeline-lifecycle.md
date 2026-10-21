# Operating the v2 plugin lifecycle

Status: implemented operating model

Every v2 run stores:

- `registry-snapshot.json`: exact package owners, digests, grants, and providers;
- `graph-snapshot.json`: frozen nodes, dependency/remediation edges, policy, and
  graph digest;
- `events.jsonl`: append-only lifecycle and plugin-domain events;
- `administrative-decisions.jsonl`: audited blocked-run reopening decisions,
  when present.

Resume is fail-closed. The current package digests, pipeline ID, and graph digest
must match the run snapshots. A typed wait signal must match the wait identity,
signal type, issuer, expiry, and idempotency rules.

`orchestrator_required` is resumable and preserves consumed budgets. `blocked`
is not ordinarily resumable. Reopening requires an
`administrative-reopen.v2` decision with an actor and reason. The allowed
continuations are one authorized retry, the already-declared remediation edge,
or cancellation. The actor must be present in the platform
`administrativeDecisionIssuers` allowlist. Administrative mutations are
also authenticated by the trusted host boundary; a caller-provided actor claim
alone is rejected. Mutations use durable cross-process leases, stale-owner
recovery, and fencing.

Troubleshooting signals:

- `RECOVERY_GRAPH_DIGEST_MISMATCH`: the definition changed; restore the pinned
  definition or create a new run.
- `RECOVERY_PINNED_PACKAGE_DIGEST_MISMATCH`: installed plugin code differs from
  the run owner snapshot.
- `ADMIN_REOPEN_STAGE_NOT_BLOCKED`: administrative reopening targeted a stage
  that is not blocked.
- `ADMIN_REOPEN_ISSUER_DENIED`: the actor is not in the configured
  administrative-decision issuer allowlist.
- `ADMIN_REMEDIATION_UNDECLARED`: the decision attempted an undeclared
  remediation path.
- `GRAPH_CYCLE`, `GRAPH_DEPENDENCY_MISSING`, or
  `GRAPH_REMEDIATION_MISSING`: definition validation failed before execution.
