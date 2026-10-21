# Phase 9 Extension Assessment

Status: migration decision record, not parity evidence

This assessment covers every discovered package root, every v2 registration, the
OpenClaw host extension, and retained legacy behavior that still has no v2
owner. It answers the following questions before implementation:

1. Is the implementation already good, should it be simplified, or should it be
   rewritten?
2. Does the proposed boundary follow the goal architecture?
3. Which native-language tests prove complete observable behavior?

The objective is behavioral continuity, not source-code continuity. `reuse`,
`refactor`, and `rewrite` are equally valid when the resulting implementation is
smaller, safer, and easier to replace. Any intentional behavioral change needs
an approved difference record and tests for both the legacy expectation and the
replacement expectation.

## Questions Every Migration Must Answer

The three required questions are necessary but not sufficient. Every extension
must also answer:

4. What is the exact observable contract: inputs, outputs, reason codes,
   artifacts, effects, events, ordering, timing, and operator-visible messages?
5. What is the minimum authority required by each registration, and which
   capability denials must be proven?
6. Which state and effects must survive process death, and what are their
   idempotency, replay, locking, and fencing rules?
7. What are the timeout, cancellation, retry, degraded-mode, and terminal
   failure semantics?
8. Can the package be installed, upgraded for new runs, pinned for resumed runs,
   replaced, disabled, and removed without hidden imports or configuration?
9. Does the package boundary contain one cohesive owner, dependency set, trust
   boundary, and release lifecycle, or should it be split or merged?
10. Which data is confidential, how is it redacted, and what audit evidence may
    be persisted?
11. Which legacy behavior is accidental complexity and may be deleted, and who
    approves that behavioral change?
12. What proves that core remains generic and that no plugin can commit
    lifecycle state directly?

## Common TypeScript Proof Matrix

Every package-local suite remains TypeScript. Each registration must pass this
matrix in addition to the extension-specific tests below:

- activate with valid configuration and reject invalid or unknown configuration;
- execute real local behavior through the v2 registry, graph, invocation
  context, capability runtime, and actual package adapter;
- prove every supported success, control, validation, and failure result;
- reject undeclared capabilities, out-of-scope resources, malformed adapter
  responses, and schema drift;
- prove timeout, cancellation, adapter crash, plugin crash, and cleanup;
- restart after requested, accepted, and completed effect boundaries and prove
  idempotency or fail-closed reconciliation;
- replay plugin state and observer checkpoints deterministically;
- prove install, atomic activation rollback, replacement, pinned resume,
  disablement, and removal;
- run paired legacy and v2 fixtures and compare normalized results, reason
  codes, artifacts, effects, events, and operator-visible output;
- prove that no retained v1 implementation, bridge, or privileged import is
  reachable from the replacement package.

## Nova Stage Packages

### `kubeclaw.architecture-validator:architecture`

- **Decision — refactor.** Keep the closed response parser and small stage
  boundary. Generic graph validation is already core authority, required-file
  checks belong to deterministic preflight stages, configuration belongs to
  registry activation, and session lifecycle belongs to `runtime.dispatch`.
  The package retains only software-architecture judgment with rich structured
  findings.
- **Architecture.** The stage is correctly isolated behind `runtime.dispatch`
  and `artifacts.write`. It must not read the repository or select lifecycle
  transitions through hidden helpers.
- **Behavior to preserve.** Feasibility, component-boundary, software
  dependency, deployment, and requirement judgment; pass, remediation, and
  blocked outcomes; checked-file evidence and stable findings.
- **Proof.** Paired legacy/v2 architecture fixtures; valid pass, request-fix,
  blocked, malformed response, contradictory response, dispatch failure,
  timeout, cancellation, artifact failure, prompt guidance, and deterministic
  reason-code tests.

### `kubeclaw.blueprint-sync:sync`

- **Decision — refactor.** Keep the direct sync/commit/state/artifact sequence,
  but move it into an explicit idempotent plan so crash recovery never repeats a
  commit or state append. Port only legacy path-selection and branch semantics
  that are still observable.
