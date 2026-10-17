# Prism Design Engine Architecture

Status: planned direction and living design document
Audience: maintainers, product designers, pipeline developers, worker authors,
and operators
Last updated: 2026-08-12

## Purpose

Define the target product, runtime, data, learning, and pipeline architecture for
Prism: a dedicated OpenClaw design agent that produces tasteful, interactive,
implementation-neutral visual baselines for the KubeClaw delivery pipeline.

This document is the workspace for resolving the architecture before deployment
code is written. It distinguishes accepted decisions from proposed defaults and
open decisions. It does not describe current runtime behavior.

## Product Vision

Prism should make excellent product design accessible to a user who is not a UI
designer. The user describes the product and desired outcome in ordinary language.
Prism researches, proposes, explains, prototypes, critiques, and refines a complete
design with minimal required input.

The long-term goal is a system that learns the user's contextual taste well enough
to propose an almost immediately acceptable design while remaining explainable,
editable, diverse, and under explicit human control.

Prism is not a production UI builder. It produces an interactive mocked prototype
and a machine-readable visual specification. The pipeline remains responsible for
building the real application.

```text
user intent
    -> Prism research and design
    -> approved Design Baseline Bundle
    -> KubeClaw pipeline implementation
    -> visual fidelity verification
    -> outcome and preference feedback
    -> improved future proposals
```

## Success Criteria

Prism succeeds when it provides:

1. Taste: proposals are distinctive, reference-grounded, and appropriate rather
   than generic AI averages.
2. Simplicity: a non-designer can reach a strong result without learning design
   terminology or configuring technical systems.
3. Completeness: the baseline covers screens, flows, states, responsive behavior,
   accessibility, content intent, and component behavior needed by implementation.
4. Stability: approved baselines are immutable, reproducible, versioned, and safe
   to consume after Prism, a provider, or an editor component changes.
5. Agility: providers, models, retrieval engines, renderers, and editors remain
   replaceable behind stable contracts.
6. Explainability: Prism can trace every important decision to the brief, a
   reference, a craft rule, a user preference, or an explicit trade-off.
7. Learnability: selections, rejections, edits, approvals, and implementation
   outcomes improve future ranking without silently locking the user into one look.
8. Pipeline fitness: Forge can implement the baseline without guessing its design
   intent, while visual gates can measure meaningful fidelity.

## Non-Goals

Prism does not:

- build, deploy, or host the production UI;
- decide the production frontend framework or application architecture;
- require production APIs, databases, authentication, or business logic;
- execute arbitrary generated applications in the trusted agent container;
- mirror a proprietary design provider without explicit permission;
- replace human approval with an opaque quality score;
- make an editor framework, model provider, or vector database canonical;
- train silently on private work outside the configured retention and consent rules.

## Decision Status Vocabulary

- **Accepted**: architecture should not change without an explicit superseding
  decision.
- **Proposed**: preferred default, pending validation through a prototype or
  operational review.
- **Open**: material choice still requiring evidence or an operator decision.
- **Deferred**: intentionally excluded from the first delivery but preserved in
  the target architecture.

## Accepted Decisions

### Product boundary

- Prism produces design intent and mocked visual behavior, not production UI.
- All prototype data and interactions may be mocked.
- The approved output is a versioned Design Baseline Bundle.
- The KubeClaw pipeline owns implementation, testing, deployment, and production
  behavior.
- Visual fidelity is verified against approved baseline evidence rather than the
  current mutable Prism workspace.

### Runtime boundary

- Prism is a separate OpenClaw instance in its own Kubernetes workload.
- It reuses the neutral pipeline worker-core contract rather than creating a
  parallel task lifecycle.
- Prism owns design-specific schemas and policy; worker-core remains
  specialist-neutral.
- The Studio is a preview and editing sidecar, not a second orchestrator.
- The existing Tailscale Kubernetes Operator exposes the private Studio service.
- Prism receives no production deployment authority and no unrelated linting,
  BuildKit, test-runner, or broad Kubernetes tools.

### Canonical data

- A versioned Design Document is the canonical editable source of design truth.
- Generated HTML, React, screenshots, and previews are disposable projections.
- PostgreSQL with pgvector owns durable relational truth, learning history, and
  v1 retrieval indexes.
- A separate vector database is deferred until measured PostgreSQL limits justify
  its operational and consistency cost.
- The existing content-addressed platform artifact store owns large immutable
  artifacts. Its backend can later become S3-compatible without changing Prism.
- External research providers are replaceable adapters, never canonical stores.
- Provider identities, response shapes, and provider-specific vocabulary never enter
  the canonical corpus, Design Document, Baseline Bundle, or pipeline contract.
- Corpus ingestion checks policy before acquisition, uses isolated stateless workers,
  and publishes only complete immutable Prism-owned revisions.
- Source adapters and restrictive policy packs make ingestion customizable without
  expanding project authority.

### User authority

- Prism may research, critique, and propose automatically.
- Only explicit user approval publishes a baseline to the pipeline.
- Every structured edit supports undo and redo.
- Preference learning is event-based, contextual, inspectable, and correctable.
- Automatic critique never changes an approved baseline in place.

## Proposed System Context

