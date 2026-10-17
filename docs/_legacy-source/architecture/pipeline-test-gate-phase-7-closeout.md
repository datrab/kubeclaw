# Pipeline Test Gate Phase 7 Closeout

Date: 2026-08-12

Status: complete

This closeout supersedes the 2026-08-10 final audit. That audit proved the
library parts but did not prove the production connection required by D-113.

## 1. Production Nova gate composition

Status: complete

`createProductionNovaTestGate` constructs the authenticated transport, durable
dispatch store, reconnecting dispatcher, verified result importer, evidence
store, Nova gate policy, and legacy authority router as one production path.
It rejects a relative state root and does not give Buster authority to Nova.

This composition connects D-110, D-111, D-112, and D-113.

## 2. Buster service startup and shutdown

Status: complete

`BusterRemotePlanRuntime` owns the HTTP lifecycle. It binds the configured
address, stops accepting requests, closes connections with a time limit,
aborts active jobs, and waits for terminal state. Repeated stop calls are safe.
`BusterRemotePlanService.shutdown` tracks active execution promises.

## 3. Recovery before service readiness

Status: complete

Runtime start calls durable recovery before it binds the listener. A proof
stores a `running` job, starts Buster, and checks that the job is terminal
before the ready health endpoint is available.

## 4. Production runtime configuration

Status: complete

Nova and Buster load separate versioned configuration files. These files define
endpoints, storage roots, TLS files, poll and shutdown periods, capability
policy, and all archive, request, response, result, evidence, and record limits.

The files name a token environment variable. They do not contain the token.
Both loaders reject a missing secret. Clear-text transport is limited to
loopback. A non-loopback Buster listener requires a TLS key and certificate.

## 5. Bounded digest-addressed result transfer

Status: complete

Completed status contains only `buster-plan-result-ref.v1`: the logical result
digest, byte content digest, and byte size. Buster validates and stores the full
result before it marks the job complete. The authenticated result operation
reads the result by job ID and content digest through a separate size limit.

Nova verifies the body size, byte digest, contract, logical result digest,
receipts, and identities before it imports evidence and makes policy decisions.

## 6. Real provider across the remote boundary

Status: complete

The unmocked proof creates and discovers a real provider package. Nova sends a
real archive through HTTP. Buster verifies and extracts it. The default
`TestPlanRunner` uses the worker core and an isolated provider process. The
provider reads the repository, writes evidence, and returns a contract result.
Buster stores the result and evidence. Nova verifies both and passes the gate.

This proof found and fixed a production defect. Buster put the repository
beside the workspace. The runner correctly rejected it. Buster now extracts
the repository inside the bounded provider workspace.

## 7. Nova and Buster process restart proof

Status: complete

Nova and Buster have executable production remote-gate entry points. The proof
starts both roles with production configuration and durable storage.

The Nova case kills Nova after Buster accepts a job. Buster completes it. A new
Nova process loads the same job and state, reconnects, imports the result, and
makes the same decision.

The Buster case kills both processes during execution. A new Buster process
changes the durable `running` job to an interrupted terminal error before it
reports ready. A new Nova process reconnects and imports the safe error.

## 8. No duplicate provider execution after restart

Status: complete

The process proof uses a real provider that writes one execution marker. After
Nova restarts and submits the same immutable job, the marker has one entry.

This proof found and fixed an idempotency defect. A duplicate submit conflicted
after the job left `accepted`. The store now compares the stable idempotency
key, job ID, and request digest and returns the current status for the same job.
A changed request still fails.

## 9. Large valid terminal result

Status: complete

The HTTP proof creates a valid result with 100 bounded findings. Its serialized
size is larger than the 64 KiB status limit. Status succeeds because it returns
only the reference. Nova reads the full result through the result limit and
validates all findings.

## 10. Production dual-authority rejection

Status: complete

The proof constructs the production Nova composition. It selects a resolved
provider and its legacy successor at the same time. Nova rejects the request
before it creates dispatch state, contacts Buster, or calls the old runner.

The retained proof also covers unknown suites, duplicate suite selection,
migrated suites, and the exact deletion ledger.

## 11. Decisions and documents

Status: complete

