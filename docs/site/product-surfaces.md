# Product Surface Map

Status: implemented inventory with stated depth limits
Audience: reader, operator, plugin author, maintainer, documentation owner
Owner: documentation architecture
Evidence: package.json; packaging/runtime/package-ownership.json; packaging/runtime/roles; skills/common/plugin-runtime; skills/nova; skills/worker; skills/buster; skills/prism; contracts; charts; scripts
Applies to: current repository product and platform surfaces
Last verified: source inspection on 2026-09-17

## Purpose

This map lists every public surface family that needs documentation.
It gives each family one reading destination and one source authority.

This page is a coverage map, not a replacement for the linked guides.
A detailed page explains behavior and procedures.
An indexed page identifies the authority while its complete reference remains unavailable.

## Coverage Labels

| Label | Meaning |
| --- | --- |
| Detailed | The linked site explains the main behavior, boundary, and reader action. |
| Partial | The linked site explains useful parts, but it does not cover every field or path. |
| Indexed | This map identifies the surface and source authority. A complete reader reference is not available. |

## Control And Execution

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-CTL-01 | Product purpose and system boundary | [Architecture entry](understand/README.md) | [Runtime roles](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/packaging/runtime/roles) | Detailed |
| SUR-CTL-02 | Project compiler and project input | [Configure and Operate](use/operate.md#understand-the-two-command-forms) | [Project compiler](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/project/compiler.ts) | Partial |
| SUR-CTL-03 | Nova Core lifecycle and scheduling | [Components and authority](understand/components-and-authority.md) | [Nova Core](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/core) | Partial |
| SUR-CTL-04 | Plugin discovery, grants, activation, and isolation | [Extension decision guide](extend/README.md) | [Plugin runtime](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime) | Partial |
| SUR-CTL-05 | Worker Core admission and attempt execution | [Components and authority](understand/components-and-authority.md#worker-core-the-neutral-attempt-controller) | [Worker Core](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/worker/core) | Partial |
| SUR-CTL-06 | Runtime roles and package ownership | [Deployment and trust](understand/deployment-and-trust.md) | [Package ownership](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/packaging/runtime/package-ownership.json) | Partial |
| SUR-CTL-07 | Request, state, retry, wait, and recovery | [Request, state, and recovery](understand/request-state-recovery.md) | [Nova execution](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/core/execution) | Detailed |

## Specialists And Quality Gates

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-SPC-01 | Forge implementation work | [Components and authority](understand/components-and-authority.md) | [Implementation agent](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/plugins/implementation-agent) | Partial |
| SUR-SPC-02 | Echo analysis and findings | [Echo decisions](decisions/echo.md) | [Review plugin](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/plugins/review) | Partial |
| SUR-SPC-03 | Prism design, approval, and publication | [Prism decisions](decisions/prism.md) | [Prism](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/prism) | Partial |
| SUR-SPC-04 | Buster test-plan execution and result import | [Buster extension guide](extend/buster.md) | [Buster Engine](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/buster/engine) | Partial |
| SUR-SPC-05 | Twelve Buster suite definitions | [Buster extension guide](extend/buster.md) | [Suite contracts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts/pipeline-test-gate/v1/suites) | Partial |
| SUR-SPC-06 | Lint policy, tools, rules, baselines, and waivers | [Lint plugin entry](extend/plugin-catalogue/kubeclaw.lint.md) | [Lint plugin](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/plugins/lint) | Partial |

## Configuration And Policy

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-CFG-01 | Project input and compiled graph | [Configure and Operate](use/operate.md#understand-the-two-command-forms) | [Project compiler](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/project/compiler.ts) | Partial |
| SUR-CFG-02 | Explicit pipeline graph | [Configure and Operate](use/operate.md#start-a-project-run) | [Pipeline schema](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json) | Partial |
| SUR-CFG-03 | Platform installation, trust, grants, and adapters | [Configure and Operate](use/operate.md#configure-the-platform) | [Platform schema](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/config/platform.schema.json) | Detailed |
| SUR-CFG-04 | Plugin and host configuration | [Plugin catalogue](extend/plugin-catalogue/README.md) | [Installed manifests](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills) | Partial |
| SUR-CFG-05 | Runtime role membership | [Deployment and trust](understand/deployment-and-trust.md) | [Role manifests](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/packaging/runtime/roles) | Partial |
| SUR-CFG-06 | Helm, GitOps, and deployment values | [Helm values](reference/helm-values.md) | [Charts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts) | Partial |
| SUR-CFG-07 | Environment variables and secret references | [Environment variables](reference/environment-variables.md) and [Secrets](reference/secrets.md) | [Deployment scripts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts) | Partial |
| SUR-CFG-08 | Quality, security, approval, and retention policy | [Decisions](decisions/README.md) | [Contracts and configuration](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts) | Indexed |

## Public Interfaces And Records

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-API-01 | Command-line entry points and flags | [CLI commands](reference/cli.md) | [Package commands](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/package.json) | Partial |
| SUR-API-02 | Public plugin SDK types and helpers | [Extension contracts](extend/contracts.md) | [Plugin SDK](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/sdk) | Partial |
| SUR-API-03 | Schemas, constraints, defaults, and versions | [Reference](reference/README.md) | [Contract schemas](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts) | Indexed |
| SUR-API-04 | Events, payloads, ordering, and correlation | [Request, state, and recovery](understand/request-state-recovery.md) | [Telemetry contracts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts/telemetry/v1) | Indexed |
| SUR-API-05 | Error codes, effects, and recovery actions | [Observe and Diagnose](use/diagnose.md) | [Runtime error types](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/registry/errors.ts) | Indexed |
| SUR-API-06 | Nova grants and Buster runtime capabilities | [Capability catalogue](reference/capabilities.md) | [Capability vocabulary](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts) | Partial |
| SUR-API-07 | Internal and external communication protocols | [Deployment and trust](understand/deployment-and-trust.md) | [Runtime contracts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts) | Indexed |
| SUR-API-08 | Durable stores, paths, retention, and cleanup | [Back Up and Recover](use/recovery.md) | [State adapters](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugins) | Partial |
| SUR-API-09 | Ports, endpoints, callers, and network exposure | [Deployment and trust](understand/deployment-and-trust.md) | [Deployment charts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts) | Indexed |
| SUR-API-10 | Images, versions, digests, and promotion | [Plan and Install](use/install.md) | [Image build workflow](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/.github/workflows/build-images.yaml) | Partial |
| SUR-API-11 | Verification commands and automation workflows | [Verification commands](reference/verification-commands.md) and [Workflow inventory](reference/workflows.md) | [Verification scripts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/tests/verification) | Partial |

## Communication, Data, And Telemetry

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-COM-01 | Nova dispatch to Buster, Prism, Forge, and Echo | [Request, state, and recovery](understand/request-state-recovery.md) | [Nova plugins](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/plugins) | Partial |
| SUR-COM-02 | Core calls to stages, adapters, and observers | [Extension contracts](extend/contracts.md) | [Plugin runtime](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime) | Partial |
| SUR-COM-03 | Worker control channel and native process communication | [Worker Trust](understand/worker-trust.md) | [Worker Core](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/worker/core) | Partial |
| SUR-COM-04 | Redis streams, service HTTP, private routes, Git, OCI, and BuildKit paths | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Deployment charts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts) | Partial |
| SUR-DAT-01 | Nova journals, snapshots, effects, and run roots | [Request, state, and recovery](understand/request-state-recovery.md) | [Nova state](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/core/state) and [effects](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/core/effects) | Partial |
| SUR-DAT-02 | Worker journals, ownership, output spools, and result seals | [Back Up and Recover](use/recovery.md) | [Worker Core](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/worker/core) | Partial |
| SUR-DAT-03 | Buster plans, attempts, evidence, and reports | [Buster extension guide](extend/buster.md) | [Buster Engine](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/buster/engine) | Partial |
| SUR-DAT-04 | Prism revisions, approvals, artifacts, and PostgreSQL data | [Prism decisions](decisions/prism.md) | [Prism storage](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/prism/storage) | Partial |
| SUR-DAT-05 | LiteLLM PostgreSQL data | [Pipeline dependencies](understand/pipeline-dependencies.md) | [LiteLLM deployment](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/my-values/infra/litellm-deployment.yaml) | Indexed |
| SUR-DAT-06 | Artifact identities, digests, encoding, retention, and backup groups | [Back Up and Recover](use/recovery.md) | [Artifact store](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugins/artifact-store) | Partial |
| SUR-TEL-01 | Telemetry envelope, event catalogue, and correlation identity | [Observe and Diagnose](use/diagnose.md) | [Telemetry contract](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts/telemetry/v1) | Indexed |
| SUR-TEL-02 | Event producers, consumers, redaction, and evidence boundary | [Observe and Diagnose](use/diagnose.md) | [Observability contract](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts/pipeline-observability/v1) | Partial |
| SUR-TEL-03 | Observer checkpoints, retries, retention, and backpressure | [Plugin catalogue](extend/plugin-catalogue/README.md) | [Telemetry plugins](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugins) | Indexed |

## Security And Trust

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-SEC-01 | Threat model and trust boundaries | [Deployment and trust](understand/deployment-and-trust.md) | [Plugin isolation](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/isolation) | Partial |
| SUR-SEC-02 | Human, administrative, and workload identities | [Deployment and trust](understand/deployment-and-trust.md) | [Runtime roles](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/packaging/runtime/roles) | Partial |
| SUR-SEC-03 | SPIFFE attestation and mTLS | [Worker Trust](understand/worker-trust.md) | [Worker trust chart](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/charts/kubeclaw/templates/configmap-worker-trust.yaml) | Detailed |
| SUR-SEC-04 | Secret resolution, rotation, and recovery | [Secrets](reference/secrets.md) | [Secret resolver](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugins/secret-resolver) | Partial |
| SUR-SEC-05 | Network policy, private exposure, and denied paths | [Deployment and trust](understand/deployment-and-trust.md) | [Deployment charts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts) | Partial |
| SUR-SEC-06 | Package, image, digest, and attestation supply chain | [Plan and Install](use/install.md) | [Plugin installer](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/packages) | Partial |
| SUR-SEC-07 | Capability grants and least privilege | [Capability catalogue](reference/capabilities.md) | [Capability registry](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/registry) | Partial |

## Required Platform Dependencies

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-DEP-01 | Git source and workspace isolation | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Git workspace adapter](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugins/git-workspace) | Detailed |
| SUR-DEP-02 | Local Git mirror | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Deployment chart](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts/kubeclaw) | Partial |
| SUR-DEP-03 | BuildKit | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Deployment chart](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts/kubeclaw) | Partial |
| SUR-DEP-04 | Local OCI registry and upstream mirror | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Registry client setup](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts/registry-client-config.mjs) | Partial |
| SUR-DEP-05 | Redis transport and coordination | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Redis transport](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugins/redis-transport) | Partial |
| SUR-DEP-06 | PostgreSQL durable product data | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Prism database configuration](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/prism/config) | Partial |
| SUR-DEP-07 | Tailscale exposure | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Tailscale provider](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/buster/plugins/tailscale-exposure) | Partial |
| SUR-DEP-08 | Kubernetes, storage, DNS, and service discovery | [Deployment and trust](understand/deployment-and-trust.md) | [Deployment charts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts) | Partial |
| SUR-DEP-09 | SPIFFE identity and Envoy transport trust | [Worker Trust](understand/worker-trust.md) | [Worker trust chart](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/charts/kubeclaw/templates/configmap-worker-trust.yaml) | Detailed |
| SUR-DEP-10 | LiteLLM model gateway | [Pipeline dependencies](understand/pipeline-dependencies.md) | [LiteLLM configuration](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/my-values/infra/litellm-config.yaml) | Indexed |

