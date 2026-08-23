# Prism Completion Remediation Plan

Status: active. Repository work is in progress. Live proof needs the redeployed
namespace controller, published images, cluster credentials, and provider secrets.

This plan closes the difference between the accepted Prism architecture and the
current implementation. It separates repository completion from live production
proof. A passing unit test, fixture, or rendered Helm file does not replace a real
service or cluster test.

## 1. Required result

The completed path is:

```text
Nova architecture artifact
-> Prism structured brief
-> corpus and provider research
-> three materially different directions
-> user selection and structured refinement
-> complete prototype and quality report
-> explicit approval
-> immutable Baseline Bundle
-> Nova module plan
-> Forge implementation
-> Buster fidelity checks
```

Permanent Prism runs in `kubeclaw`. Temporary acceptance environments use a
`BusterNamespaceLease`. Only the namespace controller creates or deletes
namespaces. Service DNS and Tailscale are used for access. Port-forward is not part
of the production or acceptance path.

## 2. Execution rules

1. Complete phases in order unless a phase explicitly permits parallel work.
2. Do not add provider-specific fields to canonical Prism data.
3. Do not add a second task lifecycle beside Worker Core.
4. Use real PostgreSQL, Chromium, services, and Kubernetes where they can run.
5. A substitute test must state what it does not prove.
6. Do not enable public-web ingestion until its complete security and rights gate
   passes.
7. Do not mark live proof complete from a fixture or claimed result.
8. Fix all accepted P0 through P3 Autoreview findings before release.

## Phase 0: restore truthful status and traceability

### Work

1. Keep Prism status as `integration-in-progress`.
2. Add every item in this plan to Prism traceability with an owner, code target,
   test, live proof, and state.
3. Remove or correct completion claims that conflict with the audit.
4. Make `verify:prism:production` fail when a required live evidence record is
   absent. Keep a separate repository-only command.
5. Make the clean bootstrap path install all Prism workspace packages and tools.

### Exit gate

- A clean checkout can install and run repository verification with one documented
  command.
- Generated status, documentation, and traceability agree.

## Phase 1: connect the Nova architecture handoff

### Work

1. Define and validate the complete `prism.design-request.v1` contract.
2. Resolve Nova's architecture artifact through the platform artifact service.
3. Verify its digest before Prism accepts it.
4. Persist the request, architecture revision, constraints, open assumptions, and
   non-changeable decisions in PostgreSQL.
5. Bind the Prism project and first Design Document to this request.
6. Reject a stale approval when the architecture digest changes.
7. Remove the independent manual-project path from Nova-started work. Keep an
   explicit standalone Studio path for user-created experiments.
8. Add restart-safe dispatch and resume tests.

### Tests

- Start a real Nova design stage with a stored architecture artifact.
- Prove that Prism displays its audience, surfaces, journeys, states, constraints,
  and assumptions.
- Change one architecture byte and prove the old approval cannot resume Nova.
- Restart Nova before dispatch, after acceptance, during approval, and after
  publication without duplicate work.

### Exit gate

- One immutable architecture artifact creates one bound Prism design request and
  one resumable Nova stage.

## Phase 2: complete Brief and Directions

### Work

1. Implement the four accepted Studio spaces: Brief, Directions, Prototype, and
   Approve.
2. In Brief, show imported context and ask only questions that materially change
   the design.
3. Record assumptions and unresolved decisions explicitly.
4. Generate three materially different directions by default.
5. Define a diversity threshold so three cosmetic variants do not pass.
6. Show for each direction:
   - representative screens;
   - experience thesis;
   - dominant references and reference lock;
   - strengths, risks, and trade-offs;
   - token, typography, and media previews;
   - applicable and unsuitable contexts.
7. Add Choose, Reject, More like this, Less like this, and Keep this detail actions.
8. Add a decision ledger and retain rejected directions outside the approved bundle.

### Tests

- Use three benchmark briefs for web, dense application UI, and TUI.
- Prove that all directions meet the brief and cross the diversity threshold.
- Complete the journey with keyboard-only use on desktop, phone, and tablet.

### Exit gate

- A non-designer can understand the brief and select one well-explained direction
  without editing JSON or knowing design terminology.

## Phase 3: integrate research, retrieval, and preference evidence

### Work

