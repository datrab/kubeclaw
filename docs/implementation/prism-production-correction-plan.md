# Prism production correction plan

Status: approved findings; implementation is required.

Date: 2026-08-21.

This plan corrects the Prism production integration. It replaces inaccurate
completion claims with testable work. It also puts the permanent Prism release
in the `kubeclaw` namespace and keeps all namespace authority in the namespace
controller.

The implementation is complete only when every exit gate in this plan passes.
A document, fixture, or claimed result is not test evidence.

## 1. Required result

The permanent system uses this layout:

```text
kubeclaw namespace
├── Nova
├── Buster
├── Prism control
├── Prism Studio
├── Prism workers
├── Prism PostgreSQL
├── Archviewer
└── namespace controller
```

No agent can create, change, or delete a Kubernetes namespace.

The namespace controller is the only component with namespace authority. Nova
and Buster request temporary namespaces with `BusterNamespaceLease` resources.

The production test path is:

```text
push to main
→ GitHub builds and publishes signed Prism images
→ test runner creates a BusterNamespaceLease
→ namespace controller creates test-prism-*
→ test runner installs Prism with the new image digests
→ Nova starts the real design stage
→ Prism creates and publishes a baseline
→ Forge reads the baseline
→ Buster verifies the implementation
→ evidence is published
→ lease is released
→ namespace controller deletes test-prism-*
```

## 2. Non-negotiable rules

1. Nova is the pipeline orchestrator.
2. Worker Core stays generic.
3. Prism owns design behavior only.
4. Puck stays an exchangeable Studio adapter.
5. PostgreSQL is the canonical Prism database.
6. Published Baseline Bundles are immutable.
7. Buster owns fidelity tests.
8. Archviewer only presents Nova documents as HTML.
9. Agents have no namespace-management RBAC.
10. The namespace controller has the minimum namespace authority.
11. Permanent Prism runs in `kubeclaw`.
12. Temporary Prism acceptance runs in controller-created `test-prism-*`
    namespaces.
13. Tests use real services when the service can run.
14. A substitute test must state what it does not prove.
15. A skipped required test keeps the release blocked.

## 3. Severity and order

Use this order:

1. Correct security and namespace authority.
2. Correct deployment and image publication.
3. Correct Worker Core and Nova request behavior.
4. Correct storage, migration, and Baseline Bundle integrity.
5. Complete the Design Engine, Studio, corpus, preference, and quality systems.
6. Connect Forge and Buster to the real pipeline.
7. Add controller-leased live tests.
8. Prove recovery, observability, and security.
9. Run the final audit.

Do not start the final live test while a P0 or P1 item is open.

## Phase 0: correct status and traceability

### Work

1. Change the Prism audit status from `code complete` to
   `production integration incomplete`.
2. Remove claims that are not supported by code or live evidence.
3. Add each finding in this plan to the Prism traceability file.
4. Give each finding an owner, code location, test, live proof, and status.
5. Make the generated blueprint report `integration-in-progress` until the
   final gate passes.

### Exit gate

- Documentation and generated inventory show the same status.
- No incomplete feature is marked complete.
- Each plan item has a testable closure condition.

## Phase 1: enforce the namespace authority model

### Work

1. Set the default Prism namespace to the normal `kubeclaw` namespace.
2. Remove `PRISM_NAMESPACE=prism` as the default.
3. Remove direct Prism namespace creation from `deploy.sh`.
4. Remove direct Prism namespace deletion from normal teardown paths.
5. Confirm that Nova, Buster, Prism control, Studio, workers, ingestion, and
   Archviewer cannot create, patch, update, or delete namespaces.
6. Keep namespace verbs only on the namespace-controller ServiceAccount.
7. Keep the controller prefix allow-list. Add `test-prism` if the current
   `test` prefix rule does not safely cover it.
8. Add an admission or verification rule that rejects namespace verbs on an
   agent ServiceAccount.
9. Add a live RBAC test for each deployed agent identity.

### Required tests

```text
kubectl auth can-i create namespaces --as system:serviceaccount:kubeclaw:agent-nova = no
kubectl auth can-i create namespaces --as system:serviceaccount:kubeclaw:agent-buster = no
kubectl auth can-i create namespaces --as each Prism ServiceAccount = no
kubectl auth can-i create BusterNamespaceLease in kubeclaw as Nova = yes
namespace controller can create only an allowed leased namespace
namespace controller rejects a disallowed prefix
```