- **Architecture.** Correct package boundary and grants. Git mutation remains in
  the adapter; the stage owns domain decisions and summary construction.
- **Behavior to preserve.** Declared control-file synchronization, missing-file
  remediation, scoped commit messages, blueprint state projection, and report
  artifacts.
- **Proof.** Real temporary Git repositories covering no-op, changed files,
  missing files, duplicate paths, dirty trees, commit failure, crash after sync,
  crash after commit, replay, cancellation, stale fence, and replacement.

### `kubeclaw.buster-quality-gate:quality`

- **Decision — refactor.** Keep the strict evidence/verdict reducer but replace
  compressed protocol code with readable shared decoding helpers. Restore every
  legacy quality classification and retry/remediation rule without embedding
  Buster scheduling in the stage.
- **Architecture.** Correctly separates Buster evidence production from Nova's
  decision authority. Core alone applies the returned control result.
- **Behavior to preserve.** Evidence contradiction checks, failure
  classification, pass, request-fix, blocked, and actionable findings.
- **Proof.** Paired gate fixtures for every failure class; mixed suite evidence;
  invalid identity; contradictory pass; malformed output; real dispatch and
  artifact adapter failures; timeout, cancellation, crash, retry, and replay.

### `kubeclaw.case-study:case-study`

- **Decision — refactor.** Retain the small grounded-output contract. Move shared
  prompt/JSON mechanics out, keep section and factual-grounding rules local, and
  remove any legacy deployment side effect that belongs to a delivery adapter.
- **Architecture.** Correct stage boundary. Generation and publication must
  remain separate capabilities and registrations.
- **Behavior to preserve.** Required ordered sections, identity binding,
  supplied-facts-only generation, size limits, and artifact production.
- **Proof.** Paired legacy/v2 content fixtures; valid document, missing,
  duplicated, or reordered sections; invented-fact detection where legacy
  enforced it; malformed identity; dispatch/artifact failure; timeout,
  cancellation, crash, replay, and deterministic artifact identity.

### `kubeclaw.delivery-lint:delivery-lint`

- **Decision — reuse with focused refactoring only.** This is the authoritative
  reference extraction. Keep its direct deterministic implementation; extract
  Dockerfile parsing only if new parity cases prove the current parser
  insufficient. Do not rebuild a generic validation framework around it.
- **Architecture.** Aligned: read-only repository access and artifact writing
  are explicit capabilities, and the package owns its reason codes and schemas.
- **Behavior to preserve.** Skip semantics, Dockerfile/static-path validation,
  pass, remediation, unsafe-input blocking, stable report artifacts, and
  absence of any v1 fallback.
- **Proof.** Existing real pass/fail/blocked/crash tests plus paired legacy
  fixtures for every reason code, multi-stage and JSON-form `COPY`, path edge
  cases, missing files, read/artifact failures, timeout, cancellation, replay,
  install, replace, remove, and negative absence checks.

### `kubeclaw.human-approval:approval`

- **Decision — refactor.** Preserve the durable wait protocol, but reduce the
  current approval module into message construction, wait construction, and
  signal reduction. Remove transport presentation details from the stage.
- **Architecture.** Aligned when `operator.request` owns transport,
  `signal.wait` owns persistence/authorization, and core owns resume attempts.
- **Behavior to preserve.** Approval request delivery, authorized approve/reject
  signals, expiry, duplicate/stale signal rejection, restart, cancellation, and
  stable operator correlation.
- **Proof.** Paired legacy/v2 approve, reject, timeout, duplicate, stale,
  unauthorized, malformed, crash-before-wait, crash-after-wait, redelivery,
  resume-as-new-attempt, operator failure, cancellation, and replay tests.

### `kubeclaw.implementation-agent:implementation`

- **Decision — rewrite.** The current dispatch-and-parse shell does not preserve
  Forge's complete behavior. Implement a smaller explicit agent-work state
  machine using the runtime capability: start, monitor, collect transcript and
  artifacts, handle handoff, terminate, retry, recover, and return one closed
  result. Do not port Forge's scheduler coupling or polling sprawl.