1. Add a Design Engine research step before direction generation.
2. Query the Prism corpus with brief, surface, domain, state, and style context.
3. Add replaceable source adapters for approved internal projects, uploads,
   open-source systems, design systems, and temporary provider research.
4. Keep all external identities at the adapter boundary.
5. Produce a reference lock and coverage-gap report.
6. Apply required, preferred, excluded, rights, freshness, diversity, source-family,
   and overuse rules during ranking.
7. Apply personal, project, domain, craft, and novelty preference projections during
   ranking and generation.
8. Explain which evidence changed a result.
9. Add user correction and retraction controls to `What Prism learned`.
10. Add blind regression briefs that detect taste collapse and repeated designs.

### Tests

- Select, reject, preserve, edit, reverse, and retract real design evidence.
- Prove that the next direction ranking changes for the stated context only.
- Prove that Prism's own critique does not create preference evidence.
- Prove source-family caps and novelty protection on a representative corpus.

### Exit gate

- Research and user evidence materially affect proposals and remain explainable.

## Phase 4: implement a faithful Design Document renderer

### Work

1. Implement every accepted v1 node type and strict property schema.
2. Render semantic theme tokens, typography, spacing, layout, sizing, alignment,
   radius, border, shadow, color, asset treatment, and responsive patches.
3. Apply view states and mock data deterministically.
4. Implement mocked flow transitions without arbitrary scripts.
5. Pin Chromium, fonts, locale, timezone, device scale factor, motion policy, and
   mock seed.
6. Emit node boxes, computed presentation facts, accessibility trees, and browser
   metadata.
7. Add renderer fixtures that cover web authentication, a dense dashboard, and TUI.
8. Fail clearly on an unsupported node or property. Do not silently use a generic
   block.

### Tests

- Compare semantic tokens and computed presentation facts against expected values.
- Run deterministic screenshot tests twice in clean processes.
- Change a visual token and prove the screenshot and evidence digest change.
- Change non-visual metadata and prove the screenshot does not change.

### Exit gate

- Baseline previews express the approved design rather than browser-default HTML.

## Phase 5: correct Worker Core binding

### Work

1. Put complete Design Documents, assets, previews, and bundles in Worker Core
   artifact inputs, not `operation.values`.
2. Verify input kind, media type, size, and digest before use.
3. Return screenshots, accessibility trees, reports, and bundles as Worker Core
   evidence references.
4. Remove base64 screenshots and complete documents from specialist results.
5. Keep only small Prism-owned result facts in specialist values.
6. Connect real progress, cancellation, timeout, retry, cleanup, receipt, and failure
   handling through Worker Core.
7. Remove the unused worker `ARTIFACT_ROOT` setting or give workers a supported
   evidence-transfer path. Do not mount a shared RWO volume as an accidental queue.
8. Prove Worker Core imports no Prism type or operation.

### Tests

- Run all five operations through the real Worker Core protocol.
- Cancel generation, rendering, and ingestion during work.
- Retry after a lost response and prove no duplicate revision or bundle.
- Reject a corrupt or wrong-kind artifact input.
- Prove all successful file output appears as generic evidence.

### Exit gate

- The accepted Design Engine binding tests pass without large data in specialist
  JSON.

## Phase 6: complete corpus ingestion and governed deletion

### Work

1. Make control submit acquisition work to the isolated ingestion service.
2. Implement reviewed source-adapter and policy-pack interfaces.
3. Enforce rights policy before durable acquisition and before publication.
4. Add bounded HTTPS acquisition with DNS and redirect rechecks for IPv4 and IPv6,
   private/loopback/link-local/metadata blocking, rate limits, response-size limits,
   content-type checks, and timeouts.
5. Respect access controls, terms policy, and Robots Exclusion rules.
6. Validate and sanitize images, SVG, archives, fonts, and active content in
   quarantine.
7. Normalize screens, flows, states, components, traits, strengths, risks, and
   accessibility observations.
8. Store permitted content-addressed artifacts and embeddings atomically.
9. Keep an item unsearchable until all publication steps succeed.
10. Implement rights expiry and deletion across rows, embeddings, caches, governed
    artifacts, and retrieval results.
11. Keep public-web ingestion disabled until all preceding tests pass.

### Tests

