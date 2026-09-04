# Pipeline Test-Gate Implementation Plan

Status: approved sequence; Phase 7 complete after corrected implementation, full verification, and clean Terra review
Design source: `docs/architecture/pipeline-test-gate-design.md`
Roadmap source: `docs/architecture/pipeline-test-gate-roadmap.md`

## Objective

Replace the closed Buster suite runtime with an extensible test-plan runtime.
Move one old suite at a time. Preserve every required old behavior. Add the
accepted improvements. Delete each replaced path after its cutover.

## Implementation Controls

### Decision Ledger

`docs/architecture/pipeline-test-gate-decision-ledger.json` maps every accepted
decision to its implementation phase and proof.

A verification check must reject:

- An accepted decision that is absent from the ledger.
- A duplicate decision ID.
- A proved decision without a proof command or proof file.
- A deferred decision that becomes a first-version dependency.
- A completed migration with an active legacy target.

Each implementation pull request lists the decision IDs that it implements or
changes. It updates the ledger in the same change.

### Parity Ledger

Each old suite gets a separate baseline with stable parity IDs. A migration is
not complete until every parity ID has one of these dispositions:

- `preserved`: The replacement proves the same behavior.
- `improved`: The replacement proves stricter or clearer behavior.
- `removed-defect`: An accepted decision requires removal of the old defect.
- `not-applicable`: Evidence proves that the item was not runtime behavior.

`more` is allowed. `less` blocks the cutover.

### Deletion Ledger

Each suite baseline lists all old code, configuration, protocol, documentation,
and test paths that must disappear or change during cutover. Negative checks
prove that the removed surfaces cannot return.

## System Creation Order

### Phase 1: Record the Unit Baseline

Status: complete

1. Inspect the unit implementation and output parser.
2. Trace selection, configuration, protocol, worker, result, and gate paths.
3. Find direct, contract, integration, and real-pipeline tests.
4. Assign stable parity IDs.
5. Record required improvements and deletion targets.

Output: `docs/architecture/pipeline-test-gate-unit-baseline.md`.

### Phase 2: Define the Minimum Contracts

Status: complete

Define versioned schemas for:

- Provider registration.
- Provider configuration.
- Resolved test plan.
- Provider invocation.
- Common attempt and final node results.
- Evidence and artifacts.
- Typed input and output links.
- Report-adapter registration and result.

The schemas reject unknown fields. They include only accepted fields needed by
the unit vertical slice or by a cross-cutting contract that cannot change later
without breaking compatibility.

Output:

- `contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json`
- `contracts/pipeline-test-gate/v1/src/types.ts`
- `contracts/pipeline-test-gate/v1/src/validation.ts`
- `tests/verification/contracts/check-pipeline-test-gate-contracts.mts`

Proof: `npm run verify:test-gate:contracts`.

Audit:

- `docs/architecture/pipeline-test-gate-phase-2-audit.md`

### Phase 3: Create the Provider Registry

Status: complete

The registry must:

- Load installed packages through the existing plugin system.
- Load independent registrations from one package.
- Validate every registration and schema.
- Reject duplicate registration identities.
- Lock the exact package version and digest.
- Freeze one registry snapshot for the pipeline run.

Output:

- `skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json`
- `skills/common/plugin-runtime/foundation/registry/build.ts`
- `skills/common/plugin-runtime/foundation/registry/types.ts`
- `tests/verification/contracts/check-pipeline-test-provider-registry.mts`

Proof: `npm run verify:test-gate:provider-registry`.

Audit: `docs/architecture/pipeline-test-gate-phase-3-audit.md`.

### Phase 4: Create the Suite Resolver

Status: complete

The resolver must:

- Read `.swarm/pipeline.json`.
- Treat declarations as a closed allowlist.
- Resolve fixed suite versions.
- Apply provider defaults, suite-template values, and project overrides.
- Resolve exclusions, additions, conditions, dependencies, and typed links.
- Apply blocking and advisory modes.
- Validate the complete graph.
- Produce one immutable resolved test plan.

The resolver does not execute providers.

Output:

- `skills/nova/core/test-gates/pipeline.ts`
- `skills/nova/core/test-gates/resolver.ts`
- `skills/nova/core/test-gates/types.ts`
- `tests/verification/contracts/check-pipeline-test-suite-resolver.mts`

