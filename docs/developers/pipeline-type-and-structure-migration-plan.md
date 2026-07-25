# Pipeline Type And Structure Migration Plan

Status: ready to execute

Baseline commit: `3332db05d`

This plan removes the remaining TypeScript and structural ESLint debt without broad rewrites, duplicate boundary types, or baseline expansion. Common migrates first because Nova and Buster consume it. Buster then proves the migration pattern on the smaller runtime. Nova follows in cohesive subsystem slices.

## Starting Evidence

The canonical full-repository report at the baseline commit records:

- 970 active blocking findings: 493 TypeScript and 477 ESLint;
- 7,615 approved debt findings, visible only with `--include-debt`;
- 8,585 total findings when approved debt is included;
- zero findings from Knip, Dependency Cruiser, JSCPD, dependency audits, Go, shell, Docker, Semgrep, Helm, Kubernetes, Trivy, and YAML tools;
- 20 successful tool executions and zero tool failures.

The remaining ESLint findings are structural only: complexity over 15, functions over 60 logical lines, nesting deeper than three levels, and files over 300 logical lines.

## Non-Negotiable Migration Rules

Every phase follows the same sequence:

1. Declare the subsystem's input, output, error, and dependency interfaces.
2. Validate `unknown` external data exactly once at the owning boundary.
3. Remove implicit `any`, unsafe property assumptions, and incompatible object shapes.
4. Flatten excessive nesting before reducing cyclomatic complexity.
5. Split functions over 60 logical lines by responsibility, not by line count alone.
6. Split files over 300 logical lines only when the new modules have distinct owners.
7. Run focused behavior tests and all static-analysis gates.
8. Record before/after finding counts and commit the phase independently.

The structural priority is nesting, complexity, function length, then file length. A phase must not:

- add or refresh baseline fingerprints;
- add `any`, `@ts-ignore`, unowned `@ts-expect-error`, unsafe casts, or compatibility fallbacks to silence findings;
- define a Nova- or Buster-local copy of a Common contract;
- move code to Common unless at least two independent consumers need the capability;
- mix unrelated subsystem cleanup into the phase;
- change observable behavior unless the phase explicitly documents and tests the change.

## Standard Phase Gate

Each phase is complete only when all of the following are true:

- the phase-owned TypeScript findings are zero;
- the phase-owned ESLint findings are zero;
- focused success, validation-failure, dependency-failure, and recovery tests pass;
- no new Knip, dependency cycle, or JSCPD finding exists;
- the canonical full report has no new fingerprint outside the phase scope;
- documentation and generated contracts are synchronized when a boundary changes;
- `git diff --check` passes;
- the phase has one reviewable commit and an evidence note with before/after counts.

Canonical report command:

```bash
node skills/nova/pipeline/tools/lint-report.ts \
  --repo "$PWD" \
  --policy "$PWD/charts/kubeclaw/files/config/lint-policy.json" \
  --policy-project workspace \
  --tier full \
  --include-debt \
  --output /tmp/pipeline-migration-lint.json
```

The phase must also run the directly affected `node --test` files, `npm run verify:contracts` when a contract changes, and `npm run docs:check` when documentation or generated surfaces change. Live infrastructure tests are required only when the slice changes a deployed runtime boundary.

## Phase 0: Freeze The Starting Point

Status: complete

Deliverables:

- Commit the completed lint calibration, observer-contract extraction, production/test duplication cleanup, fallback removal, settings ownership, error handling, structured logging, and mutable-state cleanup.
- Capture the canonical active and debt-visible reports.
- Treat commit `3332db05d` and the counts above as the comparison point.

Exit criteria:

- Work starts from a committed checkpoint.
- Every later phase reports its delta against the previous completed phase and Phase 0.

## Common Foundations

### Phase 1: Configuration And Runtime-Policy Contracts

Status: complete

Scope:

- Common configuration primitives and validators;
- runtime-environment and runtime-policy adapters;
- settings shared by Nova and Buster.

Actions:

- Define typed configuration sections with explicit required and optional fields.
- Convert raw JSON and environment input into validated settings at one boundary.
- Separate deployment infrastructure values from application policy.
- Replace property-by-property downstream assumptions with validated configuration types.
- Split validation by configuration section while preserving one canonical loader.

Exit criteria:

- Nova and Buster consume the same Common configuration contracts where semantics match.
- Invalid, missing, conflicting, and unknown settings have deterministic tests.
- No downstream module reads raw environment or unvalidated configuration objects.

Completion evidence:

- Common CLI, platform-profile, runtime-environment, and runtime-state-path helpers have zero TypeScript and ESLint findings.
- CLI parsing now uses typed flag specifications and cohesive value/count validators.
- Platform discovery has an explicit non-empty path contract, and runtime-state matchers have one typed predicate interface.
- Eighteen focused configuration tests and the 35-check strict CLI contract passed.

### Phase 2: Redis Transport Interfaces

Status: complete

Scope:

- Common Redis connection, readiness, stream, queue, and retry primitives;
- Nova and Buster Redis facades only where needed for runtime-overwritten paths.

Actions:

- Define explicit connection, command, stream-reader, stream-writer, and readiness interfaces.
- Type Redis replies and normalize external client errors at the adapter boundary.
- Make connection ownership, shutdown, retry, and timeout behavior explicit.
- Replace structural mock objects with contract-conforming test doubles.

Exit criteria:

- Redis consumers depend on narrow interfaces rather than concrete clients.
- No duplicated Redis reply parsing or readiness logic remains.
- Connection, timeout, malformed-reply, replay, and shutdown tests pass.

Completion evidence:

- Common Redis transport, message-contract, wait, and tail-recovery modules have zero TypeScript and ESLint findings.
- The resilient wait path now separates validated options, adapter lifecycle, and tail-scan recovery behind narrow interfaces.
- Thirty-seven focused Redis, completion, polling, replay, timeout, malformed-reply, readiness, and shutdown tests passed.
- Knip, dependency-cycle, duplication, security, deployment, and configuration checks reported zero phase findings.

### Phase 3: Agent And Session Lifecycle Types

Status: complete

Scope:

- Common agent identity, session identity, lifecycle events, state transitions, and terminal states.

Actions:

- Define discriminated unions for lifecycle events and terminal outcomes.
- Centralize legal-transition validation without placing Nova policy in Common.
- Replace optional-property bags with state-specific types.
- Type ACP/OpenClaw inputs as `unknown` until validated by their adapter.

Exit criteria:

- Illegal transitions are impossible to construct internally or rejected at ingress.
- Nova and Buster share identity and lifecycle vocabulary without sharing orchestration policy.
- Transition, replay, duplicate-event, and terminal-state tests pass.

Completion evidence:

- Session spawning, stopping, termination, state persistence, handoff receipts, and lifecycle transitions are separated behind explicit contracts.
- Gateway replies and approval/pipeline events are validated once at ingress; shared value normalization prevents contract drift.
- Phase-owned TypeScript and ESLint findings are zero; Knip, dependency cycles, and duplication remain clean.
- Forty-nine focused lifecycle, transition, replay, handoff, termination, approval-event, and cooldown tests passed.

### Phase 4: Git And Evidence Boundary Types

Status: complete

Scope:

- Common Git command results, repository/worktree identities, evidence references, artifact manifests, and portable paths.

Actions:

- Type Git execution inputs and structured results.
- Validate repository-relative paths and external Git output once.
- Define evidence/artifact references independently from Nova's evidence policy.
- Remove stringly typed success/error and path objects.

Exit criteria:

- Git and evidence consumers do not parse raw process output independently.
- Repository, worktree, path-boundary, missing-artifact, and command-failure tests pass.

Completion evidence:

- Git execution, worktree synchronization, module merge, stash recovery, commit, and push responsibilities now use typed boundaries in cohesive modules.
- Artifact publication validates run identity, storage roots, content metadata, hashes, and portable references at one boundary.
- Phase-owned TypeScript and ESLint findings are zero; duplication and dependency boundaries remain clean.
- Thirty-three focused Git tests plus artifact authority, evidence authority, parallel-run evidence, and observability integrity contracts passed.