- **Architecture.** The package owns implementation policy; the runtime adapter
  owns host sessions; Git adapters own workspaces and commits; core owns
  attempts, remediation, and lifecycle truth.
- **Behavior to preserve.** Agent selection, task handoff, progress/liveness,
  completion evidence, transcript capture, termination, retry classes,
  cancellation, crash recovery, and implementation artifacts.
- **Proof.** Paired Forge/v2 scenario corpus using a real local session harness:
  success, findings, handoff, no-progress, malformed completion, agent crash,
  host restart, timeout, cancellation, transcript loss, duplicate completion,
  effect replay, workspace conflict, and pinned-version resume.

### `kubeclaw.lint:pre-check`

- **Decision — refactor aggressively.** Preserve the proven tool discovery,
  parsers, policies, and fingerprints, but replace the 3,000-plus-line copied
  orchestration surface with a data-driven tool catalog and one execution
  reducer. Pre-check becomes a configuration of that engine, not a parallel
  implementation.
- **Architecture.** Correct stage/adapter split, provided the stage only selects
  policy and reduces results while `lint.execute` owns subprocess execution.
- **Behavior to preserve.** Changed-file scope, quick tool selection, optional
  tool absence, warning/error policy, stable findings, and report artifacts.
- **Proof.** Paired legacy/v2 fixture matrix for every detected project type and
  tool; clean, warning, failure, absent optional tool, malformed output,
  discovery error, timeout, cancellation, tool crash, output limit, replay, and
  deterministic fingerprints.

### `kubeclaw.lint:full`

- **Decision — refactor aggressively with the same engine as pre-check.** Full
  lint should differ through declarative tier policy and scope, not duplicated
  control flow.
- **Architecture.** Same alignment requirements as pre-check. Stage identity
  remains separate because scheduling, inputs, and budgets differ.
- **Behavior to preserve.** Full repository scope, complete tool selection,
  architecture/container/Kubernetes/Terraform/Go policies, and stable
  remediation output.
- **Proof.** The complete pre-check matrix plus full-only tools, repository-wide
  scope, Helm rendering, cross-file policy, partial-tool failure, concurrency,
  deterministic ordering, and large-output behavior.

### `kubeclaw.pipeline-review:review`

- **Decision — refactor.** Keep it as a reporting stage, share dispatch/closed
  JSON helpers, and keep retrospective synthesis distinct from lifecycle review
  decisions.
- **Architecture.** Aligned if it cannot return remediation or mutate lifecycle
  truth; it may only produce a report artifact.
- **Behavior to preserve.** Run-wide evidence synthesis, identity binding,
  grounded findings, stable sections, and report generation.
- **Proof.** Paired report fixtures; successful report, incomplete evidence,
  malformed/contradictory output, dispatch/artifact failure, timeout,
  cancellation, crash, replay, and proof that findings do not control core.

### `kubeclaw.preflight-contract:validate`

- **Decision — reuse and simplify.** Keep deterministic repository reads and
  contract checks. Flatten repeated validation branches into declarative rules
  only where parity tests demonstrate identical reason codes and details.
- **Architecture.** Aligned: deterministic domain validation over bounded
  read-only repository and artifact capabilities.
- **Behavior to preserve.** Required-file/schema checks, pass, request-fix,
  blocked unsafe input, stable findings, and report artifacts.
- **Proof.** Paired fixture for every legacy rule/reason code; clean, multiple
  findings, missing/malformed files, unsafe paths, oversized files, read
  failure, artifact failure, cancellation, crash, replay, and ordering.

### `kubeclaw.project-summary:summary`

- **Decision — reuse.** The deterministic 39-line implementation is already the
  desired straight path. Add validation for all numeric and identity fields if
  legacy behavior requires it; avoid introducing an agent.
