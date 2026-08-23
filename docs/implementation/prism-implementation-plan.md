# Prism Technical Implementation Plan

Implementation status: phases 0 through 10 are complete in the local implementation foundation. Cluster, physical-device, live-provider, and approved external-source checks remain deployment acceptance work. See `docs/implementation/prism/phase-10-final-audit.md`.

Production pipeline integration is a separate follow-up. See
[Prism production integration plan](prism-production-integration-plan.md).

Status: approved execution sequence

Execution status: final pre-build plan

Architecture source:
[Prism Design Engine Architecture](../architecture/prism-design-engine-architecture.md)

Spike source:
[Prism Foundation Spikes](../spikes/prism-foundation-spikes.md)

## Objective

Build one complete Prism system from the accepted architecture.

```text
Nova design request
  -> Prism directions
  -> desktop and mobile visual editing
  -> review and approval
  -> immutable Baseline Bundle
  -> Nova module plan
  -> existing Buster fidelity gates
```

The implementation must keep these boundaries:

- worker-core remains generic;
- the Design Document remains canonical;
- Puck remains replaceable;
- PostgreSQL remains the only v1 database;
- the platform artifact store owns large objects;
- Buster remains the fidelity-test system;
- only explicit user approval publishes a baseline;
- generated design data cannot expand runtime authority.

## Delivery milestones

The phases produce usable milestones. Do not wait until the final phase to integrate the
system.

```text
Milestone A: Technical proof
  Phase 0
  Editor, mobile editing, preview isolation, and retrieval are proven.

Milestone B: Prism foundation
  Phases 1-3
  Contracts, reducer, renderer, revisions, artifacts, and the control API work together.

Milestone C: Usable Prism alpha
  Phases 4-5
  A user can generate, edit, review, approve, and publish one real baseline.

Milestone D: Intelligent Prism beta
  Phases 6-7
  The local corpus, retrieval, preference learning, and quality workflow are active.

Milestone E: Pipeline-integrated release candidate
  Phases 8-9
  Nova, Buster, deployment, security, backup, and observability are connected.

Milestone F: Normal project use
  Phase 10
  The complete journey and failure matrix pass from a clean deployment.
```

Each milestone must be demonstrable from a clean checkout or clean deployment. A
milestone is not complete when its packages pass separately but its stated user journey
does not pass.

## Decisions required before production work

Phase 0 must record these implementation decisions. They are inputs to later phases, not
new architecture workstreams.

| Decision | Required result | Blocks |
| --- | --- | --- |
| Studio authentication | One trusted Tailscale-identity-to-short-lived-session design; client-supplied identity headers alone are not trusted | Phase 3.5 |
| Artifact backend | One v1 backend that implements the existing content-addressed artifact interface, digest verification, immutable publication, and versioned recovery | Phase 3.4 |
| Model policy | Approved primary and fallback adapters for generation, visual analysis, embeddings, and design review, with budgets and data-handling rules | Phase 5 |
| Initial corpus policy | Explicit enabled source classes, acquisition rules, retention modes, and review owners | Phase 6 |
| PostgreSQL packaging | Chart-managed or external PostgreSQL selected, with the same dedicated Prism database and roles in either case | Phase 9 |

Record each result in the Phase 0 audit. A later phase must not choose one of these
silently in production code.

## Implementation controls

### One vertical path first

Build one small complete path before broad feature work:

```text
one project
  -> one Design Document
  -> one web view
  -> one visual edit
  -> one immutable revision
  -> one safe render
  -> one approved Baseline Bundle
  -> one Buster visual target
```

Do not build the complete corpus, learning system, or component catalog before this
path works.

### Work-package size

Each implementation change must:

- implement one bounded behavior;
- include its contract and tests;
- avoid unrelated refactoring;
- state which accepted architecture contract it implements;
- state which proof command passes;
- remove superseded spike or compatibility code when its replacement is complete.

### Verification names

Add these commands as their phases start:

```text
npm run verify:prism:spikes
npm run verify:prism:contracts
npm run verify:prism:domain
npm run verify:prism:renderer
npm run verify:prism:storage
npm run verify:prism:studio
npm run verify:prism:engine
npm run verify:prism:corpus
npm run verify:prism:learning
npm run verify:prism:pipeline
npm run verify:prism:helm
npm run verify:prism:e2e
npm run verify:prism
```