### Exit gate

- Permanent Prism installs in `kubeclaw`.
- No agent has namespace-management rights.
- Only the controller creates and deletes temporary test namespaces.

## Phase 2: correct the deployment command

### Work

1. Keep `deploy.sh prism` as the canonical multi-workload install command.
2. Add `deploy.sh agent prism` as an exact alias to the dedicated Prism
   command.
3. Do not send Prism through the generic single-agent Helm chart.
4. Make `deploy.sh agent` reject unknown roles.
5. Reject generic agent-only options for Prism, including `--with-code`, when
   they do not apply.
6. Make install, upgrade, status, smoke, E2E, and teardown use `kubeclaw` by
   default.
7. Add an explicit namespace option for leased test installs only.
8. Make teardown remove only the Prism Helm release and Prism-owned resources.
   It must not delete `kubeclaw`.
9. Keep persistent data unless an explicit destructive test option is used.

### Tests

- Execute every command in a real shell test. Do not check strings only.
- Prove that `deploy.sh prism` and `deploy.sh agent prism` produce the same
  Helm action.
- Prove that `deploy.sh agent unknown` fails.
- Prove that a Prism teardown cannot delete `kubeclaw`.
- Run install twice and prove idempotency.
- Cause one failed upgrade and prove atomic rollback.

### Exit gate

- Both supported Prism command forms are safe.
- The generic agent chart cannot install Prism.

## Phase 3: correct GitHub image publication

### Work

1. Remove the duplicate `tags` key from `build-images.yaml`.
2. Keep these images in the matrix:

```text
kubeclaw-prism-control
kubeclaw-prism-studio
kubeclaw-prism-worker
kubeclaw-prism-ingestion
```

3. Keep the Prism runtime bundle in the bundle publication job.
4. Trigger the image build when Prism code, contracts, chart, Dockerfiles,
   runtime packaging, or shared runtime dependencies change.
5. Publish commit tags and immutable digests.
6. Do not use `latest` as deployment authority.
7. Keep SBOM, provenance attestation, signing, and vulnerability scanning.
8. Export image digests as outputs for the live Prism test job.
9. Fail the workflow if any required Prism image is missing.
10. Add a workflow validation test that parses the YAML and rejects duplicate
    keys.

### Exit gate

- A push to `main` publishes all changed Prism images.
- The workflow exposes exact digests to the leased-namespace test.
- Helm never resolves a mutable tag during acceptance.

## Phase 4: secure Worker Core binding and internal APIs

### Work

1. Require authenticated control-to-worker requests.
2. Use a dedicated secret for worker authentication.
3. Compare authentication data in constant time.
4. Add a strict request-body limit to every endpoint, including dispatch.
5. Reject unknown content types and unknown fields.
6. Validate the full operation-specific schema before execution.
7. Add replay protection or bind authentication to the body digest and time.
8. Keep the Worker Core envelope generic.
9. Keep Prism request and result types inside the Design Engine package.
10. Return generic error data without prompts, secrets, or provider payloads.
11. Replace broad application NetworkPolicy groups with exact service paths.

### Tests

- Real worker accepts a valid signed request.
- Real worker rejects missing, invalid, expired, and replayed authentication.
- Real worker rejects an oversized body before buffering it.
- Real worker rejects an unknown operation and an invalid operation payload.
- NetworkPolicy blocks Studio-to-worker and ingestion-to-PostgreSQL paths.

### Exit gate

- An unauthenticated pod cannot execute design work.
- Worker Core contains no Prism import.

## Phase 5: correct Nova dispatch, approval, and resume

### Work

1. Use separate idempotency keys for the initial design request and approved
   continuation.
2. Include the approval identity and approved input digest in the continuation
   key.
3. Store dispatch identity before the network call.
4. Reconnect to accepted work after Nova restarts.
5. Verify the approval identity through the real approval service.
6. Verify that approval matches the exact Design Document revision and all
   required input digests.
7. Reject stale approvals and changed architecture inputs.
8. Block module planning while the required baseline is missing or stale.
9. Do not let Prism approve its own output.
10. Make the real Nova plugin consume the immutable Design Request artifact.