- Use approved internal-project and upload sources first.
- Inject blocked DNS, redirects, malformed content, active SVG, archive bombs,
  timeouts, and rights changes.
- Prove a failed item leaves no searchable record or retained forbidden artifact.
- Expire rights during retrieval and prove immediate exclusion and governed cleanup.

### Exit gate

- Corpus publication is atomic, rights-aware, independently owned, and safe after
  retries and deletions.

## Phase 7: complete Studio editing and prototype behavior

### Work

1. Replace the fixed first-child inspector with real click-to-select identity from
   the isolated preview.
2. Show contextual typed properties for the selected node.
3. Implement safe insert, move, duplicate, delete, variant, text, token, asset, and
   responsive operations.
4. Add natural-language change proposals that produce reviewable typed operations.
5. Add viewport, state, and flow navigation.
6. Add comments, unresolved decisions, design rationale, and provenance views.
7. Keep undo, redo, revision history, and stale-revision conflict handling.
8. Keep Puck behind the editor adapter and prove a second minimal adapter against the
   same operation contract.
9. Preserve the last valid preview after render failure.

### Tests

- Run real control, worker, PostgreSQL, artifact store, and Chromium.
- Use two concurrent browser sessions and prove conflict handling.
- Complete desktop, phone, tablet, keyboard, and screen-reader journeys.

### Exit gate

- The complete approved design can be refined without raw JSON, arbitrary CSS, or
  direct source-code editing.

## Phase 8: complete quality and publication gates

### Work

1. Derive required views, flows, and states from the accepted brief.
2. Check schema, references, reachability, flow recovery, responsiveness, content,
   accessibility, and visual quality.
3. Add browser checks for contrast, keyboard order, focus visibility, touch targets,
   reduced motion, landmarks, accessible names, and dialog behavior.
4. Add design checks for hierarchy, density, token consistency, component
   consistency, media treatment, reference-lock fidelity, and direction originality.
5. Require loading, empty, error, success, permission, destructive, and recovery
   states when the brief needs them.
6. Distinguish blocking errors, review warnings, and information.
7. Require explicit warning acceptance and store it outside the Design Document.
8. Generate human-readable design specification and observable acceptance criteria
   from the approved brief and design, not generic text.
9. Publish only after all authoritative gates pass.

### Tests

- Use one failing fixture for every gate and prove publication is blocked.
- Corrupt each bundle member and prove digest validation fails.
- Restart during publication and prove one immutable bundle identity.

### Exit gate

- Every published baseline has complete, brief-derived, independently verifiable
  evidence.

## Phase 9: finish pipeline fidelity integration

### Work

1. Put the exact Baseline Bundle digest into Nova's module plan.
2. Map relevant views, states, flows, components, and criteria to modules.
3. Give Forge read-only, scoped access to its assigned design targets.
4. Send the verified bundle through the real Buster gateway.
5. Test presence, geometry, typography, tokens, assets, responsive behavior,
   accessibility, flow behavior, and screenshot drift.
6. Route intentional deviations through the existing approval system.
7. Require a new baseline when approved intent changes.

### Tests

- Implement one real small application from a baseline.
- Inject visual, keyboard, and broken-flow defects and prove Buster blocks them.
- Correct the defects and pass against the unchanged baseline digest.

### Exit gate

- The real Nova-to-Forge-to-Buster path uses one verified approved digest.

## Phase 10: fix deployment and controller defects

### Work

1. Fix `cleanupPolicy: retain` so a retained leased namespace survives pipeline
   completion until manual release or controller expiry.
2. Keep controller-enforced bounded expiry for all retained namespaces.
3. Quote PostgreSQL role passwords safely with `psql` variables. Do not interpolate
   Secret values into SQL literals.
4. Confirm permanent Prism uses `kubeclaw` and no agent has namespace verbs.
5. Keep `deploy.sh prism` and `deploy.sh agent prism` equivalent.
6. Keep Service DNS and Tailscale as the access paths. Do not add port-forward.
7. Redeploy the current namespace controller before leased Prism acceptance.
8. Verify all four Prism images by immutable digest, signature, SBOM, provenance,
   and vulnerability policy.

### Tests

- Test database passwords containing quotes and special characters.
- Test delete and retain lease policies, manual release, and expiry cleanup.
- Run RBAC checks for Nova, Buster, all Prism service accounts, and the controller.