`verify:prism` runs all completed Prism proofs. It must remain suitable for CI.

### Proof records

Each phase creates:

```text
docs/implementation/prism/phase-<n>-audit.md
```

The audit records:

- source commit;
- implemented work packages;
- commands and results;
- measured performance and resource use where relevant;
- known limits;
- deleted temporary or compatibility paths;
- explicit pass or fail.

### No silent architecture changes

If a spike or implementation proves that an accepted contract cannot work:

1. stop the affected work package;
2. record the evidence;
3. propose the smallest contract change;
4. receive explicit approval;
5. update architecture before production code continues.

Do not weaken mobile editing, runtime isolation, user approval, or worker-core
neutrality to accommodate a library.

## Planned repository layout

Create paths only when their phase starts.

```text
contracts/prism/v1/
  schemas/
  src/
  fixtures/

skills/prism/domain/
  document/
  operations/
  baseline/
  preferences/

skills/prism/control/
  api/
  auth/
  projects/
  revisions/
  workers/

skills/prism/engine/
  operations/
  providers/
  corpus/
  evaluation/
  publication/

skills/prism/renderer/
  catalog/
  runtime/
  preview-protocol/
  capture/

skills/prism/studio/
  editor/
  mobile/
  api/
  review/

skills/prism/pipeline-adapter/

charts/prism/

tests/verification/prism/
```

The final package names can follow existing workspace naming rules. Do not combine
these responsibilities only to reduce directory count.

## Phase 0: prove risky dependencies

Goal: decide the four choices that can invalidate large parts of the build.

### Work package 0.1: isolated spike environment

Create:

```text
spikes/prism/
  puck-adapter/
  mobile-editor/
  preview-isolation/
  postgres-retrieval/
```

Rules:

- spike packages are not production workspaces;
- use pinned dependencies and lockfiles inside each spike;
- use synthetic fixtures only;
- do not import spike code into production packages;
- delete or archive a spike after its decision and replacement proof are complete.

Proof:

```text
npm run verify:prism:spikes
```

### Work package 0.2: Puck operation adapter

Build a small editor with stack, grid, split, heading, text, button, and status nodes.

Prove:

- insert, remove, duplicate, move, and property edit;
- nested declared slots;
- action interception;
- permission enforcement;
- Design Document to Puck projection;
- Puck action to typed Prism operation;
- save, reload, and identical resolved tree;
- no canonical dependence on complete Puck data.

Decision:

- `keep`: Puck passes all required behavior;
- `adapt`: Puck needs a small maintained adapter with stable public APIs;
- `replace`: a required behavior depends on experimental or non-deterministic state.

`replace` is not a passing result by itself. Phase 0 must select and prove a replacement
editor foundation against the same operation, mobile, and isolation tests before Studio
production work starts.

### Work package 0.3: mobile editor

Run the accepted mobile sequence on browser device profiles and one real touch device.

Prove:

- touch drag without scroll conflicts;
- non-drag movement for every move;
- bottom-sheet property and insert controls;
- inline text with the mobile keyboard;
- compact-only override;
- wide-view pan and zoom;
- undo, redo, refresh, and recovery;
- reduced motion and screen-reader basics.

### Work package 0.4: opaque preview isolation

Prototype the authoring and runtime split.

Preferred result:

```text
Puck authoring projection
  -> typed operations
  -> validated Design Document
  -> separate opaque-origin preview
```

Run the attack set from the spike document. Prove that selection and drop evidence
still work without same-origin Studio authority.

### Work package 0.5: PostgreSQL retrieval

Run PostgreSQL with pgvector in a temporary CI or Kubernetes environment.

Build:

- 500 labelled references;
- 10,000 load-test references;
- optional 100,000-row scale probe;
- full-text candidates;
- exact vector candidates;
- Reciprocal Rank Fusion;
- rights and status filters;
- source and product diversity caps.

Record relevance, diversity, p50, p95, query plans, scanned rows, and reproducibility.