```text
                          +----------------------+
                          | User via Tailscale   |
                          | Prism Studio         |
                          +----------+-----------+
                                     |
                                     v
+--------------+          +----------+-----------+
| Refero       |<-------->| Prism OpenClaw Agent |
| Stitch       |          | brief / research /   |
| web capture  |          | synthesis / critique |
| OSS sources  |          +-----+----------+-----+
+--------------+                |          |
                                |          | worker-core attempts
                                |          v
                  +-------------+---+  +---+----------------+
                  | Design services |  | KubeClaw pipeline  |
                  | render/capture  |  | artifact contracts |
                  | corpus/ranking  |  +---+----------------+
                  +------+----------+      |
                         |                 v
                         v            Forge implementation
                PostgreSQL + pgvector     and visual gate
                and object storage
```

The diagram describes logical ownership. Initial deployment may colocate services
that can later scale independently without changing contracts.

## Accepted End-to-End Project Workflow

Prism is one specialist phase in a Nova-owned project lifecycle. Nova remains the
main orchestrator and the final owner of pipeline planning.

```text
1. User and Nova discuss a new product.
2. Nova develops and records the product and system architecture.
3. Nova creates a versioned Prism Design Request from the approved architecture.
4. Prism validates the request and identifies missing UX facts or assumptions.
5. Prism researches and proposes distinct experience directions.
6. User and Prism select and refine one direction in conversation and Studio.
7. Prism expands it into the complete applicable experience:
   web UI, mobile UI, TUI, CLI interaction, or a combination.
8. Prism covers required journeys and states, including authentication when the
   architecture requires it.
9. User explicitly approves one immutable Design Baseline Bundle.
10. Prism writes the human-readable design specification into the project docs and
    returns the bundle reference and structured summary to Nova.
11. Nova validates the handoff, creates the module plan, and starts the pipeline.
12. The pipeline implements and verifies the product against the approved baseline.
13. Explicit user feedback and implementation outcomes improve later proposals.
```

Nova does not ask Prism to invent product architecture. Prism may report a missing,
contradictory, or unsafe product requirement and wait for Nova or the user to resolve
it. Prism owns experience design within the accepted architecture.

### Nova to Prism handoff

Nova publishes a versioned Design Request. It contains or references:

- project identity and architecture revision;
- product purpose, audience, jobs, and constraints;
- supported experience surfaces such as web, mobile, desktop, TUI, or CLI;
- functional capabilities and journeys that require design;
- authentication, onboarding, permissions, errors, and destructive operations;
- brand, accessibility, platform, and implementation constraints;
- known content and data concepts;
- open assumptions Prism may explore;
- decisions Prism must not change;
- repository documentation location and artifact namespace.

Prism rejects an ambiguous or inconsistent request only when proceeding would create
material design rework. Otherwise it records assumptions and begins research.

### Prism to Nova handoff

Prism returns:

- approved baseline identity and digest;
- human-readable design specification paths;
- machine-readable bundle reference;
- screen, state, flow, component, and viewport inventories;
- implementation acceptance criteria;
- unresolved items explicitly accepted by the user;
- suggested module boundaries as non-authoritative design evidence;
- provider, model, renderer, and schema versions required for audit.

Nova validates the contract and uses it as input when creating the authoritative
module plan. Prism does not mutate the module graph directly.

### Three storage layers

“Saved with the architecture documentation” means the approved design is represented
in the same version-controlled project documentation set, not that all Prism state is
placed in one Markdown file.

1. **Repository documentation** is for humans and implementation agents. It contains
   the approved design overview, journeys, screen/state inventory, design system,
   interaction rules, accessibility requirements, acceptance criteria, and links to
   immutable evidence.
2. **Design Baseline Bundle** is the exact machine contract consumed by the pipeline.
   It contains the canonical Design Document snapshot, manifests, mocks, assets,
   screenshots, and digests.
3. **Prism operational state** stays in PostgreSQL and object storage. It contains
   drafts, edit history, retrieval evidence, provider cache, preference events, and
   internal audit data that would make project documentation noisy or unsafe.

Repository documentation references one exact bundle digest. A baseline is invalid
when the documented identity and immutable bundle do not agree.

## User Experience Architecture

The default experience has four spaces. Complexity is progressively disclosed;
the primary journey does not expose infrastructure, embeddings, design tokens, or
provider controls.

### 1. Brief

Prism imports available project context, explains its current understanding, and
asks only questions whose answers materially change the design.

The live brief contains:

- what is being designed;
- target platform and viewports;
- audience and expertise;
- primary jobs and journeys;
- business goal and user objection;
- desired feeling and brand constraints;
- content and accessibility constraints;
- required screens and states;
- known implementation constraints;
- unresolved assumptions and their confidence.

The user can accept the inferred brief or correct any item directly.

### 2. Directions

Prism normally produces three deliberately distinct, reference-locked directions.
Each direction presents:

- a representative key screen;
- the visual thesis in ordinary language;
- why it fits the brief;
- notable strengths and trade-offs;
- its dominant reference and narrowly bounded secondary influences;
- a small token and media preview;
- accessibility or implementation risks.

Primary actions are simple:

- choose this direction;
- more like this;
- less like this;
- keep one named detail;
- regenerate distinct alternatives.

Directions must not be minor color variations of one layout. The system enforces a
minimum diversity threshold across composition, type, density, surface treatment,
media strategy, and interaction character.

### 3. Prototype

The chosen direction expands into a complete mocked prototype. The default canvas
offers:

- screen and flow navigation;
- viewport and state switching;
- element selection and contextual explanation;
- natural-language change requests scoped to a selected element or screen;
- safe direct edits for exposed properties;
- version comparison and restoration;
- comments and unresolved decisions;
- design rationale and reference provenance on demand.

The inspector should show the simplest useful controls first: content, variant,
spacing, alignment, visibility, asset, and ordering. Advanced tokens and responsive
rules remain available but collapsed.

### 4. Approve

Before publication, Prism presents a human-readable completeness report:

- screens and journeys covered;
- loading, empty, error, success, permission, and destructive states covered;
- supported viewports and responsive rules;
- accessibility and contrast results;
- component and token consistency;
- unresolved assumptions;
- quality critique and known limitations;
- baseline artifacts that will enter the pipeline.

Approval creates a new immutable bundle. It never mutates or reuses a previously
approved bundle identity.

## Research and Synthesis Policy

Every substantial design is reference-grounded. Prism uses three evidence layers:

1. Styles establish visual direction and taste.
2. Screens establish concrete hierarchy, content, states, and component patterns.
3. Flows establish journey order, decisions, system responses, and recovery paths.

Research follows this sequence:

```text
brief
  -> local corpus retrieval and coverage analysis
  -> external research for missing or fresh evidence
  -> candidate normalization and provenance checks
  -> distinct direction generation
  -> reference lock and decision ledger
  -> prototype generation
  -> critique and visual QA
```

Each direction has one dominant foundation. Secondary references may own only named,
bounded roles. Prism must not average conflicting sources into a safe centroid.

A reference lock records:

- primary source or explicit synthesized direction;
- traits that must survive;
- narrowly borrowed secondary details;
- token and component role rules;
- media strategy;
- rejected defaults and failure modes;
- accessibility constraints;
- reference provenance and permitted retention.

## External Provider Architecture

All providers implement a stable logical interface:

```text
discover(query, filters, budget) -> candidate summaries
retrieve(provider_ref, detail_level) -> normalized evidence
capture(provider_ref, policy) -> optional licensed artifact
provenance(provider_ref) -> rights and retention metadata
health() -> availability and quota state
```

Provider-specific payloads never become the Design Document or canonical corpus. An
adapter extracts provider-neutral design facts and evidence. A short-lived ingestion
record may retain an external locator only when rights enforcement, deletion, or
audit requires it and policy permits it. The locator stays at the adapter boundary.
It is not a Prism reference identity.

Initial provider candidates:

- Refero for styles, screens, flows, and discovery vocabulary;
- Google Stitch MCP for generated explorations and design metadata;
- direct Playwright capture of permitted public sources;
- permissively licensed open-source applications and design systems;
- approved Figma/community sources;
- internal completed designs and rejected explorations;
- intentionally generated experiments that fill corpus coverage gaps.

Provider selection considers relevance, freshness, diversity, quota cost, latency,
rights, and current corpus coverage. Unavailability must degrade to other providers
or the local corpus without invalidating approved baselines.

## Design Corpus

The corpus has three retention and quality tiers:

- **Ephemeral**: temporary search and analysis cache with provider-specific expiry.
- **Curated**: references selected for a project or explicitly retained.
- **Canonical exemplars**: reviewed references demonstrating exceptional and
  deliberately varied design decisions.

The corpus stores normalized knowledge, not only screenshots:

- source, capture time, product, platform, industry, and audience;
- license, provenance, retention, attribution, and deletion requirements;
- screen type, journey, state, viewport, and relationship to neighboring screens;
- OCR text and content hierarchy;
- layout regions and component inventory;
- typography, palette, spacing, radius, elevation, density, and media treatment;
- interaction, motion, responsive, and accessibility observations;
- critique, strengths, risks, and applicable contexts;
- text, image, layout, and style embeddings;
- corpus version, analyzer version, and confidence;
- projects and decisions influenced by the reference;
- user feedback and later outcomes.

Coverage is managed explicitly across platform, screen type, state, flow, industry,
audience, aesthetic, density, accessibility, and device. The scheduler prioritizes
coverage gaps and source diversity instead of maximizing raw item count.

## Storage Architecture

### PostgreSQL: canonical knowledge

Prism owns a dedicated PostgreSQL database, credentials, migrations, backup policy,
and restoration procedure. It does not depend on LiteLLM's database or lifecycle.
The database can initially share a PostgreSQL server, but remains logically isolated
and independently movable.

PostgreSQL stores canonical relational state, immutable Design Document JSONB
revisions, normalized corpus knowledge, rights policy, append-only preference
evidence, and operation idempotency. The accepted twelve-table logical model is
defined in [Prism Storage Model v1](prism-storage-model-v1.md).

### PostgreSQL and pgvector: retrieval

V1 stores one combined fixed-dimension embedding per corpus revision and begins with
exact vector search. PostgreSQL full-text search and relational filters complement
the vector candidates. Separate embedding facets and approximate vector indexes are
added only after representative benchmarks show a material need.