### Phase 5: Shared Result And Error Contracts

Status: complete

Scope:

- Common operation results, reason codes, structured errors, retryability, and noncritical reporting.

Actions:

- Define discriminated success/failure results for shared operations.
- Separate operator-facing messages from stable machine reason codes.
- Make retryable, terminal, and noncritical outcomes explicit.
- Remove incompatible local result shapes only after callers migrate.

Exit criteria:

- Shared operations have one result/error vocabulary.
- Nova and Buster retain domain-specific outcomes above the Common boundary.
- No error is silently swallowed or converted through message matching.

Completion evidence:

- Common now exposes discriminated operation results and one structured error vocabulary for stable codes, outcome classification, diagnostics, and causes.
- Pipeline events, Redis task transport, Discord delivery, and noncritical reporting use explicit error boundaries; Redis reply codes are normalized once at the adapter.
- Phase-owned TypeScript and ESLint findings are zero, with no new baseline or suppression.
- Twenty-one focused result, transport, noncritical-reporting, and Discord success/failure tests passed.

## Buster Vertical Migration

### Phase 6: Task Envelope And Completion Contracts

Status: complete

Scope:

- Buster task input, identity, claim, execution request, completion signal, and verdict envelopes.

Actions:

- Validate queue payloads once at task ingress.
- Define discriminated task and completion states.
- Make correlation, attempt, module, and run identity mandatory where required.
- Type completion publication and duplicate/idempotent completion handling.

Exit criteria:

- Invalid task envelopes fail before execution.
- Completion signals cannot omit required identity or verdict evidence.

Completion evidence:

- Buster task ingress now produces one typed identity contract after validating required identity, session, capability, configuration, and repository-path boundaries.
- Completion, output-artifact publication, terminal guarantees, and dead-letter records use explicit typed envelopes and cohesive owners.
- Phase-owned TypeScript and ESLint findings are zero without baseline expansion.
- Twenty-one focused task/completion tests plus Nova-to-Buster envelope and Redis lifecycle acceptance contracts passed.
- Success, failure, malformed payload, duplicate, and replay tests pass.

### Phase 7: Buster Task Lifecycle

Status: complete

Scope:

- claim, start, heartbeat, cancellation, timeout, completion, cleanup, and recovery.

Actions:

- Implement lifecycle transitions over the Phase 6 contracts.
- Isolate side effects from transition decisions.
- Flatten nested terminal and cleanup paths.
- Make cleanup failure reporting intentional and deterministic.

Exit criteria:

- Every task reaches one legal terminal state.
- Cancellation, timeout, worker loss, restart, and cleanup behavior is tested.
- Lifecycle functions meet structural budgets.

Completion evidence:

- Buster task orchestration is split into typed context, deterministic execution, prompt, session, cleanup, completion, and finalization owners.
- Repository preparation, suite adjudication, optional agent judgment, termination, terminal completion, and cleanup retain one explicit execution path.
- Phase-owned TypeScript and ESLint findings are zero; all lifecycle functions and files meet structural budgets.
- Twenty-two lifecycle/session/completion tests plus Buster surface and Redis lifecycle acceptance contracts passed.

### Phase 8: Buster Pipeline Helpers And Runtime Boundaries

Status: complete

Scope:

- runtime policy, BuildKit, gateway, Git workflows, Discord, logging, resource cleanup, diagnostics, and capability checks.

Actions:

- Migrate each adapter to explicit request/result interfaces.
- Validate subprocess, network, filesystem, and runtime responses at the adapter.
- Keep orchestration decisions out of infrastructure adapters.

Exit criteria:

- Helpers expose narrow typed capabilities rather than unstructured utility functions.
- Infrastructure failures preserve structured context and reason codes.
- Adapter-focused tests cover success and failure behavior.

Completion evidence:

- Runtime policy, BuildKit, capability, Git, Discord, logging, diagnostics, output, cleanup, and telemetry adapters now expose explicit typed boundaries.
- Git identity/push policy, Discord artifacts, Buster output, pipeline embeds, and telemetry contracts/artifacts/incidents are split by responsibility.
- Phase-owned TypeScript and ESLint findings are zero; all adapter files and functions meet structural budgets.
- Thirty-eight focused adapter success, failure, recovery, identity, artifact, and telemetry tests passed.

### Phase 9: Buster Suite Configuration And Results

Status: complete

Scope:

- suite registry, suite settings, suite execution context, evidence, and result/verdict types.

Actions:

- Define one suite interface and explicit capability declaration.
- Validate suite-specific configuration before execution.
- Standardize result and evidence envelopes without erasing suite-specific details.
- Split oversized suites by setup, execution, evidence, and adjudication responsibility.

Exit criteria:

- Every suite conforms to one typed registry contract.
- Unknown suites and invalid settings fail closed.
- Suite result aggregation has exhaustive verdict handling.

Completion evidence:

- The suite runner and verdict schema now expose one typed registry and result contract; unknown suites and malformed timeout, port, and verdict data fail closed.
- Every suite configuration and result path type-checks under the strict Buster project with zero phase-owned TypeScript findings.
- Optional runtime-only modules have explicit ambient boundaries instead of unchecked import suppressions.
- Fifty-eight focused suite and runner behavior tests passed, including invalid settings, authority boundaries, timeout recovery, evidence aggregation, and concurrent execution.
- Remaining Buster structural decomposition is retained as explicit Phase 10 closeout work; no baseline or suppression was added.

### Phase 10: Buster Redis Queue Boundary And Closeout

Status: complete

Scope:

- queue consumption, claim/acknowledgement, completion publication, retry/replay, and dead-letter behavior.

Actions:

- Apply the Common Redis interfaces to the complete Buster task path.
- Prove idempotency across lost acknowledgements and worker restarts.
- Remove transitional Buster-local types and adapters.
- Run the complete non-live Buster suite and relevant startup/runtime smoke tests.

Exit criteria:

- Buster has zero TypeScript and ESLint findings, including approved debt.
- Knip, dependency cycles, and duplication remain zero.
- The Buster migration pattern is documented for Nova phases.

Completion evidence:

- Queue consumption, retry/replay, session monitoring, acknowledgement, and completion publication use explicit typed request and state owners.
- The suite runner, Kubernetes suite, API suite, visual regression, screenshot, and verification paths are split into cohesive execution, evidence, and boundary modules.
- Buster TypeScript and ESLint findings are zero without baseline expansion; circular dependencies and production duplication are zero.
- The complete non-live Buster suite passed 156/156 tests, and the Buster, ACP gateway, compatibility-freeze, Redis, and helper-import contracts passed.

## Nova Subsystem Migration

### Phase 11: Telemetry Builders And Observability

Status: complete

Scope:

- telemetry builders, observer ingestion, bridge validation, correlation, model usage, replay, and readiness.

Actions:

- Keep `contracts/agent-observability/v1` as the neutral bridge contract.
- Validate observer records before converting them into pipeline-owned telemetry.
- Type builders by event family instead of optional-property mega-objects.
- Separate ingestion, canonical mapping, persistence, and projection responsibilities.
- Preserve replay and idempotency semantics with deterministic tests.

Exit criteria:

- Raw observer records cannot enter pipeline projections unvalidated.
- Canonical telemetry builders are exhaustive and event-family specific.
- Parallel-run, replay, duplicate, malformed-record, and model-usage tests pass.

Completion evidence:

- Observer ingestion, Redis lifecycle, mapping, usage aggregation, replay/readiness verification, sink validation, and canonical telemetry construction are separated into typed owners.
- Phase-owned TypeScript and ESLint findings are zero without new suppressions or baseline entries.
- Thirty-seven focused telemetry/observability tests passed, including duplicate delivery, replay, malformed records, sink timeouts, and model-usage idempotency.
- Seven observability and telemetry contract suites passed with 222 checked contract assertions.

### Phase 12: Lifecycle And Status Projections

Status: complete

Scope:

- lifecycle legality, appenders, status-store projections, read models, run facts, and command lifecycle.

Actions:

- Dispatch typed event families to cohesive projection handlers.
- Separate legality decisions, persistence, and read-model updates.
- Replace large conditional reducers with exhaustive typed handlers.
- Preserve ordering, replay, and terminal-state invariants.

Exit criteria:

- Lifecycle and projection code has exhaustive event handling.
- Replays produce the same read models deterministically.
- No projection handler exceeds structural budgets.

Completion evidence:

- Lifecycle legality, persistence, status storage, runtime projection, module/gate completion, run-fact evaluation, and command validation now have cohesive owners.
- Phase-owned TypeScript and ESLint findings are zero without baseline expansion or suppression.
- Twenty-eight focused lifecycle, completion, command, projection, and run-fact tests passed.
- Canonical lifecycle replay and the status-store public-surface contract passed after the facade split.

### Phase 13: Polling And Rate Limiting

Status: complete

Scope:

- polling state machines, dual polling, session-end handling, observability polling, rate-limit detection, waiting, and termination.

Actions:

- Model polling and rate limiting as explicit state transitions.
- Separate observation, transition decision, side effect, and terminal adjudication.
- Make time and retry dependencies injectable and deterministic.
- Remove nested terminal-path branching.

Exit criteria:

- Polling and rate-limit state transitions are exhaustive.
- Timeout, session loss, rate-limit recovery, cancellation, and restart tests pass without real clocks.

Completion evidence:

- Polling, Forge completion, ACP session termination, durable cooldown, and rate-limit exhaustion now use cohesive transition, observation, and finalization owners.
- Phase-owned TypeScript and ESLint findings are zero without baseline expansion or suppression.
- Forty-five focused polling and rate-limit tests passed, including timeout-edge writes, terminal failures, replay, cooldown recovery, and exhaustion delivery failures.
- The canonical rate-limit and ACP polling surface contracts and rate-limit output verification passed after the facade splits.

### Phase 14: Gates And Runners

Status: complete

Scope:

- approval, review, Buster, module, worker, and pipeline runners plus gate state and control results.

Actions:

- Define typed runner contexts and stage results.
- Separate orchestration from adapter calls and terminal decisions.
- Consolidate gate verdict handling around the shared result/error vocabulary.
- Split runners by phase ownership while keeping one explicit execution path.

Exit criteria:

- Every runner input/output is explicit and exhaustively handled.
- No hidden fallback execution or old/new runner coexistence remains.
- Gate success, rejection, retry, remediation, timeout, and recovery tests pass.

Completion evidence:

- Approval, review, Buster, module, worker, and pipeline orchestration now use explicit typed contexts, control adapters, terminal results, and phase-owned helpers.
- Phase-owned TypeScript and ESLint findings are zero without baseline expansion or suppression.
- Focused approval, Buster, module-worker, pipeline-lock, state-machine, terminal-runner, and recovery behavior tests passed.
- Canonical compatibility, degraded-terminal, module-runner, operator-alert, pipeline-runner, typed-step-result, and remediation-handoff contracts passed after the runner splits.

### Phase 15: Summary And Reporting

Status: complete

Scope:

- project summary, formatters, failure presentation, lint evidence, and operator-facing output.

Actions:

- Define read-only summary input models.
- Separate data selection, aggregation, and rendering.
- Make absent or incomplete evidence explicit rather than defaulting silently.
- Keep terminal output inside declared output adapters.

Exit criteria:

- Summary/reporting code consumes typed projections and does not reconstruct domain state.
- Golden output, partial-evidence, and failure-presentation tests pass.

Completion evidence:

- Summary persistence, pipeline-review execution, case-study execution, failure retry outcomes, project-summary collection/rendering, and lint-tool registration now have cohesive owners behind stable facades.
- Phase-owned TypeScript and ESLint findings are zero without baseline expansion or suppression.
- Ninety-eight focused summary, failure, project-summary, and lint-report tests passed, including partial evidence, no-output retry, formatter, parser-failure, and tool-adapter behavior.
- Canonical generator-result, dynamic-import, compatibility-freeze, and observability catch-reporting contracts passed after making their source inventories split-aware.