Minimum v1 acceptance targets:

- rights and status filters have zero false inclusions in the labelled fixture;
- `precision@10` is at least `0.70` across the representative query set;
- `recall@20` is at least `0.80` across the representative query set;
- the top ten contain at least four product or source families when the eligible pool
  contains four;
- exact hybrid search p95 is at most `300 ms` with 10,000 references on the declared
  benchmark resources;
- the optional 100,000-row probe records whether p95 remains below `1 s`;
- the same query, corpus snapshot, model, and ranking version return the same ordered
  result IDs.

If a target fails, record the corpus, labels, hardware, query plans, and smallest measured
change that passes. Changing a target requires explicit approval; adding Qdrant or a
learned reranker is not an automatic response.

### Work package 0.6: implementation input decisions

Resolve and record the five decisions in `Decisions required before production work`.
Use small proofs where required. Do not add provider-specific data to canonical Prism
contracts.

### Phase 0 exit gate

Phase 0 passes only when:

- Puck has a keep, adapt, or replace decision;
- the selected editor foundation passes the required operation tests;
- mobile editing passes the full sequence;
- opaque preview isolation passes the attack tests;
- PostgreSQL meets the expected v1 retrieval target or has a measured small change;
- authentication, artifact, model, corpus, and PostgreSQL packaging decisions are
  recorded;
- all spike results are committed in the Phase 0 audit;
- no spike dependency is in a production package.

Critical path: all later Studio work waits for work packages 0.2 through 0.4. Corpus
work waits for 0.5.

## Phase 1: executable Prism contracts

Goal: create one strict machine boundary for all later packages.

### Work package 1.1: contract package

Create `contracts/prism/v1` with:

- Design Document schema;
- node and property definitions;
- edit-operation schema;
- renderer-pack manifests;
- Baseline Bundle, preview index, acceptance criteria, and handoff schemas;
- Design Engine request and result schemas;
- preference-event schema;
- retrieval query and result schemas;
- ingestion, quality finding, and pack schemas.

All object schemas reject unknown fields.

### Work package 1.2: generated types and validation

Create:

- generated or mechanically checked TypeScript types;
- one validation entry point per public schema;
- safe error messages that do not include secrets or full private content;
- schema and package version constants;
- schema digest calculation.

### Work package 1.3: fixtures

Create:

- minimal valid web document;
- complete authentication flow;
- dense dashboard;
- TUI setup flow;
- valid Baseline Bundle manifest;
- one valid request and result for each engine operation;
- invalid reference, property, cycle, action, path, asset, and unknown-field cases.

### Work package 1.4: boundary proof

Prove:

- worker-core does not import Prism types;
- Prism requests fit inside the existing opaque specialist payload;
- large inputs remain artifact references;
- all public examples in architecture documents remain valid or are corrected through
  an explicit architecture update.

Proof:

```text
npm run verify:prism:contracts
```

### Phase 1 exit gate

- every schema has valid and invalid fixtures;
- TypeScript and JSON Schema agree;
- unknown fields fail;
- cross-document references validate;
- package API is frozen for v1 implementation;
- Phase 1 audit passes.

## Phase 2: domain reducer and safe renderer

Goal: implement the canonical document behavior before database or UI work.

### Work package 2.1: document resolver

Build pure functions for:

- component expansion;
- variant application;
- state patches;
- responsive patches;
- mock-data references;
- stable resolved-node identity;
- cycle and limit enforcement.

### Work package 2.2: typed operation reducer

Implement:

- insert;
- remove;
- duplicate;
- move;
- property set;
- wrap and unwrap;
- component variant set;
- responsive property set;
- asset set;
- atomic batch.

Each operation takes a base document and returns a complete new document. It must not
mutate its input.

### Work package 2.3: inverse operations and history

Prove:

- operation and inverse restore equivalent state;
- batch is all-or-nothing;
- failed operations return no partial document;
- restore creates a new revision rather than deleting history.

### Work package 2.4: core renderer

Implement the first trusted component pack and render:

- layout nodes;
- essential content and input nodes;
- navigation and feedback nodes;
- terminal nodes required by fixtures;
- named states and responsive targets.

