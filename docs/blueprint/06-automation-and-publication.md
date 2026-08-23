# 6. Automation and publication specification

## Objectives

Automation must prevent factual drift, prove examples, keep navigation complete, and build the interactive architecture. An ASD-STE100-inspired check enforces bounded sentences, direct instructions, approved terminology, and prohibited vague terms. Technical review and reader acceptance tests remain required because automation cannot certify full ASD-STE100 compliance.

## Content architecture

Use a static documentation application with:

- authored MDX/Markdown for explanation and procedures;
- generated JSON as the shared fact layer;
- typed HTML components for references, evidence links, callouts, and architecture views;
- release-aware source-link resolution;
- server/static-rendered content with progressive enhancement;
- track-scoped navigation and search filters;
- stable canonical URLs and redirect support.

Framework selection is a later recorded decision. Required capabilities—not framework preference—drive the choice: static output, MDX, typed components, accessible routing/search, versioning, code-generated pages, and integration with the existing website.

## Canonical generated data

| Dataset | Source | Consumers |
| --- | --- | --- |
| Platform components | role manifests, package ownership, public package exports | architecture map, component pages, status page |
| Plugin catalogue | every `plugin.json`, schemas, package metadata, adjacent tests/source | Extend catalogue, plugin reference, architecture map |
| Extension points | plugin v2 schema and SDK exports | extension tutorials and normative reference |
| Capability catalogue | capability vocabulary, operations/resources/constraints, core-only list | security architecture, plugin authoring, generated reference |
| Contract catalogue | `contracts/**`, schemas, exports, fixtures, version metadata | reference and compatibility matrix |
| Runtime roles and bundles | `packaging/runtime/**` | architecture deployment views and operator configuration |
| Configuration | chart values, runtime schemas, config readers, environment reads | operator tasks and generated reference |
| CLI and verification commands | command definitions and package scripts | task pages and reference |
| Telemetry catalogue | telemetry contract manifest/catalogue and generated schemas | architecture flow and event reference |
| Evidence index | page front matter plus source/test resolver | source badges, coverage report, publication gate |
| Decisions | decision-record front matter | decisions index, status labels, related links |
| Redirects | migration ledger | website routing and broken-link prevention |

## Build pipeline

1. Resolve release identity: version, tag, and commit SHA.
2. Require a clean, conflict-free source tree for publication.
3. Validate contracts, manifests, package ownership, and runtime roles.
4. Generate inventories and reference data.
5. Generate architecture nodes/edges/views from the same data.
6. Resolve evidence paths and symbols to release-pinned source URLs.
7. Build authored pages and generated catalogue/reference pages.
8. Validate internal links, anchors, redirects, and orphan pages.
9. Compile/type-check/run examples according to their declared verifier.
10. Render the site and run accessibility, responsive, no-script, and visual-regression checks.
11. Run track journey tests and documentation coverage checks.
12. Produce a signed build report containing source SHA, dataset digests, checks, and publication URL.
13. Publish immutable versioned docs, then update the current-version alias only after all gates pass.

## Required automation

### Generation

- Platform, runtime-role, engine/specialist-status, plugin, registration, capability, contract, telemetry, CLI, configuration, environment, Helm, secret-name, workflow, and verification-command catalogues.
- One skeleton/reference page for every plugin and extension registration.
- Source and verification links pinned to the release commit.
- Architecture HTML data and fallback nested lists/tables.
- Redirect map from the completed migration ledger.
- Current/designed/deprecated status index.
- Coverage and freshness report.

### Validation

- JSON Schema and TypeScript contract validation.
- Plugin manifest/schema/module/export existence.
- Role-manifest/package/plugin composition and dependency-direction checks.
- Source path and symbol existence.
- Broken link, anchor, duplicate URL, redirect loop, and orphan-page checks.
- Generated-file freshness.
- Example schema validation, compilation, package test, or isolated execution.
- Command existence and safe smoke verification.
- No current page sourced only from a plan/audit document.
- No planned component labeled implemented.
- No raw internal planning, phase, audit, generator, or template page in public navigation or search.
- Every plugin/registration/capability/contract/config family has a target page.
- Every published page has audience, status, evidence, version, and owner metadata.
- Every deletion ledger row marked complete has a valid destination and redirect or an explicit no-redirect decision.

### Human quality gates

- Technical owner confirms behavior and boundaries.
- An operator follows operator procedures in a representative environment without architecture knowledge.
- A developer implements each extension-point tutorial from a clean checkout without architecture knowledge.
- An architecture reader explains authority, flows, deployment, and boundaries using only Understand.
- An editor checks direct language, defined terms, one action per procedural step, expected results, failure paths, and unnecessary repetition.
- Security reviews claims involving isolation, grants, secrets, network, untrusted input, and privileged execution.