- **Architecture.** Aligned: pure reduction plus one artifact effect.
- **Behavior to preserve.** Status, delivery/test percentages, diagnostics,
  zero-denominator behavior, and stable Markdown.
- **Proof.** Paired legacy/v2 summaries for every terminal status, zero and
  nonzero totals, invalid counts, diagnostic sanitization, artifact failure,
  cancellation, crash/replay, and byte-for-byte deterministic output.

### `kubeclaw.review:review`

- **Decision — refactor.** Keep the strict closed contract and result reducer.
  Extract generic safe JSON decoding but retain review-specific contradiction
  rules. Add missing legacy evidence acquisition through explicit inputs or
  capabilities rather than hidden repository access.
- **Architecture.** Aligned as a decision stage returning a typed result. It
  must not perform remediation itself.
- **Behavior to preserve.** Evidence inspection requirements, PASS/FAIL
  contradictions, critical/deferred issues, failed commands, unverified
  requirements, and request-fix mapping.
- **Proof.** Paired review corpus; pass, each failure source, deferred-only,
  malformed JSON, unknown fields, contradictory output, dispatch failure,
  timeout, cancellation, crash, retry/replay, and deterministic finding maps.

## Buster Stage Package

### `kubeclaw.test-agent:test`

- **Decision — rewrite.** The current 25-line implementation judges supplied
  suite evidence but does not reproduce the Buster worker. Build a compact test
  work state machine that plans/dispatches suites, monitors the testing agent,
  collects command and artifact evidence, and then applies the strict verdict
  reducer.
- **Architecture.** Test policy belongs here; runtime sessions belong to
  `runtime.dispatch`; commands belong to `command.execute`; Git access belongs
  to Git adapters; core owns retries and lifecycle.
- **Behavior to preserve.** Suite selection, real execution evidence,
  pass/failure classification, findings, transcripts, liveness, handoff,
  termination, retry, cancellation, and recovery.
- **Proof.** Paired Buster/v2 corpus with real local session and command
  harnesses: all suites pass, assertion failure, infrastructure failure,
  malformed evidence, agent crash, no progress, timeout, cancellation, restart,
  duplicate result, transcript/effect replay, and pinned resume.

## Adapter Packages

### `kubeclaw.artifact-store:artifact-store`

- **Decision — refactor.** Preserve content-addressing, namespace checks, atomic
  files, and integrity validation. Replace the growing catalog scan with a
  small append-only indexed catalog only if crash/concurrency benchmarks justify
  it.
- **Architecture.** Aligned as the exclusive artifact persistence authority.
- **Behavior to preserve.** Put/read JSON, digest identity, collision rejection,
  namespace isolation, size limits, atomic visibility, and integrity checks.
- **Proof.** Paired artifact fixtures; concurrent writers, crash at every write
  boundary, catalog corruption, digest mismatch, symlink/path escape, oversized
  data, cancellation, stale fence, replay, replacement, and removal.

### `kubeclaw.command-runner:command`

- **Decision — reuse with focused refactoring.** The bounded subprocess model is
  simpler than legacy shell helpers. Keep explicit executable and working-root
  policy; factor process termination into one tested helper.
- **Architecture.** Aligned as a privileged adapter, but it does not replace the
  unrelated operator-control command lifecycle.
- **Behavior to preserve.** Allowlisted execution, arguments, cwd, environment,
  stdout/stderr limits, exit/signal reporting, timeout, cancellation, and child
  cleanup.
- **Proof.** Real subprocess tests for success, nonzero exit, signal, timeout,
  cancellation, output overflow, denied executable/cwd/env, symlink escape,
  process-tree cleanup, adapter shutdown, crash, fence, and concurrency.

### `kubeclaw.git-workspace:git`

- **Decision — rewrite around a smaller transactional Git plan.** The current
  adapter is compact but does not yet cover the broad legacy stash, rebase,
  merge, push-retry, scoped-status, and cleanup semantics. Port observable
  behavior into explicit operations and receipts, not dozens of helper exports.
- **Architecture.** Aligned when all repository mutation lives here and stages
  receive only operation-specific grants.
