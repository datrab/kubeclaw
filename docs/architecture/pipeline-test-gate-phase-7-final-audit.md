# Pipeline Test Gate Phase 7 Final Audit

Date: 2026-08-12

## Result

Phase 7 is complete.

Nova is the only gate-decision authority. Buster executes immutable resolved
plans. The worker core executes one attempt. Providers and report adapters
return facts. The old suite runtime is only a deletion-ledger migration bridge.

## Production flow

1. Nova checks old and new authority before work starts.
2. Nova builds and attests a committed Git snapshot, then stores the job and archive.
3. Nova sends the job through authenticated HTTP or HTTPS.
4. Buster verifies the trusted source authority, source attestation, and immutable job before storage.
5. Buster runs the plan through `TestPlanRunner` and the worker core.
6. Buster stores evidence and the full result before completion.
7. Status returns a small digest-addressed result reference.
8. Nova downloads and verifies the full result and evidence.
9. Nova imports the result once and makes the gate decision.
10. Nova stores the test subgraph under the exact owning pipeline stage.

## Corrected defects

- Added the production Nova composition.
- Added Buster start, recovery-before-ready, and bounded shutdown.
- Added versioned production configuration and TLS/secret rules.
- Removed the full terminal result from the status response.
- Put the remote repository inside the runner workspace.
- Made duplicate submission safe before and after state changes.
- Made simultaneous identical and different submissions safe.
- Prevented one accepted job from starting twice.
- Added exact pipeline-stage ownership for the Nova test subgraph.
- Made graph projection replay safe across the graph-write/import-complete crash window.
- Added stable cross-run test identity without weakening current results.
- Replaced working-directory archives with committed Git snapshots.
- Moved snapshot construction and signing inside the production Nova gate.
- Added a domain-separated Ed25519 source attestation. Nova holds the private
  key. Buster holds only the public key and checks the trusted authority.
- Bound the owning pipeline-stage ID inside the signed source statement.

## Unmocked proof

The proof uses real HTTP, authentication, files, archive extraction, durable
stores, the default plan runner, worker-core attempt execution, an isolated
provider process, evidence transfer, result transfer, Nova import, and Nova
policy.

The process proof kills and restarts Nova and Buster. Nova reconnects to
completed work. Buster reconciles interrupted work before readiness. One
provider marker proves that Nova restart does not execute completed work twice.
The same proof retains the test subgraph, stable test identity, and committed
source revision across restart.

The negative process proof changes signed source metadata, recomputes the
outer request digest, and confirms that Buster rejects the forged source
attestation before provider execution.

A valid terminal result larger than the status limit completes through the
separate bounded result operation.

## Decision audit

D-091, D-093, D-094, and D-110 through D-113 are implemented. D-093 implements
the required history foundation, not the deferred history user interface. The
decision ledger traces all 113 decisions. Earlier plan, worker, observability,
report-adapter, capability, and role boundaries remain intact.

## Verification

- `npm run verify:test-gate:phase7`
- `npm run verify:contracts`
- 33 plugin package live tests.
- 40 executable registration crash-containment tests.
- 398 TypeScript source files checked.
- Documentation generation, references, and coverage.
- Git whitespace check.
- Production dependency audit: zero vulnerabilities.

## Terra review

Terra used `gpt-5.6-terra`, high reasoning, and
`/app/node_modules/@openai/codex/bin/codex.js`.

The final run reported:

No accepted or actionable findings were reported.

All accepted findings from earlier runs were fixed and retested.

## Scope boundary

Phase 7 does not add ClawDeck, PostgreSQL, object storage, a distributed worker
queue, or high-availability ingestion. The replaceable transport and storage
interfaces allow those later systems without changing the plan, attempt,
result, evidence, or gate contracts.
