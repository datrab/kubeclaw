# Prism production integration audit

Status: production integration incomplete; corrective work is in progress.

The current correction result is in
`docs/implementation/prism/phase-16-correction-audit.md`.

Date: 2026-08-21.

## Result

The repository contains a substantial Prism integration foundation. The
correction plan records missing production behavior and live evidence. Do not
call Prism production-ready until all correction-plan gates pass.

The current Kubernetes identity is Nova. Nova must not create namespaces
directly. Nova can create a BusterNamespaceLease. The namespace controller
uses that lease to create a temporary test namespace and grants scoped access
inside it.

This environment has no Docker or Podman command. It cannot build and start
the final OCI images. It has no approved Prism provider secret. Therefore,
this audit does not mark the live production gates as passed.

## Implemented foundation

### Runtime package

- Prism has a separate runtime role.
- Prism uses generic Worker Core envelopes.
- Worker Core has no Prism type.
- The isolated Prism runtime bundle builds from the repository.

### Images

- Control, Studio, worker, and ingestion have separate Dockerfiles.
- Archviewer replaces the old `prism-preview` image name.
- The image workflow builds, scans, signs, and publishes the images.
- Production code does not contain a `latest` Prism image authority.

### Services

- Control owns projects, revisions, approvals, bundles, artifacts, and the
  safe corpus API.
- Studio uses the real control API in production.
- Worker accepts authenticated Worker Core attempts.
- Ingestion writes approved acquisition input to a quarantine area.
- Large request bodies have limits.
- Internal service secrets protect control-to-worker and ingestion calls.

### Storage

- PostgreSQL with pgvector is the only canonical database.
- Revisions and published baselines are immutable.
- Artifact names use SHA-256 content identity.
- Backup jobs restore each dump into a separate proof database and query it.
- The backup schedule does not run two proof jobs at the same time.

### Nova and pipeline

- Nova has a Prism design stage.
- The stage dispatches through the generic runtime adapter.
- The stage creates a durable human approval wait.
- The approved request uses a different idempotency key from the first
  request.
- Forge receives read-only, module-scoped baseline targets.
- Buster receives visual, accessibility, and flow targets from the same
  baseline digest.

### Deployment

- `deploy.sh` has install, smoke, E2E, status, and removal commands.
- The install needs digest-pinned images and a real Tailscale approver list.
- Helm uses atomic upgrades.
- NetworkPolicy rules use small service-to-service paths.
- Only the Tailscale proxy can enter Studio.
- Prism does not get Kubernetes API authority.

### Archviewer

- Archviewer stays in the Nova pod.
- It shows architecture documents as HTML.
- It has no Prism approval or baseline authority.

## Test evidence

The local production command passed after a clean dependency install:

```text
npm run verify:prism:production
```

The passing checks include:

- Design contracts and digest rules
- Immutable operations and revision conflicts
- Safe rendering and unknown-component rejection
- PostgreSQL migrations through PGlite with the real pgvector extension
- Corpus rights, expiry, and retrieval rules
- Studio build and browser tests for desktop, phone, and tablet
- Puck adapter and isolated preview tests
- Engine operations and generic Worker Core envelopes
- Forge and Buster bundle adapters
- Helm lint and render
- Runtime-role isolation checks
- Deploy command checks
- Nova stage contract checks
- Documentation links and generated blueprint checks

PGlite is the one database substitute. The environment has no PostgreSQL
server and no container authority. PGlite runs PostgreSQL in WebAssembly and
loads the real pgvector extension. It does not prove storage class, network,
restart, backup, or restore behavior. The cluster tests close this gap.

The Studio development document is fixed test input. It is loaded only by the
Vite development server. The production bundle does not use it as project
data.

## Open live gates

Run these gates after the CI images exist and an authorized cluster identity
is available:

1. Publish and verify all signed image digests.
2. Run `scripts/deploy.sh prism` with the real Tailscale approver login.
3. Run `scripts/deploy.sh prism-smoke`.
4. Open Studio through Tailscale and verify the identity headers.
5. Run `scripts/deploy.sh prism-e2e` twice in clean namespaces.
6. Run live provider acceptance with the protected Prism provider Secret.
7. Run the pod, network, database, artifact, provider, and backup failure
   matrix.
8. Run Forge and Buster against a real test application.
9. Test a physical phone and tablet.
10. Run Autoreview again after Codex authentication is restored.

These are required release gates. A skipped gate is not a pass.

## Autoreview

The required helper was run three times with this engine:

```text
/app/node_modules/.bin/codex
model: gpt-5.6-terra
reasoning: high
```

All three calls failed before review because the Codex OAuth refresh token was
revoked. The helper returned HTTP 401. No model finding was accepted or
rejected. A manual review found and fixed these defects:

- Missing control-to-worker authentication
- Unbounded worker request bodies
- Over-wide internal NetworkPolicy paths
- Missing migration-job database network access
- Wrong Baseline Bundle evidence digests
- One idempotency key for two different Nova requests
- An ingestion image that could not start
- An unused Redis dependency and network path
- An assumed Tailscale approver identity
- An unused Playwright production dependency

Autoreview must run again when the account is authenticated. This is a release
blocker, not a code substitute.

## Decision

Prism is not production-integrated. Complete
`prism-production-correction-plan.md`, run the real leased-namespace tests,
and repeat the final audit before release.