Proof: `npm run verify:test-gate:suite-resolver`.

Audit: `docs/architecture/pipeline-test-gate-phase-4-audit.md`.

### Phase 5: Create the Test-Plan Runner

Status: complete

The Buster runner must:

- Execute registered providers from the resolved plan.
- Start independent ready tests within operator limits.
- Enforce named concurrency groups.
- Use one retry by default and preserve every attempt.
- Enforce time, output, resource, and artifact limits.
- Support cancellation and bounded termination.
- Collect declared evidence after success or failure.
- Request fixture cleanup after every terminal outcome.
- Record basic resource use.
- Return facts without making Nova's gate decision.

Output:

- `skills/buster/engine/test-gates/provider-loader.ts`
- `skills/buster/engine/test-gates/artifacts.ts`
- `skills/buster/engine/test-gates/runner.ts`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`

Proof: `npm run verify:test-gate:plan-runner`.

Audit: `docs/architecture/pipeline-test-gate-phase-5-audit.md`.

### Phase 5.5: Extract the Neutral Worker Core

Status: complete. See
[pipeline-worker-core-phase-5-5-audit.md](pipeline-worker-core-phase-5-5-audit.md).

#### Goal

Before Nova-to-Buster integration, separate the neutral worker lifecycle from
the Buster test-plan engine.

The extraction must not change test behavior. The current Buster runner remains
the first caller of the worker core.

#### Layer Boundary

The worker core owns one attempt lifecycle:

- Validate one immutable attempt envelope.
- Verify the selected worker profile and protocol version.
- Start one specialist operation.
- Apply cancellation and limits.
- Stream ordered logs and progress.
- Collect typed evidence.
- Request bounded cleanup.
- Return one typed attempt result.

The Buster engine owns test meaning:

- Resolve ready test-plan nodes.
- Resolve typed test inputs.
- Apply test dependencies and result filters.
- Apply matrices and test concurrency groups.
- Decide when a local retry is allowed.
- Combine attempt facts into final test-node results.

Nova owns pipeline meaning:

- Store the canonical pipeline graph.
- Apply global capacity and shared-resource limits.
- Apply gate policy.
- Start configured agent work.
- Decide distributed reassignment after worker loss.
- Make the final pipeline decision.

#### Language Boundary

All worker messages use versioned JSON contracts. No contract depends on a
TypeScript class, Node object, or in-process callback.

The first local extraction uses the current TypeScript runtime. A later Go
worker host can implement the same contracts when measurements show a clear
need. It must not require changes to provider, suite, result, or evidence
contracts. All implementations must pass the same worker contract and behavior
tests.

#### Step 5.5-A: Define Worker Contracts

Status: complete

Add versioned contracts for:

- Worker profile.
- Worker registration and health message.
- Attempt envelope.
- Attempt claim and claim generation.
- Attempt progress event.
- Ordered log part.
- Attempt result.
- Cancellation request.
- Worker lifecycle state.

Worker IDs in messages are not proof of identity. The distributed transport
must provide mutual authentication. Nova binds registration and each claim to
the authenticated worker identity. It checks that identity before accepting
progress, evidence references, cancellation acknowledgements, or results.

The attempt envelope must include:

- Pipeline, module, gate, plan, node, execution, and attempt identities.
- Attempt number.
- Fixed protocol version.
- Fixed worker profile.
- Specialist engine identity.
- Frozen package and provider facts.
- Granted capabilities.
- Limits.
- Typed inputs.
- Cancellation identity.

It must not include gate policy.

Proof must reject:

- Unknown fields.
- Invalid identities.
- Unsupported protocol versions.
- A changed profile during an attempt.
- Invalid claim generations.
- Invalid log sequence numbers.
- Invalid or incomplete terminal result identities.

Output:

- `contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v1.schema.json`
- `contracts/pipeline-worker-core/v1/src/types.ts`
- `contracts/pipeline-worker-core/v1/src/validation.ts`
- `tests/verification/contracts/check-pipeline-worker-core-contracts.mts`

Proof: `npm run verify:worker-core:contracts`.

Audit: `docs/architecture/pipeline-worker-core-phase-5-5-a-audit.md`.

#### Step 5.5-B: Extract One Attempt Executor

Status: complete

Move the provider-process lifecycle behind one neutral interface.

Keep this interface small. Add a field only when it is required to execute,
recover, or prove one attempt. Scheduling preferences, gate policy, advanced
queue controls, and distributed routing do not belong in this interface.

The interface accepts one attempt envelope. It returns one attempt result and
typed evidence records.

The executor must preserve the Phase 5 behavior for:

- Provider package verification.
- Process isolation.
- CPU, memory, process, time, log, result, and evidence limits.
- Cooperative and forced cancellation.
- Evidence collection.
- Cleanup.
- Resource measurements.
- Receipt facts.

The executor must not:

- Resolve a test plan.
- Apply test dependencies.
- Apply retry policy.
- Apply blocking or advisory policy.
- Make a Nova pipeline decision.

Implementation:

- `skills/worker/core/worker/attempt-executor.ts`
- `skills/worker/core/worker/digest.ts`
- `tests/verification/contracts/check-pipeline-worker-attempt-executor.mts`

Proof: `npm run verify:worker-core:attempt-executor`.

Audit: `docs/architecture/pipeline-worker-core-phase-5-5-b-audit.md`.

#### Step 5.5-C: Adapt the Local Buster Runner

Status: complete. See
[pipeline-worker-core-phase-5-5-c-audit.md](pipeline-worker-core-phase-5-5-c-audit.md).

Keep the current local scheduling behavior.

For each ready test node, Buster creates one attempt envelope and sends it to
the local attempt executor. Buster keeps:

- Parallel ready-node scheduling.
- Named concurrency groups.
- One default retry.
- Result-filter dependencies.
- Matrix execution.
- Typed value and artifact links.
- Final node-result construction.

No provider or suite contract changes in this step.

#### Step 5.5-D: Add the Local Worker Lifecycle

Status: complete. See
[pipeline-worker-core-phase-5-5-d-audit.md](pipeline-worker-core-phase-5-5-d-audit.md).

Implement the local states:

- `starting`
- `ready`
- `draining`
- `stopped`
- `unhealthy`

The local worker reports:

- Worker identity.
- Worker type and version.
- Protocol versions.
- Specialist engine versions.
- Capabilities.
- Total and available capacity.
- Active attempt count.
- Health state.

Local draining stops new attempts and gives active attempts a generous but
bounded completion period. It then cancels remaining work, collects evidence,
and performs cleanup.

#### Step 5.5-E: Prove No Behavior Change

Status: complete. See
[pipeline-worker-core-phase-5-5-audit.md](pipeline-worker-core-phase-5-5-audit.md).

Run:

1. Worker-contract tests.
2. Attempt-executor tests.
3. Existing Phase 5 runner tests without reduced coverage.
4. Cancellation, timeout, cleanup, and limit tests.
5. Provider package and evidence security tests.
6. Full plugin-system tests.
7. Decision traceability and documentation checks.
8. Independent review with `gpt-5.6-terra` and high reasoning.

Add comparison tests that run the same provider fixture through the old Phase 5
entry point and the extracted local worker entry point. Result facts, evidence,
and terminal state must match. Accepted contract additions are allowed.

#### Step 5.5-F: Close Integration and Define Role Surfaces

Status: complete

Send real Buster attempts through one persistent local worker runtime. The
runtime lifecycle and capacity report must cover active Buster attempts.

Collect final Buster evidence before the neutral worker result is signed. The
worker result must contain the same evidence references and byte totals as the
final Buster attempt.

Replace timer-based cancellation proof with a provider-ready signal. Add a
direct-versus-local comparison proof for the same provider fixture.

Define explicit runtime export surfaces:

- Nova orchestrator surface.
- Neutral worker surface.
- Buster specialist surface.

These surfaces are the first step for D-105. Phase 5.6 replaced the broad
Common overlay with role dependency-set assembly. See
[pipeline-runtime-packaging.md](pipeline-runtime-packaging.md).

Implementation and proof:

- `skills/nova/core/src/index.ts`
- `skills/worker/core/src/index.ts`
- `skills/buster/engine/src/index.ts`
- `skills/nova/pipeline.ts`
- `skills/buster/runtime.ts`
- `tests/verification/contracts/check-pipeline-runtime-role-surfaces.mts`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`

