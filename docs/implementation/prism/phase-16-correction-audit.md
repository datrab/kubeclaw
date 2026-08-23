# Prism correction audit

Status: repository correction complete; live release proof blocked.

Date: 2026-08-21.

## Result

The correction work fixed the repository defects that the production plan
identified. The repository is not proof that Prism is ready for production.
The live cluster, provider, Forge, and Buster gates still need external
authority and secrets.

Do not change the generated blueprint status to `implemented` until all live
gates pass.

## Deployment authority

Permanent Prism uses the `kubeclaw` namespace. Prism does not create or delete
that namespace.

These commands are equivalent:

```text
scripts/deploy.sh prism
scripts/deploy.sh agent prism
```

Both commands use the dedicated Prism Helm chart. The generic agent chart does
not install Prism.

No agent ServiceAccount has namespace verbs. The namespace controller is the
only namespace authority. A live test runner must create a
`BusterNamespaceLease`. The controller then creates a `test-prism-*`
namespace.

The Kubernetes identity in this execution environment reports no useful name.
It cannot create namespaces, leases, Deployments, or read Secrets. Therefore,
this environment cannot run the leased cluster test.

## Repository corrections

### Worker and request safety

- Control signs each worker request with HMAC-SHA-256.
- The signature binds the body digest, time, and random nonce.
- The worker rejects an old time, a changed body, and a repeated nonce.
- Worker requests have a two-megabyte limit.
- Engine request and result fields use strict schemas.
- Worker Core stays generic and contains no Prism type.

### Durable engine work

- PostgreSQL stores engine request digests and completed results.
- A database advisory lock serializes each idempotency key.
- A repeated key with different input fails.
- A retry after a lost response returns the saved result.
- A generated design is bound to its source revision.
- A stale generated design returns a revision conflict.
- Concurrent retries can apply one generated revision only.

### Database upgrades

- Migration files have ordered names.
- PostgreSQL records each applied file.
- A later migration adds the engine result fields.
- One database connection owns the transaction and advisory lock.
- Two migration Jobs cannot apply the same file at the same time.
- Control does not run schema migrations at startup.

### Studio

- Studio loads real projects, directions, views, states, flows, and preference
  evidence from control.
- The user can select a direction and request a real design change.
- The user can switch view, state, flow, and viewport.
- Studio shows revision history.
- A restore creates a new immutable revision.
- The user can retract preference evidence.
- Puck remains an adapter. It is not the canonical data model.

### Baseline evidence

- Publication renders every required view and state at compact, regular, and
  wide sizes with Playwright and Chromium.
- Each preview, accessibility tree, specification, criteria file, quality
  report, and checksum file has its own digest.
- Publication blocks on quality errors.
- The bundle is content-addressed and immutable.

### Corpus and learning

- PostgreSQL and pgvector provide hybrid full-text and semantic retrieval.
- Retrieval applies rights and expiry rules before it returns a result.
- Preference events are append-only, contextual, explainable, and retractable.
- Prism critique is not user-taste evidence.

### Delivery and live acceptance path

- GitHub builds the control, Studio, worker, and ingestion images.
- The workflow uses commit tags and image digests.
- The protected live job requests a namespace lease. It does not create a
  namespace directly.
- `deploy.sh prism-e2e` installs digest-pinned images in the leased namespace.
- The service journey now checks the initial wait, two directions, selection,
  refinement, revision history, approval, publication, and dispatch handoff.
- Failure tests stop real pods, restart real PostgreSQL, and run real backup
  and restore Jobs.

## Tests that passed

The local production suite passed after a clean install of development test
packages:

```text
npm run verify:prism:production
```

It includes contract, domain, renderer, storage, Studio browser, engine,
corpus, preference, quality, pipeline adapter, Helm, runtime role, image
definition, deployment command, namespace RBAC, and documentation checks.

The browser tests use real Chromium. The storage tests use PGlite PostgreSQL
with the real pgvector extension. PGlite is the only service substitute. This
environment has no PostgreSQL server, Docker, Podman, or writable Kubernetes
authority. PGlite does not prove storage, network, restart, backup, or restore
behavior. The leased cluster test must close this gap.

## Autoreview

The final review command was:

```text
autoreview --mode local --engine codex --codex-bin /app/node_modules/.bin/codex --model gpt-5.6-terra --thinking high --stream-engine-output
```

Autoreview found and caused fixes for migration upgrades, migration locking,
request binding, stale generation, concurrent retries, and legacy operation
rows.

The last review reported one P1 finding that said `Validator` was not defined.
The finding is false. `Validator` is defined on line 9 of the same file, and
the contracts TypeScript check passes. No code change was made for that
finding.

## Open live release gates

The following work cannot be marked passed from this environment:

1. Confirm that GitHub published and signed all four image digests.
2. Run the protected live job with a lease-capable test identity.
3. Run the live model and embedding providers with approved Secrets.
4. Pass the success journey twice in new `test-prism-*` namespaces.
5. Run the complete pod, network, PostgreSQL, artifact, provider, rights, and
   backup failure matrix.
6. Run Nova as the real pipeline orchestrator through approval and resume.
7. Give Forge the approved read-only bundle and build the test application.
8. Make Buster fail real visual, keyboard, and flow defects.
9. Fix the defects and make Buster pass against the same baseline digest.
10. Prove the full OpenTelemetry chain and required alerts.
11. Test one physical phone and tablet.

The protected GitHub job remains disabled unless
`PRISM_LIVE_ACCEPTANCE_ENABLED` is `true` and its required Secrets exist.

## Release decision

The code and deployment definitions are ready for the live proof. Prism is not
production-ready until the open live gates pass. A skipped gate is not a pass.
