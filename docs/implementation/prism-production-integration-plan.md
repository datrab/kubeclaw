# Prism production integration plan

Status: approved implementation foundation exists. Production integration is not complete.

This plan connects Prism to the production pipeline as a new system. Nova
remains the only pipeline orchestrator.

Nova's existing HTML presentation sidecar is not Prism. It remains available so
Nova can present architecture documents and other reports as HTML. Rename this
sidecar and image to `archviewer` so its purpose is clear. Archviewer does not
store, edit, approve, or publish Prism designs.

Related documents:

- [Prism implementation plan](prism-implementation-plan.md)
- [Prism final foundation audit](prism/phase-10-final-audit.md)
- [Prism Design Engine contract](../architecture/prism-design-engine-contract-v1.md)
- [Prism Baseline Bundle contract](../architecture/prism-baseline-bundle-v1.md)
- [Worker Core architecture](../architecture/pipeline-worker-core-phase-5-5-audit.md)

## 1. Required result

The completed production path is:

```text
User and Nova define a product
→ Nova approves the architecture input
→ Nova sends an immutable design request to Prism
→ Prism creates directions
→ User edits and approves the design in Studio
→ Prism publishes an immutable Baseline Bundle
→ Nova verifies and imports the bundle
→ Nova creates the module plan
→ Forge implements the product
→ Buster checks the implementation against the Prism baseline
→ Nova continues or stops the pipeline from verified evidence
```

The integration is complete only when this path runs on the target Kubernetes
cluster with production images and real services.

## 2. Fixed system boundaries

These rules must not change during implementation.

1. Nova is the only pipeline orchestrator.
2. Worker Core stays generic. It must not import Prism types.
3. The Prism Design Engine owns all design operations.
4. The Prism Design Document is the canonical editable design.
5. A published Baseline Bundle is immutable.
6. Studio is a separate stateless workload.
7. Puck is an exchangeable editor adapter. Puck data is not canonical.
8. PostgreSQL is the canonical Prism database.
9. The artifact store holds large immutable files.
10. Buster owns fidelity tests. Prism must not create a second test system.
11. Prism has no production deployment authority.
12. A user approval is required before Nova can import a baseline.

## 3. Test rule

Use the real implementation whenever it is available.

### 3.1 Pure tests

Pure tests can use fixed input files. An input file is not a mock. Examples are:

- a valid Design Document;
- an invalid Design Document;
- a signed Baseline Bundle manifest;
- a typed worker request;
- a Puck action event.

Pure tests must not replace PostgreSQL, Redis, the artifact store, Worker Core,
OpenClaw, Nova, Prism, or Buster with local fake objects.

### 3.2 Service integration tests

Service integration tests must start real services:

- PostgreSQL with pgvector;
- Redis;
- the selected artifact-store service;
- Prism control;
- Prism Studio;
- Prism workers;
- Nova;
- Buster;
- an OCI registry when an image is built;
- a Kubernetes API when Kubernetes behavior is tested.

Use short-lived containers or a short-lived Kubernetes namespace. Do not use an
in-memory database in production integration tests.

### 3.3 Live provider tests

Provider acceptance tests must call the approved live providers. They must use
small fixed requests and strict cost limits. They must record the provider,
model, request digest, response digest, duration, and cost when the provider
returns cost data.

A deterministic provider can remain in pure engine tests. It cannot prove live
provider integration.

### 3.4 Allowed substitutes

A substitute is allowed only when the real dependency cannot run in CI. The test
report must include:

- the dependency that is not available;
- the technical reason;
- the substitute that was used;
- the behavior that the test does not prove;
- the live acceptance test that closes the gap;
- the owner and due condition for that test.

Do not use a substitute only to make a test faster.

### 3.5 Failure tests

Use real failure injection where possible:

- stop a real pod;
- revoke a real token;
- block a real NetworkPolicy path;
- corrupt a copied artifact and verify its digest rejection;
- terminate a worker during a real operation;
- use Toxiproxy or a network rule for delay and disconnect tests.

Do not return a fake error from a fake client when the real service can be
stopped or isolated.

## 4. Delivery phases

Run the phases in order. Each phase has a hard exit gate. Do not report a later
phase as complete when an earlier gate is open.

## Phase 0: record the production baseline

Goal: remove ambiguity before code changes.

### Work

