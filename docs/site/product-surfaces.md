# Product Surface Map

Status: implemented inventory with stated depth limits
Audience: reader, operator, plugin author, maintainer, documentation owner
Owner: documentation architecture
Evidence: package.json; packaging/runtime/package-ownership.json; packaging/runtime/roles; skills/common/plugin-runtime; skills/nova; skills/worker; skills/buster; skills/prism; contracts; charts; scripts
Applies to: current repository product and platform surfaces
Last verified: source and contract inspection on 2026-09-19

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
| SUR-CTL-02 | Project compiler and project input | [Nova Core](understand/nova-core.md#1-project-admission-and-compilation) | [Project compiler](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/project/compiler.ts) | Detailed |
| SUR-CTL-03 | Nova Core lifecycle and scheduling | [Nova Core](understand/nova-core.md) | [Nova Core](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/core) | Detailed |
| SUR-CTL-04 | Plugin discovery, grants, activation, and isolation | [Plugin Runtime](understand/plugin-runtime.md) | [Plugin runtime](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime) | Detailed |
| SUR-CTL-05 | Worker Core admission and attempt execution | [Worker Core](understand/worker-core.md) | [Worker Core](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/worker/core) | Detailed |
| SUR-CTL-06 | Runtime roles and package ownership | [Deployment and trust](understand/deployment-and-trust.md) | [Package ownership](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/packaging/runtime/package-ownership.json) | Partial |
| SUR-CTL-07 | Request, state, retry, wait, and recovery | [Request, state, and recovery](understand/request-state-recovery.md) | [Nova execution](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/core/execution) | Detailed |

## Specialists And Quality Gates

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-SPC-01 | Forge implementation work | [Forge](understand/forge.md) | [Implementation agent](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent) | Detailed |
| SUR-SPC-02 | Echo analysis and findings | [Echo](understand/echo.md) | [Review plugin](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review) | Detailed |
| SUR-SPC-03 | Prism design, approval, and publication | [Prism](understand/prism.md) | [Prism](https://github.com/datrab/kubeclaw/tree/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism) | Detailed |
| SUR-SPC-04 | Buster test-plan execution and result import | [Buster architecture](understand/buster.md) | [Buster Engine](https://github.com/datrab/kubeclaw/tree/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine) | Detailed |
| SUR-SPC-05 | Twelve Buster suite definitions | [Buster suite reference](reference/buster-suites.md) | [Suite contracts](https://github.com/datrab/kubeclaw/tree/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites) | Detailed |
| SUR-SPC-06 | Lint policy, tools, rules, baselines, and waivers | [Lint policy](reference/lint-policy.md) and [extension guide](extend/lint.md) | [Lint plugin](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint) | Detailed |

## Configuration And Policy

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-CFG-01 | Project input and compiled graph | [Nova project](reference/nova-project.md) and [project test pipeline](reference/pipeline-json.md) | [Project compiler](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/project/compiler.ts) | Detailed |
| SUR-CFG-02 | Explicit pipeline graph | [Pipeline definition](reference/pipeline-definition.md) | [Pipeline schema](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json) | Detailed |
| SUR-CFG-03 | Platform installation, trust, grants, and adapters | [Pipeline platform](reference/pipeline-platform.md) and [operation procedure](use/operate.md#configure-the-platform) | [Platform schema](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/config/platform.schema.json) | Detailed |
| SUR-CFG-04 | Plugin and host configuration | [Host and Prism configuration](reference/host-and-prism-configuration.md), [plugin operation](use/plugins.md), and [plugin catalogue](extend/plugin-catalogue/README.md) | [Installed manifests](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills) | Detailed |
| SUR-CFG-05 | Worker profiles and runtime role membership | [Worker profiles and roles](reference/worker-profiles-and-roles.md) and [deployment trust](understand/deployment-and-trust.md) | [Role manifests](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/packaging/runtime/roles) | Detailed |
| SUR-CFG-06 | Helm, GitOps, and deployment values | [Helm values](reference/helm-values.md), [precedence](reference/configuration-precedence.md), and [change impact](reference/configuration-change-impact.md) | [Charts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/charts) | Detailed |
| SUR-CFG-07 | Environment variables and secret references | [Environment variables](reference/environment-variables.md) and [Secrets](reference/secrets.md) | [Deployment scripts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts) | Partial |
| SUR-CFG-08 | Quality, security, approval, and retention policy | [Decisions](decisions/README.md) | [Contracts and configuration](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts) | Indexed |

## Public Interfaces And Records

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-API-01 | Command-line entry points and flags | [CLI commands](reference/cli.md) | [Package commands](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/package.json) | Partial |
| SUR-API-02 | Public plugin SDK types and helpers | [Extension contracts](extend/contracts.md) | [Plugin SDK](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/sdk) | Partial |
| SUR-API-03 | Schemas, constraints, defaults, and versions | [Reference](reference/README.md) | [Contract schemas](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts) | Indexed |
| SUR-API-04 | Events, payloads, ordering, and correlation | [Telemetry](understand/telemetry.md) | [Active v2 event contract](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L597-L672) | Detailed |
| SUR-API-05 | Error codes, effects, and recovery actions | [Observe and Diagnose](use/diagnose.md) | [Runtime error types](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/registry/errors.ts) | Indexed |
| SUR-API-06 | Nova grants and Buster runtime capabilities | [Capability catalogue](reference/capabilities.md) | [Capability vocabulary](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts) | Partial |
| SUR-API-07 | Internal and external communication protocols | [Communication](understand/communication.md) | [Runtime contracts](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/contracts) | Detailed |
| SUR-API-08 | Durable stores, paths, retention, and cleanup | [Data and state](understand/data-and-state.md) | [State adapters](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins) | Detailed |
| SUR-API-09 | Ports, endpoints, callers, and network exposure | [Communication endpoint catalogue](understand/communication.md#endpoint-catalogue) | [Deployment charts](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts) | Detailed |
| SUR-API-10 | Images, versions, digests, and promotion | [Plan and Install](use/install.md) | [Image build workflow](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/.github/workflows/build-images.yaml) | Partial |
| SUR-API-11 | Verification commands and automation workflows | [Verification commands](reference/verification-commands.md) and [Workflow inventory](reference/workflows.md) | [Verification scripts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/tests/verification) | Partial |

## Communication, Data, And Telemetry

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-COM-01 | Nova dispatch to Buster, Prism, Forge, and Echo | [Communication](understand/communication.md#complete-connection-matrix) | [Nova plugins](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins) | Detailed |
| SUR-COM-02 | Core calls to stages, adapters, and observers | [Plugin Runtime](understand/plugin-runtime.md) | [Plugin runtime](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime) | Detailed |
| SUR-COM-03 | Worker control channel and native process communication | [Worker Core](understand/worker-core.md#native-control-channel) | [Worker Core](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/worker/core) | Detailed |
| SUR-COM-04 | Redis streams, service HTTP, private routes, Git, OCI, and BuildKit paths | [Communication](understand/communication.md) | [Deployment charts](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts) | Detailed |
| SUR-DAT-01 | Nova journals, snapshots, effects, and run roots | [Data and state](understand/data-and-state.md#nova-run-state) | [Nova state](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/core/state) and [effects](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/core/effects) | Detailed |
| SUR-DAT-02 | Worker journals, ownership, output spools, and result seals | [Data and state](understand/data-and-state.md#worker-state) | [Worker Core](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/worker/core) | Detailed |
| SUR-DAT-03 | Buster plans, attempts, evidence, and reports | [Data and state](understand/data-and-state.md#buster-state) | [Buster Engine](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/buster/engine) | Detailed |
| SUR-DAT-04 | Prism revisions, approvals, artifacts, corpus, preferences, and PostgreSQL data | [Data and state](understand/data-and-state.md#postgresql-owners) and [Prism data architecture](understand/prism-data.md) | [Prism storage](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/storage) | Detailed |
| SUR-DAT-05 | LiteLLM PostgreSQL data | [Data and state](understand/data-and-state.md#litellm-postgresql) | [LiteLLM deployment](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/my-values/infra/litellm-deployment.yaml) | Detailed |
| SUR-DAT-06 | Artifact identities, digests, encoding, retention, and backup groups | [Data and state](understand/data-and-state.md#artifact-lifecycle) | [Artifact store](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/artifact-store) | Detailed |
| SUR-TEL-01 | Telemetry envelope, event catalogue, and correlation identity | [Telemetry](understand/telemetry.md#active-event-catalog) | [Active v2 SDK contract](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L597-L672) | Detailed |
| SUR-TEL-02 | Event producers, consumers, redaction, and evidence boundary | [Telemetry](understand/telemetry.md#producer-and-consumer-matrix) | [Nova telemetry runtime](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/core/telemetry) | Detailed |
| SUR-TEL-03 | Observer checkpoints, retries, retention, and backpressure | [Telemetry](understand/telemetry.md#observer-delivery-checkpoints-and-recovery) | [Observer runtime](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/core/telemetry/observers.ts) | Detailed |

## Security And Trust

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-SEC-01 | Threat model and trust boundaries | [Security and trust](understand/security-and-trust.md) | [Plugin isolation](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugin-runtime/foundation/isolation) | Detailed |
| SUR-SEC-02 | Human, administrative, and workload identities | [Security and trust](understand/security-and-trust.md#identity-types-must-not-be-confused) | [Prism session identity](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/control/session.ts) | Detailed |
| SUR-SEC-03 | SPIFFE attestation and mTLS | [Security and trust](understand/security-and-trust.md#spiffe-spire-envoy-and-worker-core) and [Worker Trust](understand/worker-trust.md) | [Worker trust chart](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/templates/configmap-worker-trust.yaml) | Detailed |
| SUR-SEC-04 | Secret resolution, rotation, and recovery | [Security and trust](understand/security-and-trust.md#secrets-ownership-resolution-and-recovery) and [Secrets](reference/secrets.md) | [Secret resolver](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/secret-resolver) | Detailed |
| SUR-SEC-05 | Network policy, private exposure, and denied paths | [Security and trust](understand/security-and-trust.md#network-segmentation-and-negative-paths) | [Deployment charts](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts) | Detailed |
| SUR-SEC-06 | Package, image, digest, and attestation supply chain | [Security and trust](understand/security-and-trust.md#source-package-image-and-artifact-integrity) | [Plugin installer](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugin-runtime/foundation/packages) | Detailed |
| SUR-SEC-07 | Capability grants and least privilege | [Security and trust](understand/security-and-trust.md#least-authority-by-layer) | [Capability registry](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugin-runtime/foundation/registry) | Detailed |

## Required Platform Dependencies

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-DEP-01 | Git source and workspace isolation | [Pipeline dependencies](understand/pipeline-dependencies.md) | [Git workspace adapter](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugins/git-workspace) | Detailed |
| SUR-DEP-02 | Local Git mirror | [Absent Git mirror boundary](understand/platform-and-operations.md#git-source-and-the-absent-git-mirror) | [Current Git source path](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/core/test-gates/source-git.ts) | Detailed |
| SUR-DEP-03 | BuildKit | [Rootless BuildKit](understand/platform-and-operations.md#rootless-buildkit) | [Buster runtime entrypoint](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/docker/buster-runtime-entrypoint.sh) | Detailed |
| SUR-DEP-04 | Local OCI registry and upstream mirror | [Registry and mirror architecture](understand/platform-and-operations.md#writable-local-oci-registry) | [Registry client setup](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/registry-client-config.mjs) | Detailed |
| SUR-DEP-05 | Redis transport and coordination | [Redis data boundary](understand/data-and-state.md#redis-durable-delivery-not-product-authority) and [communication](understand/communication.md#redis) | [Redis transport](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/redis-transport) | Detailed |
| SUR-DEP-06 | PostgreSQL durable product data | [Pipeline dependencies](understand/pipeline-dependencies.md) and [Prism data architecture](understand/prism-data.md) | [Prism database configuration](https://github.com/datrab/kubeclaw/tree/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/config) | Detailed |
| SUR-DEP-07 | Tailscale exposure | [Platform and operations](understand/platform-and-operations.md#redis-postgresql-and-tailscale) and [communication](understand/communication.md#complete-connection-matrix) | [Tailscale provider](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/buster/plugins/tailscale-exposure) | Detailed |
| SUR-DEP-08 | Kubernetes, storage, DNS, and service discovery | [Platform and operations](understand/platform-and-operations.md) | [Deployment configuration](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/my-values/infra) | Detailed |
| SUR-DEP-09 | SPIFFE identity and Envoy transport trust | [Worker Trust](understand/worker-trust.md) | [Worker trust chart](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/charts/kubeclaw/templates/configmap-worker-trust.yaml) | Detailed |
| SUR-DEP-10 | LiteLLM model gateway | [Platform and operations](understand/platform-and-operations.md#litellm-model-gateway) | [LiteLLM configuration](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/my-values/infra/litellm-config.yaml) | Detailed |

## Optional Platform Extensions

These components can improve platform operation.
The pipeline does not require them when another supported component supplies the same infrastructure function.

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-OPT-01 | Argo CD deployment reconciliation | [Platform and operations](understand/platform-and-operations.md#argo-cd-and-exclusive-resource-ownership) | [GitOps chart](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/gitops) | Detailed |
| SUR-OPT-02 | Cilium networking and policy | [Platform and operations](understand/platform-and-operations.md#one-network-owner-flannel-or-cilium) | [Deployment configuration](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/my-values) | Detailed |
| SUR-OPT-03 | Monitoring and dashboards | [Platform and operations](understand/platform-and-operations.md#monitoring-is-optional-and-non-authoritative) | [Monitoring configuration](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/gitops/platform/values) | Detailed |
| SUR-OPT-04 | Ops Pod, analysis tools, and Ops MCP | [Ops MCP](understand/ops-mcp.md) and [platform architecture](understand/platform-and-operations.md#ops-pod-tool-policy-is-not-kubernetes-authority) | [Ops chart](https://github.com/datrab/kubeclaw/tree/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/ops-pod) | Detailed |
| SUR-OPT-05 | Architecture viewer | [Archviewer](understand/archviewer.md) | [Architecture viewer chart](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/templates/archviewer.yaml) | Detailed |

## Operator Lifecycle

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-OPS-01 | Prerequisites, sizing, versions, and installation | [Plan and Install](use/install.md) and [capacity](use/capacity.md) | [Deployment entry](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts/deploy.sh) | Detailed |
| SUR-OPS-02 | Configuration, start, audit, signal, and result inspection | [Configure and Operate](use/operate.md) | [Nova project CLI](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/project/cli.ts) | Detailed |
| SUR-OPS-03 | Health, telemetry, diagnosis, and incident evidence | [Observe and Diagnose](use/diagnose.md) | [Telemetry contracts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts/telemetry/v1) | Detailed |
| SUR-OPS-04 | Backup, restore, failover, and state reconciliation | [Back Up and Recover](use/recovery.md) | [Nova state implementation](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/nova/core/state) | Detailed |
| SUR-OPS-05 | Upgrade, credential rotation, retention, rollback, and retirement | [Maintain and Retire](use/maintenance.md) and [capacity](use/capacity.md) | [Deployment and maintenance scripts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts) | Detailed |
| SUR-OPS-06 | Current implementation and live acceptance | [Current Status](status/current.md) | [Status publication generator](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/scripts/docs-status.mjs) | Detailed |

## Extension Surfaces

| ID | Surface | Primary reading | Source authority | Coverage |
| --- | --- | --- | --- | --- |
| SUR-EXT-01 | Pipeline stages | [Extension decision guide](extend/README.md#stage) | [Registry builder](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/registry/build.ts) | Detailed |
| SUR-EXT-02 | Event observers | [Extension decision guide](extend/README.md#observer) | [Registry builder](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/registry/build.ts) | Detailed |
| SUR-EXT-03 | Capability adapters | [Extension decision guide](extend/README.md#capability-adapter) | [Registry builder](https://github.com/datrab/kubeclaw/blob/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation/registry/build.ts) | Detailed |
| SUR-EXT-04 | Buster test providers | [Buster extension guide](extend/buster.md) | [Buster plugin SDK](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/buster/plugin-sdk) | Detailed |
| SUR-EXT-05 | Buster report adapters | [Buster extension guide](extend/buster.md) | [Buster report adapter contracts](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/buster/plugin-sdk) | Detailed |
| SUR-EXT-06 | OpenClaw extensions | [Host and engine boundaries](extend/host-and-engine.md) | [Installed OpenClaw manifests](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills) | Detailed |
| SUR-EXT-07 | Codex plugins and skills | [Host and engine boundaries](extend/host-and-engine.md) | [Installed Codex plugins](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/plugins) | Detailed |
| SUR-EXT-08 | Specialist engines | [Host and engine boundaries](extend/host-and-engine.md) | [Worker attempt contract](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/contracts/pipeline-worker-core) | Partial |
| SUR-EXT-09 | Runtime roles and deployable package sets | [Host and engine boundaries](extend/host-and-engine.md) | [Runtime role manifests](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/packaging/runtime/roles) | Partial |
| SUR-EXT-10 | Core and Foundation changes | [Extension decision guide](extend/README.md) | [Plugin foundation](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills/common/plugin-runtime/foundation) | Partial |
| SUR-EXT-11 | Installed extension packages and registrations | [Plugin catalogue](extend/plugin-catalogue/README.md) | [Installed package manifests](https://github.com/datrab/kubeclaw/tree/d8c38328ae305d431574aed008c4e1333e4b49f5/skills) | Detailed |

## Known Depth Limits

An indexed row is a known documentation obligation.
It must not disappear because a detailed page is absent.

The reference does not yet enumerate every schema, error code, event, protocol, store, endpoint, SDK export, or command flag.
The operator journey does not yet include a maintained first pipeline input.
Use the [Current Status](status/current.md) page before you make a support or readiness claim.
