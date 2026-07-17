# Documentation rebuild plan

Status: historical rebuild plan; current maintenance context
Audience: maintainers, operators, documentation agents
Goal: rebuild the KubeClaw docs into rich, operator-grade documentation that is easy to read, easy to maintain, and difficult to drift away from the deployed system.

## Current Status

The rebuild plan below is retained for background and quality standards. It is no longer the only active execution tracker. The current source-grounded documentation coverage/enrichment work is tracked in:

- `docs/archive/audits/2026-06-12-documentation-coverage-audit.md`
- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/archive/audits/2026-06-12-documentation-enrichment-plan.md`
- `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`

Before following any phase guidance in this file, check those artifacts and the current docs tree. Many target pages and generated references now exist, and the active next actions are the remaining gaps in the topic map/changelog rather than every phase listed below.

## Goal tracking

This plan is intended to be executed as one long-running `/goal`. Each phase has a completion gate that must be satisfied before moving on. The goal is complete only when the final definition of done near the end of this file is satisfied.

## Intent

The current documentation tree has useful structure, but many pages are too thin and too template-driven. The rebuild should keep the good navigation shape while replacing thin pages with practical documentation that explains real behavior, exact operations, expected outcomes, and recovery paths.

The desired reader experience is closer to Kubernetes-style operator documentation:

- a reader understands what the system does before running commands
- tasks include exact commands and realistic examples
- procedures explain what should happen after each important step
- troubleshooting sections describe symptoms, likely causes, checks, and fixes
- reference pages are exact and maintained from source where possible
- target-state ideas are separated from current behavior

The operator should not need to inspect source code to answer routine deployment, verification, operation, debugging, or recovery questions.

## Publishing scope

For the current rebuild, the active publishing target is GitHub Markdown in this repository. The docs should render well in GitHub's Markdown viewer, with clear navigation from `docs/README.md`.

A future dedicated documentation site on `tdlabs.ch` can be planned later. The current rebuild should not spend time on site framework selection, website theming, versioned docs hosting, or tdlabs.ch deployment.

Explicitly out of scope for this rebuild unless maintainers later choose otherwise:

- formal documentation versioning and release alignment
- broad security policy docs beyond practical component secret setup and recovery
- formal docs ownership and review rules beyond the docs checks needed in CI

## Documentation principles

1. **Operator first**
   Write task and runbook pages around the operator's actual job: install, configure secrets, deploy infrastructure, deploy agents, verify health, run the pipeline, inspect failures, recover, upgrade, and tear down safely.

2. **Explain behavior, not only commands**
   Commands are not enough. Pages should explain what the command does, what system behavior it triggers, what success looks like, what partial success looks like, and what to do next.

3. **Use source references only when useful**
   Do not force a source list onto every page. Add source links or a short source list only when a page makes specific claims about code, scripts, manifests, config keys, generated schemas, or external references.

4. **Separate concepts, tasks, and reference**
   Concept pages explain the model. Operator pages teach procedures. Reference pages specify exact values. Decision pages explain why important choices exist.

5. **Prefer practical examples**
   Include realistic commands, example output shapes, namespace examples, secret examples, status examples, and failure examples.

6. **Document observability deeply**
   Operators should know where to look first, which logs/status/artifacts matter, what telemetry exists, and how to route telemetry to custom sinks where the system supports it.

7. **Reference upstream docs instead of duplicating them**
   Link to upstream documentation where another project is the better source of truth. This includes OpenClaw for model/provider setup and OpenClaw-owned behavior, Tailscale for tailnet/operator behavior, LiteLLM for proxy/provider behavior, Qdrant/PostgreSQL/Redis for infrastructure behavior, and other component docs where useful. KubeClaw docs should explain how KubeClaw uses those prerequisites and what the operator must configure locally.

8. **Do not hide uncertainty**
   If behavior is planned but not implemented, label it clearly as target state or move it to future ideas. If behavior is unclear, open an issue in the docs backlog instead of guessing.

9. **Automate drift-prone facts**
   CLI flags, Helm values, environment variables, rendered manifests, secret names, image names, CI workflows, status values, artifact paths, and verification commands should be extracted or checked automatically where possible.

10. **Keep behavior source-backed and tested**
    Behavior docs should be backed by code, manifests, generated inventory, scripts, tests, or verified runtime checks wherever needed. Do not document guessed behavior as fact. When docs describe operator-visible behavior, include the test, check, command, or source that proves it when practical.

## Target documentation shape

Keep the current top-level tree, but improve the intent of each section:

```text
docs/
  README.md
  DOCUMENTATION_REBUILD_PLAN.md
  DOCUMENTATION_WORKFLOW.md
  CONTRIBUTING.md
  ROADMAP.md
  open-issues.md
  future-implementation-ideas.md

  getting-started/
    README.md
    local-development.md
    first-deployment.md
    repository-tour.md

  concepts/
    README.md
    platform-model.md
    operator-model.md
    pipeline-model.md
    intent-driven-pipeline.md
    extensibility-model.md

  architecture/
    README.md
    system-overview.md
    component-map.md
    runtime-topology.md
    data-flow.md
    lifecycle-and-state.md
    security-model.md
    observability-model.md

  deployment/
    README.md
    deployment-overview.md
    setup-flow.md
    model-provider-prerequisites.md
    secrets.md
    infrastructure.md
    litellm.md
    tailscale-operator.md
    helm-chart.md
    values-files.md
    agent-deployments.md
    networking.md
    rbac-and-sandbox.md
    persistent-storage.md
    ci-and-image-publishing.md
    deployment-verification.md

  operators/
    README.md
    install-and-upgrade.md
    running-the-platform.md
    running-the-pipeline.md
    observability.md
    recovery-runbook.md
    debugging.md
    common-failures.md
    failure-drills.md
    maintenance.md
    security-operations.md
    final-preview-tailscale.md

  pipeline/
    README.md
    architecture.md
    runtime-flow.md
    modules-and-gates.md
    workers-and-buster.md
    failure-and-recovery.md
    telemetry-and-artifacts.md
    progress-json.md
    configuration.md

  developers/
    README.md
    codebase-tour.md
    contributing.md
    adding-pipeline-features.md
    adding-gates.md
    hooks-and-plugins.md
    replacing-agent-runtime.md
    adding-buster-suites.md
    adding-observability-sinks.md
    linting-rules.md
    adding-verification.md
    testing-and-ci.md
    documentation-conventions.md

  examples/
    README.md
    values/
    secrets/
    swarm-config/
    progress-json/

  reference/
    README.md
    cli.md
    helm-values.md
    environment-variables.md
    secrets.md
    openclaw-config.md
    swarm-config.md
    progress-json.md
    status-and-artifacts.md
    redis-streams.md
    telemetry-events.md
    observability-sinks.md
    exit-codes.md
    test-suites.md
    linting-rules.md
    buster-task-config.md
    verification-commands.md

  decisions/
    README.md
    architecture-decisions.md
    deployment-decisions.md
    pipeline-decisions.md
    security-decisions.md

  generated/
    inventory/
    reference/