Embedding rows record source identity, source revision, embedding model, dimensions,
normalization version, and content digest. Re-embedding is idempotent and never
changes canonical source records in place.

A specialized retrieval database may be introduced later only when a recorded
benchmark shows that PostgreSQL cannot meet an accepted requirement. Valid triggers
include retrieval latency, corpus scale, independent search scaling, multi-vector
query complexity, or unacceptable interference with transactional workloads. The
retrieval service interface must allow this without changing Design Documents,
Baseline Bundles, Studio APIs, or pipeline contracts.

The accepted v1 query, eligibility, hybrid-search, fusion, selection, result, and
benchmark contracts are defined in
[Prism Retrieval and Ranking v1](prism-retrieval-ranking-v1.md).

### Artifact store: immutable artifacts

The existing content-addressed platform artifact store contains:

- screenshots and screenshot crops;
- source captures where retention is permitted;
- generated media and thumbnails;
- rendered prototype assets;
- approved Design Baseline Bundles;
- visual comparison evidence;
- import/export archives.

Objects are content-addressed, checksummed, media-typed, retention-tagged, and never
addressed by unrestricted filesystem paths in pipeline contracts.

## Canonical Design Document

The Design Document is editor-independent, versioned JSON. It describes what Studio
must render and how the mocked experience behaves. It does not contain research,
architecture, preference history, or pipeline state.

```text
DesignDocument
├── meta
├── theme
│   └── usage rules
├── assets
│   └── role, ratio, fit, position, alt text, and art direction
├── components
├── views
│   ├── node tree
│   ├── states
│   └── responsive overrides
└── flows
    ├── goal, start, success, and recovery
    └── user actions and system responses
```

These six top-level sections are accepted for v1. A new top-level section requires
a real case that cannot fit an existing section without changing its meaning.

The v1 field-level direction is also accepted:

- all six root sections are required and reject unknown fields;
- IDs are readable Prism-owned kebab-case names;
- `meta` owns schema identity and immutable revision metadata;
- `theme` owns semantic tokens, three named breakpoints, and plain-text usage rules;
- `assets` owns content-addressed media references and presentation guidance;
- `components` owns reusable node trees and patch-based variants;
- `views` owns one root tree, named patch-based states, responsive patches, and
  deterministic mock data;
- `flows` owns goals, start/success/recovery points, and declarative transitions;
- one saved revision is immutable and schema migrations create new revisions;
- v1 contains no arbitrary code, expressions, production calls, provider fields,
  extension fields, or embedded research and learning history.

The property-catalog simplification review is accepted in
[prism-design-document-v1-review.md](prism-design-document-v1-review.md). It validates
web authentication, a dense dashboard, and a TUI setup flow. It also locks five
corrections: explicit reference objects, action-based transitions, direct property
patches, bounded dot-path data binding, and responsive behavior owned only by views.

Every visible node uses one common shape:

```text
id
type
props
children
```

Only `id` and `type` are always required. Layout uses normal node types such as
`stack`, `grid`, `split`, `scroll`, and `overlay`. V1 does not define a second layout
language or a general prototype programming language.

The visual thesis, reference lock, decision ledger, research evidence, and broad
do/do-not guidance stay in the human design specification and Baseline Bundle
evidence. A rule belongs in `theme.rules` only when it directly controls rendering
or implementation, such as "action color is CTA-only."

### Required properties

- Stable node identities survive rendering and ordinary edits.
- Tokens have semantic roles; a source accent cannot silently change roles.
- Layout uses constraints and named regions rather than absolute coordinates by
  default.
- Responsive behavior is explicit at meaningful breakpoints.
- States and transitions are first-class, not encoded only in screenshots.
- Mock data is typed, deterministic, and visibly non-production.
- Assets carry provenance, alt text, crop behavior, and art direction.
- Assets use Prism-owned identities. They do not use provider IDs.
- Flows state their goal, success condition, recovery paths, user actions, and system
  responses.
- Unknown schema fields fail validation unless a future version explicitly permits
  an extension namespace.
- Migrations are explicit, tested, one-way transformations with preserved originals.

### Edit operations

Studio edits are append-only structured operations, for example:

- replace content;
- set component variant;
- set semantic token;
- update layout constraint;
- move a node within an allowed region;
- insert or remove a component;
- change asset or crop;
- add a state or transition;
- update responsive override;
- attach or resolve an annotation.

Every operation identifies its base revision and affected nodes. Conflicts fail
explicitly and require rebasing or user resolution. Periodic snapshots compact the
operation stream without discarding audit history.

## Studio and Prototype Renderer

The accepted desktop, tablet, and mobile interaction model, visual-editing scope,
Puck adapter boundary, typed operation catalog, and v1 proof are defined in
[Prism Studio Interaction v1](prism-studio-interaction-v1.md).

The accepted trusted renderer, iframe isolation, declarative mock behavior, runtime
profiles, customization packs, scaling model, and safety proof are defined in
[Prism Prototype Runtime v1](prism-prototype-runtime-v1.md).