- **Behavior to preserve.** Worktree allocation/cleanup, scoped changes,
  commits, merges, sync/pull/push, conflict classification, runtime-state and
  out-of-scope preservation, retries, locks, and fencing.
- **Proof.** Paired real-Git scenario corpus covering clean/dirty repositories,
  parallel worktrees, conflicts, rebase, push rejection/retry, stash
  restoration, crash at every effect boundary, cancellation, stale fence,
  duplicate receipt, restart, and concurrent runs.

### `kubeclaw.lint:executor`

- **Decision — refactor with the lint stages.** Keep one generic execution loop
  and make tools declarative records containing detection, command, parser, and
  policy metadata. Do not let the adapter decide stage outcomes.
- **Architecture.** Aligned if it only provides `lint.execute` and obtains
  subprocess authority through its trusted adapter boundary.
- **Behavior to preserve.** Tool discovery, deterministic ordering,
  parallelism limits, output parsing, optional absence, timeout, and result
  normalization.
- **Proof.** Real installed tools plus controlled fixture executables; success,
  findings, malformed output, missing required/optional tools, timeout,
  cancellation, crash, output cap, deterministic order, and concurrent runs.

### `kubeclaw.network-http:http`

- **Decision — reuse.** The small allowlisted adapter is the desired generic
  boundary. Keep it transport-only and do not add operator, runtime, or Redis
  policy.
- **Architecture.** Aligned as the sole generic HTTP authority.
- **Behavior to preserve.** Origin/method/header allowlists, size limits,
  redirect denial, timeout, cancellation, and confidential audit handling.
- **Proof.** Real local HTTP server covering methods, headers, bodies, response
  types, redirects, slow responses, disconnects, oversized streams, DNS/IP
  policy where configured, cancellation, shutdown, fence, and secret redaction.

### `kubeclaw.openclaw-agent-events:source`

- **Decision — refactor.** Retain it as the v2 subscription adapter, but share
  exactly one normalized event contract with the OpenClaw host extension and
  remove duplicate normalization/redaction logic.
- **Architecture.** Aligned as the boundary between host-specific hooks and
  immutable v2 observer events.
- **Behavior to preserve.** Supported hook coverage, run/session correlation,
  source-side redaction, ordering, subscription rollback, cancellation, and
  reconnect/replay behavior.
- **Proof.** Real in-process hook emitter plus transport restart tests for every
  hook type, malformed/oversized events, secret redaction, ordering,
  duplicates, disconnect, backpressure, cancellation, crash, checkpoint, and
  package replacement.

### `kubeclaw.operator-messaging:operator`

- **Decision — refactor and narrow.** Keep this package as authenticated,
  target-scoped request transport. Move Discord formatting, compaction, gating,
  degraded/restored notices, and notification policy to the notification
  observer/presentation package. It must not falsely claim complete legacy
  operator-messaging parity by itself.
- **Architecture.** The narrow adapter is aligned. Full legacy behavior is
  aligned only after the observer and operator-control package own the remaining
  policy.
- **Behavior to preserve.** Target authorization, confidential authentication,
  idempotent delivery, response correlation, rate-limit classification, and
  cancellation.
- **Proof.** Real local gateway tests for send/response, auth failure, wrong
  target, rate limit, retry, timeout, cancellation, duplicate idempotency key,
  malformed response, secret redaction, crash/replay, and replacement.

### `kubeclaw.repository-adapter:repository`

- **Decision — reuse.** The read-only 61-line adapter is appropriately direct.
  Add streaming only if large-file parity requires it.
- **Architecture.** Aligned and intentionally separate from mutating Git
  authority.
- **Behavior to preserve.** Repository-relative text reads, canonical-path and
  symlink containment, file/size validation, and cancellation.
- **Proof.** Real filesystem tests for valid text, missing/directory/oversized
  files, traversal, absolute paths, symlink escape/race, invalid UTF-8 policy,
  cancellation, fence, root replacement, and removal.

