# KubeClaw Documentation

Status: current
Audience: operators, maintainers, developers

## Purpose

This is the active documentation home for KubeClaw. It separates current source-backed documentation from archived historical material.

## Sections

- [Getting started](getting-started/README.md) - local orientation, repository tour, and first deployment path.
- [Concepts](concepts/README.md) - platform, operator, pipeline, intent, and extensibility models.
- [Architecture](architecture/README.md) - system overview, topology, data flow, lifecycle, security, and observability.
- [Deployment](deployment/README.md) - Helm chart, values, images, infrastructure, secrets, networking, RBAC, storage, CI, and verification.
- [Pipeline](pipeline/README.md) - Nova end-to-end flow, technical implementation map, runtime flow, gates, workers, recovery, telemetry, and configuration.
- [Operators](operators/README.md) - installation, running, debugging, recovery, maintenance, and security operations.
- [Developers](developers/README.md) - codebase tour, adding features, adding gates, adding Buster suites, verification, and documentation conventions.
- [Examples](examples/README.md) - safe values, secrets, swarm config, and progress JSON examples.
- [Reference](reference/README.md) - values, environment variables, OpenClaw config, swarm config, progress JSON, artifacts, Redis streams, telemetry, process exits, and verification commands.
- [Decisions](decisions/README.md) - source-backed decision records.
- [Roadmap](ROADMAP.md) - planned direction separated from current behavior.
- [Contributing](CONTRIBUTING.md) - docs-local contribution paths.
- [Documentation rebuild plan](DOCUMENTATION_REBUILD_PLAN.md) - phased plan for rebuilding thin docs into rich, operator-grade documentation with maintenance automation.
- [Documentation audit](DOCUMENTATION_AUDIT.md) - page-by-page rebuild decisions.
- [Documentation target page list](DOCUMENTATION_TARGET_PAGE_LIST.md) - active target tree for the first rebuild pass.
- [Open issues](open-issues.md) - factual unresolved problems.
- [Future implementation ideas](future-implementation-ideas.md) - candidates that are not committed work.

## Common Operator Paths

- First deployment: [Getting started](getting-started/README.md) -> [First deployment](getting-started/first-deployment.md)
- Setup and secrets: [Deployment](deployment/README.md) -> [Setup flow](deployment/setup-flow.md) and [Secrets](deployment/secrets.md)
- Model/provider prerequisites: [Deployment](deployment/README.md) -> [Model provider prerequisites](deployment/model-provider-prerequisites.md)
- Infrastructure, LiteLLM, and Tailscale: [Deployment](deployment/README.md) -> [Infrastructure](deployment/infrastructure.md), [LiteLLM](deployment/litellm.md), and [Tailscale operator](deployment/tailscale-operator.md)
- Nova and Buster agents: [Deployment](deployment/README.md) -> [Agent deployments](deployment/agent-deployments.md)
- Verify deployment: [Deployment](deployment/README.md) -> [Deployment verification](deployment/deployment-verification.md)
- Run and recover the pipeline: [Operators](operators/README.md) -> [Running the pipeline](operators/running-the-pipeline.md) and [Recovery runbook](operators/recovery-runbook.md)
- Understand pipeline internals: [Pipeline](pipeline/README.md) -> [Technical implementation map](pipeline/technical-implementation-map.md)
- Inspect observability and artifacts: [Operators](operators/README.md) -> [Observability](operators/observability.md)
- Operate final previews: [Operators](operators/README.md) -> [Final preview Tailscale](operators/final-preview-tailscale.md)

## Common Contributor Paths

- Contribute docs or code: [Contributing](CONTRIBUTING.md) and [Developer guides](developers/README.md)
- Add pipeline features or gates: [Developers](developers/README.md) -> [Adding pipeline features](developers/adding-pipeline-features.md) and [Adding gates](developers/adding-gates.md)
- Add hooks, plugins, or runtime adapters: [Developers](developers/README.md) -> [Hooks and plugins](developers/hooks-and-plugins.md) and [Replacing agent runtime](developers/replacing-agent-runtime.md)
- Add Buster suites, lint rules, or observability sinks: [Developers](developers/README.md) -> [Adding Buster suites](developers/adding-buster-suites.md), [Linting rules](developers/linting-rules.md), and [Adding observability sinks](developers/adding-observability-sinks.md)
- Add verification: [Developers](developers/README.md) -> [Adding verification](developers/adding-verification.md)