### Exit gate

- Deployment and lease behavior match the documented authority and cleanup model.

## Phase 11: complete recovery and observability

### Work

1. Produce daily encrypted database backups with a digest and version manifest.
2. Protect immutable artifacts with equivalent encrypted retention and versioning.
3. Make weekly restore proof:
   - restore into a separate database;
   - open one project;
   - load one Design Document revision;
   - open one Baseline Bundle;
   - verify all required artifact digests;
   - report evidence;
   - delete the proof environment.
4. Add the quarterly derived-data rebuild, preference projection, preview render, and
   test revision proof.
5. Emit Prism domain facts through the existing OpenTelemetry and ClawDeck path.
6. Add dashboards and alerts for service health, operation duration/failure,
   publication, ingestion, rights expiry, storage, backup, restore, and worker
   progress.
7. Stop authoritative publication when required artifact or observability evidence
   is incomplete.
8. Declare retention, accepted data loss, accepted recovery time, and the WAL
   archiving trigger in deployment policy.

### Exit gate

- Real persistent backup, restore, derived rebuild, telemetry, and alert proofs pass.

## Phase 12: controller-leased live acceptance

### Work

1. After image publication, create a `BusterNamespaceLease` with a `test-prism-*`
   namespace.
2. Install exact released image digests in that namespace.
3. Verify migrations, PostgreSQL, control, Studio, workers, ingestion, Secrets,
   NetworkPolicy, readiness, Service DNS, and Tailscale.
4. Run the real success path twice in separate clean namespaces.
5. Run the real failure matrix:
   - control unavailable before dispatch;
   - response lost after acceptance;
   - Nova restart during approval;
   - worker termination during render;
   - provider rate limit;
   - invalid document;
   - missing or corrupt artifact;
   - stale approval;
   - PostgreSQL restart;
   - artifact-store disconnect;
   - rights expiry during retrieval;
   - Buster visual, keyboard, and flow failures.
6. Publish machine-readable evidence with commit, image digests, cluster, namespace,
   start/end time, and artifact digests.
7. Release each lease and prove controller cleanup.

### Exit gate

- Two success runs and the complete failure matrix pass with no claimed or simulated
  outcomes.

## Phase 13: final audit and release decision

### Work

1. Run the complete repository verifier from a clean checkout.
2. Run all live commands against the released images.
3. Audit the result against all Prism architecture decisions and this plan.
4. Run Terra/high Autoreview over the complete Prism implementation range.
5. Verify every finding against the real code and fix all accepted P0 through P3
   items.
6. Repeat affected tests and Autoreview after fixes.
7. Update operator, user, security, recovery, troubleshooting, and architecture
   documentation.
8. Change Prism status to `implemented` only after every required proof is present.

### Final definition of done

- Nova's real architecture artifact controls the design brief.
- Research and explainable learned taste affect three distinct directions.
- Studio provides the complete simple non-designer journey.
- Renderer output faithfully represents Design Document visual intent.
- Worker Core remains generic and owns artifacts, evidence, progress, cancellation,
  retry, and receipts.
- Corpus ingestion is isolated, policy-safe, and independently owned.
- Publication is quality-gated and content-addressed.
- Forge and Buster use the exact approved baseline digest.
- Permanent Prism runs in `kubeclaw` without namespace authority.
- Controller-leased acceptance passes twice with the real failure matrix.
- Backup, restore, rebuild, telemetry, alerts, and security proofs pass.
- Final Terra/high Autoreview has no accepted P0 through P3 finding.

## 3. Recommended commit sequence

Keep commits reviewable and use this order:

1. Truthful status, traceability, and clean bootstrap.
2. Nova Design Request and architecture binding.
3. Brief and Directions.
4. Research and preference integration.
5. Faithful renderer.
6. Worker Core artifact and evidence binding.
7. Corpus ingestion and deletion.
8. Studio editing and prototype flows.
9. Quality gates and Baseline Bundle publication.
10. Forge and Buster fidelity path.
11. Controller, PostgreSQL, and deployment fixes.
12. Recovery, observability, and alerts.
13. Leased live acceptance and final audit.

Do not combine repository implementation claims with live acceptance claims. Each
commit must state what its tests prove and what remains unproved.
