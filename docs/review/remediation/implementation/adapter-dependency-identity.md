# Nested dependency identity prerequisite

The original adapter dependency key bound only capability/request content unless its parent already had an external deliveryId. An ordinary historical artifact read in a later administrative attempt therefore reused the first child's key with a different actual attempt and failed EFFECT_IDEMPOTENCY_CONFLICT. This was reproduced by the real pipeline-review/case-study administrative retry work; external delivery identity is not an appropriate workaround for a read.

Every active adapter invocation now records its actual EffectRequest.idempotencyKey in one internal executionKey field. Every nested dependency binds that key plus the actual attempt and request digest. Same-owner repeated calls/reconstruction retain their key; a later parent or attempt gets a distinct key. Adapter activation calls without an invocation retain the existing explicit activation owner. No opaque key parsing, nonce, synthetic read delivery ID, confidential bypass or Core business names are introduced.

The optional AdapterDependencyOptions.deliveryId forwards to the existing EffectRequest.deliveryId only for a real invocation owner and a bounded nonempty string. It does not determine durable execution ownership. Versioned original operator request records with explicit deliveryId now persist run/stage ownership and exact transmitted JSON bytes (one body, no duplicated payload), so reusing an external ID for a foreign run/stage conflicts even if its transport payload is identical. Attempts in the same delivery stage can read their accepted original receipt. Changed payloads conflict. Recovery also validates original request ownership and transport bytes before adopting any receipt, including a crash after Core acceptance but before adapter reservation. Original uncertain Discord sends still require reconciliation and are never blindly repeated.

The per-record admission ceiling is derived from at most twice the admitted 1 MiB transport body when encoded as a JSON string, plus the existing 64 KiB metadata allowance. Aggregate record-count and byte quotas remain unchanged. A real near-1-MiB high-escaping payload is accepted and transmitted byte-for-byte with legacy and explicit identities; oversized input and insufficient aggregate quota fail before HTTP.

## Recovery and rollout

This deliberately changes nested effect identities. New immutable registry snapshots include dependencyIdentityVersion=parent-invocation.v1. Original recovery/resume/administrative execution verifies the marker before starting adapters. Missing or different markers reject with an actionable RECOVERY_DEPENDENCY_IDENTITY_MISMATCH. Finish old active runs with their original runtime; automatic migration and live upgrade are unsupported. Read-only historical snapshot/report parsing remains available. The marker is integrity-covered by the existing snapshot digest, not an assertion that a malicious storage writer is trusted.

## Frozen prerequisite scope

- skills/common/plugin-runtime/sdk/src/runtime.ts: only AdapterDependencyOptions optional deliveryId.
- skills/nova/core/execution/adapter-invocation-phase.ts: required internal executionKey.
- skills/nova/core/execution/adapter-startup.ts: unconditional parent ownership and bounded delivery option forwarding.
- skills/nova/core/execution/engine-snapshots.ts: only marker read guard and frozenRegistryRecord marker; concurrent pinned-package/report changes belong to their author.
- skills/common/plugins/operator-messaging/src/delivery-records.ts: owner/transportBody in the original request append plus validation in the original recovery receipt reader. The new lookupDelivery function is unfinished handoff scope and must not enter this prerequisite commit.
- skills/common/plugins/operator-messaging/src/adapter.ts: derived per-record escaping allowance and original receipt callback computes expected transport and passes it into durable receipt validation; no new receipt capability or payload-helper extraction.
- tests/verification/reliability/adapter-dependency-identity.test.mts and this note plus three evidence logs.

The remaining operator receipt capability, payload-helper extraction, vocabulary/authorization entries and handoff work are explicitly outside this prerequisite freeze.

## Evidence

`docs/review/evidence/adapter-dependency-identity-tests.txt`: 14/14 PASS, original registry, adapter runtime, effect coordinator/journals, resource locks and real local HTTP. New tests prove same-parent repeated child call once, reconstruction once, later parent/new attempt distinct execution, no fabricated deliveryId for reads, immutable absent/changed marker denies original recoverPipeline before adapter.ready or external action, matching marker accepts the same-owner replay path, actual original operator receipt replay across attempts, changed payload/foreign run conflict and uncertain Discord refusal. Review found that the first freeze omitted receipt-recovery ownership checks; the added counterprobe interrupts the actual EffectCoordinator audit after durable acceptance before adapter reservation, then reconstructs the original runtime. Foreign run/stage and changed payload cannot adopt the original receipt; same-owner recovery succeeds without a send. Existing five operator retry tests and seven cleanup authorization/deadline tests pass. The cleanup fixtures needed the report author's legitimate newly required report.evidence.read provider/grants before this final run; the first attempted run failed at registry construction, before exercising this change.

`docs/review/evidence/adapter-dependency-identity-nova-tsc.txt`: original Nova owning TypeScript command PASS.

`docs/review/evidence/adapter-dependency-identity-lint.txt`: canonical repository ESLint on four prerequisite Core/SDK production files and the new regression PASS; exact shared-only operator adapter/delivery-records blobs are checked through ESLint stdin with their real source paths. Unfinished receipt capability WIP is excluded from these two blobs, not suppressed.

Local Discord-shaped HTTP is protocol evidence, not actual Discord delivery or deployed-token proof. No external notifications, deployment, CI execution, snapshot migration or commit was performed by the author.