The separate Studio deployment is a stateless web application backed by Prism APIs. It renders
Design Documents, submits typed edits, displays revisions, and streams job progress.
It does not access provider credentials or databases directly.

Puck is the leading proposed editor foundation for constrained React components and
drag-and-drop composition. Adoption requires a spike proving:

- mapping between the independent Design Document and Puck data;
- stable node selection and contextual editing;
- grid, flex, responsive, and nested layout behavior;
- deterministic serialization;
- undo/redo and revision replay;
- accessibility of the editor itself;
- acceptable performance on complete product flows;
- no requirement to make Puck's internal schema canonical.

Open Design should be evaluated for reusable patterns or bounded components,
especially its headless plugin architecture, MCP-readable design artifacts,
live-reload previews, element picker, tweak workflow, and critique orchestration.
Its agent runtime must not replace worker-core or become the canonical domain model.

## Render and Capture Service

The initial capture service may run in the Studio container if resource measurements
support it. It becomes a separate sidecar or service when Chromium isolation,
concurrency, or scaling requires it.

Responsibilities:

- deterministically render a Design Document revision;
- navigate mocked states and flows;
- capture approved viewport matrices;
- extract node boxes and computed presentation evidence;
- run accessibility checks;
- run screenshot comparisons;
- emit immutable evidence with renderer, browser, font, and viewport versions.

Rendering must pin browser, fonts, locale, timezone, animation policy, mock seed, and
device scale factor. Dynamic timestamps, random data, cursors, and animations are
masked or frozen for comparisons.

## Worker Core and Design Engine Boundary

Prism follows the accepted neutral-worker architecture in D-096:

```text
Nova
  -> generic worker-core attempt
       -> opaque specialist request
            -> Prism Design Engine
                 -> design operation and result
       -> generic evidence, telemetry, receipt, and lifecycle result
```

Worker-core remains unchanged and specialist-neutral. It owns transport, immutable
attempt identity, claims, authenticated worker identity, limits, progress, logs,
cancellation, evidence collection, cleanup, health, capacity, result digests, and
receipts. It does not know about design operations, documents, views, providers,
quality policy, or publication rules.

The Prism Design Engine is a separate package above worker-core. It owns all
design-specific contracts, validation, policy, orchestration, and tools. Its small v1
operation set is:

- `design.generate` for initial generation and refinement;
- `design.render` for deterministic prototype rendering and capture;
- `design.evaluate` for schema, completeness, accessibility, and quality findings;
- `design.ingest` for one corpus item;
- `design.publish` for an immutable approved Baseline Bundle.

These names appear only inside the Prism engine request. Worker-core validates the
declared engine contract and treats the request and result bodies as bounded opaque
JSON. Other workers use the same core with their own engine contracts and operation
names.

Large screenshots, corpora, documents, and bundles use logical artifact references
rather than queue payloads. Worker-core supplies generic evidence, timing, retry,
failure, and receipt fields. The Prism engine result supplies only design-specific
output, such as a Design Document revision, render index, evaluation report, corpus
identity, or Baseline Bundle handoff.

Do not create a second Prism copy of worker-core task IDs, attempt IDs, limits,
timestamps, lifecycle states, evidence envelopes, failure envelopes, or telemetry.
The Prism contract defines only the specialist payload carried by the existing
neutral protocol.

The accepted operation payloads, validation boundary, capability mapping,
idempotency rules, and binding tests are defined in
[Prism Design Engine Contract v1](prism-design-engine-contract-v1.md).

## Design Baseline Bundle

Approval publishes one immutable, content-addressed bundle containing:

- the bundle manifest;
- one complete approved Design Document;
- the human-readable design specification;
- observable acceptance criteria;
- all required assets;
- approved preview evidence;
- checksums for every member.

The bundle contains only approved implementation and verification inputs. Drafts,
research responses, rejected directions, preference events, approval events, and
worker logs remain in their owning systems.

The accepted field-level contract, validation rules, publication rules, and handoff
shape are defined in [Prism Baseline Bundle v1](prism-baseline-bundle-v1.md).

## Pipeline Integration

The proposed pipeline path is:

```text
architecture/brief
  -> Prism design request
  -> user approval wait
  -> immutable baseline publication
  -> baseline contract validation
  -> Forge implementation
  -> functional and accessibility tests
  -> render implementation at baseline viewports/states
  -> visual fidelity gate
  -> review and human decision when drift is material
```

Prism should be callable as an explicit plugin-owned pipeline stage and independently
from Studio. Core must not know what a design stage means.

The visual gate compares more than a global pixel percentage. Evidence includes:

- required screen/state presence;
- stable landmark and component mapping;
- layout geometry and responsive behavior;
- semantic tokens and typography;
- assets and crop treatment;
- interaction and flow behavior;
- accessibility requirements;
- screenshot difference with declared masks and tolerances.

Intentional implementation changes require a new baseline revision or an explicit,
audited deviation approval. They must not silently retrain the taste model.

## Taste and Preference Learning

Prism does not upvote or reward its own generated UI. Its critique is quality
evidence, not user-preference evidence. Preference strength comes from user choices,
user edits, explicit approvals, and later accepted outcomes. When the user provides
no signal, Prism records no taste conclusion.

### Event model

