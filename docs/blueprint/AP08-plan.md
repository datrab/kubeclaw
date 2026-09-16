# AP08 extension documentation plan

Status: scoped repeat review completed; two documentation findings corrected; focused closure confirmation pending
Date: 2026-09-16
Scope: W08-W11 and reader outcomes E1-E6
Assessment revision: `bcf032f241b432bf920baa9ee5f727947921447d`

## Result of AP08.0

AP08 has one measurable coverage model before content work starts. The model separates four questions that an aggregate plugin count cannot answer:

1. Which installable packages exist?
2. Which extension contracts do the packages register?
3. Which non-manifest authoring paths exist, such as configuration and Worker Core engines?
4. Can a new developer complete the full task without information from the original chat?

The [generated extension inventory](generated/ap08-extension-inventory.md) is the mechanical baseline. Its JSON companion contains the complete package, registration, role, guide, test, and catalogue-page records. The [audit ledger](AP08-audit-ledger.json) stores reviewed progress separately from generated facts. The generator joins both sources and checks them during `docs:check:generated`.

This plan is the authored coverage authority. A generated row proves that a file or declaration exists. It does not prove that its documentation is correct or sufficient.

## Baseline findings

The repository contains 51 installable extension manifests:

- 48 pipeline runtime packages;
- two OpenClaw host-extension packages;
- one Codex plugin package.

The 48 pipeline packages declare 67 registrations: 21 stages, five observers, 21 adapters, 19 test providers, and one report adapter.

At the AP08.0 baseline, the catalogue had 50 package pages. That baseline did not contain `kubeclaw-ops`. The existing pipeline-system inventory has a narrower search scope and reports 49 package roots. AP08 uses the new 51-manifest baseline for complete extension-documentation coverage. It retains the narrower inventory for its pipeline-runtime purpose until AP09 reconciles inventory ownership.

The current publication generator creates the catalogue pages from manifests. It also replaces the complete content of each page. This design mixes mechanical facts with generic prose and prevents maintainers from keeping detailed authored explanations on those pages. AP08.9 must separate generated facts from authored content before it can claim catalogue completion.

The current publication check reports 47 of the 50 catalogue pages as stale against that generator. This is pre-existing AP08 work, not an AP08.0 regression. The same check also reports legacy decision and status-page findings that remain assigned to AP09 and AP11.

The baseline separates test files from package test commands. `kubeclaw.demo-auth-smoke` and `kubeclaw.http` have package commands that call repository-level integration tests. `kubeclaw-prism` has a package-local test file but no package test command. Only `kubeclaw-ops` has neither a detected test file nor a package test command. These facts do not measure external contract-test coverage. Each package audit must trace that evidence separately.

The existing suite documentation is substantial. AP08 treats it as source material, not as accepted proof. Each retained explanation must agree with the current manifest, implementation, configuration, tests, and runtime boundary.

At the AP08.0 baseline, `first-plugin.md` stopped after manifest discovery. AP08.2 replaced it with the package, role, bundle, activation, observed output, intentional failure, validation failure, removal, and remaining-state journey.

## Coverage units

AP08 tracks three different units. Completion requires all applicable units to pass.

| Unit | Exact scope | Reason for the unit |
| --- | --- | --- |
| Package | All 51 installable manifests | Prevent a package from disappearing behind an aggregate type count |
| Contract surface | Configuration, stage, observer, adapter, test provider, report adapter, OpenClaw extension, Codex plugin or skill, Worker Core engine, runtime role, and core change | Keep extension mechanisms with different hosts and authority models separate |
| Reader journey | Choose, create, build, test, activate, observe, fail, retry, update, replace, disable, remove, and inspect remaining state | Prove that documentation supports work, not only recognition |

Worker Core engines, runtime roles, configuration-only changes, and core changes do not all have installable extension manifests. They therefore have explicit contract-surface and reader-journey coverage even when they add no row to the 51-package inventory.

## Contract-surface audit matrix

`Pending` means that AP08.0 identified the source boundary but did not yet accept its documentation. Later parts update one row only after source, content, local verification, and reader evidence exist.