Proof: `npm run verify:worker-core:role-surfaces` and
`npm run verify:test-gate:plan-runner`.

#### First Implementation Outputs

Create or update:

- Versioned worker-core contracts and types.
- Neutral attempt executor.
- Local worker lifecycle controller.
- Buster adapter for the attempt executor.
- Worker-core contract and lifecycle tests.
- Updated Phase 5 runner tests.
- A Phase 5.5 audit document.
- Decision-ledger targets and proof.

Exact file paths are selected during implementation. The worker-core package
must remain outside the Buster-only test-gate namespace.

#### Deferred Distributed Work

Do not implement the distributed queue in the first extraction.

Later work adds:

- Durable queue storage.
- Mutual Nova and worker authentication.
- Authorization bound to worker type and current claims.
- Worker claims and renewal.
- Generous worker-loss grace periods.
- Claim fencing and stale-result rejection.
- Global and shared-resource concurrency.
- Duplicate-safe result delivery.
- Replayable live-log delivery.
- Direct upload to shared evidence storage.
- Multi-replica worker registration and health.
- Rolling updates and distributed draining.
- Queue wait limits and scheduling errors.

Distributed proof must reject stale claim generations, conflicting terminal
results, unauthenticated or incorrectly authorized worker messages, and log
streams that cannot be reconciled by sequence number.