1. Add a generated integration-status record for Prism.
2. Record every missing production edge.
3. Add one traceability table. Each requirement must point to its code, test,
   deployment object, and live proof.
4. Record the exact versions of OpenClaw, Node.js, PostgreSQL, pgvector, Redis,
   Puck, Playwright, Helm, and Kubernetes.
5. Select the artifact-store backend for production tests.
6. Select the live generation, vision, embedding, and review providers.
7. Select the first permitted corpus source classes.
8. Record the complete operator command surface, secret inventory, network
   edges, storage classes, backup destination, and rollback owner.
9. Add a documentation matrix. It must cover installation, configuration,
   normal use, failure recovery, security, upgrades, backup, restore, and
   removal.

### Files

```text
docs/implementation/prism/integration-baseline.md
docs/implementation/prism/integration-traceability.json
docs/operations/prism-operator-guide.md
docs/user-guides/prism-studio.md
docs/runbooks/prism-recovery.md
docs/security/prism-threat-model.md
scripts/docs-blueprint-generate.mjs
```

### Exit gate

- The generated blueprint reports `integration-in-progress`.
- No known missing edge is absent from the traceability table.
- Provider and artifact-store choices have named owners and secret names.
- Every planned command, Secret, service, image, test, and document has one
  traceability entry.

## Phase 1: package the Prism runtime role

Goal: create a production Prism role that uses the same package system as Nova
and Buster.

### Work

1. Add `prism` to the runtime-role manifest schema.
2. Add `packaging/runtime/roles/prism.json`.
3. Add Prism packages to `packaging/runtime/package-ownership.json`.
4. Add a real Prism runtime entrypoint in the Prism package.
5. Package Worker Core, Prism contracts, Prism engine, shared plugins, and the
   required external dependencies.
6. Add the Prism role to the bundle build script and release workflow.
7. Prove that the Prism bundle contains no Nova core and no Buster engine.
8. Prove that Worker Core contains no Prism import.

### Required runtime capabilities

```text
artifacts.read
artifacts.write
network.http
secrets.read
telemetry.emit
```

The control path can dispatch Prism work. A single Prism attempt receives only
the capability for its operation.

### Files

```text
packaging/runtime/roles/prism.json
packaging/runtime/package-ownership.json
scripts/build-runtime-role-bundle.mjs
scripts/check-runtime-role-manifests.mjs
scripts/package-agent-skill-bundle.sh
skills/prism/runtime.ts
tests/verification/contracts/check-prism-runtime-role.mts
tests/verification/contracts/check-prism-runtime-bundle-isolation.mts
```

### Tests

- Build the real Prism runtime bundle from a clean `npm ci` checkout.
- Start the bundled runtime with its production entrypoint.
- Send one signed Worker Core request.
- Verify one signed Worker Core result and receipt.
- Remove one required package and prove that the manifest check fails.

### Exit gate

- The Prism role bundle builds in CI.
- The isolated bundle starts without repository source paths.
- Runtime-role checks pass for Nova, Buster, and Prism.

## Phase 2: build production images

Goal: create pinned images for each trust and resource class.

### Images

```text
kubeclaw-prism-control
kubeclaw-prism-studio
kubeclaw-prism-worker
kubeclaw-prism-ingestion
```

The ingestion image can be disabled in Helm. It must still build and pass its
security checks before external ingestion is enabled.

### Work

1. Add one Dockerfile for each image.
2. Pin every base image by version and digest.
3. Use a dated Debian snapshot when operating-system packages are required.
4. Put Chromium only in the worker images that need it.
5. Put no provider secret in an image layer.
6. Add SBOM, provenance, and vulnerability scan output.
7. Sign published images.
8. Add all images to `.github/workflows/build-images.yaml`.
9. Rename the existing Nova `prism-preview` presentation image to
   `archviewer`. Keep it separate from all Prism images and contracts.

### Tests

- Build all images for `amd64` and `arm64` when the base supports both.
- Start each image with its real entrypoint.
- Test the readiness and liveness endpoints.
- Scan each final image.
- Inspect each image and verify its non-root user, entrypoint, and labels.
- Prove that Studio has no database, provider, Redis, or Kubernetes credential.

### Exit gate

- GHCR contains the tagged Prism images configured by the chart.
- All critical and high vulnerability findings are fixed or have an approved,
  time-bounded exception.