## Optional Platform Extensions

These components can improve platform operation.
The pipeline does not require them when another supported component supplies the same infrastructure function.

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-OPT-01 | Argo CD deployment reconciliation | [Platform and operations](understand/platform-and-operations.md) | [GitOps chart](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts/gitops) | Partial |
| SUR-OPT-02 | Cilium networking and policy | [Platform and operations](understand/platform-and-operations.md) | [Deployment configuration](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/my-values) | Partial |
| SUR-OPT-03 | Monitoring and dashboards | [Platform and operations](understand/platform-and-operations.md) | [Monitoring configuration](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/my-values) | Partial |
| SUR-OPT-04 | Ops Pod, analysis tools, and Ops MCP | [Platform and operations](understand/platform-and-operations.md) | [Ops chart](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts/ops-pod) | Partial |
| SUR-OPT-05 | Architecture viewer | [Platform and operations](understand/platform-and-operations.md) | [Architecture viewer](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/tools) | Indexed |

## Operator Lifecycle

| ID | Surface | Primary reading | Coverage |
| --- | --- | --- | --- |
| SUR-OPS-01 | Prerequisites, sizing, versions, and installation | [Plan and Install](use/install.md) | Partial |
| SUR-OPS-02 | Configuration, start, audit, signal, and result inspection | [Configure and Operate](use/operate.md) | Partial |
| SUR-OPS-03 | Health, telemetry, diagnosis, and incident evidence | [Observe and Diagnose](use/diagnose.md) | Partial |
| SUR-OPS-04 | Backup, restore, failover, and state reconciliation | [Back Up and Recover](use/recovery.md) | Partial |
| SUR-OPS-05 | Upgrade, credential rotation, retention, rollback, and retirement | [Maintain and Retire](use/maintenance.md) | Partial |
| SUR-OPS-06 | Current implementation and live acceptance | [Current Status](status/current.md) | Detailed |

