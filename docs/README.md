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

## Current Completion State

The active tree is source-backed by repository code, manifests, generated inventory, verification tests, or upstream documentation where the upstream project owns the behavior.

The docs deliberately separate current behavior from unresolved readiness gaps:

- source-verified local quickstart exists for Helm rendering and deployment truth verification
- complete live clean-cluster quickstart remains open until prerequisites and secret provisioning are fully source-verified
- root `LICENSE` is not present because maintainers have not selected license terms
- public security disclosure contact is still a maintainer decision
- NodePort exposure, privileged Buster, version compatibility gaps, and missing Kubernetes-native observability are tracked as current risks or future work
- generated docs automation covers CLI, Helm values, environment variables, secrets, verification commands, and source inventory; remaining reference automation opportunities are tracked rather than presented as current behavior

## Archive boundary

`docs/archive/` contains historical reviews, retired root docs, migration notes, plans, static artifacts, and deployment audits. Archive files can be useful context, but they are not current behavior authority unless an active doc points to a specific source-backed item.

## Source Of Truth Map

| Reader question | Start here | Source owner | Proof command |
| --- | --- | --- | --- |
| What is the platform and where do I begin? | `getting-started/README.md`; `getting-started/repository-tour.md` | root `README.md`, `docs/README.md`, `scripts/docs-check.mjs` | `npm run docs:check` |
| How is the runtime deployed? | `deployment/README.md`; `deployment/deployment-overview.md`; `operators/install-and-upgrade.md` | `scripts/deploy.sh`, `charts/kubeclaw/templates/*.yaml`, `my-values/*.yaml` | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| What state does the pipeline own? | `architecture/lifecycle-and-state.md`; `reference/status-and-artifacts.md` | `skills/nova/pipeline/services/status-store.ts`, `skills/nova/pipeline/services/artifact-bundle.ts` | `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` |
| How does Buster consume work? | `pipeline/workers-and-buster.md`; `reference/buster-task-config.md`; `reference/redis-streams.md` | `skills/buster/pipeline/services/task-queue.ts`, `task-validation.ts`, `task-completion.ts` | `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` |
| What references are generated? | `generated/inventory/README.md`; `generated/reference/README.md`; `reference/README.md` | `scripts/docs-inventory.mjs`, `scripts/docs-generate.mjs`, `docs/generated/inventory/*.json` | `npm run docs:inventory:check && npm run docs:generate:check` |

## Failure Signals

- Generated reference pages differ after `npm run docs:generate`.
- A page links to `docs/archive/` as active behavior authority without saying why.
- An operator page names a command but not the expected resource, artifact, or state to inspect next.
- A live-only behavior such as provider readiness, Tailscale tailnet policy, or CNI enforcement is documented as repo-proven.

Those failures mean the reader's next question is still unanswered. Fix the smallest page that owns the claim rather than duplicating detail into every index.