### Work package 2.5: deterministic mock runtime

Implement declared actions, flow transitions, scenarios, ephemeral form state, reset,
and deterministic mock values. Do not add an expression language.

Proof:

```text
npm run verify:prism:domain
npm run verify:prism:renderer
```

### Phase 2 exit gate

- all Phase 1 fixtures resolve and render;
- property and structural operations round-trip;
- invalid operations fail without mutation;
- same document, profile, viewport, state, and scenario produce equivalent output;
- no arbitrary code or URL execution exists;
- Phase 2 audit passes.

## Phase 3: PostgreSQL and control API

Goal: persist immutable Prism state and expose one narrow authenticated API.

### Work package 3.1: database package and migration tool

Create the accepted v1 tables and constraints. Use one migration authority. Do not run
migrations from every application replica.

Prove forward migration from an empty database and restore into a clean database.

### Work package 3.2: repositories

Implement repositories for:

- projects and brief revisions;
- design documents and revisions;
- directions;
- baselines;
- corpus items, revisions, rights, and embeddings;
- preference events;
- engine idempotency.

Keep Design Documents as complete JSONB snapshots.

### Work package 3.3: revision service

Implement optimistic concurrency:

```text
base revision
  -> validate operation
  -> create complete immutable revision
  -> update current revision in one transaction
```

Prove conflict rejection, idempotent retry, restore as new revision, and concurrent
attempt safety.

### Work package 3.4: artifact integration

Use the existing platform artifact interface. Upload and verify a content-addressed
object before committing its database reference. Add cleanup for unreferenced uploads.

### Work package 3.5: control API and authentication

Implement:

- Tailscale identity to short-lived Prism session;
- project, direction, document, revision, operation, preview, review, and approval APIs;
- server-side permission checks;
- no database or provider credential in Studio;
- request limits and structured errors.

Proof:

```text
npm run verify:prism:storage
```

### Phase 3 exit gate

- one project can save, edit, restore, and retrieve immutable revisions;
- stale edits fail safely;
- artifact digests verify;
- Studio API authority is narrower than control authority;
- backup and restore fixture succeeds;
- Phase 3 audit passes.

## Phase 4: Studio vertical slice

Goal: deliver the complete editor experience for the initial component set.

### Work package 4.1: Studio shell

Build the responsive shell:

- desktop three-panel layout;
- tablet drawers;
- mobile canvas and bottom sheets;
- screens, states, and flows navigator;
- properties, insert, and Prism panels;
- preview, inspect, review, and approval modes.

Before visual implementation, research Studio styles, editor screens, and editing flows.
Create one dominant reference lock and a decision ledger. Preserve reference roles and
reject generic editor conventions that do not serve Prism. This design evidence is a
Phase 4 artifact and must be updated when the main Studio interaction model changes.

### Work package 4.2: editor adapter

Implement the Phase 0 editor decision. Convert all direct editor actions into the
Phase 2 typed operation reducer. Do not save raw editor state.

### Work package 4.3: complete visual editing

Implement:

- selection;
- inline text;
- properties;
- insertion;
- delete and duplicate;
- copy and paste;
- constrained drag and reorder;
- non-drag movement;
- layout wrapping;
- responsive overrides;
- assets and crop;
- undo and redo.

### Work package 4.4: isolated preview bridge

Implement the accepted opaque-origin frame and bounded message protocol. Studio owns
overlays. The frame reports safe layout evidence only.

### Work package 4.5: version and failure UX

Implement revision history, comparison, restore, stale render state, retry, conflict
rebase, and preservation of unsent instructions.

### Work package 4.6: capture parity

Use the same component catalog and runtime-profile digest for interactive preview and
Playwright capture. Add screenshot determinism tests.

Proof:

```text
npm run verify:prism:studio
```

### Phase 4 exit gate

- the full desktop and mobile acceptance sequences pass;
- refresh reproduces the same revision;
- direct edits use the canonical operation schema;
- isolation attacks fail;
- capture parity passes;
- accessibility checks pass for Studio itself;
- Phase 4 audit passes.

## Phase 5: Design Engine vertical slice

Goal: run Prism operations through the existing generic worker-core.