- Image signatures and SBOM files are available.

## Phase 3: finish the Prism services

Goal: replace fixture-driven local behavior with real services.

### Control API

Implement endpoints for:

```text
project create and read
brief revision create and read
direction list and selection
document revision read and edit
render request and status
evaluation request and status
preference event create and retract
approval create and verify
baseline publish and read
corpus search and ingestion status
health and readiness
```

Studio authentication must use the verified Tailscale identity to create a
short-lived Prism session. The browser receives a secure, HTTP-only,
same-site cookie. State-changing requests require CSRF protection. Control must
reject a client-supplied user identity, an expired session, a wrong audience,
and missing approval authority.

### Studio

1. Remove the default fixture as an application data source.
2. Load projects and revisions from Prism control.
3. Send typed edit operations to Prism control.
4. Use optimistic revision checks.
5. Show worker progress from the real operation stream.
6. Keep the last valid preview when rendering fails.
7. Use the real approval API.
8. Use the real artifact read path for assets and previews.

Fixtures can remain only in Storybook-like development examples and pure tests.

### Worker service

1. Bind all Design Engine operations to Worker Core.
2. Use real artifact references for large inputs and outputs.
3. Add cancellation and retry handling.
4. Add idempotency for generate, render, evaluate, ingest, and publish.
5. Emit the shared telemetry and receipt contracts.

### Tests

- Run control against real PostgreSQL and the real artifact store.
- Run worker requests through the real Worker Core transport.
- Run Studio browser tests against the real control API.
- Open two Studio sessions and prove stale-revision rejection.
- Restart control and prove that all accepted revisions remain.
- Restart a worker during render and prove safe retry or terminal failure.

### Exit gate

- No production Studio path reads the fixture document.
- A browser can create, edit, reload, approve, and publish a real project.
- A restart does not lose canonical state.

## Phase 4: deploy the standalone Prism system

Goal: install Prism as a separate Kubernetes system.

### Workloads

```text
prism-control
prism-studio
prism-worker
prism-ingestion-worker (disabled by default)
prism-postgresql
backup and restore-proof jobs
```

### Work

1. Replace the placeholder `kubeclaw/prism:latest` image in `charts/prism`.
2. Use separate image values for control, Studio, worker, and ingestion.
3. Add published image repositories and tags to production values.
4. Add real Secrets and ConfigMaps.
5. Add database migrations as a one-shot Job.
6. Add PodDisruptionBudgets where replicas are greater than one.
7. Add topology spread for Studio and workers.
8. Keep default-deny ingress and egress.
9. Expose only Studio through the installed Tailscale Operator.
10. Rename the Nova `prism-preview` presentation sidecar, image, service name,
    port name, and operator documentation to `archviewer`. Keep its HTML
    presentation function. Do not connect it to Prism state or authority.
11. Add generous, configurable CPU, memory, and ephemeral-storage values.
12. Add persistent backup storage and a restore-proof schedule.

Prism PostgreSQL is dedicated to Prism. It is not the optional platform
PostgreSQL that LiteLLM uses. `KUBECLAW_DEPLOY_POSTGRESQL=false` must not disable
the Prism database when `KUBECLAW_DEPLOY_PRISM=true`.

### `scripts/deploy.sh` integration

Prism must be a first-class deployment target. Do not require operators to run
raw Helm commands for normal installation, status, smoke, upgrade, or removal.

Add these commands:

```text
./scripts/deploy.sh prism
./scripts/deploy.sh prism-smoke
./scripts/deploy.sh prism-e2e
./scripts/deploy.sh prism-status
./scripts/deploy.sh teardown-prism
```

Update existing commands:

- `setup` creates or verifies the Prism namespace and required service
  accounts. It must be idempotent.
- `secrets` creates, copies, or verifies the Prism database, artifact-store,
  provider, dispatch, session-signing, backup, and Tailscale inputs. It must
  print missing secret names and keys without printing secret values.
- `all` runs `setup`, `infra`, `prism`, and `agents` in dependency order. Prism
  must be ready before Nova is deployed with its required Prism stage enabled.
- `smoke` includes `prism-smoke` after the Nova and Buster pod checks.
- `status` includes Prism Deployments, StatefulSets, Jobs, Services, Ingress,
  PVCs, backup state, migration state, and the installed image references.
