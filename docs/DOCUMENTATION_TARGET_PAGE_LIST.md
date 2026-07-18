# Documentation Target Page List

Status: current inventory guide
Audience: maintainers, documentation agents

## Purpose

This page describes the active documentation shape. Current coverage and priorities live in:

- `docs/DOCUMENTATION_TOPIC_MAP.md`

Use `find docs -type f -not -path 'docs/archive/*' | sort` and `npm run docs:check` for current inventory and generated-reference checks.

## Active Sections

### Home And Maintenance Control

- `README.md`
- `DOCUMENTATION_REBUILD_PLAN.md`
- `DOCUMENTATION_AUDIT.md`
- `DOCUMENTATION_TARGET_PAGE_LIST.md`
- `DOCUMENTATION_WORKFLOW.md`
- `CONTRIBUTING.md`
- `ROADMAP.md`
- `open-issues.md`
- `future-implementation-ideas.md`

Historical planning references:

- `DOCUMENTATION_HANDOFF_PROMPT.md`
- `DOCUMENTATION_PLAN.md`

### Getting Started

- `getting-started/README.md`
- `getting-started/local-development.md`
- `getting-started/first-deployment.md`
- `getting-started/repository-tour.md`

### Concepts

- `concepts/README.md`
- `concepts/platform-model.md`
- `concepts/operator-model.md`
- `concepts/pipeline-model.md`
- `concepts/intent-driven-pipeline.md`
- `concepts/extensibility-model.md`

### Architecture

- `architecture/README.md`
- `architecture/system-overview.md`
- `architecture/component-map.md`
- `architecture/runtime-topology.md`
- `architecture/data-flow.md`
- `architecture/lifecycle-and-state.md`
- `architecture/security-model.md`
- `architecture/observability-model.md`

### Deployment

- `deployment/README.md`
- `deployment/deployment-overview.md`
- `deployment/setup-flow.md`
- `deployment/model-provider-prerequisites.md`
- `deployment/secrets.md`
- `deployment/infrastructure.md`
- `deployment/litellm.md`
- `deployment/tailscale-operator.md`
- `deployment/helm-chart.md`
- `deployment/values-files.md`
- `deployment/agent-deployments.md`
- `deployment/networking.md`
- `deployment/rbac-and-sandbox.md`
- `deployment/persistent-storage.md`
- `deployment/ci-and-image-publishing.md`
- `deployment/deployment-verification.md`
- `deployment/docker-images.md`

`deployment/docker-images.md` remains the image/runtime build authority and is kept separate from CI publishing procedures.

### Operators

- `operators/README.md`
- `operators/install-and-upgrade.md`
- `operators/running-the-platform.md`
- `operators/running-the-pipeline.md`
- `operators/observability.md`
- `operators/recovery-runbook.md`
- `operators/debugging.md`
- `operators/common-failures.md`
- `operators/failure-drills.md`
- `operators/maintenance.md`
- `operators/security-operations.md`
- `operators/final-preview-tailscale.md`

### Pipeline

- `pipeline/README.md`
- `pipeline/architecture.md`
- `pipeline/technical-implementation-map.md`
- `pipeline/end-to-end-flow.md`
- `pipeline/runtime-flow.md`
- `pipeline/modules-and-gates.md`
- `pipeline/workers-and-buster.md`
- `pipeline/failure-and-recovery.md`
- `pipeline/telemetry-and-artifacts.md`
- `pipeline/progress-json.md`
- `pipeline/configuration.md`

### Developers

- `developers/README.md`
- `developers/contributing.md`
- `developers/codebase-tour.md`
- `developers/adding-pipeline-features.md`
- `developers/adding-gates.md`
- `developers/hooks-and-plugins.md`
- `developers/replacing-agent-runtime.md`
- `developers/adding-buster-suites.md`
- `developers/adding-observability-sinks.md`
- `developers/linting-rules.md`
- `developers/adding-verification.md`
- `developers/testing-and-ci.md`
- `developers/documentation-conventions.md`

### Examples

- `examples/README.md`
- `examples/values/`
- `examples/secrets/`
- `examples/swarm-config/`
- `examples/progress-json/`

Example subdirectories now contain committed README/JSON/value examples in the active docs tree. Treat additional example files as future enrichment work only when the topic map or changelog identifies a source-backed gap.

### Reference

- `reference/README.md`
- `reference/cli.md`
- `reference/helm-values.md`
- `reference/environment-variables.md`
- `reference/secrets.md`
- `reference/openclaw-config.md`
- `reference/swarm-config.md`
- `reference/progress-json.md`
- `reference/status-and-artifacts.md`
- `reference/redis-streams.md`
- `reference/telemetry-events.md`
- `reference/observability-sinks.md`
- `reference/exit-codes.md`
- `reference/test-suites.md`
- `reference/linting-rules.md`
- `reference/buster-task-config.md`
- `reference/verification-commands.md`

Generated or partially generated reference pages are expected for CLI, Helm values, environment variables, secrets, OpenClaw config, swarm config, progress JSON, status/artifacts, Redis streams, telemetry events, observability sinks, exit codes, test suites, linting rules, Buster task config, and verification commands.

### Decisions

- `decisions/README.md`
- `decisions/architecture-decisions.md`
- `decisions/deployment-decisions.md`
- `decisions/pipeline-decisions.md`
- `decisions/security-decisions.md`

### Generated

- `generated/inventory/`
- `generated/reference/`

Generated directories now exist and are checked by `npm run docs:check` through `scripts/docs-inventory.mjs`, `scripts/docs-generate.mjs`, and `scripts/docs-check.mjs`. Future generated slices should be added with a stale-output check before active reference pages depend on them.

## First Rebuild Pass Order

1. Navigation and source inventory automation.
2. Deployment/operator docs backed by deploy script, secret setup, Helm, and manifest inventory.
3. Generated reference docs for the first automation slice.
4. Pipeline/developer docs backed by runtime source, tests, and generated inventories.
5. Diagrams, examples, failure drills, and readability pass.