## Interactive architecture presentation

### Views from one model

The presentation renders the same canonical nodes and relationships in several selectable views:

- **Layer view:** Nova foundation, Plugin Foundation/SDK, Worker Core communication/lifecycle/telemetry layer, engines, plugins, and external systems.
- **Authority view:** who may schedule, mutate lifecycle, execute specialist work, publish evidence, request operator input, and observe.
- **Runtime view:** Nova bundle, Buster bundle, shared packages, external capabilities, and process/pod boundaries.
- **Run view:** request, graph freeze, stage/adapter calls, Forge/Echo dispatch, Buster job, result reduction, remediation/wait/resume, closure.
- **Telemetry view:** producers, outbox/admission, stores, evidence, reconciliation, and consumer views.
- **Failure view:** failure class, retry owner, durable state, recovery path, and terminal behavior.
- **Status view:** implemented, changing, designed, deprecated, and removed components.

Selecting a node opens: purpose, owns, does not own, inputs/outputs, capabilities, deployment, failure behavior, related nodes, source, verification, decisions, operator tasks, and developer extension links.

### Accessibility and resilience

- Semantic HTML headings, lists, links, buttons, details, and tables are primary; lines and positioning are visual enhancement.
- Full keyboard navigation with visible focus and logical reading order.
- Screen-reader summaries for each view and relationship group.
- Text alternatives for animation and motion disabled under reduced-motion preference.
- Status is never communicated by color alone.
- Zoom and reflow work at 200–400%; touch targets meet accessible sizing.
- A no-JavaScript fallback contains the full node hierarchy and relationship tables.
- Print styles produce a readable architecture reference.

### Preliminary visual research and implementation lock

Refero research reviewed three relevant directions: Expo’s precise light technical documentation, Timescale’s diagrammatic industrial blueprint, and Linear’s restrained dark command-center treatment.

Recommended foundation for exploration:

- **Primary:** Expo for content-first clarity, neutral canvas, compact hierarchy, restrained interaction color, and minimal ornament.
- **Borrow only:** Timescale’s sharp diagram framing and technical mono role for the architecture presentation.
- **Optional bounded mode:** Linear’s graphite layering for a dark architecture focus mode, not as an unrelated second brand.
- **Reject:** decorative gradients, generic card grids, color-coded spaghetti connectors, manually drawn factual vectors, oversized marketing heroes, and diagram interactions that hide content from assistive technology.

This is a research direction, not the final reference lock. Before implementation, create three reference-locked visual options, select one, then record exact tokens, component roles, density, media strategy, and signature interaction. Visual QA compares the rendered site to that lock at desktop, tablet, and mobile widths.

## Publication model

- `/docs/current/` points to the latest supported release.
- `/docs/<version>/` is immutable and tied to one commit.
- Designed/not-implemented content is versioned and labeled independently from current guarantees.
- Removed pages resolve through migration redirects; they do not remain as duplicate hidden content.
- Search indexes current content by default and can explicitly include decisions or older versions.
- Raw phase/audit/plan files, internal tooling, generated JSON, and templates are excluded by allowlist, not merely hidden from navigation.
- Sitemap, canonical URLs, metadata, and structured data are generated from page manifests.

## CI gates

Recommended commands:

```text
docs:inventory       generate shared factual datasets
docs:reference       generate catalogue/reference pages
docs:evidence        resolve and validate source/test links
docs:examples        validate and execute declared examples
docs:coverage        prove inventory-to-page and old-to-new coverage
docs:build           build static publication output
docs:a11y            test rendered pages and architecture views
docs:visual          compare key pages to approved reference baselines
docs:journeys        execute Understand, Use, and Extend acceptance paths
docs:publish-check   run every required gate and emit the build report
```

Existing `docs:*`, plugin inventory, runtime packaging, contract, and product verification commands should be composed rather than duplicated. New checks extend the current tooling to cover the website and migration.

## Freshness and ownership

- Code owners are inferred from package/contract ownership and confirmed in page metadata.
- Changes to a manifest, schema, public export, role manifest, capability vocabulary, chart values, CLI definition, or telemetry catalogue trigger affected-page regeneration.
- Changes to implementation paths referenced by authored pages trigger evidence review.
- CI reports affected documentation and blocks release when required generated output or coverage is stale.
- Time alone does not make a page stale; unverified changes to its evidence dependencies do.

## Completion criteria

The automation/publication design is complete when it accounts for generation, evidence, examples, coverage, migration redirects, interactive HTML, accessibility, versioning, search, status separation, publication allowlisting, CI gates, human task tests, and ownership. Implementation of this specification is the first phase after blueprint approval.