```

The exact file list can change during the audit. The important rule is that the docs remain navigable by job-to-be-done, not by whatever source file happened to produce a fact.

## Page standards

### Operator task page

Use this shape for deployment and operations tasks:

```text
# Task name

What this page helps you do.

## When to use this
## Before you begin
## What happens
## Procedure
## Verify the result
## Expected output or state
## Common failures
## Recovery
## Related reference
## Sources
```

`Sources` is optional. Use it only for specific code, script, manifest, config, generated inventory, or external documentation references.

### Runbook page

Use this shape for incident and recovery pages:

```text
# Runbook name

## Symptoms
## Impact
## Fast checks
## Likely causes
## Recovery procedure
## Verification
## Escalation
## Prevention
## Related reference
```

### Architecture page

Use this shape for system explanation:

```text
# Architecture topic

## Overview
## Components
## Runtime flow
## State and ownership
## Failure behavior
## Operator implications
## Related tasks
## Sources
```

### Reference page

Use this shape for generated or source-backed reference:

```text
# Reference topic

## Summary
## Values / fields / flags
## Defaults
## Examples
## Used by
## Generated from
```

## Phase 0: Define the standard

Deliverables:

- finalize the page standards above
- update `docs/developers/documentation-conventions.md`
- define what counts as current behavior, target state, and open issue
- define where optional source references belong
- define examples style: commands, expected state, and troubleshooting examples

Completion gate:

- page standards are written into `docs/developers/documentation-conventions.md`
- optional source-reference rules are documented
- templates or template sections exist for operator tasks, runbooks, architecture pages, reference pages, and troubleshooting entries
- at least one existing thin page can be reviewed against the new standard without requiring extra explanation
- maintainers agree that future docs work has a clear quality bar

## Phase 1: Audit the current docs

Create a page-by-page audit of the existing `docs/` tree.

For each page, decide:

- keep and expand
- split
- merge
- archive
- regenerate from source
- rewrite manually

Audit dimensions:

- audience is clear
- page has enough practical operator detail
- page distinguishes current behavior from target state
- page includes commands where needed
- page includes expected results where needed
- page includes troubleshooting where needed
- page links to the right reference docs
- page has source references only where useful

Deliverables:

- `docs/DOCUMENTATION_AUDIT.md`
- updated docs backlog in `docs/open-issues.md` if the audit finds unclear behavior

Completion gate:

- every active Markdown page under `docs/` has an audit decision
- every decision has a short reason
- every page that needs source verification, generation, or operator examples is marked accordingly
- pages that should be archived, split, merged, or regenerated are explicitly listed
- the first two rebuild work packages are ordered and ready to execute
- unclear behavior found during the audit is captured in `docs/open-issues.md` or a dedicated docs backlog

## Phase 2: Rebuild the information architecture

Normalize navigation around reader intent.

Work items:

- add `docs/concepts/` if it helps separate mental models from procedures
- keep operator pages task-driven
- keep reference pages dry and exact
- move historical or stale material out of the active reader path
- add landing pages that explain where to go next
- add a lightweight roadmap page for future direction without mixing target-state work into current operator docs
- add a contribution guide for docs, pipeline features, gates, hooks, plugins, test suites, linting rules, and examples

Operator-first navigation should make these paths obvious:

- first deployment
- setup and secrets
- example configuration
- model provider prerequisites
- deploy infrastructure
- deploy LiteLLM
- deploy Tailscale operator
- deploy Nova and Buster
- verify deployment
- run the pipeline
- debug a failed pipeline
- recover a stuck or failed run
- validate docs with failure drills
- inspect artifacts and telemetry
- operate final previews

Developer and contributor navigation should make these paths obvious:

- how to contribute docs or code
- how the pipeline is extendable
- how to add custom gates
- how hooks and plugins fit into the pipeline
- how to replace or adapt the agent runtime
- how to adapt the intent-driven pipeline beyond application delivery
- how to add test suites, linting rules, templates, and examples

Deliverables:

- updated section landing pages
- final target page list for the first rebuild pass
- `docs/ROADMAP.md`
- `docs/CONTRIBUTING.md` or a clearly linked contributor guide

Completion gate:

- section landing pages exist or are updated for the active docs tree
- the active tree has a documented purpose for each major section
- the common operator paths listed in this phase are reachable from the docs home page within two clicks
- the contributor paths listed in this phase are reachable from the docs home page or developer landing page
- stale historical material is outside the active reader path or clearly labeled
- roadmap content is clearly marked as planned/future direction, not current behavior
- the target page list for the first rebuild pass is final enough to start writing without re-litigating navigation

## Phase 3: Build source inventory automation

Create tooling that extracts drift-prone facts from the repository and deployment files.

Candidate output path:

```text
docs/generated/inventory/
```

Inventory targets:

- `scripts/deploy.sh` commands and environment variables
- `scripts/setup.sh` legacy bootstrap behavior and guardrails
- `my-values/setup-secrets.sh` secret setup modes, inputs, generated secrets, and optional components
- Helm values from `charts/kubeclaw/` and `my-values/`
- rendered Nova and Buster manifests
- infrastructure manifests and values for Redis, Qdrant, PostgreSQL, LiteLLM, and Tailscale
- pipeline CLI flags
- environment variables from config loaders
- OpenClaw and swarm config fields
- progress JSON fields and examples
- hook and plugin extension points
- agent runtime boundaries and replacement points
- Buster test suites and task config
- linting rules and customization points
- observability sinks and telemetry routing
- Redis streams, status keys, and artifact paths
- telemetry event names and payload shapes
- CI workflows and image publishing behavior
- verification commands and smoke checks
- known status and exit codes

Suggested generated files:

```text
docs/generated/inventory/deploy-script.json
docs/generated/inventory/secret-setup.json
docs/generated/inventory/helm-values.json
docs/generated/inventory/rendered-manifests.json
docs/generated/inventory/pipeline-cli.json
docs/generated/inventory/environment-variables.json
docs/generated/inventory/status-and-artifacts.json
docs/generated/inventory/redis-streams.json
docs/generated/inventory/telemetry-events.json
docs/generated/inventory/observability-sinks.json
docs/generated/inventory/test-suites.json
docs/generated/inventory/linting-rules.json
docs/generated/inventory/swarm-config.json
docs/generated/inventory/progress-json.json
docs/generated/inventory/ci-images.json
docs/generated/inventory/verification-commands.json
```

Deliverables:

- inventory generator scripts
- generated JSON inventories
- documentation on how to regenerate them

Completion gate:

- at least one docs inventory command exists and is documented
- deployment script and secret setup inventory are generated from source rather than manually copied
- generated inventory files are written under `docs/generated/inventory/`
- the inventory output is stable enough to diff in git
- there is a local check that detects stale generated inventory
- the next inventory targets are listed with owner/order so automation can expand incrementally

## Phase 4: Replace the thin template

Create practical templates that force useful content.

Templates to add:

- operator task template
- incident runbook template
- deployment component template
- architecture explanation template
- reference page template
- troubleshooting entry template

The templates should require:

- purpose
- audience
- prerequisites
- exact commands
- expected state
- verification
- common failure modes
- recovery steps
- related pages

The templates should not require a source list unless the page references specific implementation details.

Deliverables:

- `docs/developers/documentation-conventions.md` rewrite
- `docs/developers/templates/` or equivalent template section

Completion gate:

- documentation conventions include the new templates or link to them
- each template includes required sections for purpose, prerequisites, procedure, verification, expected state, common failures, and recovery where relevant
- templates explicitly avoid mandatory source sections unless implementation details are referenced
- at least one operator page and one runbook are rewritten or drafted using the new templates
- reviewers can reject a thin page by pointing to a specific convention or template rule

## Phase 5: Generate and refresh reference docs

Use the inventory from Phase 3 to maintain exact reference pages.

Reference pages to generate or partially generate:

- CLI commands and flags
- deployment script commands and env vars
- secret names, keys, and setup modes
- Helm values
- environment variables
- OpenClaw config
- swarm config
- progress JSON
- Redis streams
- telemetry events
- observability sinks
- Buster test suites and task config
- linting rules
- status and artifact paths
- exit codes
- swarm.config.json examples and fields
- verification commands

Generated docs should be clearly marked as generated or inventory-backed, and manual narrative should live outside generated blocks.

Deliverables:

- generation script
- regenerated `docs/reference/**`
- CI check for stale generated docs

Completion gate:

- generated or inventory-backed reference docs exist for the first automation slice
- generated sections are clearly marked so maintainers know what not to hand-edit
- manual narrative is separated from generated blocks
- local docs generation produces no unexpected diff after a clean run
- stale generated reference output fails a local check
- the remaining non-generated reference pages have an explicit plan to generate, partially generate, or keep manual

## Phase 6: Rebuild deployment and operator docs

This is the highest-value writing phase.

Priority pages:

- first deployment from a clean cluster
- complete setup flow
- example config selection for local/dev/staging-like deployments
- model provider prerequisites and OpenClaw integration setup
- secrets setup guide
- deploy infrastructure
- deploy LiteLLM
- deploy Tailscale Kubernetes Operator
- deploy Nova and Buster agents
- verify deployment health
- run the pipeline
- resume the pipeline
- observe the platform and pipeline
- inspect artifacts and status
- debug stuck runs
- recover failed gates
- operate final previews
- rotate secrets
- upgrade safely
- teardown safely

The setup guide must explicitly explain:

- `scripts/setup.sh` is a guarded legacy Git repository bootstrap, not the normal platform deployment flow
- the normal platform path starts with `scripts/deploy.sh setup`
- when to run `scripts/deploy.sh secrets`
- what `my-values/setup-secrets.sh` creates
- which secrets are required for which components
- which secrets are optional
- how `KUBECLAW_DEPLOY_LITELLM`, `KUBECLAW_DEPLOY_POSTGRESQL`, `KUBECLAW_DEPLOY_QDRANT`, and `TAILSCALE_OPERATOR_ENABLED` change prompts and deployment behavior
- what to deploy before what
- what successful setup looks like
- how to recover from missing or incomplete secrets

The model provider and OpenClaw integration guide must cover:

- which model/provider setup belongs in OpenClaw documentation
- which KubeClaw secrets or values depend on that setup
- links to the relevant OpenClaw provider documentation instead of copying provider-specific instructions wholesale
- how operators verify that KubeClaw agents can reach the configured provider path
- common failures caused by missing provider credentials, invalid model names, or unreachable LiteLLM/OpenClaw endpoints

The LiteLLM guide must cover:

- when LiteLLM is deployed
- required secrets
- PostgreSQL relationship
- config map and deployment behavior
- how agents use LiteLLM
- verification commands
- common failures

The Tailscale operator guide must cover:

- tailnet prerequisites
- `operator-oauth` secret
- install path through `scripts/deploy.sh tailscale` and `scripts/deploy.sh infra`
- ingress class behavior
- final preview relationship
- verification commands
- common failures
- links to relevant Tailscale operator and tailnet documentation where upstream docs are the better source of truth

Infrastructure component guides must cover:

- links to upstream docs for LiteLLM, Qdrant, PostgreSQL, Redis, Tailscale, and other deployed components where relevant
- which behavior is upstream component behavior versus KubeClaw deployment behavior
- which values, secrets, services, checks, and recovery steps are KubeClaw-specific

Deliverables:

- rebuilt deployment docs
- rebuilt operator docs
- example configuration docs
- realistic copy/paste examples
- cross-links into generated reference pages

Completion gate:

- the clean-cluster deployment path is documented from prerequisites through verification
- setup, model provider prerequisites, secrets, infrastructure, LiteLLM, Tailscale operator, agents, and verification each have practical operator pages
- example config pages exist for common local/dev/staging-like scenarios and are clearly marked as examples, not production defaults
- the docs clearly distinguish `scripts/setup.sh` legacy repository bootstrap from the normal `scripts/deploy.sh` platform deployment flow
- required and optional secrets are documented with component ownership, creation path, verification command, and recovery steps
- OpenClaw, Tailscale, LiteLLM, Qdrant, PostgreSQL, Redis, and other upstream documentation is linked where it is the better source of truth
- LiteLLM deployment includes prerequisites, secrets, PostgreSQL relationship, install command, verification, and common failures
- Tailscale operator deployment includes tailnet prerequisites, OAuth secret, install command, ingress class behavior, final preview relationship, verification, and common failures
- infrastructure component docs distinguish upstream component behavior from KubeClaw-specific deployment behavior
- operator pages include realistic copy/paste commands and expected states
- at least one maintainer/operator can dry-run the documented flow against the repo and identify no missing mandatory step

## Phase 7: Rebuild pipeline docs

Explain the pipeline deeply enough that an operator understands runtime behavior.

Topics to cover:

- what starts a pipeline run
- project and repo selection
- module lifecycle
- gate lifecycle
- how to extend the pipeline with custom gates
- how to extend the pipeline through hooks and plugins
- where the pipeline is intentionally replaceable or adaptable
- how to replace or adapt the agent runtime for something other than OpenClaw
- approval behavior
- Buster worker behavior
- available Buster test suites
- how to add Buster test suites
- linting rules and how to add or customize them
- status transitions
- retry and resume behavior
- failure classification
- artifacts and summaries
- progress.json structure, examples, and interpretation
- swarm.config.json examples and field descriptions
- telemetry events, observability sinks, and custom sink extension points
- Discord/OpenClaw/Kubernetes interactions
- what the operator should monitor
- how to decide whether to resume, rerun, recover, or escalate

Deliverables:

- expanded `docs/pipeline/**`
- rebuilt `docs/operators/running-the-pipeline.md`
- rebuilt pipeline failure and recovery runbooks
- developer docs for custom gates, test suites, linting rules, and observability sinks
- developer docs for hooks, plugins, and agent runtime replacement/adaptation
- reference docs for `progress.json`, `swarm.config.json`, test suites, linting rules, and telemetry/observability sinks

Completion gate:

- pipeline architecture, runtime flow, modules/gates, workers/Buster, failure/recovery, telemetry/artifacts, and configuration pages are expanded beyond command summaries
- `docs/operators/running-the-pipeline.md` explains start, status, resume, expected output, terminal states, and escalation paths
- custom gate extension docs include lifecycle, config, implementation shape, operator impact, examples, and failure modes
- hooks and plugin docs describe the extension points, lifecycle, contracts, examples, failure behavior, and when to use each mechanism
- agent runtime replacement docs explain what is OpenClaw-specific, what is pipeline-generic, which contracts must be preserved, and how another runtime could be integrated
- Buster test suite docs describe each suite, when it runs, required inputs, outputs, artifacts, failure behavior, and how to add a suite
- linting docs describe available rules, defaults, customization points, failure output, and how to add rules
- `progress.json` docs include field-level reference, realistic complete examples, partial/in-progress examples, failed-run examples, and interpretation guidance
- `swarm.config.json` docs include field descriptions, realistic examples, defaults, validation behavior, and relationship to OpenClaw/swarm runtime behavior
- observability docs cover logs, statuses, telemetry, artifacts, custom sink extension, verification, and troubleshooting
- status transitions, retry/resume behavior, artifacts, summaries, and failure classes are documented with practical examples
- operator runbooks map common symptoms to checks, logs, artifacts, and recovery actions
- Discord, OpenClaw, Kubernetes, Nova, and Buster responsibilities are clearly separated
- a reader can follow one pipeline run from start to terminal state without source-code inspection

## Phase 8: Add useful diagrams

Add diagrams where they clarify real operations.

Preferred formats:

- SVG diagrams committed as editable source assets, preferred while GitHub Markdown is the active publishing target
- HTML/CSS diagrams embedded in Markdown only where GitHub renders them acceptably, or later when a dedicated docs site exists
- generated static images only when the source remains maintainable

Diagrams to add:

- full deployment topology
- infrastructure dependency graph
- secret flow
- pipeline runtime flow
- module and gate lifecycle
- Buster worker flow
- final preview and Tailscale ingress flow
- failure and recovery decision flow

Avoid decorative diagrams. Every diagram should help an operator or maintainer answer a real question.

Deliverables:

- diagrams embedded in architecture, deployment, pipeline, and operator pages

Completion gate:

- diagrams exist for deployment topology, infrastructure dependencies, secret flow, pipeline runtime flow, Buster worker flow, final preview/Tailscale flow, and failure/recovery decision flow
- each diagram is embedded near the relevant explanation instead of isolated in an orphan page
- each diagram has a short text explanation for readers who skim or cannot render the visual format
- diagrams use current component names and avoid target-state behavior unless explicitly labeled
- diagram source is maintainable in the repository, not only exported as an opaque image
- reviewers can trace each diagram to a documented page or generated inventory source where needed

## Phase 9: Add docs maintenance automation

Add checks that keep docs maintainable.

Checks to consider:

- generated inventory is current
- generated reference docs are current
- links are valid
- active pages do not reference missing files
- pages do not claim target-state behavior as current behavior
- deployment/config/source changes trigger docs review
- no generated docs were manually edited outside allowed regions
- required operator pages have procedure, verification, and troubleshooting sections

Potential commands:

```bash
npm run docs:inventory
npm run docs:generate
npm run docs:check
```

Deliverables:

- docs check scripts
- CI workflow integration through GitHub Actions or the repository's active CI system
- contributor instructions for updating docs

Completion gate:

- `npm run docs:inventory`, `npm run docs:generate`, and `npm run docs:check` or equivalent commands exist
- docs checks run locally and in GitHub Actions or the repository's active CI pipeline
- stale generated inventory or generated reference docs fail with an actionable message
- link/reference checks cover active docs pages
- docs conventions explain when maintainers must update docs for deployment, config, source, or workflow changes
- docs conventions require behavior claims to be backed by code, generated inventory, tests, or verified commands where practical
- CI or contributor guidance makes docs maintenance part of normal code review

## Phase 10: Validate docs with examples and failure drills

Use examples and drills to prove the docs are complete enough to operate from.

Work items:

- add example configs for common local/dev/staging-like setups
- add safe example secrets templates with placeholder values only
- add realistic `progress.json` examples for successful, in-progress, and failed runs
- add realistic `swarm.config.json` examples
- define failure drills for missing secrets, failed LiteLLM connectivity, failed Tailscale operator setup, stuck pipeline status, failed gates, failed Buster suites, broken lint rules, and missing artifacts
- run or mentally dry-run the operator docs against those scenarios and update missing steps
- capture any untestable or unclear behavior in `docs/open-issues.md`

Deliverables:

- `docs/examples/**`
- `docs/operators/failure-drills.md`
- validated runbooks for the most important deployment and pipeline failures

Completion gate:

- example configs exist for the supported setup shapes and are clearly marked as examples
- `progress.json` examples cover success, in-progress, failure, and partial artifact states
- `swarm.config.json` examples cover the common operator paths
- failure drills exist for setup/secrets, LiteLLM, Tailscale, pipeline stuck states, failed gates, Buster failures, lint failures, and missing artifacts
- each drill maps symptom, setup, expected failure, checks, recovery, and verification
- running or dry-running the drills does not reveal missing mandatory operator instructions
- unresolved gaps from drills are captured in `docs/open-issues.md`

## Phase 11: Style and readability pass

After facts and procedures are correct, polish the docs.

Work items:

- make section landing pages clean and useful
- reduce duplicate explanations
- add direct cross-links
- improve headings
- add practical examples
- shorten long paragraphs
- keep reference pages dry
- keep operator pages actionable
- ensure pages are pleasant to scan

Deliverables:

- final readability pass over active docs
- updated docs README

Completion gate:

- the docs home page and section landing pages guide readers to common tasks quickly
- active pages use consistent headings and page shape without feeling mechanically templated
- long pages are split or structured for scanning
- duplicate explanations are reduced and replaced with links
- operator pages remain actionable and reference pages remain exact
- examples are realistic and not placeholder-only
- a final pass confirms the active docs tree feels clear, rich, calm, and not skeletal

## Final definition of done

The documentation rebuild goal is complete when all phase completion gates are satisfied and the active docs let an operator do the following without source-code inspection:

- understand what KubeClaw deploys and how the major components fit together
- prepare prerequisites for Kubernetes, registry access, model/provider access, Discord/OpenClaw integration, LiteLLM, infrastructure components, and Tailscale final previews, with links to upstream docs where upstream projects are the source of truth
- run the setup and secret creation flow with confidence
- choose and adapt example configs for common local/dev/staging-like deployments
- know which secrets are required, which are optional, and which component uses each one
- deploy infrastructure, LiteLLM, Tailscale operator, Nova, and Buster in the correct order
- verify the deployment using documented commands and expected states
- run, monitor, resume, observe, and inspect the pipeline
- debug common deployment and pipeline failures using documented symptoms, checks, and recovery steps
- validate important recovery paths through documented failure drills
- operate final previews and understand the Tailscale ingress path
- extend the pipeline with custom gates, add Buster test suites, and add or customize linting rules using documented examples
- configure and extend observability sinks where supported
- understand `progress.json` and `swarm.config.json` through field references and realistic examples
- find exact reference values for CLI flags, environment variables, Helm values, secrets, status/artifact fields, Redis streams, telemetry events, observability sinks, test suites, linting rules, and verification commands
- maintain docs by running documented generation/check commands

The active docs should also let a developer or contributor do the following without reverse-engineering the code first:

- understand the roadmap and distinguish future direction from current behavior
- contribute docs, examples, gates, hooks, plugins, test suites, linting rules, or pipeline features
- understand where the pipeline is extendable and which contracts extension points must preserve
- adapt or replace the agent runtime when the pipeline should target something other than OpenClaw
- understand how the intent-driven pipeline can apply beyond application delivery, such as infrastructure or other intent-based workflows

The roadmap should include, at minimum:

- Clawdeck observability
- design agent and design flow
- improved linting
- code mapping and autoreview features
- parallel agents
- parallel pipelines
- improved pipeline reviews and auto-improvement
- improved templates
- improved prompt engineering
- additional intent-driven use cases beyond application delivery, including infrastructure-oriented workflows
- pentest/security agent

The final closeout should include:

- a clean or intentionally documented `git status --short`
- successful docs generation/check commands
- successful behavior verification commands or documented reasons where a behavior cannot be tested automatically
- a summary of generated docs automation coverage
- a summary of manual pages rebuilt
- a list of remaining known limitations, if any, in `docs/open-issues.md` or `docs/future-implementation-ideas.md`
- maintainer confirmation that the docs are ready to be treated as the active operator documentation set