| Surface | Primary current evidence | Owning part | Current status |
| --- | --- | --- | --- |
| Configuration-only change | project compiler inputs, project schemas, role manifests, deployment values | AP08.1 | Choice boundary documented and locally checked; detailed task audit remains pending |
| Pipeline stage | `plugin-system-v2.schema.json` stage registration and installed stage implementations | AP08.2-AP08.6 | Shared contract and Nova authoring path documented; package audit remains pending |
| Pipeline observer | `plugin-system-v2.schema.json` observer registration and observer delivery runtime | AP08.3, AP08.6 | Shared contract and Nova delivery path documented; package audit remains pending |
| Capability adapter | `plugin-system-v2.schema.json` adapter registration, capability vocabulary, grant policy, and effect runtime | AP08.3, AP08.4, AP08.6 | Contract, Nova path, and effect recovery model documented; persistent host checks remain limited |
| Test provider | `plugin-system-v2.schema.json` provider registration, Buster provider registry, and suites | AP08.3, AP08.5 | Contract, provider, fixture, suite, and evidence paths documented; package audit remains pending |
| Report adapter | `plugin-system-v2.schema.json` report registration and JUnit implementation | AP08.3, AP08.5 | Contract and JUnit path documented; sandbox-dependent runtime check remains limited |
| OpenClaw extension | two OpenClaw manifests, package metadata, loader-facing modules, and host compatibility fields | AP08.7 | Authoring path documented; focused package checks passed; live host acceptance remains pending |
| Codex plugin and skill | Codex manifest and the KubeClaw Ops skill | AP08.7 | Authoring path documented; package-local automated test does not exist |
| Worker Core engine | Worker Core attempt execution and the versioned pipeline-worker-core contracts | AP08.7 | Integration path documented; attempt-executor contract and type checks passed |
| Runtime role | three role manifests, package ownership, and runtime bundle checks | AP08.2, AP08.7 | Inclusion and complete authoring path documented; role closure passed; image acceptance remains pending |
| Core change | public SDK boundary checks and the relevant Nova, Buster, Prism, or Worker Core internals | AP08.1 | Choice boundary documented and locally checked; detailed surface audits remain pending |

The source descriptions in this table are discovery anchors. They are not substitutes for narrow symbol, schema, configuration, and test links in the product pages.

## Page structure

AP08 uses the following canonical product pages. Page names can change only when the replacement preserves the same reader outcome.

| AP08 part | Canonical destination | Reader outcome |
| --- | --- | --- |
| AP08.1 | `docs/site/extend/README.md` | Select configuration, an extension contract, an engine, or a core change for a concrete need |
| AP08.2 | `docs/site/extend/first-plugin.md` | Build and activate one minimal pipeline plugin from a clean checkout |
| AP08.3 | `docs/site/extend/contracts.md` | Understand the five pipeline registrations, their data, authority, and lifecycle |
| AP08.4 | `docs/site/extend/effectful-plugin.md` | Implement an extension with state or an external effect and handle uncertain outcomes |
| AP08.5 | `docs/site/extend/buster.md` | Extend Buster with providers, suites, and report normalization without bypassing evidence rules |
| AP08.6 | `docs/site/extend/nova.md` | Extend Nova stages, adapters, observers, and lint behavior at supported boundaries |
| AP08.7 | `docs/site/extend/host-and-engine.md` | Build OpenClaw, Codex, Worker Core, and runtime-role extensions at their separate boundaries |
| AP08.8 | `docs/site/extend/testing.md` | Test, diagnose, update, replace, disable, and remove an extension |
| AP08.9 | `docs/site/extend/plugin-catalogue/` | Find verified facts, use cases, configuration, limits, errors, checks, and sources for all 51 packages |
| AP08.10 | future AP08 completion checkpoint | Record package, contract, journey, link, language, and reader acceptance |

Prism product architecture remains in the Understand track. AP08.7 explains only the supported Prism host and Worker extension paths. Detailed lint rule reference belongs to AP09; AP08.6 explains the rule model, configuration, failure behavior, and supported authoring workflow.

## Quality contract for AP08 pages

AP08 inherits the complete [documentation quality standard](07-documentation-quality-standard.md). Its product pages use understandable technical English for readers who know software development, Git, tests, and common runtime concepts. They do not assume academic language or prior KubeClaw knowledge.