- `teardown` removes Prism workloads and its Helm release but keeps Prism data
  unless the operator explicitly requests data deletion.
- `teardown-all` clearly lists and then removes the Prism namespace, PVCs,
  backups that are inside the deletion scope, and Secrets after the existing
  destructive confirmation.

Add these environment settings:

```text
KUBECLAW_DEPLOY_PRISM=true|false
PRISM_NAMESPACE=prism
PRISM_RELEASE=prism
PRISM_VALUES_FILE=my-values/prism-values.yaml
PRISM_HELM_TIMEOUT=45m
PRISM_ROLLOUT_TIMEOUT=45m
PRISM_CONTROL_IMAGE_REPOSITORY
PRISM_CONTROL_IMAGE_TAG
PRISM_STUDIO_IMAGE_REPOSITORY
PRISM_STUDIO_IMAGE_TAG
PRISM_WORKER_IMAGE_REPOSITORY
PRISM_WORKER_IMAGE_TAG
PRISM_INGESTION_IMAGE_REPOSITORY
PRISM_INGESTION_IMAGE_TAG
```

Defaults must come from the checked-in production values. Environment values
are explicit operator overrides. Prism uses ordinary repository-and-tag image
references. A production deploy must reject a missing values file or a missing
required Secret.

`deploy.sh prism` must do these steps:

1. Check `kubectl`, `helm`, the cluster identity, and namespace safety.
2. Create the Prism namespace when it does not exist.
3. Check required Secrets and storage classes.
4. Validate the chart and values with Helm and the chart JSON schema.
5. Install or upgrade the Prism release with `--atomic`, `--wait`, and a bounded
   timeout.
6. Run the migration Job once for the target release.
7. Wait for PostgreSQL, control, Studio, and workers.
8. Report the deployed image references.
9. Run `prism-smoke`.
10. Print the Studio Tailscale address and a machine-readable deployment
    result.

`deploy.sh prism-smoke` must use the real deployed services. It must check:

- database connection and schema version;
- artifact write, read, and digest verification;
- Redis and Worker Core dispatch;
- one bounded render and evaluation;
- Studio health and authenticated control access;
- Tailscale reachability when enabled;
- telemetry receipt completeness.

`deploy.sh prism-e2e` must call the Nova-run `npm run e2e:real:prism` path. It
must not implement a second end-to-end journey in Bash.

Add command-contract tests for help text, argument validation, disabled Prism,
idempotent repeated deploys, failed Helm rollback, status, smoke, safe teardown,
and destructive teardown. Tests that inspect command construction can use a
recording shell harness. The acceptance test must run the real script against a
real Kubernetes cluster.

### Deployment files

```text
scripts/deploy.sh
my-values/prism-values.yaml
charts/prism/
tests/verification/contracts/check-deploy-prism-command.mts
tests/verification/live/prism-deploy-production-smoke.mjs
tests/verification/live/prism-deploy-idempotency.mjs
tests/verification/live/prism-deploy-teardown.mjs
```

### Real cluster tests

Run in a short-lived namespace on a real Kubernetes cluster:

1. Install the chart.
2. Wait for every workload to become ready.
3. Run migrations.
4. Open Studio through Tailscale.
5. Create and edit a project.
6. Scale Studio and workers up and down.
7. Delete a Studio pod and verify no data loss.
8. Delete a worker during a render and verify recovery.
9. Restart PostgreSQL and verify recovery.
10. Run backup, delete the test database, restore it, and open the project.
11. Prove forbidden network paths with active connection attempts.
12. Prove permitted network paths with active application requests.
13. Run `deploy.sh prism` twice and prove that the second run makes no harmful
    change.
14. Run `deploy.sh prism-status` and verify every reported image reference against
    the workload specification.
15. Run `deploy.sh teardown-prism`, verify that data remains, reinstall Prism,
    and open the same project.
16. Run the destructive Prism deletion path in a disposable namespace and
    verify that its declared data is removed.

### Exit gate

- Prism runs independently from Nova.
- Nova has no Prism sidecar.
- The restore proof passes with real persistent storage.
- Network tests prove default-deny behavior.
- `deploy.sh all`, `prism`, `prism-smoke`, `prism-status`, and Prism teardown
  paths pass against the real cluster.