The local and distributed modes must use the same attempt contracts.

### Phase 5.6: Create Exact Runtime Packages and Bundles

Status: complete.

Phase 5.6 replaced the broad Common overlay with exact role package sets.

- Phase A classified every runtime package and shared plugin.
- Phase B moved the mixed core into shared, Nova, worker, and Buster packages.
- Phase C added exact Nova and Buster role manifests.
- Phase D added dependency-set bundle assembly.
- Phase E proved role isolation and reproducibility.
- Phase F made package-set archives authoritative.

Nova receives no worker or Buster execution code. Buster receives the worker
core and Buster engine, but no Nova policy code. Shared packages have one
source and can be installed into more than one runtime.

The audit documents are
`pipeline-runtime-packaging-phase-5-6-a-audit.md` through
`pipeline-runtime-packaging-phase-5-6-f-audit.md`. The combined result is in
`pipeline-runtime-packaging-phase-5-6-final-audit.md`.

### Phase 5.7: Create the Durable Observability Foundation

Status: complete

Decisions: D-106, D-107

Purpose: make the pipeline side ready for ClawDeck, worker replicas, restart
recovery, and high telemetry volume without making Nova the telemetry proxy.

The target architecture is defined in
`docs/architecture/pipeline-observability-foundation.md`.

#### Phase 5.7-A: Inventory and Coverage Ledger

Inventory every producer and current output path:

- Nova lifecycle and effect events.
- Worker lifecycle, progress, logs, and results.
- Buster suite, provider, and agent evidence.
- OpenClaw agent events, model calls, and tool calls.
- Application logs, metrics, traces, and events.
- Local JSONL files, Redis streams, status files, artifacts, and run bundles.

For each record class, name the producer, authority, durable owner, live
transport, retention rule, ClawDeck view, and current gap. Mark legacy Git,
local-file, Redis-completion, and direct-notification paths for removal or
retention with one clear reason.

Exit proof: every supported action has one declared durable record or evidence
reference. No record has two authorities.

#### Phase 5.7-B: Producer Delivery Contracts

Add small, language-neutral contracts for:

- Producer identity and boot identity.
- Producer-local sequence and source event identity.
- Correlation, causation, attempt, and claim identity.
- Durable admission acknowledgement.
- Replay range and explicit gap report.
- Producer terminal closure.
- Observability completeness state.

Keep the admitted `telemetry_envelope.v1` contract as the canonical ClawDeck
event unless the audit proves that a breaking v2 event contract is required.
Use a separate producer-ingress contract so producer retries and local order do
not overload the canonical envelope.

Exit proof: TypeScript and Go fixtures validate the same bytes. Duplicate
records are accepted idempotently. Conflicting records and stale claims fail.

#### Phase 5.7-C: Durable Outbox and Admission

Implement one bounded durable producer outbox and one admission interface.