### Tests

- Kill Nova before dispatch, after acceptance, while waiting, and after
  approval.
- Prove that resume creates no duplicate request or Baseline Bundle.
- Change one architecture digest and prove that the old approval fails.
- Submit an unauthorized approver identity and prove rejection.

### Exit gate

- One Nova run resumes through one real approval and one baseline publication.

## Phase 6: correct migrations and PostgreSQL authority

### Work

1. Create separate database roles:

```text
prism_migrator
prism_runtime
prism_readonly
```

2. Give schema-change authority only to `prism_migrator`.
3. Remove startup migration from Prism control.
4. Run migrations only in the Helm migration Job.
5. Permit the migration pod to reach PostgreSQL in NetworkPolicy.
6. Give control only runtime data permissions.
7. Give reports and restore verification the minimum read permissions.
8. Make migration Jobs safe to rerun and safe during Helm rollback.
9. Test upgrades from the previous released schema.

### Exit gate

- Control cannot change the database schema.
- The migration Job reaches PostgreSQL and completes before workloads start.
- Upgrade and rollback tests pass on real PostgreSQL.

## Phase 7: correct Baseline Bundle publication

### Work

1. Compute each file digest from that file's normalized content.
2. Never reuse the Design Document digest for specification, criteria, preview
   index, or asset files.
3. Generate the bundle checksum file and root digest deterministically.
4. Render approved previews with real Playwright and Chromium.
5. Capture required compact, regular, and wide targets.
6. Capture required states and flow checkpoints.
7. Capture accessibility trees and deterministic renderer metadata.
8. Store previews as immutable artifacts.
9. Include only approved assets and exact approved acceptance criteria.
10. Verify every path, digest, reference, and artifact before publication.
11. Make publication idempotent across process restarts.
12. Run quality gates before publication and block on errors.

### Tests

- Corrupt each bundle file in turn and require rejection.
- Remove one required preview and require rejection.
- Change renderer settings and require a different evidence digest.
- Publish the same approved input twice and get one bundle identity.
- Restart control during publication and prove safe recovery.

### Exit gate

- The pipeline can reproduce and verify the complete approved bundle without
  Prism database access.

## Phase 8: complete the Design Engine contract

### Work

1. Implement all accepted operations:

```text
design.generate
design.render
design.evaluate
design.ingest
design.publish
```

2. Add strict request and result schemas for each operation.
3. Support initial generation and refinement.
4. Generate at least two materially different directions when requested.
5. Keep provider output behind validation and typed operations.
6. Put large inputs and outputs in the artifact store.
7. Return evidence references through Worker Core.
8. Replace in-memory idempotency with durable operation records.
9. Implement cancellation, retry, and progress reporting.
10. Pin renderer, browser, fonts, locale, timezone, animation policy, and mock
    data seed.

### Exit gate

- Each operation passes pure, service, restart, cancellation, and retry tests.
- No provider-specific field enters the canonical Design Document.

## Phase 9: complete Studio v1

### Work

1. Implement the accepted Design Document node catalog or explicitly defer a
   node with an approved limitation.
2. Load real projects, views, states, flows, assets, revisions, findings, and
   approvals from control.
3. Remove hard-coded Home and Primary Journey navigation.
4. Implement direction comparison and selection.
5. Implement click-to-select and typed property editing.
6. Implement user instructions such as `Propose change` through the real API.
7. Implement viewport and state switching.
8. Implement mocked flow navigation.
9. Implement undo, redo, revision history, and stale-revision handling.
10. Show render and evaluation progress.
11. Keep the last valid preview after a failed render.
12. Add the `What Prism learned` view with correction and retraction controls.
13. Keep Puck behind the Prism editor-adapter interface.
14. Prove that a second adapter can read and write the same typed operations
    with a small contract fixture.

### Tests

- Use real control, PostgreSQL, worker, artifact storage, and browser.
- Run desktop, phone, and tablet journeys.
- Open two sessions and prove revision conflict handling.
- Test keyboard-only use and screen-reader landmarks.

### Exit gate

- A user can complete the full Brief → Directions → Prototype → Approve
  journey without direct database or fixture access.

## Phase 10: complete corpus ingestion and retrieval