The decision ledger now names the production composition, runtime lifecycle,
runtime configuration, and new proofs for D-110 through D-113. The
implementation plan marks the corrected work as pending final verification and
Terra review. The two 2026-08-10 closeout audits are explicitly superseded.

The authority rules did not change:

- Nova owns the gate decision.
- Buster owns plan execution and durable remote results.
- The worker core owns one attempt execution.
- Providers and report adapters return facts only.
- The old suite runtime is a deletion-ledger migration bridge only.

### D-091 canonical Nova graph

Nova now stores one durable test-subgraph projection under the exact owning
pipeline stage ID. The projection contains the immutable test nodes and links,
all attempts, final node results, and declared agent-review work. It is a view
of the Nova-owned graph. It is not a second scheduler. Re-import and Nova
restart retain one identical projection.
If Nova stops after the graph write but before import completion, the next
import accepts the identical durable graph and completes. A different graph
for the same run and parent stage is rejected.

### D-093 stable test identity

Every resolved test has a `testIdentity` derived from project, module or gate
scope, suite instance, declared node ID, and matrix variation. Plan, run,
attempt, and provider-package identity are excluded. The identity stays stable
across runs and is present in provider invocation, attempt result, node result,
remote verification, and the Nova graph projection. Complete history metrics
remain a later ClawDeck view over these retained facts.

### D-094 committed source boundary

`buildCommittedSourceSnapshot` resolves one Git commit and tree, then creates
the archive with `git archive`. It does not archive the working directory. The
production Nova gate accepts a repository root and revision, then runs this
builder internally. It does not accept a caller-built archive or signed source
statement. The
remote job binds repository identity, commit, tree, archive digest and size,
creator authority, and owning pipeline stage. Nova signs this source statement
with a domain-separated Ed25519 signature. Nova receives the private key.
Buster receives only the public key. These keys are separate from the HTTP
bearer token. Buster verifies the configured trusted authority and signature
before it stores or executes the job. The signature covers the owning pipeline
stage, so a valid snapshot cannot move to a different stage. Buster also rejects a
statement that does not match the archive. The unmocked proof changes a tracked
file and adds an untracked file after commit; neither changed byte reaches the
provider. A forged source statement is rejected over the real HTTP boundary.

## Focused proof

- `npm run verify:test-gate:remote-plan`
- `node tests/verification/contracts/check-pipeline-committed-source-snapshot.mts`
- `npm run verify:test-gate:remote-runtime`
- `node tests/verification/contracts/check-pipeline-remote-runtime-config.mts`
- `npm run plugin-system:sandbox:build`
- `node tests/verification/contracts/check-pipeline-remote-real-provider.mts`
- `node tests/verification/contracts/check-pipeline-remote-process-restart.mts`
- `npm run verify:test-gate:remote-import`
- `npm run verify:test-gate:legacy-bridge`
- `npm run verify:test-gate:traceability`

## 12. Full verification

Status: complete

The focused Phase 7 suite and the full repository contract suite pass. All 33
plugin package live tests pass. All 40 executable plugin registrations contain
crash-containment proof. The TypeScript source check passes. Documentation generation,
references, and coverage pass. Git whitespace is clean. The production
dependency audit reports zero vulnerabilities.

## 13. Terra review

Status: complete

The independent review used Codex `gpt-5.6-terra` with high reasoning.

Accepted review findings fixed at Phase 7 included source attestation. That
attestation was later removed from the current deployment and contract. The
current route uses bearer-token authentication and binds the archive digest,
repository identity, revision, tree, and owning pipeline stage in the immutable
job instead.

- Production Nova builds the committed snapshot. Callers cannot supply
  independent archive and source-statement inputs.
- Identical graph writes resume safely after the graph-write/import-complete
  crash window. Divergent writes fail.
- Replayed imports completed before D-091 backfill the canonical graph.
- Invalid Nova private keys fail during configuration loading.
- Concurrent different requests for one idempotency key now conflict.
- Concurrent identical requests return the atomic winner even when local
  timestamps differ.
- Concurrent identical service submits start one execution.
- TLS is checked in the transport, production loader, and production factory.

One early TLS finding was rejected because the transport already enforced the
rule. Defense-in-depth checks were still added to the two production entry
points.

Final result: no accepted or actionable findings were reported.