- Append before send.
- Acknowledge only after durable admission.
- Retry with the same event identity.
- Compact only acknowledged records.
- Report a full outbox as an observability error.
- Preserve raw invalid records in quarantine.
- Assign the canonical run cursor at admission.
- Keep live Redis or WebSocket delivery as a bounded view, not the durable copy.

The implementation can use an embedded store for the first local profile. Its
interface must support a production PostgreSQL-backed admission service and
horizontal ingestion later.

Exit proof: producer and admission restarts lose no acknowledged record. A
temporary network outage replays in order without duplicate normalized facts.

#### Phase 5.7-D: Durable Results, Evidence, and Closures

Store final attempt results and evidence before completion acknowledgement.

- Attempt results are keyed by run, attempt, and claim generation.
- Large evidence uploads directly to content-addressed storage.
- Results carry evidence identities, digests, sizes, and completeness.
- Producer closure declares the expected record range and evidence set.
- Run closure combines producer state, quarantine, missing payloads, and
  unavailable capabilities.
- A result from an old claim cannot replace the current result.

Exit proof: completed work remains recoverable after simultaneous Nova and
worker restart. Deleting an ephemeral worker Pod does not delete the result.

#### Phase 5.7-E: Nova Reconciliation and Gate Completeness

Add an idempotent Nova reconciliation loop.

- Replay the Nova lifecycle journal.
- Find unresolved attempts.
- Import durable completed results.
- Reconnect to current claims.
- Requeue expired claims.
- Reject stale or conflicting results.
- Record imported results once in the canonical reconciliation graph.
- In Phase 7, map the reconciled test-gate result into the pipeline graph.
- Read observability completeness before the final gate decision.
- Permit an earlier stage to continue with explicit incomplete observability
  only when the remaining work is safe and stage policy allows it.
- Preserve every continued gap and block authoritative final approval until
  required observability is complete.

Nova consumes small normalized facts and references. It does not read or relay
all raw logs, traces, tool calls, or evidence bytes.

The embedded recovery profile stores the desired reconciliation plan beside
the pipeline run. `recoverPipelineV2` invokes reconciliation before it resumes
the pipeline graph. The distributed service connection in Phase 7 must keep
this startup behavior while replacing the embedded file drivers.

Exit proof: kill and restart the Nova reconciliation runtime while at least 20
worker attempts complete in mixed order. Nova must map each result to the
correct plan node and accept it once. Phase 7 proves that the connected gate
reaches the same final pipeline decision as an uninterrupted run.

#### Phase 5.7-F: ClawDeck Alignment and Cutover Proof

Update the ClawDeck architecture and fixtures in the same contract change.

- ClawDeck ingests the producer and canonical contracts.
- It preserves raw and normalized records.
- It detects producer gaps and shows explicit completeness.
- It links results, logs, traces, agents, tool calls, and evidence by identity.
- It treats live mode as the durable history tail.
- It never becomes scheduler or gate authority.

Run scale and recovery proof with concurrent Nova, Buster, and application
producers. Include duplicate delivery, delayed delivery, out-of-order arrival,
clock skew, worker restart, Nova restart, collector restart, missing payload,
quarantine, and storage-pressure scenarios.

Phase 5.7-A through Phase 5.7-F are authorized for sequential implementation.
Each subphase must pass its proof, decision audit, documentation update, and
independent review with `gpt-5.6-terra` and high reasoning before the next subphase
starts. Phase 5.7 is complete only when all subphases and the final cross-phase
audit pass.

Pipeline-side completion does not deploy ClawDeck. It includes the embedded
drivers, replaceable interfaces, recovery behavior, completeness contracts,
and ClawDeck-facing fixtures. PostgreSQL, object storage, high-availability
ingestion, retention services, and the ClawDeck user interface are later
deployment work.

The active artifact, plugin-state, wait, bounded telemetry, notification, and
transport paths use the shared durable-record boundary. Legacy Buster bridges
remain only until their suites and the Phase 7 remote connection migrate.

### Phase 6: Create Report Adapters

Status: complete on 2026-08-09

- 6-A defined the normalized report facts and bounds.
- 6-B added replaceable report-adapter registrations.
- 6-C added isolated, bounded adapter execution.
- 6-D provided the JUnit adapter.
- 6-E froze exact adapters in resolved plans and stored normalized facts in
  durable attempt results.