Each important design choice must state the problem, applicable constraints, selected approach, benefit, cost, alternatives when evidence records them, and the condition that can require reconsideration. Code can prove current behavior but cannot prove historical intent. The page marks an inferred reason as an inference and an unknown reason as unknown.

Each substantial page starts from a concrete developer need and explains cause and effect. It defines KubeClaw-specific terms before using them in later detail. It keeps exact contract names and configuration keys, but does not use those names as a substitute for explanation.

Product pages link claims to narrow implementation, contract, configuration, and test evidence. They do not copy production code into manually maintained blocks. AP09 can add a generated source preview only when the published preview and link resolve to the same pinned revision.

## Requirement traceability

| AP08 requirement | Owning parts | Final proof |
| --- | --- | --- |
| Choose configuration, plugin, provider, adapter, engine, or Core | AP08.1 | Scenario-based choice exercise and supported/unsupported boundary table |
| Inventory all supported extension points and limits | AP08.1, AP08.3, AP08.7, AP08.9 | Contract matrix plus 51-package inventory and catalogue audit |
| Complete minimal plugin from package to active observation | AP08.2 | Clean-checkout build, inclusion, activation, observation, failure, and reversal record |
| Practical stateful or effectful example | AP08.4 | Duplicate, interruption, retry, cancellation, resume, uncertain result, and cleanup evidence |
| Lifecycle, data, schemas, capabilities, artifacts, and compatibility | AP08.3, AP08.8 | Contract explanations and lifecycle reader exercise |
| Install, activate, replace, update, disable, and remove | AP08.8 | Per-surface procedure with remaining-state verification |
| Providers, report adapters, observers, integrations, and Worker engines | AP08.3, AP08.5-AP08.7 | One complete supported path for every distinct contract surface |
| Complete package catalogue | AP08.9 | 51 of 51 records at `reader-accepted` or an exact documented product boundary |
| Quality, readability, reasons, language, and links | All parts; AP08.10 | Quality-gate matrix, source checks, language result, and independent reader exercise |

## Required explanation for each extension surface

Each surface page must answer all applicable questions below. An `N/A` value requires a reason.

| Area | Required answer |
| --- | --- |
| Problem | Which concrete need requires this extension, and why is configuration alone insufficient? |
| Boundary | Which host loads it, which component owns canonical state, and what can the extension not change? |
| Package | Which files, dependencies, exports, schemas, and generated outputs are required, and why? |
| Registration | How does discovery find inert metadata, and how does activation reach executable code? |
| Data | Which inputs, outputs, artifacts, checkpoints, and persisted records cross the boundary? |
| Authority | Which capabilities the extension requests or provides, who grants them, and how denial appears |
| Sequence | The ordered path from discovery through execution, result import, and cleanup |
| Concurrency | Duplicate input, concurrent attempts, ordering, ownership, and idempotency behavior |
| Failure | Validation failure, startup failure, timeout, interruption, dependency failure, partial success, and uncertain effect |
| Recovery | Safe retry, reconciliation, resume, cancellation, cleanup, and evidence retention |
| Lifecycle | Install, activate, observe, update, replace, disable, remove, and remaining state |
| Compatibility | API, package, contract, host, role, and state compatibility rules that current sources support |
| Security | Trust boundary, secret handling, isolation, network or file access, and least-authority consequences |
| Reasons | Recorded decision evidence, or an explicit statement that historical rationale is unknown |
| Evidence | Narrow implementation, contract, configuration, and test links at the reviewed revision |
| Limits | Implemented, locally verified, live verified, incomplete, unsupported, and planned behavior kept separate |

## Package catalogue audit

Every one of the 51 package records receives a content audit. A catalogue page passes only when it includes or links to all applicable items:

- a plain description of the problem that the package solves;
- one representative use case and a clear condition not to use it;
- its host, package identity, registration identities, and runtime-role inclusion;
- configuration fields, defaults, precedence, secrets, and invalid combinations;
- input, output, artifact, checkpoint, and persistent-state behavior;
- capability requests, provided capabilities, and grant or denial behavior;
- timeout, partial-success, retry, duplicate-input, cancellation, and cleanup behavior;
- installation, activation, observation, update, disablement, removal, and remaining state;
- compatibility and unsupported variants;
- actual test commands with passed, failed, skipped, unavailable, and not-run results kept distinct;
- narrow links to manifests, implementation symbols, schemas, configuration, tests, and relevant decisions.