### Phase 16: Artifact And Evidence Plane

Status: complete

Scope:

- evidence publication, artifact storage, archive manifests, producer health, terminal closure, and remediation handoff.

Actions:

- Define typed evidence commands and publication results.
- Separate artifact construction, persistence, integrity validation, and lifecycle policy.
- Make partial/noncritical publication outcomes explicit.
- Remove transitional evidence shapes after all producers migrate.

Exit criteria:

- Every artifact has validated identity, provenance, digest, and lifecycle association.
- Publication, replay, partial failure, integrity failure, and terminal closure tests pass.

Completion evidence:

- Artifact authority, summary projection, plugin request validation, plugin storage, evidence evaluation, producer health, run manifests, lifecycle projections, prompt publication, and terminal finalization now have cohesive owners behind stable facades.
- Phase-owned TypeScript and ESLint findings are zero without baseline expansion or suppression.
- Artifact lane identity, concurrent index append, stale-lock recovery, authority matrix, terminal closure, producer health, archive manifest, and observability evidence contracts passed.
- Governance artifact references and worker control-result boundaries now fail explicitly when required canonical evidence is absent.

### Phase 17: Nova And Repository Closeout

Actions:

- Remove obsolete local types, adapters, casts, directives, and migration scaffolding.
- Run the full non-live test suite and all contract checks.
- Run the canonical full lint with and without debt visibility.
- Delete resolved baseline fingerprints; do not renew or replace them.
- Verify the local and CI dependency/type-resolution layouts produce identical fingerprints.
- Update the Phase 8/9 evaluation with final production evidence.

Exit criteria:

- TypeScript findings: zero active and zero baselined.
- ESLint findings: zero active and zero baselined.
- All 20 applicable lint tools complete with zero findings and zero tool failures.
- Non-live tests and contract checks pass.
- Live Nova and Buster runtime verification passes after deployment.
- `lint-baseline.json` contains no pipeline debt and can be removed if no other project uses it.

## Phase Tracking

| Phase | Slice | Status | Required completion evidence |
|---|---|---|---|
| 0 | Starting checkpoint | Complete | Commit `3332db05d`; canonical reports captured |
| 1 | Common configuration/runtime policy | Complete | Zero slice findings; 18 tests; 35 CLI contract checks |
| 2 | Common Redis interfaces | Complete | Zero slice findings; 37 Redis contract and recovery tests |
| 3 | Common agent/session lifecycle | Complete | Zero slice findings; 49 transition/replay tests |
| 4 | Common Git/evidence boundaries | Complete | Zero slice findings; 33 Git tests and evidence boundary contracts |
| 5 | Common result/error contracts | Complete | Zero slice findings; 21 structured-result/error tests |
| 6 | Buster task/completion contracts | Complete | Zero slice findings; 21 tests and envelope/lifecycle contracts |
| 7 | Buster task lifecycle | Complete | Zero slice findings; 22 tests and recovery/lifecycle contracts |
| 8 | Buster helpers/runtime boundaries | Complete | Zero slice findings; 38 adapter tests |
| 9 | Buster suites | Complete | Zero slice findings; 58 suite and runner tests |
| 10 | Buster queue closeout | Complete | Zero Buster findings; 156 tests; zero cycles/duplication |
| 11 | Nova telemetry/observability | Complete | Zero slice findings; 37 tests; 222 contract assertions |
| 12 | Nova lifecycle/status | Pending | Zero slice findings; projection tests |
| 13 | Nova polling/rate limiting | Pending | Zero slice findings; deterministic state tests |
| 14 | Nova gates/runners | Pending | Zero slice findings; gate/recovery tests |
| 15 | Nova summary/reporting | Pending | Zero slice findings; golden output tests |
| 16 | Nova artifact/evidence plane | Pending | Zero slice findings; integrity/failure tests |
| 17 | Repository closeout | Pending | Zero debt; all tools/tests clean; live verification |
