# Pipeline Test Gate Phase 7-F Audit

Date: 2026-08-10

Superseded on 2026-08-12 by
`pipeline-test-gate-phase-7-closeout.md`. The original proof did not include the
production composition, bounded terminal-result transfer, real provider across
the remote boundary, or spawned-process restart coverage. Do not use the final
status below as the current Phase 7 status.

## Purpose

Phase 7-F proves the complete pipeline connection. It does not build ClawDeck
or its future storage services.

## Connected flow

The production flow is:

1. Nova stores the immutable plan job and repository archive.
2. Nova selects the new path and any old migration suites.
3. Nova rejects dual authority before work starts.
4. Nova submits the job through the authenticated remote transport.
5. Buster stores and verifies the job before execution.
6. Buster uses the existing plan runner and worker core.
7. Buster stores the result and evidence before completion.
8. Nova reconnects to the terminal job after response or process loss.
9. Nova verifies and copies all remote evidence.
10. Nova imports the full result once.
11. Nova makes the gate decision.

## Phase 7 proof command

`npm run verify:test-gate:phase7` covers:

- Remote job contracts and canonical digests.
- Durable Nova dispatch state.
- Authenticated submit, status, cancel, and evidence operations.
- Safe and bounded archive extraction.
- Lost response recovery.
- Duplicate request conflicts.
- Cancellation and request time limits.
- Registry reauthorization after restart.
- Two concurrent and isolated plan jobs.
- Real HTTP evidence transfer into Nova storage.
- Result, receipt, node, attempt, retry, and evidence verification.
- Blocking, advisory, report, cleanup, and agent-review decisions.
- Legacy deletion-ledger and dual-authority checks.
- Worker-core contracts and role isolation.
- Stale-claim rejection.
- Missing evidence and incomplete observability behavior.
- Recovery with 20 concurrent worker attempts.

## Retained behavior

The existing plan runner still owns:

- Fixtures and typed links.
- Retries.
- Concurrency limits.
- Cancellation.
- Provider isolation.
- Report adapters.
- Evidence collection.
- Cleanup.

The remote connection does not create a second execution engine.

## Deferred work

These items remain later work:

- A durable distributed queue and horizontal Buster selection.
- Direct upload to future shared object storage.
- Production service deployment and certificate management.
- ClawDeck storage, API, and interface work.
- Migration of each old suite to provided provider packages.

The current transport and file-backed durable stores implement the pipeline
contract. Later storage and queue drivers can replace them without changing
the plan, attempt, result, or gate contracts.

## Decision audit

Decisions D-110 through D-113 are implemented. Earlier plan, worker,
observability, report, capability, and role-boundary decisions remain intact.

## Verification result

The focused Phase 7 proof, full retained-capability suite, documentation
checks, whitespace checks, and production dependency audit pass. The
dependency audit reports zero vulnerabilities.

## Terra review status

The final review was attempted with:

- Model: `gpt-5.6-terra`.
- Reasoning: high.
- Codex binary: `/app/node_modules/@openai/codex/bin/codex.js`.

The Codex account rejected the turn because its usage limit was reached. The
reported retry time is 2026-08-16 at 05:08 UTC. No clean result is claimed.

## Phase result

The Phase 7-F implementation and local proof are complete. Final Phase 7
closeout is pending the required Terra review. Phase 8 must not start until the
review runs and all accepted findings are resolved.