Prism records observations, not unqualified conclusions. Useful events include:

- direction selected or rejected;
- pairwise preference between directions or elements;
- reference liked, disliked, retained, or removed;
- component or visual trait explicitly preserved;
- direct edit and later reversal;
- natural-language criticism classified into design dimensions;
- approval with modification distance and elapsed effort;
- pipeline implementation deviation;
- final user acceptance or later redesign;
- outcome metrics when explicitly connected and permitted.

Every event carries user, project, domain, brief, candidates, affected traits,
timestamp, provenance, confidence, and consent scope.

### Separate preference layers

The accepted minimal event contract, learning scopes, deterministic projection,
conflict priority, and user-correction rules are defined in
[Prism Preference Learning v1](prism-preference-learning-v1.md).

- Personal taste: recurring preferences of one user.
- Project taste: the established language and constraints of one product.
- Domain evidence: patterns appropriate to an audience or product class.
- Craft quality: accessibility, hierarchy, consistency, usability, and clarity.
- Novelty and diversity: protection against repetitive self-imitation.

These layers are combined at ranking time and remain independently inspectable.

### Ranking strategy

The initial system uses deterministic weighted features and pairwise preference
updates rather than training a bespoke model prematurely. Candidate selection should
consider:

- relevance to the brief;
- reference quality and evidence confidence;
- user and project preference fit;
- source and aesthetic diversity;
- novelty relative to recent proposals;
- accessibility and usability risk;
- provider rights and freshness;
- historical acceptance and modification distance.

Weights are versioned. A ranking decision stores its candidate set, features,
weights, and explanation so it can be replayed.

### Anti-collapse safeguards

- no learning solely from Prism's own critique scores;
- source-family and aesthetic exposure caps;
- explicit negative examples and rejection reasons;
- preference decay or revalidation where context changes;
- blind benchmark briefs and taste regression suites;
- exploration allocation for credible alternatives;
- user-visible reset, correction, export, and deletion controls;
- no global promotion from one user's private preferences without consent.

## Quality and Completeness Gates

Prism separates deterministic validation from agent judgment.

### Deterministic gates

- document and bundle schema validity;
- reference and artifact integrity;
- screen, state, flow, and viewport coverage declared by the brief;
- broken transition and unreachable-state detection;
- missing assets, alt text, and responsive rules;
- token-role and component-variant consistency;
- contrast, focus, keyboard, reduced-motion, and touch-target checks;
- deterministic rendering and screenshot availability;
- provider rights and retention compliance;
- unresolved blocking decisions.

### Critique dimensions

- brief and brand fit;
- hierarchy and comprehension;
- usability and journey confidence;
- visual craft and coherence;
- distinctiveness and memorability;
- content and persuasion;
- responsive composition;
- accessibility beyond mechanical checks;
- implementation clarity;
- evidence strength and reference fidelity.

Critique produces findings with evidence, severity, confidence, affected nodes, and
suggested remedies. A numerical score may summarize findings but never replaces them
or grants publication authority.

## Security and Trust Boundaries

- Studio is private through Tailscale and authenticated at the application boundary.
- Studio receives no provider or database credentials.
- Prism secrets use existing Kubernetes secret mechanisms and explicit capability
  grants.
- Provider adapters receive only their required credential and egress scope.
- Captured web content, SVG, HTML, fonts, and documents are untrusted inputs.
- Prototype rendering disables arbitrary network access and unsafe script execution
  unless a separately sandboxed mode explicitly permits them.
- Design Documents cannot name host filesystem paths or executable commands.
- Uploaded and captured artifacts are media-validated, size-bounded, scanned, and
  content-addressed.
- Mock data must not contain production secrets or personal data by default.
- Worker identity in payloads is not trusted; worker-core authentication binds claims
  and results to the actual worker.
- Pipeline consumers receive immutable artifacts, never a writable Prism workspace.
- Rights and retention policy is evaluated before storage, embedding, publication,
  export, or model use.

## Kubernetes Deployment

Proposed Helm release: `agent-prism`.

### Prism control deployment

- OpenClaw gateway and Prism agent;
- design orchestration and provider adapters;
- Design Engine coordination and worker-core client integration;
- no BuildKit, production deployer, general lint suite, or broad cluster authority;
- read/write access only to its scoped workspace and required artifact interfaces.

### Prism Studio deployment

- private web UI and preview renderer;
- ClusterIP service exposed by the existing Tailscale Operator;
- stateless and independently deployable from Prism control;
- narrowly authenticated access to the internal Prism API;
- no database, provider, queue, Kubernetes, or artifact-write credentials;
- independent health, readiness, resource limits, rollout, and rollback.

### Prism worker deployment

- neutral worker-core plus the Prism Design Engine;
- pinned Playwright/Chromium runtime;
- isolated temporary storage;
- no service account token;
- restricted network policy;
- bounded concurrency, time, memory, output, and artifact size.

### Storage and service dependencies

- dedicated Prism PostgreSQL database with pgvector and least-privilege credentials;
- existing content-addressed artifact store;
- worker-core transport and artifact capability;
- optional Redis only through the established transport abstraction;
- Tailscale Ingress controlled by tailnet identity policy.

### Availability model