### `kubeclaw.runtime-dispatch:runtime`

- **Decision — rewrite.** The current bounded HTTP dispatch is useful transport
  code but is not the complete legacy agent runtime. Define explicit start,
  monitor, signal, transcript, result, terminate, and recover operations with
  durable correlation and receipts. HTTP may remain one provider.
- **Architecture.** Aligned when host-specific session authority stays inside
  the adapter and stages never receive credentials or raw session APIs.
- **Behavior to preserve.** Agent/model selection, session start, monitoring,
  liveness, transcript/evidence, handoff, termination, retries, rate limits,
  cancellation, crash recovery, and confidential authentication.
- **Proof.** Real local runtime harness exercising every operation and failure
  boundary, duplicate dispatch, out-of-order events, disconnect/reconnect,
  timeout, cancellation, host crash, transcript truncation, secret redaction,
  effect replay, fencing, and provider replacement.

### `kubeclaw.secret-resolver:secrets`

- **Decision — reuse.** Keep the tiny allowlisted resolver. Add provider
  interfaces only when another secret backend is actually introduced.
- **Architecture.** Aligned as confidential transient authority; resolved values
  must never enter journals, receipts, events, or errors.
- **Behavior to preserve.** Allowlisted lookup, missing-secret classification,
  cancellation, and non-persistence.
- **Proof.** Present/missing/empty/denied secrets, alternate provider, timeout,
  cancellation, crash, audit and journal scans for leakage, replacement, and
  removal.

### `kubeclaw.state-store:state`

- **Decision — reuse with concurrency hardening.** The append-only namespace
  model is simpler than mutable legacy projections. Keep it and add compaction
  only as an independently verified maintenance operation.
- **Architecture.** Aligned as plugin-owned append-only state behind
  registration-specific namespaces.
- **Behavior to preserve.** Append/read, monotonic sequence, identity,
  idempotency, namespace isolation, validation, and deterministic replay.
- **Proof.** Concurrent appenders, duplicate and conflicting idempotency keys,
  partial writes, corruption, restart, replay, namespace denial, cancellation,
  fencing, compaction if added, pinned resume, and replacement.

### `kubeclaw.telemetry-store:telemetry`

- **Decision — retain as a local evidence provider, not as legacy Redis parity.**
  Refactor its journal mechanics onto the shared durable-log primitive. Add a
  separate Redis provider rather than mixing transports into this adapter.
- **Architecture.** Aligned as one replaceable `telemetry.emit` provider.
- **Behavior to preserve.** Validated append-only telemetry, event identity,
  ordering, redaction, and idempotency.
- **Proof.** Concurrent emission, duplicates, corruption, restart/replay,
  ordering, redaction, size limits, cancellation, crash, replacement with Redis,
  and no event loss at accepted/completed boundaries.

### `kubeclaw.transport-publisher:publisher`

- **Decision — refactor as generic HTTP publication only.** Keep target-scoped
  authenticated publication. Do not stretch it into Redis stream parity; use a
  dedicated provider for Redis semantics.
- **Architecture.** Aligned as one provider of `transport.publish`, with
  transport-specific configuration and no domain notification logic.
- **Behavior to preserve.** Target allowlists, authentication, payload bounds,
  idempotency, retry classification, cancellation, and confidential audit.
- **Proof.** Real local target covering success, nonretryable/retryable errors,
  rate limit, timeout, cancellation, duplicate key, oversized payload, wrong
  target, malformed response, secret scan, crash/replay, and replacement.

### `kubeclaw.wait-store:waits`

- **Decision — refactor around the Phase 7 canonical signal claim.** Keep the
  durable typed wait model, but eliminate duplicate validation or persistence
  paths between adapter and core.
- **Architecture.** Aligned if core owns lifecycle pause/resume and the adapter
  owns durable wait/signal storage only.
- **Behavior to preserve.** Typed wait creation, authorized issuer, expiry,
  duplicate/stale rejection, atomic claim, new attempt on resume, and restart.