## Extension Surfaces

| ID | Surface | Primary reading | Coverage |
| --- | --- | --- | --- |
| SUR-EXT-01 | Pipeline stages | [Extension decision guide](extend/README.md#stage) | Detailed |
| SUR-EXT-02 | Event observers | [Extension decision guide](extend/README.md#observer) | Detailed |
| SUR-EXT-03 | Capability adapters | [Extension decision guide](extend/README.md#capability-adapter) | Detailed |
| SUR-EXT-04 | Buster test providers | [Buster extension guide](extend/buster.md) | Detailed |
| SUR-EXT-05 | Buster report adapters | [Buster extension guide](extend/buster.md) | Detailed |
| SUR-EXT-06 | OpenClaw extensions | [Host and engine boundaries](extend/host-and-engine.md) | Detailed |
| SUR-EXT-07 | Codex plugins and skills | [Host and engine boundaries](extend/host-and-engine.md) | Detailed |
| SUR-EXT-08 | Specialist engines | [Host and engine boundaries](extend/host-and-engine.md) | Partial |
| SUR-EXT-09 | Runtime roles and deployable package sets | [Host and engine boundaries](extend/host-and-engine.md) | Partial |
| SUR-EXT-10 | Core and Foundation changes | [Extension decision guide](extend/README.md) | Partial |
| SUR-EXT-11 | Installed extension packages and registrations | [Plugin catalogue](extend/plugin-catalogue/README.md) | Detailed |

## Known Depth Limits

An indexed row is a known documentation obligation.
It must not disappear because a detailed page is absent.

The reference does not yet enumerate every schema, error code, event, protocol, store, endpoint, SDK export, or command flag.
The operator journey does not yet include a maintained first pipeline input.
Use the [Current Status](status/current.md) page before you make a support or readiness claim.