- A failed atomic upgrade leaves the last healthy Prism release available.

## Phase 5: add the Nova design stage

Goal: make design approval a durable pipeline stage.

### Pipeline position

```text
project discussion
→ architecture documents
→ Prism design request
→ Prism approval wait
→ Baseline Bundle import
→ module plan
→ implementation
```

Nova must not create the final module plan before the required Prism baseline is
approved.

### Work

1. Add a Nova `prism-design` plugin.
2. Define one typed Design Request artifact.
3. Dispatch Prism through `runtime.dispatch`.
4. Store the dispatch identity before the network call.
5. Reconnect to an accepted dispatch after Nova restarts.
6. Add a durable approval wait.
7. Verify the approval identity and the exact input digests.
8. Import and verify the Baseline Bundle.
9. Store the bundle digest in the project and module-plan authority.
10. Make design optional only when architecture policy marks the project as
    having no user experience surface.
11. Block implementation when a required baseline is missing or stale.

### Files

```text
skills/nova/plugins/prism-design/
skills/nova/core/execution/
contracts/prism/v1/
packaging/runtime/roles/nova.json
my-values/nova-values.yaml
tests/verification/contracts/check-prism-nova-stage.mts
```

### Tests

- Pure parser tests use signed fixed artifacts.
- Plugin integration tests use real runtime-dispatch, Redis, artifact storage,
  and a running Prism control and worker.
- Crash tests terminate Nova at each durable boundary.
- Resume tests prove that Nova does not publish a second Prism request.
- Approval tests use the real approval endpoint and a real CI operator identity.
- Stale bundle tests change one approved input digest and require rejection.

### Exit gate

- A production Nova run stops at the real design approval wait.
- Approval resumes the same run.
- Nova imports one verified bundle and then creates the module plan.
- Crash recovery creates no duplicate baseline or dispatch.

## Phase 6: connect the Baseline Bundle to implementation

Goal: make the approved design part of every relevant module contract.

### Work

1. Add the bundle digest to the module plan.
2. Map views, flows, components, and acceptance criteria to modules.
3. Give Forge read-only access to the approved bundle.
4. Put design IDs in implementation instructions.
5. Require an explicit change request when implementation cannot follow the
   baseline.
6. Never let Forge rewrite or replace the approved bundle.

### Tests

- Run Forge through the real dispatch service.
- Verify that Forge can read the assigned bundle and cannot write it.
- Verify that modules without assigned design targets do not receive unrelated
  design data.
- Change a bundle digest after dispatch and require a new module attempt.

### Exit gate

- Every user-interface module identifies its exact baseline digest and targets.
- Forge input contains no draft or provider-specific research data.

## Phase 7: connect Buster fidelity checks

Goal: use the existing Buster gate for production fidelity checks.

### Work

1. Convert the verified Baseline Bundle to the existing Buster plan.
2. Resolve approved previews through the artifact store.
3. Run visual regression, accessibility, and end-to-end flow suites.
4. Record the baseline digest in every result.
5. Support `exact` and `intent` fidelity policies.
6. Route accepted differences through the existing approval system.
7. Require a new Prism baseline when the approved design changes.

### Tests

- Use the real Buster gateway and v2 runtime.
- Use real Playwright and Chromium.
- Use a real application deployment in a short-lived namespace.
- Introduce one real layout defect and require a visual failure.
- Introduce one keyboard defect and require an accessibility failure.
- Introduce one broken recovery action and require an end-to-end failure.
- Restore the implementation and require a pass.

### Exit gate

- Buster blocks a real incorrect implementation.
- Buster passes the corrected implementation.
- No Prism-specific comparison engine exists outside Buster.

## Phase 8: enable live providers and corpus ingestion

Goal: prove intelligent design work without unsafe source collection.

### Work

1. Configure live generation, vision, embedding, and review providers.
2. Add strict provider budgets and timeouts.
3. Store provider-neutral canonical output.
4. Enable only approved source adapters.
5. Run rights policy before every acquisition.
6. Keep the ingestion worker isolated from private networks and PostgreSQL.
7. Use the controlled artifact quarantine path.

### Tests

- Call each live provider with one bounded acceptance request.
- Validate every provider response before use.
- Revoke each provider token and verify a safe error.
- Ingest one real approved internal project.
- Ingest one real user upload.
- Attempt one forbidden source and verify no searchable item or retained source.
- Expire a real rights policy and verify immediate retrieval removal.
- Run the PostgreSQL retrieval benchmark on the deployed database.