Studio and active edit sessions require Prism availability. Approved bundles and
pipeline implementation do not. Provider outages disable only affected research
paths. Loss of a derived embedding index degrades retrieval until reindexing; it does
not lose canonical knowledge. Renderer loss blocks capture and approval but does not
corrupt documents.

## Reliability, Recovery, and Operations

- PostgreSQL uses point-in-time recovery and tested restoration.
- Object storage uses versioning or immutable retention appropriate to the deployment.
- Derived embeddings and indexes are rebuildable from canonical source revisions.
- Every embedding and ingestion job is idempotent and keyed by canonical version.
- Edit operations use optimistic concurrency and never last-write-wins silently.
- Provider calls use bounded retries, circuit breakers, quotas, and idempotency where
  supported.
- Partial direction or prototype generation remains a draft and cannot be approved.
- Long-running attempts emit progress and support worker-core cancellation.
- Startup validates schemas, provider configuration, storage reachability, renderer
  version, and required capability grants before accepting work.

Operational telemetry should cover:

- attempt latency, failure class, cancellation, and queue depth;
- provider calls, cost, quota, rate limits, and cache hit rate;
- retrieval latency, recall benchmarks, and reranker behavior;
- render duration, crash rate, and screenshot determinism;
- edit conflicts, undo rate, approval time, and modification distance;
- corpus growth, rights state, coverage gaps, and embedding lag;
- baseline publication and pipeline-fidelity outcomes.

Logs and traces reference canonical IDs and digests, not full private prompts,
screenshots, credentials, or provider payloads.

## APIs and Capability Boundaries

Proposed logical Prism API groups:

- `/projects`: project and brief lifecycle;
- `/research`: searches, evidence, provenance, and provider budgets;
- `/directions`: generation, comparison, and selection;
- `/documents`: revisions, operations, validation, and history;
- `/renders`: preview sessions, captures, and comparison evidence;
- `/critique`: findings and resolution state;
- `/preferences`: events, profile explanations, corrections, and consent;
- `/baselines`: approval, publication, manifest, and pipeline handoff;
- `/jobs`: progress, cancellation, retry, and evidence.

The HTTP surface is not the worker contract. Studio APIs optimize interactive use;
the Prism engine contract describes durable specialist work carried by the neutral
worker-core envelope. Both call the same domain services and enforce the same
invariants.

Proposed capability vocabulary additions, subject to core security review:

- `design.documents.read`
- `design.documents.write`
- `design.corpus.search`
- `design.corpus.ingest`
- `design.render.execute`
- `design.preferences.record`
- `design.baseline.publish`

Capabilities require resource constraints such as project, corpus, provider, object
namespace, operation, and publication target. Core-only lifecycle authority remains
ungrantable.

## Versioning and Compatibility

Version independently:

- Design Document schema;
- Design Baseline Bundle schema;
- Prism Design Engine request and result schemas;
- corpus normalization schema;
- embedding schema and retrieval-index version;
- preference event schema;
- renderer and capture protocol;
- provider adapter contract;
- Studio API.

Approved bundles declare all required versions and remain readable after runtime
upgrades. Unsupported versions fail explicitly. Migration creates a new canonical
revision or bundle; it never rewrites previously approved evidence in place.

## Phased Delivery

### Phase 0: architecture lock

- resolve open decisions in this document;
- define threat model and data-retention policy;
- freeze v1 Design Document and Baseline Bundle boundaries;
- specify the pipeline stage and Prism Design Engine binding to worker-core;
- define measurable acceptance criteria for the first end-to-end slice.

### Phase 1: manual-quality vertical slice

- deploy Prism agent and read-only Studio through Tailscale;
- create briefs and three reference-locked directions;
- render one mocked flow at desktop and mobile;
- support comments and natural-language refinement;
- publish an immutable baseline bundle;
- consume it in a pipeline fixture and verify screenshots.

Use the existing artifact store initially if that shortens the slice without making
filesystem layout part of a public contract.

### Phase 2: structured Studio editing

- implement Design Document edit operations and revision history;
- add safe properties, element selection, undo/redo, and viewport/state switching;
- validate the Puck adapter or replace it based on the spike;
- add deterministic completeness and accessibility gates.

### Phase 3: independent corpus

- deploy canonical PostgreSQL/pgvector schema and object storage policy;
- add ingestion, normalization, provenance, deletion, and coverage scheduling;
- integrate Refero, Stitch, public capture, and permissive open-source sources;
- establish canonical exemplar review.

### Phase 4: contextual taste learning

- record preference events and pairwise choices;
- implement explainable contextual ranking and diversity safeguards;
- add user-visible preference profile and correction tools;
- establish offline benchmarks and taste regression tests.

### Phase 5: high-fidelity pipeline loop

- automate baseline contract validation and visual gate creation;
- link implementation outcomes and explicit deviation decisions;
- refine retrieval and ranking using measured modification distance;
- introduce richer direct manipulation only where structured round-trip remains safe.

## Open Decisions

Each decision must be resolved with an owner, evidence, date, and superseding record.

The architecture is organized into thirteen workstreams:

1. Design Document schema and versioning. **Accepted.**
2. Design Baseline Bundle contract consumed by the pipeline. **Accepted.**
3. Prism Design Engine request/result schemas and their binding to the existing
   neutral worker-core envelope. **Accepted.**
4. PostgreSQL/pgvector model, indexes, and object references. **Accepted.**
5. Retrieval and ranking pipeline. **Accepted.**
6. Preference-learning event model. **Accepted.**
7. Studio interaction model. **Accepted.**
8. Mock/prototype runtime and safety boundary. **Accepted.**
9. Corpus ingestion and provenance rules. **Accepted.** See
   [Prism Corpus Ingestion v1](prism-corpus-ingestion-v1.md).
10. Design quality and completeness gates. **Accepted.** See
    [Prism Quality Gates v1](prism-quality-gates-v1.md).
11. Pipeline fidelity-check workflow. **Accepted.** Prism uses the existing Buster
    and pipeline test-gate system through
    [Prism Pipeline Fidelity Adapter v1](prism-pipeline-fidelity-adapter-v1.md).
12. Failure recovery, backups, and observability. **Accepted.** See
    [Prism Recovery and Observability v1](prism-recovery-observability-v1.md).
13. Exact Helm resources and capability permissions. **Accepted.** See
    [Prism Helm Deployment v1](prism-helm-deployment-v1.md).

Resolve these in dependency order. The Design Document and Baseline Bundle define
the stable center. Worker, storage, Studio, learning, and pipeline contracts should
depend on them rather than inventing parallel representations.

## Remaining Pre-Build Decisions

The thirteen architecture workstreams are accepted. The remaining choices are
implementation inputs or prototype proofs. They do not require new architecture
workstreams.

1. Select Studio authentication and session transport. The preferred path is
   Tailscale identity to a short-lived Prism session.
2. Select the v1 artifact-store backend and its encryption and retention settings.
3. Select replaceable models and providers for generation, visual analysis,
   embeddings, and design review.
4. Approve the first corpus sources and their written rights and retention policy.
5. Complete the Puck desktop/mobile compatibility spike. Replace Puck if it cannot
   preserve typed Prism operations and deterministic round trips.
6. Place design approval in the project graph after architecture approval and before
   Nova module planning. Prefer one project baseline with scoped module references.
7. Set deployment values for resources, concurrency, provider-call budgets, network
   allowlists, backup retention, recovery targets, and alerts.
8. Produce implementation JSON Schemas, fixtures, renderer catalogs, retrieval
   benchmarks, and Helm validation tests from the accepted contracts.

These choices must be recorded before the affected implementation phase starts.

## Architecture Decision Record Template

Use this structure when resolving an open decision:

```text
Decision ID:
Title:
Status: proposed | accepted | superseded | rejected
Date:
Owner:

Context:
Constraints:
Options considered:
Evidence/prototype:
Decision:
Consequences:
Failure and rollback plan:
Required contract/document updates:
Supersedes:
```

## Required Pre-Build Artifacts

Architecture is ready for implementation only when the following exist and agree:

- accepted product journey and Studio interaction map;
- v1 Design Document schema with representative fixtures;
- v1 Design Baseline Bundle schema and validation rules;
- Prism Design Engine request/result schemas and binding tests against the existing
  neutral worker-core contract;
- PostgreSQL/pgvector logical model and retrieval contract;
- provider adapter and provenance policy;
- preference event and ranking explanation contract;
- threat model and capability/RBAC matrix;
- Helm deployment topology and resource budgets;
- backup and restore plan;
- end-to-end sequence diagrams;
- Phase 1 test plan and measurable acceptance criteria;
- decision ledger resolving every Phase 0 blocker.

## Reference Implementations and Research Inputs

These are evidence and implementation candidates, not architectural authorities:

- Refero design research methodology and MCP providers;
- Google Stitch MCP and SDK for generated UI exploration and design metadata;
- Open Design for headless/plugin, preview, tweak, MCP, and critique patterns;
- Puck for a constrained React visual editor and portable editor data;
- Playwright for deterministic rendering and visual comparisons;
- PostgreSQL for canonical relational state;
- pgvector and PostgreSQL full-text search for filtered and hybrid retrieval;
- a specialized vector database only if later benchmarks justify it;
- the existing KubeClaw plugin system, artifact capability, worker-core contract, and
  Tailscale Operator deployment.

Evaluate each dependency for license, maturity, maintainership, security, data
ownership, portability, versioning, operational burden, and exit strategy before
adoption.

## Final Architecture Test

Before accepting the architecture, verify that the following remain true:

- A user can produce and approve a complete design without design expertise.
- Prism can operate from its local corpus when Refero, Stitch, or another provider is
  unavailable.
- Approved baselines remain consumable when Prism and Studio are offline.
- Derived embeddings and retrieval indexes can be rebuilt without losing knowledge
  or preference history.
- The editor can be replaced without migrating the canonical design domain.
- Provider data can be deleted according to policy without corrupting projects.
- A pipeline implementation can prove what baseline it used.
- Design drift is measurable, explainable, and explicitly accepted or corrected.
- Preference learning can be inspected, corrected, reset, exported, and deleted.
- The system encourages distinctive design without compromising usability,
  accessibility, stability, or user authority.