- 6-F completed the cross-phase audit and retained-capability proof.

The original report remains durable evidence. Adapters report facts. They do
not make pipeline decisions.

### Phase 7: Connect Nova and Buster

Status: complete after corrected implementation, full verification, and clean Terra review

Phase 7 uses one remote plan job. Nova stores the immutable resolved plan and
its recovery record before dispatch. Buster schedules the plan's attempt-level
work through the existing worker core. This is the first remote profile. A
future queue can replace the transport without changing plans, attempts, or
results.

#### Phase 7-A: Audit the Connection

- Inventory the current Nova, Buster, worker, result, and legacy bridge paths.
- Record retained behavior, missing behavior, and deletion targets.
- Confirm that the new protocol does not add suite names to Buster core.

#### Phase 7-B: Define the Remote Job Contract

- Define immutable plan-job, status, and result contracts.
- Carry a bounded repository archive or a durable authenticated artifact
  reference. Build it from a committed Git revision and bind repository,
  commit, tree, archive, creator, and owning pipeline-stage identities. The
  production Nova path builds this snapshot itself and authenticates the remote
  request with the existing bearer token; it does not require source-signing
  keys. It must not accept independent
  archive and source-statement inputs.
- Make Buster verify and retain the archive bytes or recoverable reference
  before it accepts the job for execution.
- Make submission idempotent by stable job identity and request digest.
- Store the desired Nova recovery record before the first dispatch attempt.

#### Phase 7-C: Execute and Recover Remote Work

- Add authenticated submit, status, and cancel operations for resolved plans.
- Recover the exact verified repository archive after a Buster restart.
- Run the plan through `TestPlanRunner` and the existing attempt worker core.
- Preserve terminal jobs across Nova and Buster restarts.
- Store results and evidence before Buster reports completion.

#### Phase 7-D: Import Results and Decide the Gate

Status: complete

- Verify job, plan, run, node, attempt, claim, receipt, and digest identities.
- Import every result once into Nova's canonical pipeline state.
- Store nodes, relations, attempts, final results, and review work as one
  test subgraph under the exact owning pipeline stage.
- Apply blocking and advisory rules in Nova.
- Start evidence review only when the resolved configuration requests an agent.

Implementation and proof:

- `skills/nova/core/test-gates/remote-result-import.ts`
- `tests/verification/contracts/check-pipeline-remote-result-import.mts`
- `pipeline-test-gate-phase-7-d-audit.md`

#### Phase 7-E: Retire the Legacy Bridge

Status: complete

- Route resolved-plan work only through the provider-plan protocol.
- Reject unknown configuration through strict schemas.
- Remove the bridge, its suite mappings, and all dual-authority plumbing after migration.

Implementation and proof:

- `skills/nova/plugins/remote-test-gate/schemas/config.schema.json`
- `tests/verification/contracts/check-pipeline-legacy-retirement.mts`
- `pipeline-test-gate-phase-7-e-audit.md`

#### Phase 7-F: Prove and Close the Phase

Status: complete after corrected implementation, full verification, and clean Terra review

- Prove normal execution, restart recovery, network loss, duplicate submission,
  duplicate result, stale claims, cancellation, missing evidence, incomplete
  observability, and concurrent plan isolation.
- Run the full retained-capability and role-isolation checks.
- Complete the decision audit, final documentation, and clean independent review.

Implementation and proof:

- `npm run verify:test-gate:phase7`
- `pipeline-test-gate-phase-7-f-audit.md`
- `pipeline-test-gate-phase-7-final-audit.md`

The 2026-08-10 closeout claim was superseded by the 2026-08-12 deep audit. That
audit found missing production composition, an unbounded status-result path,
and missing process-level and real-provider proof. The corrected implementation,
full verification, and required Terra review now pass. All accepted findings
were resolved. Phase 8 can start only as a separate authorized phase.

Each subphase must pass focused proof, decision audit, documentation update,
and independent review with `gpt-5.6-terra` and high reasoning before the next subphase
starts.

### Phase 8: Implement the Unit Vertical Slice

Status: complete as the implementation part of the unit migration. Phase 9
proved parity and Phase 10 completed cutover and deletion.

Detailed plan:

- `pipeline-test-gate-phase-8-plan.md`
- `pipeline-test-gate-suite-migration-playbook.md`

Phase 8 uses subphases 8-A through 8-F: lock contracts, build the direct-command
provider, connect JUnit results, compose multiple unit instances, add the
independent LCOV-first coverage budget, and prove the complete Nova-to-Buster
vertical path.

Implement:

- A generic direct-command unit provider.
- JUnit-based result normalization.
- Multiple unit-test instances in one module.
- A provided unit suite template.
- Separate blocking and advisory instances.
- Full logs and explicit reports.
- The optional independent coverage-budget link.

The project supplies an executable and argument array. The provider does not
run a shell and does not parse console text as authoritative test evidence.

The provided unit suite requires JUnit by default. A project can explicitly use
exit-code mode when its tool cannot produce JUnit. Exact relative report paths
are used in the first version. Coverage remains a separate typed linked check.

Phase 8 follows the reusable suite-migration documentation gate. Every
project-facing field, default, limit, result rule, failure state, evidence rule,
security boundary, trade-off, and troubleshooting code must have a tested
example before closeout.

### Phase 9: Prove Unit Parity

Status: complete. All 93 unit parity items are proved. Phase 10 retained this
proof during cutover and deletion. Detailed plan:

- `pipeline-test-gate-phase-9-plan.md`
- `pipeline-test-gate-unit-parity-ledger.json`
- `pipeline-test-gate-phase-9-comparison.md`

Run four proof layers:

1. Contract tests for valid and invalid schemas.
2. Provider tests for commands, reports, logs, timeouts, retries, and results.
3. Parity tests for every `UNIT-*` baseline ID.
4. A real Nova-to-Buster gate run.

The new implementation can run beside the old implementation only in a
non-authoritative comparison test. Only one result can control a real gate.

### Phase 10: Cut Over and Delete Unit

Status: complete. The provider-based unit path is the only supported unit gate
path. The legacy runner, parser, protocol value, registry entry, scaffolding,
and old configuration surface are removed.

In one cutover:

1. Activate the new unit registrations and suite template.
2. Remove unit from the old suite registry, protocol list, order, and graph.
3. Delete the old unit implementation and console parser.
4. Remove old unit configuration and documentation.
5. Update examples and real-pipeline fixtures to `.swarm/pipeline.json`.
6. Add negative checks for all deleted unit surfaces.
7. Mark every unit parity item as proved.

The old and new unit paths do not both control the gate.

## Suite Migration Order

Migration status after Phase 10 is precise:

- Unit is the first legacy suite to complete implementation, parity, cutover,
  and deletion.
- Therefore, **one of thirteen** legacy suites is fully migrated and twelve
  legacy suites remain.
- The fourteen items below are replacement work items, not fourteen old suite
  names. Some split one old suite into clearer capabilities, and load testing
  is an accepted new capability rather than a legacy migration.

After unit, use this order:

1. Move manifest checks into lint.
2. Replace build with `container-build`.

   Implementation, parity, authority cutover, and old-suite deletion are complete.
3. Replace bundle with `size-budget`.
4. Replace Kubernetes deployment with a fixture.
5. Replace health with readiness plus generic HTTP tests.
6. Replace Tailscale preview with an exposure fixture.
7. Migrate API tests.
8. Add the accepted observation base for deployed tests.
9. Migrate accessibility tests.
10. Split and migrate Lighthouse tests.
11. Migrate visual regression.
12. Migrate end-to-end tests.
13. Replace the security suite with its declared security tests.
14. Add load testing and other accepted new providers.

For each item, repeat the same baseline, implementation, parity, cutover, and
deletion loop.

Implementation, parity, cutover, and deletion for item 1 are complete. All 28
manifest parity items are proved. Nova lint is the sole static Kubernetes
authority, and the old Buster manifest suite is absent.

## Completion Gates

The work is complete only when:

- Every non-deferred accepted decision is proved in the decision ledger.
- Every old suite has a closed parity ledger.
- The legacy bridge and closed suite registry are deleted.
- `.swarm/progress.json` and its readers are absent.
- Provided and imported tests use the same contracts.
- All contract, provider, integration, real-gate, cancellation, timeout,
  failure, and deletion checks pass.
- ClawDeck can read the canonical execution graph and evidence events.
