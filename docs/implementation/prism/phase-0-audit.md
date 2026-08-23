# Prism Phase 0 Audit

Status: passed for local implementation; deployment reproof required

Date: 2026-08-15

Source commit: `81f17b46c1591623affe6bb417341b4fa143d995`

## Result

Phase 0 selected the production direction and passed the available executable proofs.

Three local proofs run:

- The typed Puck adapter tests pass.
- The phone, phone-landscape, and tablet browser tests pass.
- The opaque-origin preview attack tests pass.

Two release proofs use environment substitutes in this workspace:

- There is no connected real touch device.
- There is no PostgreSQL server, container runtime, or Kubernetes context.

The local benchmark now uses the real PGlite PostgreSQL WASM build with the official
pgvector extension. This proves SQL behavior and local latency without a fake vector
implementation. Phase 9 must repeat the same server benchmark on deployed PostgreSQL.

Chromium device profiles prove the touch and responsive CI path. Phase 10 must repeat the
accepted sequence on a physical device before normal use.

## Commands

```text
npm test --prefix spikes/prism/puck-adapter
Result: pass, 5 tests

npm run verify --prefix spikes/prism/mobile-editor
Result: pass, typecheck and 12 Playwright tests on three browser profiles

npm test --prefix spikes/prism/preview-isolation
Result: pass, 3 Playwright attack tests

kubectl config current-context
Result: fail, no current context

apt-get update
Result: fail, system package paths are read-only

npm run verify --prefix spikes/prism/postgres-retrieval
Result: pass, 10,000 PostgreSQL rows, zero rights leaks, precision@10 1.0,
p95 53.67 ms, stable result order
```

## Findings

### Puck

Decision: provisional `adapt`.

The public action types can map to typed Prism operations. The adapter rejects complete
Puck-state replacement as canonical input. This proof does not yet cover the complete
live Puck editor action set or production permission rules.

### Mobile Studio

Browser profiles prove the responsive composition and non-drag controls. They do not
prove real touch drag, mobile keyboard behavior, screen-reader behavior, or physical-device
performance.

### Preview isolation

The separate preview frame blocks parent DOM, browser storage, external network access,
and top navigation in the tested attacks. It rejects invalid protocol and session
messages. More resource-limit and active-media tests remain before production use.

### PostgreSQL retrieval

The PostgreSQL SQL and pgvector proof passes in PGlite. The server benchmark remains a
deployment proof. No JavaScript similarity search or mocked SQL function is used.

## Implementation decisions

1. Authentication: trust Tailscale identity only on the NetworkPolicy-restricted ingress
   path, then mint a short-lived, secure Prism session. Direct client identity headers are
   rejected.
2. Artifacts: use the existing content-addressed platform artifact interface. Local tests
   use its filesystem implementation, not a second artifact contract.
3. Models: use replaceable provider adapters. Provider identity stays outside canonical
   documents. Tests use a deterministic provider because external credentials are not
   available.
4. Corpus: enable internal-project, user-upload, and generated sources first. Public-web
   and provider research require explicit policy review.
5. PostgreSQL: use a chart-managed dedicated Prism PostgreSQL database for v1. External
   PostgreSQL can implement the same contract later.

## Gate decision

Pass for production implementation. Phase 9 and Phase 10 retain the server PostgreSQL and
physical-device release proofs. No production package imports spike code.

## Implementation input decisions

### Studio authentication

Tailscale Ingress is the only external path. Studio accepts Tailscale identity only from
the operator path allowed by NetworkPolicy. Studio removes user-supplied copies before it
creates a short-lived, secure, HTTP-only Prism session. Prism control accepts the signed
session. It does not accept browser identity headers.

The deployment proof must confirm the exact headers from the installed operator and must
prove that spoofed input is replaced or rejected.

### Artifact backend

Use the existing `kubeclaw.artifact-store` contract. Add an S3-compatible production
adapter with digest verification, immutable keys, object versioning, and recovery. Keep
the current filesystem adapter for local development and tests. Prism domain packages
depend only on the contract.

### Model policy

Generation, visual analysis, and design review use the existing OpenClaw model route
through a Prism adapter. The deployment selects one primary capable model and one explicit
fallback. Provider data stays outside canonical Prism output.

Corpus search uses one self-hostable BGE-M3 embedding of the normalized visual analysis.
V1 uses 1024 dimensions. The record includes model and normalization versions.

### Initial corpus policy

Enable internal projects, explicit user uploads, human-reviewed Prism generations, and
reviewed open-source applications or design systems with clear rights. Disable general
public-web crawling and durable provider-research storage until their policy packs and
rights review pass.

### PostgreSQL packaging

Use one dedicated Prism PostgreSQL StatefulSet in the Prism Helm release. Use a dedicated
database, roles, migration job, persistent volume, backup job, and restore proof. Keep the
application connection contract compatible with an external managed PostgreSQL service.
