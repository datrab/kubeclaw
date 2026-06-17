# Pipeline Contract Closure Audit

Generated: 2026-06-16T22:03:55.952Z

Audit root: `/home/node/.openclaw/workspace/git-repo`

This started as an audit/design artifact and is now being used as the contract-closure ledger. The requested path `/home/node/.openclaw/git-repo` was not present; the repository audited here is `/home/node/.openclaw/workspace/git-repo`.

## Status

- Test files inventoried: 252
- Pipeline-critical behaviors inventoried: 59
- Contract gaps recorded: 10
- Source files cross-checked: 332 files / 65777 current lines across 27 source groups
- Source groups with behavior traceability: 27 / 27
- Behavior statuses: TESTED=26, CONTRACTED=33
- Test classifications: QUARANTINE=10, REWRITE=129, KEEP=113
- Contract gap statuses: CONTRACTED=6, TESTED=4
- Standalone release-safe tests: 17
- Contract-first acceptance tests planned: 12, with 12 started

No pipeline-critical behavior row is left as AMBIGUOUS, BROKEN, or UNTESTED in this catalogue. A5 artifact authority, A6 lifecycle read-model replay, and A9 gate evidence authority are now suite-wired acceptance contracts. Full closure is still false while external Redis/gateway/deploy degradation matrices and isolated Kubernetes smoke remain environment-gated follow-up. Gaps that are not fully environment-owned remain TESTED with a required action. Many current legacy tests remain AMBIGUOUS because they are static source guards, stale documentation, mocks/fakes, or helper-only units; those are tracked for rewrite/demotion while the release gate moves to contract-first acceptance.

`index.json.normalized_summary` is the canonical machine-readable rollup. `index.json.source_coverage.files` maps every audited source file to a source group, every source group maps back to one or more behavior rows, and `index.json.acceptance_suite_plan` is the executable migration queue.

## Release Signal Rule

A test is safe as a release signal only when it proves that a real producer emits exactly what the real consumer accepts, or when it runs a live/runtime harness that observes canonical artifacts/messages/state. Static string guards and mock-only tests are useful migration guards, but they cannot be final release gates.

## Required Closure Direction

1. Build an acceptance harness around real boundaries: Nova task emitter, Redis transport, Buster consumer, output artifacts, completion selection, lifecycle/read models, notifications, and final terminal decision.
2. Preserve static surface checks as drift guards only after acceptance tests own runtime truth.
3. Move every critical path currently covered by mocks into a producer-consumer fixture.
4. Treat degraded/manual/fallback operation as explicit BLOCKED/DEGRADED evidence unless a contract grants clean success.

## Closure Implemented So Far

- A1 Nova-to-Buster task envelope is suite-wired and CONTRACTED.
- A2 Redis lifecycle now proves publish, consume, pending, missing `completion_stream` dead-letter before ACK, terminal-before-ack, invalid-envelope dead-letter before ACK, ack, trim, and reclaim through the shared queue/completion helpers; live Redis smoke verifies pending clears when enabled.
- A3 Buster `output_file` authority now proves canonical paths, identity, stale/wrong-run rejection, and terminal FAIL replacement.
- A4 Redis completion selection now rejects invalid canonical entries, conflicts, noncanonical source, and stale identity.
- A5 artifact authority now proves run-scoped replay surfaces are the only operator replay authority, `latest.json` is pointer-only, plugin artifacts are references, and diagnostic/fallback/stale artifacts cannot become completion/scheduler authority.
- A6 lifecycle replay now proves deleting/staling `read-models.json` rebuilds module/gate decisions from canonical lifecycle events and stale projections cannot override replay.
- A9 gate evidence authority now proves Buster, Review, Approval, and remediation/fix evidence carry gate/run/attempt/dispatch identity where required, while stale, missing-dispatch, and path-only evidence are rejected.
- A11 first degraded/manual terminal slice now blocks unresolved degraded evidence with handoff and halted lifecycle instead of clean success.
- A8/G8 suite timeout/config now rejects missing config, missing `suite_timeout_ms`, invalid timeout, and unknown suite names across all 12 registered Buster suites.
- A10/G5 notification identity now rejects path-only severe Discord/operator messages on both notification hook and telemetry sink paths while preserving existing valid notification-hook WARN/CRITICAL status presentations; explicit critical/actionable payloads require next action before sink dispatch.
- A8/G6 denied-capability matrix now turns missing browser/container/k8s/Lighthouse/static-server capabilities into critical ERROR verdicts with durable operator alerts.
- A12/G7 deploy/runtime gate now runs deployment truth plus Nova/Buster startup smoke as one contract.
- A7/G9 restart recovery now proves lifecycle read-model authority, diagnostic-only stale active-session files, gateway-confirmation requirements, lifecycle replay, and gate evidence authority.

## Still Open

- External matrices: live Redis invalid/dead-letter/no-completion timeout, gateway down/unreachable, deploy adapter degradation, and isolated Kubernetes smoke remain environment-gated follow-up.

## Files

- `01-test-suite-catalogue.md` — every current test/verification file classified.
- `02-pipeline-behavior-catalogue.md` — pipeline behavior inventory and coverage.
- `03-contract-gaps.md` — missing, broken, drifting, or ambiguous contracts.
- `04-artifact-message-state-model.md` — canonical artifacts, Redis messages, state, locks, and notifications.
- `05-acceptance-suite-plan.md` — contract-first migration plan.
- `index.json` — machine-readable summary, tests, behaviors, gaps, canonical model.
