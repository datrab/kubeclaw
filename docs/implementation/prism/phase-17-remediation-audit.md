# Prism phase 17 remediation audit

Status: repository checks pass; production acceptance is blocked.

Date: 2026-08-22.

## 1. Audit scope

This audit compares the implementation with:

- The Prism architecture.
- The Design Document v1 decision.
- The Baseline Bundle v1 decision.
- The production correction plan.
- The audit remediation plan.
- The live namespace test.
- Terra Autoreview findings.

## 2. Implemented corrections

### Namespace and transport

- Permanent Prism uses the `kubeclaw` namespace.
- Agents do not get namespace-management rights.
- Nova requests temporary namespaces with `BusterNamespaceLease`.
- The Prism test runner uses Kubernetes Service DNS.
- The human Studio path uses Tailscale.
- Prism acceptance does not use `kubectl port-forward`.

The deployed namespace controller is stale. A clean lease still tried to grant
`pods/portforward`. The current repository source does not grant that permission.
The source does not need a new controller feature. The cluster needs a rollout of
the accepted controller image.

### Worker and migration safety

- Worker requests use a body-, time-, and nonce-bound HMAC.
- PostgreSQL stores replay nonces for all worker replicas.
- Expired nonce cleanup is bounded to 1,000 rows per request.
- Worker request bodies have a fixed 16 MB limit.
- Schema migration uses one connection, one transaction, and one advisory lock.
- The lock is acquired before schema or migration metadata changes.

### Design Document

- The 36 accepted node types have one catalogue.
- Unknown node types and unknown properties fail.
- Required properties, property types, enums, ranges, child counts, state
  patches, and responsive patches are checked.
- Canonical nodes do not have a generic render fallback.
- One Puck change produces one atomic Prism operation or operation batch.

### Studio and rendering

- The normal Studio editor uses typed fields. It does not use a raw JSON editor.
- Desktop, phone, and tablet browser tests cover edits and preview isolation.
- The renderer has semantic output for all accepted node types.
- Image and icon evidence uses the approved artifact bytes. The render request
  has a 6 MB total raw-asset limit and a bounded 16 MB worker request limit.
  This leaves space for base64 encoding, the Design Document, and the worker
  envelope.
- Browser capture checks accessible names and keyboard focus. Native label text
  counts as an accessible name.

### Approval and publication

- Direction selection verifies that the direction and document have the same
  project.
- Quality finding IDs are stable hashes of finding content.
- Blocking findings stop approval and publication.
- Each review warning needs explicit acceptance.
- Publication repeats the quality check and rejects changed warnings.
- Captured render evidence must contain the screenshot, accessibility tree, and
  accessibility audit result.
- The bundle includes all approved states at compact, regular, and wide sizes.
- Bundle assets, preview files, criteria, quality report, and design documents
  have independent digests.
- The quality report stores accepted warning IDs.
- Publication remains content-addressed and idempotent.

### Retrieval and learning

- Retrieval supports required, preferred, and excluded filters.
- Source-family caps add diversity.
- Each result explains its rank method, preferred match, and family cap.
- Rights and expiry checks occur in the database query before ranking.
- Preference evidence is contextual, explainable, retractable, and time-decayed.
- Personal, project, domain, craft, and novelty projections remain separate.

### Test integrity

- The old failure command that only claimed Buster results is removed.
- Failure acceptance now requires real Buster result receipts for the defect and
  corrected application.
- PGlite is used only where a PostgreSQL server is not available. It uses the
  real pgvector extension. It does not prove Kubernetes storage, network, backup,
  restore, or restart behavior.
- One bootstrap command installs locked test dependencies for a clean checkout.

## 3. Tests that pass in this environment

- Contract and TypeScript checks.
- Strict Design Document validation.
- Design operations and revision conflicts.
- Shared replay rejection with two PostgreSQL nonce-store instances.
- Migration ordering and PostgreSQL/pgvector behavior.
- Corpus rights, expiry, hybrid retrieval, filters, and diversity.
- Preference projection, decay, and retraction.
- Full renderer catalogue and active-content escaping.
- Studio desktop, phone, tablet, and isolated preview tests.
- Engine, Forge adapter, Buster adapter, Helm, deployment command, image,
  runtime-package, and documentation checks.

The canonical local command is:

```text
npm run verify:prism:production
```

## 4. Live gates that are still blocked

The following items cannot pass in the current session:

1. Roll the namespace controller to the accepted source image.
2. Publish the four new Prism image digests in GitHub Actions.
3. Create a clean leased namespace with the rolled controller.
4. Install Prism with those exact digests.
5. Run the real provider after its credentials are configured.
6. Run the real Nova to Prism to Forge to Buster journey twice.
7. Prove Buster failure and correction against one baseline digest.
8. Inject the required pod, network, PostgreSQL, artifact, and provider failures.
9. Prove backup and restore on persistent cluster storage.
10. Prove telemetry and alerts.
11. Complete physical phone and tablet checks.

The repository does not convert a skipped item to a pass. The blueprint must stay
`integration-in-progress` until these items pass.

## 5. Release decision

The repository remediation is suitable for image build and live acceptance.
Prism is not production-ready yet. The next authorized action is the controller
rollout, followed by the GitHub image build and the leased namespace test.

## 6. Final structured review

The closeout Autoreview used Codex `gpt-5.6-terra` with high reasoning. The
review found and the implementation fixed these final contract defects:

- Missing component and variant references were not rejected.
- Recursive component graphs were not rejected.
- Component variant and override patches were not fully checked.
- Component-reference changes through overrides could cause recursive renders.
- Ordered lists rendered as unordered lists.
- Bound accessibility labels could render as invalid ARIA text.
- State and responsive patches could refer to missing nodes.

Focused contract and renderer tests cover each correction. The final structured
review returned no accepted or actionable P0 through P3 finding.