### Work

1. Create a real ingestion service entrypoint. Do not start the normal worker
   image in ingestion mode without implementation.
2. Keep ingestion isolated from PostgreSQL and private networks.
3. Put acquired files in quarantine before validation.
4. Enforce rights policy before storage and before retrieval.
5. Implement safe URL resolution for IPv4, IPv6, redirects, DNS rebinding,
   loopback, link-local, metadata, and private networks.
6. Create text, visual, layout, and style embeddings where approved.
7. Store embeddings in pgvector.
8. Implement full-text and vector candidate searches.
9. Fuse candidates with a documented rank method.
10. Apply required, preferred, and excluded filters.
11. Add source-family caps, diversity, freshness, rights, and overuse rules.
12. Return an explainable score and coverage-gap report.
13. Remove expired material from retrieval immediately.

### Tests

- Use real PostgreSQL with pgvector and a real embedding provider acceptance
  test.
- Ingest one approved internal project and one approved upload.
- Attempt forbidden network and source paths and prove no retained artifact or
  searchable row.
- Expire rights during a search and prove removal.
- Run latency and relevance benchmarks at the target corpus size.

### Exit gate

- Retrieval uses both semantic and structured evidence.
- Rights changes take effect before the next result is returned.

## Phase 11: complete preference learning

### Work

1. Use append-only contextual preference events.
2. Store choices, rejections, retained elements, changes, reversals, approvals,
   and implementation outcomes.
3. Store context and evidence, not a silent global weight.
4. Support event retraction and correction.
5. Separate personal, project, domain, craft, and novelty signals.
6. Do not use Prism's own critique as user-taste evidence.
7. Show the user what Prism learned and why it affected a proposal.
8. Add decay, diversity, source caps, and regression benchmarks.

### Exit gate

- A user action creates a durable explainable event.
- Retracting the event changes later ranking as specified.

## Phase 12: complete quality and publication gates

### Work

1. Implement schema, reference, flow, responsive, accessibility, content,
   visual-quality, and completeness checks.
2. Check authentication, error, recovery, loading, empty, success, permission,
   and destructive-action states when the architecture needs them.
3. Distinguish errors, warnings, and information.
4. Block publication on errors.
5. Require explicit review for accepted warnings.
6. Store the quality report as immutable evidence.
7. Add blind benchmark briefs and taste-regression tests.

### Exit gate

- Every published bundle contains a passing quality report or an explicit,
  authorized exception for each warning.

## Phase 13: connect Forge and Buster through real services

### Work

1. Put the exact Baseline Bundle digest in the Nova module plan.
2. Map views, states, flows, components, and criteria to relevant modules.
3. Give Forge read-only access to assigned design targets.
4. Prove that Forge cannot change the bundle.
5. Send the verified bundle through the real Buster gateway.
6. Run real visual, accessibility, and flow suites.
7. Store the baseline digest on every Buster result.
8. Route accepted differences through the existing approval system.
9. Require a new baseline when approved design intent changes.

### Exit gate

- A real defect blocks the pipeline.
- The corrected implementation passes against the same baseline digest.

## Phase 14: add the controller-leased live Prism test

### Work

1. Add a protected GitHub job after Prism image publication.
2. Authenticate as a test runner that can create
   `BusterNamespaceLease` resources but cannot create namespaces.
3. Create a lease with a `test-prism` prefix and deletion cleanup policy.
4. Wait for the namespace controller to report the namespace as ready.
5. Install the Prism Helm chart into that namespace with the new image
   digests.
6. Use separate temporary PostgreSQL, artifacts, Secrets, and Tailscale
   exposure.
7. Run migrations and service readiness checks.
8. Run the real Nova-led journey.
9. Run the real failure matrix.
10. Publish machine-readable evidence.
11. Delete the lease and wait for controller cleanup.
12. Run a scheduled leak check for stale `test-prism-*` namespaces.

### Required live journey

```text
Nova architecture input
→ real Prism dispatch
→ two design directions
→ authenticated test user chooses one
→ one typed Studio edit
→ render and evaluation
→ authenticated approval
→ Baseline Bundle publication
→ Nova resume
→ Forge implementation
→ Buster visual, accessibility, and flow checks
→ final Nova result
```

### Required real failures