### Exit gate

- Live providers create a valid Design Document revision.
- No provider identity enters canonical Prism IDs.
- Rights tests prove that forbidden and expired sources do not enter retrieval.

## Phase 9: add the Nova-run live end-to-end suite

Goal: prove the complete production path from Nova.

### Command

Add:

```text
npm run e2e:real:prism
```

The command must start from Nova. It must use deployed production images and the
same dispatch and artifact paths as a normal run.

### Test project

Use a small application with these required experiences:

```text
sign in
authentication error
password recovery
dashboard default state
dashboard empty state
compact and wide layouts
```

### Required journey

1. Nova creates the project and architecture input.
2. Nova dispatches the design request.
3. Prism creates at least two real directions.
4. The CI operator selects one direction through the real API.
5. Studio applies one real typed visual edit.
6. Prism renders and evaluates the revision.
7. The CI operator approves the exact revision.
8. Prism publishes the Baseline Bundle.
9. Nova resumes and imports the bundle.
10. Nova creates the module plan.
11. Forge implements the test application.
12. Buster runs normal tests and Prism fidelity targets.
13. Nova receives the verified result and completes the run.

The CI operator is an authenticated test identity. The approval is a real
approval event. Prism must not approve its own output.

### Failure matrix

Run these real failures:

- Prism control unavailable before dispatch;
- lost dispatch response after Prism accepts work;
- Nova restart while it waits for approval;
- worker termination during render;
- invalid Design Document result;
- missing preview artifact;
- invalid approval identity;
- stale approval digest;
- PostgreSQL restart;
- artifact-store disconnect;
- Buster detects a visual defect;
- Buster detects an accessibility defect;
- provider rate limit;
- rights policy expiry during research.

For each failure, record the expected terminal state and recovery action.

### Evidence

The run archive must contain:

- Nova run identity;
- Prism dispatch and attempt identity;
- Design Request digest;
- approved Design Document digest;
- Baseline Bundle digest;
- approval identity and time;
- provider and model versions;
- runtime digests and image references;
- Buster plan and evidence digests;
- telemetry completeness result;
- final repository commit.

### Exit gate

- The success journey passes twice from clean namespaces.
- Every failure case reaches its expected state.
- A restart does not create duplicate work.
- Evidence can reconstruct the complete chain.

## Phase 10: production security and recovery proof

Goal: prove that Prism is safe to operate.

### Work and tests

1. Run image and dependency scans.
2. Run a secret scan on source, images, bundles, and test evidence.
3. Test service-account token absence.
4. Test container capability and seccomp settings.
5. Test every NetworkPolicy edge.
6. Test SSRF protection with private, loopback, metadata, and redirect targets.
7. Test preview iframe isolation.
8. Test malicious HTML, SVG, and oversized data.
9. Run a real database backup and restore.
10. Run artifact corruption and missing-object recovery tests.
11. Rebuild all derived search and preference data.
12. Run a high-reasoning Autoreview and fix all valid P0 through P3 findings.

### Exit gate

- No open P0, P1, P2, or P3 Autoreview finding.
- No unapproved critical or high vulnerability.
- Restore proof opens the same approved project and bundle.
- All security boundary tests pass.

## Phase 11: enable production and clarify presentation ownership

Goal: enable Prism as the production design path and keep Archviewer as Nova's
HTML presentation tool.

### Work

1. Enable the Prism stage in Nova production policy.
2. Deploy the Prism release.
3. Rename the Nova `prism-preview` sidecar and image to `archviewer`.
4. Rename its configuration, port names, Tailscale instructions, health checks,
   dashboards, alerts, tests, and operator commands.
5. Keep Nova's HTML presentation path. State clearly that it is not a design
   authority and does not consume or publish Baseline Bundles.
6. Remove fixture-based Prism production paths.
7. Update the generated blueprint to `implemented`.
8. Update runbooks, recovery instructions, and operator commands.
9. Keep one documented rollback to the previous pipeline version. Do not keep
   two active design authorities.
10. Publish the final operator guide, Studio user guide, API and contract guide,
    upgrade guide, security guide, backup/restore runbook, troubleshooting
    guide, and Nova/Forge/Buster integration guide.
