# Prism Completion Audit

Status: integration in progress.

Date: 2026-08-22.

This audit compares the Prism code with the accepted architecture, the Baseline
Bundle contract, the correction plan, and the completion remediation plan.

## 1. Result

The repository has a stronger Prism foundation. It is not ready for a production
release.

The repository checks pass after the changes in this phase. The live production
gate does not pass. The live gate needs a new namespace-controller deployment,
published Prism images, provider credentials, and the complete Nova, Forge, and
Buster test path.

## 2. Changes in this phase

### Nova input

Nova now reads the architecture artifact through the platform artifact service.
Nova checks its digest and size. It sends the verified content to Prism. Prism
validates `prism.design-request.v1` and stores the request in PostgreSQL.

An approval is bound to the active architecture digest and its monotonic
architecture revision. A delayed request cannot reactivate an older architecture.
A changed architecture cannot use an old approval.

### Design directions

Prism now uses the active brief, corpus search results, and contextual preference
evidence before it creates directions. It creates three named directions.

The diversity gate ignores copy-only changes. It compares the visual system,
layout tree, node types, and visual properties. Copy changes alone cannot make two
directions different. Prism validates all three directions before it writes any
of them. A failed diversity gate cannot leave an invalid direction selectable.
The comparison uses canonical key order, so a serialization-only key reorder does
not count as a new design.

The user can choose or reject a direction. The user can also record `More like
this`, `Less like this`, and `Keep this detail` evidence. Prism stores these as
contextual preference events.

Direction generation uses a material-distance threshold. One cosmetic token
change is not a separate direction. Prism writes directions in one transaction
only after all pairwise checks pass.

### Renderer and preview

The renderer now applies layout, size, color, radius, border, shadow, typography,
and semantic tone properties. The Studio preview renders the complete root layout.

Preview clicks select a typed Design Document node. Declared actions can move the
prototype through declared flow transitions. The preview does not run generated
application code.

Chromium captures now report their real browser version. Preview index records
include screenshot and accessibility-tree digests.

### Worker Core boundary

Worker Core remains generic. Prism puts the operation input in a content-addressed
artifact. The worker checks its type, size, and digest before use.

The worker sends screenshots and accessibility trees as generic evidence. It does
not put screenshot base64 data in the durable specialist result. Retry checks bind
the idempotency key to the input artifact digest.

Control accepts worker evidence only from its own internal artifact origin. It
checks each evidence digest before use.

### Corpus ingestion

Control sends acquisition work to the isolated ingestion service. Public-web
ingestion stays disabled.

The acquisition client uses a DNS address that it checked. The TLS connection is
pinned to that address and still checks the source host certificate. Redirects get
a new address check. This prevents a second DNS lookup from changing the target to
a private address.

Acquisition also blocks IPv4-mapped and IPv4-compatible IPv6 private addresses.
Prism keeps only the verified source-content digest in v1. It does not trust or
retain a caller artifact ID. Quarantine files are removed before publication is
acknowledged. The ingestion service also removes stale quarantine files after a
bounded TTL, including after a restart.

### Baseline Bundle

The design specification now includes the approved architecture, selected
direction, evidence, trade-offs, states, and flows. Acceptance criteria include
view states and user flows.

Every required view, state, and viewport gets a real Chromium screenshot and an
accessibility tree before publication. The files have separate digests. A failed
quality or browser accessibility gate blocks publication.

### Deployment and recovery

Prism still uses the normal `kubeclaw` namespace for the permanent release. The
test path uses a `BusterNamespaceLease`. No agent has namespace-management rights.

The database password bootstrap no longer places an unescaped password in SQL.
Backup jobs make dump and manifest checksums. The restore job verifies the files,
restores a separate proof database, and reads core Prism tables.

No port-forward is part of the Prism design. In-cluster tests use Service DNS. A
human user opens Studio through Tailscale.

Network policy now permits only the required Studio, Nova, control, worker,
ingestion, database, DNS, and Tailscale paths. A worker can fetch input artifacts
only from the exact trusted control origin and artifact path.