Generated sections can supply identifiers and schema-derived facts. Authored sections must explain meaning, reason, consequences, limits, and practical use. The generator must not replace authored content.

## Source-audit method

The audit for one package follows this order:

1. Read the complete current package guide and catalogue page.
2. Read the manifest and every referenced module and schema.
3. Follow registration, activation, caller, result, and cleanup paths through public contracts.
4. Read package tests and the relevant platform contract tests.
5. Compare documentation claims with configuration and runtime-role inclusion.
6. Record missing historical rationale instead of inventing it.
7. Write or correct the canonical explanation.
8. Run the smallest check that proves each stated behavior.
9. Record the environment, command, result, revision, and evidence limit.
10. Recheck links, language, and the complete reader task.

An audit status can be `pending`, `source-reviewed`, `content-written`, `locally-verified`, or `reader-accepted`. These statuses are sequential. A later status requires evidence for every earlier status. Live verification remains separate. The audit ledger records only deviations from its default status; the generated table expands that default to all 51 rows.

## Work sequence and gates

| Part | Work | Exit gate |
| --- | --- | --- |
| AP08.0 | Establish scope, inventory, page ownership, audit method, and completion rules | The 51 manifests, 67 registrations, non-manifest surfaces, current gaps, and all later outputs have explicit ownership |
| AP08.1 | Write the choice guide and supported/unsupported boundary map | A reader selects the correct change type for representative needs and can explain why alternatives do not fit |
| AP08.2 | Build the minimal pipeline-plugin journey | A clean-checkout exercise reaches actual role inclusion, activation, observed output, intentional failure, and reversal |
| AP08.3 | Explain shared contracts and lifecycle | All five pipeline registration types have source-backed data, authority, failure, and lifecycle explanations |
| AP08.4 | Build the practical effectful example | Duplicate, interruption, retry, cancellation, resume, uncertain result, and cleanup are exercised to supported limits |
| AP08.5 | Audit Buster extension paths | Suites, providers, and report adapters agree with current code and evidence handling |
| AP08.6 | Audit Nova extension paths | Stage, adapter, observer, and lint customization paths agree with current code and role composition |
| AP08.7 | Audit host and engine paths | OpenClaw, Codex, Worker Core, Prism integration, and runtime roles remain distinct and each supported task has a complete path |
| AP08.8 | Complete testing and lifecycle tasks | A reader can prove, diagnose, change, disable, and remove each supported extension type without hidden state assumptions |
| AP08.9 | Rebuild and audit the catalogue | 51 of 51 packages pass the catalogue criteria; generated facts and authored explanations have separate authorities |
| AP08.10 | Perform AP08 acceptance | All package, surface, and journey gates pass or have an exact documented product limit |

## Acceptance evidence

AP08 completion requires all of the following evidence:

- `docs:ap08:inventory:check` reports the expected manifest and registration set.
- All 51 packages have an audited catalogue record.
- Every supported contract surface has one clean-checkout developer journey or a justified shared journey.
- The minimal and effectful examples pass their declared local checks.
- Role inclusion and activation use the real packaging and registry paths.
- Failure exercises include expected observations and recovery boundaries.
- Source callouts resolve to the implementation, contract, configuration, and test at one revision.
- Local and publication links resolve.
- Controlled technical English checks pass for all AP08 product pages.
- Formal ASD-STE100 review remains pending until AP11 unless AP08 records a complete Issue 9 review.
- A developer or agent without chat history completes the declared reader exercise. Every necessary question becomes a documentation defect and triggers a repeat of the affected exercise.

No average score can compensate for a failed gate. File count, word count, generated headings, compilation, or a green publication build cannot prove task completeness.

## AP08.0 completion decision

AP08.0 is complete. It establishes a reproducible inventory, preserves distinct host and contract boundaries, records the current structural documentation gaps, and assigns every AP08 result to a gate.

This decision does not claim that any current extension guide or catalogue page has passed its content audit.