11. Run every command in the published operator guide against the release
    candidate. Documentation that cannot be executed must link to machine proof
    of the stated result.

### Exit gate

- Production Nova uses the standalone Prism service.
- Nova uses Archviewer for HTML presentations only.
- No active deployment object or image uses the misleading `prism-preview`
  name.
- Archviewer cannot act as a Prism design authority.
- The blueprint and deployment truth tests report the same state.
- Documentation checks pass, and the live documentation walkthrough has no
  failed or skipped required step.

## 5. Required test layers

| Layer | Real dependencies | Main proof |
|---|---|---|
| Contract | None; fixed signed inputs only | Schema and digest rules |
| Domain | None; real reducer and renderer | Canonical design behavior |
| Package | Clean npm install and isolated role bundle | Deployable runtime |
| Service | PostgreSQL, Redis, artifact store, control, workers | Durable operations |
| Browser | Studio, control, workers, real browser | Editing and approval |
| Cluster | Kubernetes, Tailscale, storage, NetworkPolicy | Deployment behavior |
| Provider | Live provider APIs | Real model compatibility |
| Pipeline | Nova, Prism, Forge, Buster | Complete product path |
| Recovery | Real process and network failures | Safe resume and restore |

## 6. CI and live infrastructure layout

Use three workflows.

### Pull request workflow

Run:

- contract and domain tests;
- clean package and role-bundle tests;
- image build without publish;
- service integration on real short-lived PostgreSQL, Redis, and artifact store;
- Studio browser tests against real services;
- Helm lint and render;
- static security checks.

### Main workflow

Run:

- publish signed images and role bundles;
- install Prism with `scripts/deploy.sh prism` in an isolated real cluster
  namespace;
- run migration, service, browser, network, backup, and restore tests;
- run `scripts/deploy.sh prism` a second time as the idempotency proof;
- run `scripts/deploy.sh prism-smoke` and `scripts/deploy.sh prism-status`;
- publish immutable evidence.

### Scheduled or approved live workflow

Run:

- live provider acceptance;
- `npm run e2e:real:prism` from Nova;
- the full failure matrix;
- physical phone and tablet checks when device infrastructure is available;
- complete recovery proof.

Provider tests require protected secrets and budget approval. Pull requests from
untrusted forks must not receive these secrets.

## 7. Observability requirements

Use the existing telemetry system. Add no Prism telemetry database.

The following identity must remain on each relevant event:

```text
project ID
Nova run ID
work ID
Prism dispatch ID
attempt ID
document revision
baseline digest
module ID when known
provider and model when used
trace and span IDs
```

Required dashboards:

- design request duration;
- approval wait duration;
- worker queue and render duration;
- provider errors and cost;
- publication success and failure;
- corpus ingestion and rights expiry;
- Studio API and preview failures;
- Buster fidelity results by baseline digest.

Required alerts:

- Prism unavailable;
- PostgreSQL backup or restore proof failed;
- artifact required by a published bundle is missing;
- worker queue does not progress;
- rights-expiry job failed;
- repeated publication failure;
- telemetry chain is incomplete.

## 8. Migration rules

1. Do not import Archviewer HTML as a canonical Design Document.
2. Archviewer remains a presentation tool. It has no design authority.
3. New design work uses the standalone Prism system after it is enabled.
4. Archviewer and Prism can operate at the same time because they have different
   purposes and contracts.
5. Published Baseline Bundles are never rewritten.

## 9. Definition of done

Prism is fully integrated only when all statements are true:

- Prism has a packaged runtime role.
- Production Prism images are pinned, signed, and published.
- The standalone Helm release runs on the target cluster.
- Studio uses real control and worker services.
- Nova has a durable Prism stage before module planning.
- A user approval resumes the same Nova run.
- Forge receives the exact approved bundle digest.
- Buster tests the implementation against that digest.
- The Nova-run live end-to-end test passes twice.
- The real failure matrix passes.
- Backup and restore proof passes.
- Live provider acceptance passes.
- No production path uses fixture design data.
- The Nova presentation sidecar is named Archviewer and has no Prism authority.
- No active deployment object or image uses the old `prism-preview` name.
- The generated blueprint reports Prism as implemented.
- The final Autoreview has no open P0 through P3 finding.
- `scripts/deploy.sh all` installs Prism in the correct dependency order.
- `scripts/deploy.sh prism` is idempotent and uses pinned production images.
- `scripts/deploy.sh prism-smoke`, `prism-status`, and Prism teardown paths pass
  on the target cluster.