### Work package 5.1: engine package

Implement the engine profile, request validator, result validator, capability map,
error codes, progress stages, and idempotency keys.

### Work package 5.2: generate

Implement modes:

- directions;
- first document;
- refinement.

Use replaceable provider adapters and record exact provider and configuration
versions outside canonical design contracts.

Natural-language edit instructions must compile to the same typed operations used by
Studio. They must not introduce a second edit path.

### Work package 5.3: render and evaluate

Bind the trusted renderer to engine operations. Implement the minimum real publication
gates for the alpha path: document validity, declared coverage, flow reachability,
responsive target presence, automatic accessibility checks, and the shared finding and
report contracts. Return large outputs only through existing worker-core evidence.

These are production gates, not temporary bypasses. Phase 7 expands their rule packs,
design-review breadth, preference integration, and Studio correction workflow.

### Work package 5.4: publish

Validate approval against exact input digests. Create the deterministic immutable
Baseline Bundle and handoff. Retry must return the same bundle.

### Work package 5.5: worker-core boundary proof

Prove cancellation, retry, progress, evidence, failure transport, capability
restriction, and absence of Prism imports in worker-core.

Proof:

```text
npm run verify:prism:engine
```

### Phase 5 exit gate

- one request creates directions and a document;
- one edit produces a new revision;
- one Studio instruction and one direct visual edit produce the same class of typed
  operation and can continue from each other's revisions;
- render and evaluation return verified evidence;
- one exact approved input publishes one stable bundle digest;
- transport retry creates no duplicate revision or bundle;
- Phase 5 audit passes.

### Milestone C integration proof

Before Phase 6 starts, run this complete alpha journey:

```text
one design request
  -> directions
  -> one Design Document
  -> desktop visual edit
  -> mobile visual edit
  -> natural-language edit
  -> immutable revisions
  -> isolated deterministic render
  -> review of the current revision
  -> explicit approval
  -> immutable Baseline Bundle
```

The proof must use the production contracts, API, reducer, renderer, Studio, Design
Engine, database, and artifact interface. Mocks are allowed only behind provider or
platform interfaces that are explicitly replaceable. Record the journey in the Phase 5
audit.

## Phase 6: corpus and retrieval

Goal: create an independent useful local design corpus.

### Work package 6.1: ingestion policy and adapter API

Implement policy before acquisition, reviewed adapter manifests, retention modes,
restricted source locators, and deny or review decisions.

Enable only the source classes accepted in the Phase 0 corpus-policy decision. Other
adapters remain unavailable, not dormant with broad permissions.

### Work package 6.2: isolated ingestion worker

Implement bounded fetch, redirects, DNS and IP checks, quarantine, media validation,
active-content rejection, digest calculation, and cleanup.

### Work package 6.3: normalization and publication

Implement normalized analysis, observed versus inferred evidence, exact duplicate
handling, embedding generation, and atomic corpus publication.

### Work package 6.4: retrieval

Implement the Phase 0 PostgreSQL query:

- required and preferred query fields;
- rights and status filters;
- full-text candidates;
- exact vector candidates;
- RRF;
- simple diversity caps;
- explanations and corpus gaps.

### Work package 6.5: expiry and deletion

Remove expired items from retrieval immediately. Delete governed artifacts and
embeddings. Preserve only required tombstone evidence.

Proof:

```text
npm run verify:prism:corpus
```

### Phase 6 exit gate

- ingest one source for each enabled source class;
- reject blocked network and content cases;
- retry without duplicate publication;
- meet the accepted retrieval benchmark;
- expire and delete one item deterministically;
- Phase 6 audit passes.

## Phase 7: preference learning and quality workflow

Goal: learn from explicit contextual evidence and enforce review before approval.

### Work package 7.1: preference events

Implement selected, rejected, liked, disliked, preserved, changed, reverted, and
retracted events. Enforce project and personal scope.

### Work package 7.2: deterministic profile

Build the profile from ordered eligible events. Preserve supporting event IDs and
conflicts. Provide correction, project-only, and forget actions.

### Work package 7.3: deterministic validation