## AP08.1 completion decision

AP08.1 is complete. The [choice-guide checkpoint](AP08.1-checkpoint.md) records the
reader result, supported and unsupported boundaries, pinned source evidence, focused
contract checks, and verification limits. The durable choice-guide check validates
the page structure and all pinned code targets.

AP08.1 does not mark an individual package audit as accepted. It also records the
failed full package-boundary check in
[DOC-AP08-BOUNDARY-CHECK-001](../site/status/open-issues.md#doc-ap08-boundary-check-001).
The [AP08.2 checkpoint](AP08.2-checkpoint.md) records the completed minimal package,
role, activation, success, failure, validation, removal, and remaining-state journey.

## AP08.2 completion decision

AP08.2 is complete for its declared documentation scope. The maintained example and
journey checker use the real manifest schemas, role-closure rules, Foundation
registry and activation, and Nova execution path. The product page adds the physical
role edit and bundle inspection that the non-mutating automated check cannot perform
against the shipped role.

AP08.2 does not own `.swarm/pipeline.json` or an end-to-end pipeline run. Its
in-memory one-stage definition is only the local invocation harness for the plugin.
Project compilation, submission, service transport, and deployed pipeline execution
belong to their Use, Operate, and acceptance tasks.

The checkpoint keeps the local persistence limit explicit. BusyBox `flock` cannot
run the persistent journal path on this host, so the automated journey uses an
in-memory event journal. AP08.2 does not claim persistent recovery or live cluster
deployment.

## AP08.3 through AP08.6 completion decision

AP08.3 through AP08.6 are complete for their declared documentation scope and local
platform limits. The [combined checkpoint](AP08.3-AP08.6-checkpoint.md) records the
four reader results, executable documentation checks, focused contract and package
results, and unavailable host-dependent checks.

At that checkpoint, these parts did not claim the later host-extension, Worker Core,
Prism integration, complete lifecycle, or package-catalogue work. AP08.7 through
AP08.9 now supply that later work.

## AP08.7 through AP08.9 completion decision

AP08.7 through AP08.9 are complete for their declared documentation scope. The
[combined checkpoint](AP08.7-AP08.9-checkpoint.md) records the host and engine paths,
complete lifecycle procedures, 51 audited catalogue records, durable checks, local
package results, and exact environment limits.

The catalogue keeps authored guidance, generated facts, and dated verification
results in separate authorities. Eighteen local commands passed. Thirty-two package
commands were unavailable on the earlier checkpoint host because named external tools or GNU userland
features are absent. The Codex package has no package-local automated command.

At the AP08.7–AP08.9 checkpoint, AP08.10 still remained open for independent reader
acceptance. Those parts did not claim live host, browser, Trivy, Kubernetes, image,
or cluster acceptance. The decision below records the later AP08.10 result.

## Independent AP08.10 decision

The [independent reader checkpoint](AP08.10-checkpoint.md) supersedes the earlier
completion claims for overall acceptance. AP08 remains open for one path-bounded
read-only repeat review.
The reader found and corrected broken procedures, a non-executing observer check,
source-reference errors, and inaccurate package guidance. The catalogue now has
51 individually reviewed pages, but page coverage is not task acceptance.

The checkpoint now classifies its observations as documentation, implementation,
environment, or live work. Deployed tutorial submission, host/image acceptance,
and unavailable tools do not automatically block a documentation package.
External-effect reconciliation and unresolved runtime failures require canonical
product triage. The repeat reviewer must assess only the named AP08 documentation
paths and must not change repository content.

The strictly scoped repeat review then inspected all 69 allowed files and 491
pinned evidence objects at `f29921db7b5cd323334fc0e6c03c6007458b3e48`.
It passed all reader journeys and 50 catalogue entries. It rejected the
`kubeclaw.project-summary` entry because its authored operation note used the
artifact encoding marker as a configuration value. It also found one non-blocking
sentence that incorrectly assigned deployed submission evidence to AP08.

Both documentation findings are corrected in the next branch revision. The
catalogue checker now derives the project-summary configuration literal from its
schema and requires the prose to distinguish that literal from the artifact
encoding marker. AP08 remains open only for focused read-only confirmation of
these two corrections.