- A failed Prism upgrade rolls back to the last healthy release.
- Operator, user, API, security, upgrade, troubleshooting, and recovery
  documentation matches the deployed system and passes its live walkthrough.

## 10. Required verification commands

Add these stable commands as their phases are implemented:

```text
npm run verify:prism:runtime-role
npm run verify:prism:images
npm run verify:prism:services:live
npm run verify:prism:cluster:live
npm run verify:prism:deploy-script
npm run verify:prism:deploy-script:live
npm run verify:prism:nova-stage:live
npm run verify:prism:buster-fidelity:live
npm run verify:prism:providers:live
npm run e2e:real:prism
npm run e2e:real:prism:failures
npm run verify:prism:recovery:live
npm run verify:prism:docs
npm run verify:prism:docs:live
npm run verify:prism:production
```

`verify:prism:production` must run all required non-provider checks. The live
provider workflow can remain protected by explicit secret and budget approval.
Its successful evidence is still required for release.

Each live command must print one machine-readable result. The result must include:

```text
status
test version
repository commit
image references
cluster identity
namespace
start and finish time
evidence artifact digests
all skipped checks and reasons
```

A skipped required check makes the production verification incomplete.

## 11. Recommended execution order

Start with these work packages:

1. Baseline and traceability.
2. Prism runtime role and isolated bundle.
3. Production images.
4. Real control, Studio, and worker services.
5. Standalone cluster deployment and complete `deploy.sh` integration.
6. Nova Prism stage and approval wait.
7. Baseline mapping to Forge and Buster.
8. Live providers and approved corpus sources.
9. Nova-run live end-to-end and failure matrix.
10. Security, recovery, Autoreview, production enablement, and the Archviewer
    rename.

Do not enable Prism in production before the Nova-run live end-to-end test and
restore proof both pass. The Archviewer rename can be prepared earlier, but its
deployment rename must be atomic so no stale service or image name remains.

## 12. Plan completeness audit

This plan is complete only if its traceability record closes every row below.

| Area | Required closure proof |
|---|---|
| Architecture | Accepted contracts and fixed authority boundaries |
| Documentation | Operator, user, API, security, upgrade, troubleshooting, and recovery guides pass checks and a live walkthrough |
| Runtime package | Isolated Prism role bundle starts from a clean install |
| Images | Four pinned, signed, scanned images with SBOM and provenance |
| Services | Real control, Studio, worker, PostgreSQL, Redis, and artifact-store integration |
| Authentication | Tailscale identity, secure session, CSRF defense, and approval-authority tests |
| Storage | Migrations, immutable revisions, artifact digests, backup, restore, and derived-data rebuild |
| Deployment | Standalone Helm release, default-deny policy, Tailscale exposure, scaling, and failure recovery |
| Deployment script | `setup`, `secrets`, `all`, Prism deploy, smoke, E2E, status, safe removal, and destructive removal pass |
| Nova | Durable dispatch, approval wait, restart recovery, bundle verification, and module-plan gate |
| Forge | Read-only exact bundle input and module target mapping |
| Buster | Real visual, accessibility, and flow defects block the pipeline |
| Providers | Bounded live calls, revoked-token failures, budgets, and provider-neutral canonical output |
| Corpus | Approved real ingestion, forbidden-source denial, expiry removal, and deployed retrieval benchmark |
| End to end | The Nova-run success path passes twice from clean namespaces |
| Failure matrix | Every declared real failure reaches its expected state and recovery action |
| Security | Image, dependency, secret, RBAC, NetworkPolicy, SSRF, iframe, active-content, and resource-limit proof |
| Observability | One trace joins Nova, Prism, Forge, Buster, providers, artifacts, and the final commit |
| Archviewer | Atomic rename is complete; HTML presentation remains; Prism authority is impossible |
| Release | Production verification, final Autoreview, rollback proof, blueprint, and deployment truth agree |

No row can close from documentation alone. Each row needs the code, automated
test, deployment object, and live evidence declared in
`integration-traceability.json`. A skipped required live test leaves the row and
the production integration incomplete.