Extend the Phase 5 publication gates with the complete accepted document, coverage, flow,
responsive, and automatic accessibility rule sets and versioned gate packs.

### Work package 7.4: design review

Implement separate findings for hierarchy, consistency, readability, density,
typography, content, originality, direction fit, and manual accessibility concerns.

### Work package 7.5: Studio review and approval

Combine findings into one report. Support blocking, review, and information levels.
Record accepted non-blocking limits. Require explicit approval for the exact revision.

Proof:

```text
npm run verify:prism:learning
```

### Phase 7 exit gate

- profiles rebuild to the same digest;
- explicit context controls preference use;
- Prism critique creates no preference evidence;
- stale reports cannot approve publication;
- blocking findings stop publication;
- Phase 7 audit passes.

## Phase 8: Nova and Buster integration

Goal: connect Prism to the existing pipeline without duplicating pipeline systems.

### Work package 8.1: Nova design request and handoff

Place design approval after architecture approval and before module planning. Send
large inputs through artifact references. Return one Baseline Bundle handoff digest.

### Work package 8.2: Buster plan adapter

Map Prism view, state, viewport, flow, accessibility, and acceptance targets to
existing Buster visual, E2E, and accessibility suites.

### Work package 8.3: fidelity policy

Map `exact` and `intent` to versioned existing gate configuration. Bind results to the
Baseline Bundle digest and stable Prism target IDs.

### Work package 8.4: legacy compatibility and deletion

Keep `preview.html`, `paths.json`, and baseline images only as the documented old
project bridge. New Prism projects must not produce both formats manually.

Create a deletion ledger for the compatibility path and remove it after all active
projects migrate.

Proof:

```text
npm run verify:prism:pipeline
```

### Phase 8 exit gate

- Nova creates a Prism request from approved architecture;
- the approved handoff creates a module plan;
- Buster runs existing suites from the bundle;
- verdict evidence identifies exact bundle and target digests;
- no second test, evidence, or approval system exists;
- Phase 8 audit passes.

## Phase 9: Helm deployment and operations

Goal: deploy the accepted secure and scalable Prism product.

### Work package 9.1: chart and values schema

Create `charts/prism` with strict values validation. Reuse stable KubeClaw helpers but
do not copy unrelated Nova features.

### Work package 9.2: workloads

Create control, Studio, standard worker, optional ingestion worker, PostgreSQL,
Services, ConfigMaps, Secrets references, and persistent storage.

Apply the Phase 0 PostgreSQL packaging decision. The selected mode must use the accepted
database contracts, roles, migration job, backup proof, and health checks. Supporting a
second packaging mode is optional and must not delay the selected deployment.

### Work package 9.3: security

Implement separate ServiceAccounts, disabled token mounting, no application RBAC,
default-deny networking, restricted egress, non-root containers, capability drop,
runtime-default seccomp, and read-only root filesystems where possible.

### Work package 9.4: jobs

Create migration, daily backup, weekly restore proof, rights-expiry, and derived-data
rebuild jobs.

### Work package 9.5: observability

Send bounded Prism domain facts through existing OpenTelemetry and ClawDeck paths.
Add only the accepted operator alerts.

### Work package 9.6: scaling proof

Run Studio and worker replicas without shared local state. Measure resource use and
set generous initial requests and limits in deployment values.

Proof:

```text
npm run verify:prism:helm
```

### Phase 9 exit gate

- only Studio is Tailscale-exposed;
- no application workload has Kubernetes RBAC;
- network isolation tests pass;
- migration and restore proof pass;
- workers and Studio scale independently;
- ClawDeck reports complete observability;
- Phase 9 audit passes.

## Phase 10: complete product proof and cutover

Goal: prove the complete dream workflow with real system boundaries.

### Work package 10.1: representative project

The project must include:

- authentication;
- default, loading, empty, error, success, permission, and recovery states;
- compact, regular, and wide targets;
- a dense application view;
- one complete multi-step flow;
- one accessibility-sensitive interaction;
- one TUI or CLI surface when appropriate.

### Work package 10.2: full journey

Run:

```text
Nova discussion and architecture
  -> Prism design request
  -> three distinct directions
  -> desktop visual edit
  -> mobile visual edit
  -> Prism instruction edit
  -> preference correction
  -> quality review
  -> explicit approval
  -> Baseline Bundle
  -> Nova module plan
  -> implementation
  -> existing Buster fidelity gate
```

### Work package 10.3: failure matrix

Prove:

- worker crash and retry;
- renderer crash;
- stale revision conflict;
- provider outage;
- PostgreSQL restart;
- artifact digest mismatch;
- incomplete observability;
- backup restore;
- rights expiry and deletion;
- rejected and later corrected design finding.

### Work package 10.4: final audit

Run contract, security, mobile, accessibility, scale, recovery, and end-to-end proofs.
Delete unused spike code, duplicate paths, temporary flags, and superseded documents.

Proof:

```text
npm run verify:prism
npm run verify:prism:e2e
```

### Phase 10 exit gate

- the complete journey passes from a clean deployment;
- all thirteen architecture workstreams have implementation evidence;
- no temporary bypass or duplicate authority remains;
- restore proof passes from the release backup;
- operational runbook is complete;
- final audit marks Prism ready for normal project use.

## Dependency order

```text
Phase 0 spikes
  -> Phase 1 contracts
  -> Phase 2 domain and renderer
  -> Phase 3 storage and API
  -> Phase 4 Studio
  -> Phase 5 Design Engine
  -> Phase 6 corpus
  -> Phase 7 learning and quality
  -> Phase 8 pipeline integration
  -> Phase 9 deployment
  -> Phase 10 product proof
```

Hard integration gates:

```text
Phase 0 -> selected editor and infrastructure inputs
Phase 3 -> Milestone B foundation proof
Phase 5 -> Milestone C complete alpha journey
Phase 7 -> Milestone D intelligent-design journey
Phase 9 -> Milestone E clean deployment journey
Phase 10 -> final release proof
```

Limited parallel work is safe:

- Phase 3 database migrations can start after Phase 1 while Phase 2 renderer work runs.
- Phase 6 ingestion policy code can start after Phase 1 and the retrieval spike.
- Phase 9 chart skeleton can start after Phase 1, but security and workload values wait
  for real Phase 4 through Phase 7 resource measurements.
- Phase 8 adapter fixtures can start after Phase 1, but final mapping waits for the
  Phase 5 Baseline Bundle publisher.

Do not parallelize work that would create competing domain models or temporary
authorities.

## First implementation queue

Start in this order:

1. Fix the isolated npm-cache configuration for spike packages.
2. Create the four Phase 0 spike directories and pinned lockfiles.
3. Implement the Puck typed-operation spike.
4. Implement the separate opaque-origin preview spike.
5. Run desktop browser tests.
6. Run mobile browser and real-touch tests.
7. Deploy temporary PostgreSQL plus pgvector for the retrieval benchmark.
8. Resolve authentication, artifact, model, corpus, and PostgreSQL packaging inputs.
9. Select and prove the editor foundation. A `replace` result must include the replacement
   proof.
10. Record the Phase 0 audit and delete rejected approaches.
11. Create `contracts/prism/v1` only after Phase 0 passes.

The first production change is Phase 1. Spike code is evidence, not product code.

## Final definition of done

Prism is ready for normal use only when:

- every phase audit passes from recorded source commits;
- every public contract has schemas, fixtures, compatibility rules, and digest handling;
- desktop and mobile visual editing pass on declared real devices;
- the opaque-origin preview attack suite passes;
- the complete Milestone C journey passes before corpus and learning are treated as
  release blockers;
- retrieval meets its accepted relevance, diversity, rights, and latency targets;
- no generated content can add code, networking, packages, or runtime authority;
- Nova, worker-core, Prism, Studio, PostgreSQL, the artifact store, and Buster each retain
  one clear authority;
- backup restore, rights deletion, worker retry, revision conflict, and artifact mismatch
  proofs pass;
- the deployment contains no undocumented compatibility path, privileged workaround, or
  duplicated approval system;
- the final Studio visual implementation is checked against its reference lock and
  decision ledger;
- the clean end-to-end project produces an approved Baseline Bundle and a Buster verdict
  bound to that exact bundle digest.