- **Proof.** Create/read/resolve, approve/reject-style schemas, duplicate,
  conflicting, stale, expired, unauthorized, malformed, concurrent signals,
  crash at claim boundaries, restart, cancellation, fencing, and replay.

## Observer Packages

Phase 10 makes observer delivery authoritative, but the migration decisions are
recorded now so Phase 9 does not create incompatible assumptions.

### `kubeclaw.agent-observability:ingester`

- **Decision — refactor.** Keep the pure event projection, centralize normalized
  hook decoding/redaction, and make telemetry identity deterministic.
- **Architecture.** Aligned as a best-effort immutable event consumer.
- **Behavior to preserve.** All supported event mappings, correlation,
  redaction, per-run order, duplicates, and checkpoint progression.
- **Proof.** One TypeScript fixture per hook plus malformed, duplicate,
  out-of-order, oversized, secret-bearing, sink failure, retry, crash,
  checkpoint, and redelivery cases.

### `kubeclaw.agent-observability:evidence`

- **Decision — reuse and separate evidence formatting from storage.** Keep one
  deterministic terminal-event-to-artifact projection.
- **Architecture.** Aligned as a non-authoritative observer with only
  `artifacts.write`.
- **Behavior to preserve.** Terminal session/agent/model evidence, stable
  artifact identity, redaction, deduplication, and checkpointing.
- **Proof.** Every terminal event type, duplicate delivery, partial/malformed
  evidence, artifact failure, retry, crash/replay, checkpoint, redaction, and
  deterministic artifact tests.

### `kubeclaw.notification-observer:notifications`

- **Decision — rewrite as a presentation policy reducer.** Move complete legacy
  notification formatting, compaction, gating, severity, degraded/restored, and
  rate-limit messaging here; use `operator.request` only for delivery.
- **Architecture.** Aligned because observer policy cannot alter lifecycle and
  transport credentials remain in the adapter.
- **Behavior to preserve.** Every run/stage/operator notification, suppression,
  compaction, rate-limit/degraded notices, idempotency, and operator-visible
  text.
- **Proof.** Paired golden messages for every subscribed event and legacy mode;
  duplicate/out-of-order events, suppression, compaction limits, delivery
  failure/retry, rate limit, crash, checkpoint, replay, and redaction.

### `kubeclaw.notification-observer:preview-delivery`

- **Decision — refactor.** Keep it separate from lifecycle notifications because
  artifact preview selection, size policy, and delivery cadence differ.
- **Architecture.** Aligned as an artifact-event observer using only operator
  delivery authority.
- **Behavior to preserve.** Eligible artifact selection, preview formatting,
  size/format limits, deduplication, and delivery.
- **Proof.** Supported/unsupported artifacts, truncation, missing artifact,
  duplicate event, delivery failure/retry, crash/replay, checkpoint,
  cancellation, and golden preview output.

### `kubeclaw.telemetry-observer:telemetry`

- **Decision — reuse with declarative event mapping.** Keep the observer tiny;
  define stable mapping tables and remove any legacy callback registry.
- **Architecture.** Aligned as a non-authoritative event consumer using only
  `telemetry.emit`.
- **Behavior to preserve.** All canonical event kinds, stable identity,
  correlation, order, redaction, checkpointing, and best-effort failure policy.
- **Proof.** One case per subscribed event, unknown event, duplicates,
  out-of-order delivery, sink failure/retry, crash, checkpoint/replay,
  redaction, and deterministic payload tests.

## OpenClaw Host Extension

### `kubeclaw-agent-observer` startup service

- **Decision — refactor substantially.** Preserve the necessary OpenClaw hook
  bridge, configuration validation, source-side redaction, bounded queue, and
  control-write reliability. Consolidate its large duplicated normalization
  surface with the v2 event contract and keep Redis as a replaceable transport,
  not embedded domain policy.
- **Architecture.** A host-native package is justified because hooks exist
  inside OpenClaw. It must remain a narrow source adapter and must not own
  pipeline lifecycle or observer projections.