- Control unavailable before dispatch.
- Dispatch response lost after acceptance.
- Nova restarts during approval wait.
- Worker terminates during render.
- Provider rate limit.
- Invalid Design Document.
- Missing or corrupt artifact.
- Invalid or stale approval.
- PostgreSQL restarts.
- Artifact store disconnects.
- Rights expire during retrieval.
- Buster detects visual, keyboard, and broken-flow defects.

Do not replace these tests with an environment variable that says they passed.

### Exit gate

- The success journey passes twice in new leased namespaces.
- Each failure reaches the specified state and recovery path.
- The controller removes both namespaces.

## Phase 15: recovery, observability, and security proof

### Work

1. Run daily PostgreSQL backup.
2. Run weekly restore proof in a separate proof database.
3. Set `concurrencyPolicy: Forbid` on backup and restore jobs.
4. Test artifact corruption and missing-object recovery.
5. Rebuild derived embeddings and preference projections.
6. Emit shared OpenTelemetry data with Nova run, work, attempt, document,
   baseline, module, provider, trace, and span identities.
7. Add dashboards and alerts for dispatch, approval, workers, providers,
   publication, rights expiry, backups, artifacts, and fidelity.
8. Test service-account token absence where Kubernetes access is not needed.
9. Test seccomp, capabilities, non-root users, read-only filesystems, Secrets,
   CSRF, sessions, SSRF, preview isolation, and oversized input.
10. Scan source, images, bundles, and evidence for secrets and vulnerabilities.

### Exit gate

- Backup and restore proof succeeds on persistent storage.
- A complete telemetry chain reconstructs one live pipeline run.
- Required alerts fire during injected failures.

## Phase 16: final verification and release decision

### Required commands

```text
npm run verify:prism:runtime-role
npm run verify:prism:images
npm run verify:prism:services:live
npm run verify:prism:cluster:live
npm run verify:prism:nova-stage:live
npm run verify:prism:buster-fidelity:live
npm run verify:prism:providers:live
npm run e2e:real:prism
npm run e2e:real:prism:failures
npm run verify:prism:recovery:live
npm run verify:prism:production
```

### Final audit

1. Audit the implementation against the architecture, accepted decisions,
   this correction plan, Helm output, RBAC, NetworkPolicy, and live evidence.
2. Run Autoreview with the correct Codex binary, Terra model, and high
   reasoning.
3. Fix all valid P0 through P3 findings.
4. Repeat Autoreview after the fixes.
5. Run the full test suite again.
6. Confirm that documentation describes the deployed system.
7. Confirm that no required check is skipped.

### Definition of done

Prism is production-integrated only when:

- Permanent Prism runs in `kubeclaw`.
- Only the namespace controller manages namespaces.
- `deploy.sh prism` and `deploy.sh agent prism` are safe.
- GitHub publishes signed, scanned, digest-addressed Prism images.
- A controller-leased live deployment uses those exact digests.
- Worker and internal APIs are authenticated and bounded.
- Migrations use a dedicated database role and Job.
- Studio implements the accepted user journey.
- The Design Engine implements all accepted operations.
- Corpus search uses approved hybrid retrieval.
- Preference learning is durable and explainable.
- Quality gates block invalid publication.
- Baseline Bundle digests and evidence are correct.
- Nova resumes one durable design stage after real user approval.
- Forge receives read-only scoped design targets.
- Buster blocks real fidelity defects.
- The success test passes twice in clean leased namespaces.
- The real failure matrix passes.
- Backup, restore, telemetry, alert, and security proofs pass.
- The final Autoreview has no open P0 through P3 finding.
- The generated blueprint reports `implemented` only after all prior facts are
  true.

## 4. Immediate first work package

The first implementation commit must contain only these corrections:

1. Correct the audit status.
2. Put permanent Prism in `kubeclaw`.
3. Remove direct agent namespace creation and deletion.
4. Add the safe `deploy.sh agent prism` alias.
5. Reject unknown generic agent roles.
6. Fix the duplicate GitHub workflow key.
7. Add YAML duplicate-key validation.
8. Add RBAC contract tests for the controller-only namespace rule.

After this commit passes review, implement Worker authentication, Nova
idempotency, migration authority, and Baseline Bundle integrity before any
feature expansion.