Production evidence is HMAC-attested by the protected release workflow. It is
bound to the repository commit, all four image digests, two clean namespace runs,
and the evidence artifact for every required live gate.

## 3. Test result

These repository checks passed during this phase:

- Prism contracts and TypeScript checks.
- Design Document operation tests.
- Renderer tests.
- PostgreSQL migration and revision tests with PGlite and the real pgvector
  extension.
- Corpus retrieval and rights tests.
- Studio build and Playwright tests on desktop, phone, and tablet sizes.
- Design Engine and Worker Core contract tests.
- Quality and preference tests.
- Forge and Buster adapter tests.
- Helm lint and template checks.
- Runtime-role, image-definition, deployment-command, RBAC, and documentation
  checks.

PGlite is a test substitute. It uses PostgreSQL in WebAssembly and the real
pgvector extension. It does not prove Kubernetes storage, network policy, backup,
restore, or restart behavior.

The deterministic design provider is only available outside production. A
production worker fails at startup when the live provider configuration is absent.

Autoreview found and drove fixes for request ordering, direction persistence,
evidence trust, NetworkPolicy paths, renderer input safety, contrast handling,
corpus provenance, quarantine cleanup, and baseline direction scope. The final
rerun could not start because the Codex account reached its usage limit. The last
completed review finding was fixed and focused tests passed, but a clean final
Autoreview result remains an external release gate.

## 4. Live namespace test

The test identity could create a `BusterNamespaceLease`. It could not create a
namespace. This is the correct authority model.

The controller rejected the lease with this error:

```text
roles.rbac.authorization.k8s.io "buster-namespace-runner" is forbidden:
the namespace controller tried to grant pods/portforward create permission
that it does not hold
```

The repository controller no longer grants `pods/portforward`. The deployed
controller still uses an old image and old behavior. The lease was deleted after
the failed test.

The next live test needs a redeployment of the existing controller. It does not
need a new controller design. It does not need port-forward permission.

## 5. Incomplete items

The following work is not complete:

1. Studio does not yet give the final simple four-space experience for Brief,
   Directions, Prototype, and Approve.
2. Studio does not yet show complete representative previews for each direction.
3. All approved source adapters and policy packs are not implemented.
4. Public-web ingestion is not enabled. This is intentional.
5. Worker cancellation, timeout, and lost-response recovery need live proof.
6. Quality checks do not yet derive all required states from the Nova architecture.
7. Forge has not implemented a real test application from a live Baseline Bundle.
8. Buster has not completed the real fail-then-pass fidelity cycle.
9. OpenTelemetry, dashboards, and alerts do not have live proof.
10. Persistent PostgreSQL backup, restore, restart, and upgrade do not have live
    proof.
11. The service E2E calls Prism directly. It does not prove the Nova stage. Its
    output now states this limit.
12. Two clean leased-namespace runs have not passed.
13. The full real failure matrix has not passed.
14. Physical phone and tablet checks have not run.

## 6. Release rule

`npm run verify:prism:repository` checks repository work.

`npm run verify:prism:production` also requires a signed live evidence manifest.
It fails when the evidence file is absent or when a required live gate was skipped.
The checker verifies a protected HMAC attestation. It binds the evidence to the
expected repository commit, the four released image digests, two clean namespace
runs, and the evidence artifact for each live gate. A local unsigned JSON file
cannot pass the production gate.

The generated Prism status must stay `integration-in-progress` until all live
gates pass.

## 7. Next action

1. Redeploy the current namespace-controller source.
2. Publish the four Prism images.
3. Add the real provider Secret.
4. Request a new `test-prism-*` lease.
5. Install Prism with exact image digests.
6. Run the service smoke through Service DNS and open Studio through Tailscale.
7. Complete the remaining Studio, Nova, Forge, Buster, telemetry, and recovery
   work.
8. Run two clean success journeys and the full failure matrix.
9. Create the production evidence manifest.
10. Run `npm run verify:prism:production`.
