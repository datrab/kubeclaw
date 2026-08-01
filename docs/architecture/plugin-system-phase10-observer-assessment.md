# Phase 10 Observer Assessment

Phase 10 applies the migration workflow to every observer boundary:

1. reuse, refactor, or rewrite—and why;
2. verify the boundary follows the goal architecture;
3. define the TypeScript tests that prove observable behavior.

Durability, confidentiality, authority, and upgrade questions are included only
where they affect the decision.

## Core observer delivery

- **Decision — rewrite.** Replace mutable callback registries and sink-local
  retry state with one journal-driven runtime.
- **Architecture.** Core owns subscription matching, delivery identity,
  ordering, attempts, checkpoints, redelivery, leases, and failure policy.
  Observers receive immutable events and registration-specific capabilities;
  they cannot return lifecycle decisions.
- **Proof.** Phase 10 tests cover stable identity, per-run ordering,
  best-effort isolation, required-audit failure, durable attempt continuation,
  deterministic restart redelivery, checkpoint integrity, and ignored return
  values. Existing capability tests prove grant denial, revocation,
  cancellation, timeout, crash containment, and effect idempotency.

## `kubeclaw.agent-observability:ingester`

- **Decision — refactor.** Retain one pure, bounded, redacted projection and
  remove delivery-attempt data from the sink payload so retries are
  idempotent.
- **Architecture.** The observer has only `telemetry.emit`; hook ingress and
  Redis transport remain separate adapters/extensions.
- **Proof.** TypeScript live tests exercise real telemetry persistence,
  independent checkpoints, duplicate drains, crash containment, and secret
  absence. Contract fixtures cover every admitted OpenClaw hook family.

## `kubeclaw.agent-observability:evidence`

- **Decision — reuse with idempotency hardening.** Keep the deterministic
  terminal-event artifact projection and use stable event identity as the
  artifact identity.
- **Architecture.** The registration has only `artifacts.write` and cannot
  emit telemetry or influence lifecycle.
- **Proof.** TypeScript live tests exercise immutable artifact writes,
  redaction, duplicate suppression, independent checkpointing, adapter
  failure, and plugin crash containment.

## `kubeclaw.notification-observer:notifications`

- **Decision — rewrite.** Replace the listener registry with a deterministic
  presentation reducer covering title, severity, bounded summaries, reason
  codes, suppression, and target selection.
- **Architecture.** Presentation stays in the observer; authenticated delivery
  stays in `operator.request`. The observer has no credential, network, file,
  or lifecycle authority.
- **Proof.** TypeScript live tests execute authenticated local HTTP delivery
  through the real secret and network adapters. Golden projection tests cover
  subscribed outcomes, bounded content, suppression, redaction, retries,
  crashes, checkpoints, and replay.

## `kubeclaw.notification-observer:preview-delivery`

- **Decision — refactor.** Keep preview policy separate from lifecycle
  notifications and forward bounded artifact metadata only.
- **Architecture.** The observer has only operator-delivery authority and
  never reads arbitrary artifact bodies.
- **Proof.** Tests cover eligible metadata, unsupported/missing values,
  truncation, secret exclusion, duplicate delivery, transport failure,
  cancellation, checkpoints, and replay.

## `kubeclaw.notification-observer:audit`

- **Decision — rewrite as a separate required registration.** Durable audit is
  not a side effect of best-effort notification delivery.
- **Architecture.** The observer receives all canonical lifecycle/effect/wait
  events and has only `artifacts.write` for the
  `kubeclaw.pipeline-audit` namespace. Its `required` failure policy makes the
  host operation fail closed after bounded retries.
- **Proof.** Tests cover immutable redacted audit artifacts, deterministic
  identity, adapter failure, bounded retries, required-sink failure,
  checkpoint/replay, and crash containment.

## `kubeclaw.telemetry-observer:telemetry`

- **Decision — refactor to a pure declarative projection.** Keep one stable
  envelope and remove retry-variant fields from externally persisted payloads.
- **Architecture.** The observer has only `telemetry.emit`; Redis and local
  persistence remain provider choices.
- **Proof.** TypeScript tests cover canonical fields, all subscriptions,
  redaction, deterministic output, sink failure, retries, ordering,
  checkpoints, restart redelivery, and crashes.

## `kubeclaw-agent-observer`

- **Decision — refactor, retaining the host-native boundary.** OpenClaw hooks
  can only be captured inside OpenClaw. The package remains a narrow ingress
  extension with source-side normalization/redaction, bounded queues, Redis
  reliability, diagnostics, rollback, and shutdown.
- **Architecture.** It does not own pipeline lifecycle, projections, or
  scheduler decisions.
- **Proof.** Native TypeScript tests cover enabled/disabled startup, hook
  families, invalid config, rollback, retry/dead-letter behavior,
  backpressure, reconnect, shutdown, ordering, and secret scans.

## Dashboard and reporting

No independently privileged dashboard or reporting observer boundary exists.
Dashboards consume the canonical telemetry feed; operator-facing reporting
consumes notification/audit projections. Creating empty wrapper plugins would
add registrations and authority without cohesive behavior, so Phase 10
deliberately does not invent them.