- **Behavior to preserve.** Startup/shutdown, all hook registrations, mapping,
  redaction, bounded queues, Redis reconnect/retry, dead letters, diagnostics,
  transactional registration rollback, and nonblocking hook behavior.
- **Proof.** TypeScript tests against the real OpenClaw plugin API and a real
  local Redis-compatible service: enabled/disabled, every hook, config errors,
  startup rollback, write/retry/dead-letter, backpressure, disconnect/reconnect,
  shutdown, crash/restart, ordering, duplicates, and secret scans.

## Required Extensions Missing From The Current Package Set

### Rejected `kubeclaw.operator-control` plugin boundary

- **Decision — do not create this plugin.** The initial assessment proposed an
  operator-control extension, but implementation review showed that its useful
  work is either generic core authority or host ingress. Making it a pipeline
  plugin would let a plugin request or commit lifecycle transitions and would
  violate the goal architecture.
- **Architecture.** Core already owns the authenticated, idempotent,
  hash-journaled administrative reopen protocol and typed signal resume.
  Operator-message transport remains a replaceable adapter. A CLI, API, or
  OpenClaw command surface may authenticate and call those core APIs, but that
  host wiring is not a stage/observer/adapter registration and is completed at
  the Phase 12 consumer cutover.
- **Behavior to preserve.** Authorized retry, remediation, cancellation, and
  approval/rejection signals; conflict detection; stale/terminal target
  rejection; audit identity; replay; and operator correlation.
- **Proof.** Phase 6/7 core lifecycle and recovery suites prove administrative
  decisions, signal authorization, idempotency, crash recovery, concurrency,
  and replay. Operator-messaging live tests prove only transport. Phase 12
  proves the selected host ingress against the authoritative v2 core.

### New Redis transport providers

- **Decision — write focused Redis providers instead of enlarging generic HTTP,
  telemetry, or state adapters.** One shared connection/runtime utility may
  support separate wait, telemetry, event-source, and publish registrations.
- **Architecture.** Transport semantics stay replaceable; domain packages depend
  on capabilities, not Redis clients.
- **Behavior to preserve.** Streams, consumer groups, blocking reads, retries,
  TTL/MAXLEN, acknowledgements, pending recovery, deduplication, network
  isolation, authentication, and shutdown.
- **Proof.** Real Redis-compatible service tests for produce/consume, group
  recovery, pending claims, duplicates, trim/TTL, disconnect/reconnect,
  authentication, timeout, cancellation, crash, fencing, and replacement by a
  non-Redis provider.

### New prompt-contract package

- **Decision — rewrite the useful prompt primitives as a small data-only
  library/package.** Do not carry forward global prompt assembly or agent-role
  coupling. Provide stable task envelopes, closed response contracts, safe
  deterministic serialization, size limits, and versioned templates.
- **Architecture.** It may be a dependency-only package with no runtime
  registration if it has no authority or effects. Domain prompts remain owned
  by their stage packages.
- **Behavior to preserve.** Required common guidance, evidence serialization,
  response-contract instructions, deterministic ordering, and size/safety
  constraints.
- **Proof.** Paired golden prompt fixtures, deterministic serialization,
  malicious/unserializable input, size limits, versioning, package removal
  impact, and proof that it contains no runtime authority.

## Recommended Phase 9 Execution Order

1. Add the prompt-contract package and shared test utilities.
2. Parity-prove deterministic stages: delivery-lint, preflight, project summary,
   and the lint engine refactor.
3. Parity-prove architecture, review, approval, quality, and reporting stages.
4. Rewrite and parity-prove runtime dispatch, implementation-agent, and
   test-agent together using one real local session harness.
5. Rewrite and parity-prove Git workspace behavior.
6. Complete artifact, repository, command, HTTP, secret, state, wait,
   telemetry, publication, Redis, and operator-control adapter parity.
7. Close every per-extension difference record and deletion ledger before
   removing the corresponding v1 owner.
8. Carry the observer-specific plans into Phase 10 without introducing a
   compatibility event bridge.
