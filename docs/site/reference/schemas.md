# Schema Authorities and Interpretation

Status: bounded reference; discovery limitations stated below
Audience: operator, project author, plugin author, maintainer
Owner: documentation; consumer semantics belong to the named component
Evidence: skills/common/plugin-runtime/foundation/registry/build.ts; skills/common/plugin-runtime/foundation/registry/schema.ts; scripts/docs-configuration-inventory.mjs; contracts/pipeline-worker-core/v1/schemas; charts/prism/values.schema.json; skills/nova/project/compiler.ts
Applies to: the named schema, registration, embedded and executable authorities catalogued below
Last verified: 2026-10-15; source behavior checked from current files; no validation or deployment run

## Choose an authority, not a file suffix

A schema describes what a value may contain. The actual validator determines
which document, definitions, defaults and additional semantic checks apply.
A file called `*.schema.json` is not proof that runtime loads it. Conversely,
a compiler can enforce a public input contract without a separate schema file.

1. For a configuration value, start with [Configuration](configuration.md)
   and the family-specific generated field table.
2. For a stage input/result or observer checkpoint, find the exact registration
   and schema path in the catalogue below.
3. For Worker, chart, API or Nova input, use its distinct authority row and
   consumer. Do not substitute the plugin-config validator.

Identify an authority by **path + embedded JSON pointer or symbol + declared
version/dialect + actual consuming caller**. Shared files can serve multiple
registrations; those are different caller edges, not duplicate contracts.

## Registered configuration authorities

The existing [Plugin configuration](plugin-configuration.md) reference owns
recursive registered configuration fields. Its selector includes the platform
schema and string or inline-object `configSchema` registrations beneath the
three common/Nova/Buster plugin roots. An inline schema is identified by its
manifest and pointer, not by an invented standalone file. It is not a global
catalogue of all input, result, checkpoint, chart or host contracts.

**Source — config selection and package-local acquisition:**
[registeredSchemaAuthorities](../../../scripts/docs-configuration-inventory.mjs#L3073-L3103) (`scripts/docs-configuration-inventory.mjs:3073–3103`, current-checkout SHA-256 `f796b673f5dac812f0fb798bdfb2ff9931a0c122f3c9fb257befca05fd49010c`). [validateRegistrationFiles / assertPackageFile](../../../skills/common/plugin-runtime/foundation/registry/build.ts#L30-L70) (`skills/common/plugin-runtime/foundation/registry/build.ts:30–70`, current-checkout SHA-256 `c65248d6d4dc09dcfe762e9cddd6dd27d5864cbdab7cc421d87256e712873867`).

## Stage input, result, and checkpoint catalogue

The following finite registration set contains **47 declaration references to
37 distinct files**, outside the registered `configSchema` path set. The
survey selected 49 regular manifests under `skills/{common,nova,buster}/plugins`
and checked their declared schema keys. These are observed counts for that
source boundary, not an expected product total or a completion test.

| Registration field | Actual consumer | Exact value checked | Operational boundary |
| --- | --- | --- | --- |
| `inputSchema` | Nova `validatePipelineDefinitionAgainstRegistry` | Each authored stage input against its installed owner | Input shape does not prove capability grant or stage success |
| `resultSchema` | `StageExecutor.execute` | Returned stage result before it is recorded | A declared result schema is not a successful execution |
| `checkpointSchema` | `ObserverRuntime.#commitCheckpoint` | Only `{sequence,eventId}` from the checkpoint | Not the complete journal envelope or arbitrary observer callback state |

**Source — actual callers:**
[validatePipelineDefinitionAgainstRegistry](../../../skills/nova/core/execution/runner.ts#L40-L46) (`skills/nova/core/execution/runner.ts:40–46`, current-checkout SHA-256 `9a34098cd68460f42e220ada2f3e7bef37fcc9eb5fdd351db2cd1585fe6a5cc6`). [StageExecutor.execute](../../../skills/nova/core/execution/stage-executor.ts#L35-L48) (`skills/nova/core/execution/stage-executor.ts:35–48`, current-checkout SHA-256 `4c846993c679c9ce663f7dda0e8de78fd26101e83948dd17211e62f83ea2eafb`). [ObserverRuntime.#commitCheckpoint](../../../skills/nova/core/telemetry/observers.ts#L51-L58) (`skills/nova/core/telemetry/observers.ts:51–58`, current-checkout SHA-256 `b46b9a70b190bf8541d96188221a63acc1e9c03ff6204a9e94b37c944306aafd`).

Each schema link opens the current source. Each declaration link identifies
its manifest pointer and exact registration ID. Module selection is package-local;
installation, trust, grants and activation are separate. When `$id` or a
version marker is absent, none is invented from the filename. Root pointer
`/` here means the document itself; local `$defs` remain dependent definitions.

| Exact authority (document root) | Declared identity / dialect | Registration and declaration pointer | Actual consumer route |
| --- | --- | --- | --- |
| [`skills/common/plugins/agent-observability/schemas/checkpoint.schema.json`](../../../skills/common/plugins/agent-observability/schemas/checkpoint.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [ingester](../../../skills/common/plugins/agent-observability/plugin.json#L37) `/observers/0/checkpointSchema`<br>[evidence](../../../skills/common/plugins/agent-observability/plugin.json#L62) `/observers/1/checkpointSchema` | `checkpointSchema`; consumer table above |
| [`skills/common/plugins/notification-observer/schemas/checkpoint.schema.json`](../../../skills/common/plugins/notification-observer/schemas/checkpoint.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [notifications](../../../skills/common/plugins/notification-observer/plugin.json#L39) `/observers/0/checkpointSchema`<br>[preview-delivery](../../../skills/common/plugins/notification-observer/plugin.json#L60) `/observers/1/checkpointSchema` | `checkpointSchema`; consumer table above |
| [`skills/common/plugins/telemetry-observer/schemas/checkpoint.schema.json`](../../../skills/common/plugins/telemetry-observer/schemas/checkpoint.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [telemetry](../../../skills/common/plugins/telemetry-observer/plugin.json#L52) `/observers/0/checkpointSchema` | `checkpointSchema`; consumer table above |
| [`skills/nova/plugins/architecture-validator/schemas/input.schema.json`](../../../skills/nova/plugins/architecture-validator/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [architecture](../../../skills/nova/plugins/architecture-validator/plugin.json#L18) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/architecture-validator/schemas/result.schema.json`](../../../skills/nova/plugins/architecture-validator/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [architecture](../../../skills/nova/plugins/architecture-validator/plugin.json#L19) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/blueprint-sync/schemas/input.schema.json`](../../../skills/nova/plugins/blueprint-sync/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [sync](../../../skills/nova/plugins/blueprint-sync/plugin.json#L19) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/blueprint-sync/schemas/result.schema.json`](../../../skills/nova/plugins/blueprint-sync/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [sync](../../../skills/nova/plugins/blueprint-sync/plugin.json#L20) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/buster-quality-gate/schemas/input.schema.json`](../../../skills/nova/plugins/buster-quality-gate/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [quality](../../../skills/nova/plugins/buster-quality-gate/plugin.json#L18) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/buster-quality-gate/schemas/result.schema.json`](../../../skills/nova/plugins/buster-quality-gate/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [quality](../../../skills/nova/plugins/buster-quality-gate/plugin.json#L19) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/case-study/schemas/input.schema.json`](../../../skills/nova/plugins/case-study/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [case-study](../../../skills/nova/plugins/case-study/plugin.json#L17) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/case-study/schemas/result.schema.json`](../../../skills/nova/plugins/case-study/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [case-study](../../../skills/nova/plugins/case-study/plugin.json#L18) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/delivery-lint/schemas/input.schema.json`](../../../skills/nova/plugins/delivery-lint/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [delivery-lint](../../../skills/nova/plugins/delivery-lint/plugin.json#L16) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/delivery-lint/schemas/result.schema.json`](../../../skills/nova/plugins/delivery-lint/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [delivery-lint](../../../skills/nova/plugins/delivery-lint/plugin.json#L17) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/demo-handoff/schemas/candidate.schema.json`](../../../skills/nova/plugins/demo-handoff/schemas/candidate.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [candidate](../../../skills/nova/plugins/demo-handoff/plugin.json#L16) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/demo-handoff/schemas/delivery.schema.json`](../../../skills/nova/plugins/demo-handoff/schemas/delivery.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [delivery](../../../skills/nova/plugins/demo-handoff/plugin.json#L29) `/stages/1/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/demo-handoff/schemas/ready.schema.json`](../../../skills/nova/plugins/demo-handoff/schemas/ready.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [ready](../../../skills/nova/plugins/demo-handoff/plugin.json#L42) `/stages/2/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/demo-handoff/schemas/result.schema.json`](../../../skills/nova/plugins/demo-handoff/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [candidate](../../../skills/nova/plugins/demo-handoff/plugin.json#L17) `/stages/0/resultSchema`<br>[delivery](../../../skills/nova/plugins/demo-handoff/plugin.json#L30) `/stages/1/resultSchema`<br>[ready](../../../skills/nova/plugins/demo-handoff/plugin.json#L43) `/stages/2/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/human-approval/schemas/architecture-input.schema.json`](../../../skills/nova/plugins/human-approval/schemas/architecture-input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [architecture-approval](../../../skills/nova/plugins/human-approval/plugin.json#L32) `/stages/1/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/human-approval/schemas/input.schema.json`](../../../skills/nova/plugins/human-approval/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [approval](../../../skills/nova/plugins/human-approval/plugin.json#L16) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/human-approval/schemas/result.schema.json`](../../../skills/nova/plugins/human-approval/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [approval](../../../skills/nova/plugins/human-approval/plugin.json#L17) `/stages/0/resultSchema`<br>[architecture-approval](../../../skills/nova/plugins/human-approval/plugin.json#L33) `/stages/1/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/implementation-agent/schemas/input.schema.json`](../../../skills/nova/plugins/implementation-agent/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [implementation](../../../skills/nova/plugins/implementation-agent/plugin.json#L21) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/implementation-agent/schemas/result.schema.json`](../../../skills/nova/plugins/implementation-agent/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [implementation](../../../skills/nova/plugins/implementation-agent/plugin.json#L22) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/lint/schemas/input.schema.json`](../../../skills/nova/plugins/lint/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [pre-check](../../../skills/nova/plugins/lint/plugin.json#L17) `/stages/0/inputSchema`<br>[full](../../../skills/nova/plugins/lint/plugin.json#L31) `/stages/1/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/lint/schemas/result.schema.json`](../../../skills/nova/plugins/lint/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [pre-check](../../../skills/nova/plugins/lint/plugin.json#L18) `/stages/0/resultSchema`<br>[full](../../../skills/nova/plugins/lint/plugin.json#L32) `/stages/1/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/pipeline-review/schemas/input.schema.json`](../../../skills/nova/plugins/pipeline-review/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [review](../../../skills/nova/plugins/pipeline-review/plugin.json#L17) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/pipeline-review/schemas/result.schema.json`](../../../skills/nova/plugins/pipeline-review/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [review](../../../skills/nova/plugins/pipeline-review/plugin.json#L18) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/preflight-contract/schemas/input.schema.json`](../../../skills/nova/plugins/preflight-contract/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [validate](../../../skills/nova/plugins/preflight-contract/plugin.json#L16) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/preflight-contract/schemas/result.schema.json`](../../../skills/nova/plugins/preflight-contract/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [validate](../../../skills/nova/plugins/preflight-contract/plugin.json#L17) `/stages/0/resultSchema`<br>[source](../../../skills/nova/plugins/preflight-contract/plugin.json#L30) `/stages/1/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/preflight-contract/schemas/source-input.schema.json`](../../../skills/nova/plugins/preflight-contract/schemas/source-input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [source](../../../skills/nova/plugins/preflight-contract/plugin.json#L29) `/stages/1/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/prism-design/schemas/input.schema.json`](../../../skills/nova/plugins/prism-design/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [design](../../../skills/nova/plugins/prism-design/plugin.json#L5) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/prism-design/schemas/result.schema.json`](../../../skills/nova/plugins/prism-design/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [design](../../../skills/nova/plugins/prism-design/plugin.json#L5) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/project-summary/schemas/input.schema.json`](../../../skills/nova/plugins/project-summary/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [summary](../../../skills/nova/plugins/project-summary/plugin.json#L16) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/project-summary/schemas/result.schema.json`](../../../skills/nova/plugins/project-summary/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [summary](../../../skills/nova/plugins/project-summary/plugin.json#L17) `/stages/0/resultSchema` | `resultSchema`; consumer table above |
| [`skills/nova/plugins/review/schemas/input.schema.json`](../../../skills/nova/plugins/review/schemas/input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [review](../../../skills/nova/plugins/review/plugin.json#L18) `/stages/0/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/review/schemas/repository-audit-input.schema.json`](../../../skills/nova/plugins/review/schemas/repository-audit-input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [repository-audit](../../../skills/nova/plugins/review/plugin.json#L33) `/stages/1/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/review/schemas/repository-revalidation-input.schema.json`](../../../skills/nova/plugins/review/schemas/repository-revalidation-input.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [repository-revalidation](../../../skills/nova/plugins/review/plugin.json#L48) `/stages/2/inputSchema` | `inputSchema`; consumer table above |
| [`skills/nova/plugins/review/schemas/result.schema.json`](../../../skills/nova/plugins/review/schemas/result.schema.json) `/` | `no $id`; `https://json-schema.org/draft/2020-12/schema` | [review](../../../skills/nova/plugins/review/plugin.json#L19) `/stages/0/resultSchema`<br>[repository-audit](../../../skills/nova/plugins/review/plugin.json#L34) `/stages/1/resultSchema`<br>[repository-revalidation](../../../skills/nova/plugins/review/plugin.json#L49) `/stages/2/resultSchema` | `resultSchema`; consumer table above |

The 37 documents contain 17 `$ref` occurrences in this finite set. Their traced
targets are same-file `providerPlan` / `sliceBudget` definitions or bundled
plugin-system `artifactRef` / `stageResult` definitions. The registry installs
that bundled contract for isolated referenced-document validation. This does
not imply arbitrary network fetching, or that each `$defs` member is a separate
public input. Static target existence alone does not prove recursive semantics.

## Other authority kinds and version selection

A **custom resource definition (CRD)** is a Kubernetes
`CustomResourceDefinition`: it declares the schema of an additional API
resource. **Common Expression Language (CEL)** rules attached to that schema
express object constraints for API-server admission—whether the API server
can accept a create or update. Admission is not controller reconciliation: the Buster
controller separately reads a lease's `spec` and `status` and acts on it.
These are different consumers, not two names for the same validation step.
For this lease, the chart condition, installed API group/version, and the
receiving API server's support for those rules still apply; no live validation
or controller run is demonstrated here.

**Source — declared admission rules and separate lease consumer:**
[conditional CRD, templated version and schema-attached rules](../../../charts/kubeclaw/templates/buster-namespace-lease-crd.yaml#L1-L44) (`charts/kubeclaw/templates/buster-namespace-lease-crd.yaml:1–44`, current-checkout SHA-256 `5dff68d75c46476c582e8bb5d677b758574ecd1a2a0676363ef11eb188cb83f8`). [lease spec/status reconciliation branch](../../../cmd/buster-namespace-controller/main.go#L252-L268) (`cmd/buster-namespace-controller/main.go:252–268`, current-checkout SHA-256 `c93bcc15f56bf6c5a9266c48835018b42589489846642bede2eb93851c4b6624`). [versioned lease API path](../../../cmd/buster-namespace-controller/main.go#L1569-L1575) (`cmd/buster-namespace-controller/main.go:1569–1575`, current-checkout SHA-256 `c93bcc15f56bf6c5a9266c48835018b42589489846642bede2eb93851c4b6624`).

| Authority / reader route | Source identity and consumer | Version and interpretation boundary |
| --- | --- | --- |
| [worker-v1](../../../contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v1.schema.json) | [validator / checkPipelineWorkerCoreContract](../../../contracts/pipeline-worker-core/v1/src/validation.ts#L23-L30); [PipelineWorkerCoreDefinition](../../../contracts/pipeline-worker-core/v1/src/types.ts#L262-L274); [attempt version dispatch / evidence/log/result validation](../../../skills/worker/core/worker/attempt-executor.ts#L188-L203) | Active Buster v1 producer, not retained-only: [profile constructor](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/buster/engine/test-gates/runner.ts#L566-L585) creates `worker-profile.v1`; [attempt constructor](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/buster/engine/test-gates/runner.ts#L1518-L1525) creates new `worker-attempt-envelope.v1`. The executor selects the v1 validator for these envelopes. See [current Buster local profiles](worker-profiles-and-roles.md#current-buster-local-profiles-worker-profilev1) for capability, registration and resource-accounting limits; no v2/v3 resource semantics or deployed execution is implied. |
| [worker-v2](../../../contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v2.schema.json) | [checkWorkerResourceContractV2 / validateWorkerResourceContractV2](../../../contracts/pipeline-worker-core/v1/src/resource-validation-v2.ts#L10-L17); [version dispatch](../../../skills/worker/core/worker/attempt-executor.ts#L188-L190) | Selected v2 resource branch; process accounting and additional relation checks. |
| [worker-v3](../../../contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json) | [checkWorkerResourceContractV3 / validateWorkerResourceContractV3](../../../contracts/pipeline-worker-core/v1/src/resource-validation-v3.ts#L10-L17); [version dispatch](../../../skills/worker/core/worker/attempt-executor.ts#L188-L190); [worker admission](../../../skills/prism/server/worker-service.ts#L84-L94) | Native v3 resource branch; task accounting and Prism admission, not v2 process semantics. |
| [prism-chart-values](../../../charts/prism/values.schema.json) | [chart identity](../../../charts/prism/Chart.yaml#L1-L6); [render / invalid-value test declaration](../../../tests/verification/deployment/prism-product-decisions.test.mjs#L17-L25) | Helm chart-root input; rendered templates and external Helm validation are separate from plugin registry validation. |
| [buster-lease-crd](../../../charts/kubeclaw/templates/buster-namespace-lease-crd.yaml) `spec.versions[0].schema.openAPIV3Schema` | [leasePlural / reconciliation / lease API path](../../../cmd/buster-namespace-controller/main.go#L25-L30) | Conditional broker + buster role; templated API group/version. API server owns OpenAPI/CEL admission; controller reconciliation is separate. |
| [nova-project-v2-validator](../../../skills/nova/project/compiler.ts) `object/text/id/absolute/strings / compileProject` | [project JSON acquisition / compileProject](../../../skills/nova/project/cli.ts#L30-L39) | Executable closed input validation, not an invented project.schema.json; helper-built graph has its own validation. |
| [review-verification-inline](../../../skills/nova/plugins/review/src/echo-review-verification-contract.ts) `echoReviewVerificationOutputSchema` | [outputContract / parseEchoReviewVerificationDispatchResponse](../../../skills/nova/plugins/review/src/scalable-review-verification.ts#L296-L303); [parseEchoReviewVerificationOutput / parseEchoReviewVerificationDispatchResponse](../../../skills/nova/plugins/review/src/echo-review-verification-parser.ts#L108-L123) | Embedded outputContract plus manual response parser; generated companion equality not established. |
| [review-bundle-inline](../../../skills/nova/plugins/review/src/review-bundle-contract.ts) `reviewBundleSchema, portableReviewBundleSchema` | [rendered/additional outputs and --check branch](../../../skills/nova/plugins/review/scripts/generate-bundle-schema.mjs#L5-L41) | Embedded legacy/portable source objects; generator maintains two companions. Runtime version selection/parity not fully traced. |
| [review-policy-inline](../../../skills/nova/plugins/review/src/review-policy-contract.ts) `REVIEW_POLICY_SCHEMA_VERSION / reviewPolicySchema` | [parseReviewPolicy](../../../skills/nova/plugins/review/src/review-policy-parser.ts#L262-L274); [resolveReviewPolicy](../../../skills/nova/plugins/review/src/review-policy-resolver.ts#L60-L86) | Current parser requires v2. Every supplied candidate is validated; the last authorized source wins as a complete policy, not a field merge. See the policy selection rules below. |

### Optional demo decision executable authority

The optional demo product decision path is an executable contract, not a
registered plugin schema. `parseProductIntent` checks closed intent and subject
objects before the POST route records the decision. `signProductIntent` emits
`demo-product-decision.v1` inside `demo-product-decision-envelope.v1`; the
signature binds the exact payload bytes under the domain
`kubeclaw.demo-product-decision.v1` followed by one NUL byte. Feature selection
requires `PRISM_PRODUCT_DECISIONS_ENABLED=true`; being optional does not remove
this public input from the schema-authority map.

The receiving Prism `receiptFor` checks `demo-product-decision-receipt.v1`
against the recorded decision and envelope. This is distinct from the external
controller's admission and signature verification; Prism-side source inspection
does not establish those remote checks or a successful execution.
[The wire-contract reference](contracts.md#optional-demo-product-decision-wire-contract)
gives exact fields, limits, consumers and identical-envelope recovery rules.
No automatic version conversion, downgrade or retirement path is established;
retain the recorded envelope and reconcile outstanding decisions before removal.

**Source:** [intent parser, signer and feature selection](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/prism/control/product-decisions.ts#L6-L72);
[POST consumer](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/prism/server/product-decisions.ts#L56-L62);
[bound receipt and reconciliation](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/skills/prism/server/product-decisions.ts#L9-L40).
No live controller or migration check was run for this entry.

### Review policy selection and rejected versions

The current policy parser accepts only `review-policy.v2`. Keeping the v1
schema file does not make v1 a valid input to that parser. Do not relabel a
retained v1 policy as v2; construct and validate the complete current policy.
This statement does not establish a migration path for older consumers.

`resolveReviewPolicy` always validates the built-in policy first. It then
validates a supplied settings-file policy and an authorized run override, in
that order. The last supplied candidate replaces the entire policy; fields
are not merged. An invalid lower-priority candidate still stops resolution.
An override requires `authorized === true`; otherwise resolution throws
`run_override review policy is not authorized` rather than falling back.

Retain the selected source and policy digest for diagnosis. Correct the owning
input or authorization before retrying; do not bypass the version guard.
A valid policy does not prove a successful review or permission to execute it.

**Source:** [skills/nova/plugins/review/src/review-policy-parser.ts:256–274](../../../skills/nova/plugins/review/src/review-policy-parser.ts#L256-L274) (committed-source SHA-256 `24c402161c2cf73a99969cd61c9f040d7598f9243327cd61325213f2b13bcbfb`).

**Source:** [skills/nova/plugins/review/src/review-policy-resolver.ts:45–86](../../../skills/nova/plugins/review/src/review-policy-resolver.ts#L45-L86) (committed-source SHA-256 `c05b626889142e5cf8bd8b9c30446c9bef87b3a7ac5d9dd10799ff769c9dc0ad`).

**Source:** [skills/nova/plugins/review/scripts/generate-policy-schema.mjs:6–13](../../../skills/nova/plugins/review/scripts/generate-policy-schema.mjs#L6-L13) (committed-source SHA-256 `7947d71484910e3433bc8eabac6ba00d79b37ce8f2f35643ac0b37a171a38c64`).

For Worker definitions select the exact `$defs` entry (for example
`workerProfile`, `workerAttemptEnvelope` or `workerAttemptResult`) and then
its actual version-dispatch path. The schema filename's directory `v1` does
not override a document or record's v2/v3 contract identity. Read
[Worker profiles and roles](worker-profiles-and-roles.md) and
[Configuration compatibility](configuration-compatibility.md) before changing
resources or recovering a retained record.

The Buster lease CRD is not plain JSON Schema: its chart conditions, templated
identity and CEL expressions remain part of the authority. Source presence
proves neither successful Helm rendering nor API admission. Nova project
helper closure and embedded review generation/parser equivalence also need
separate validation; we ran no command for this catalogue.

## Interpret nested constraints and defaults

Start from the consuming root and follow every selected branch. A valid leaf
is not enough if its parent, alternative or relationship rejects the object.

| Construct | Reading rule | Common mistake to avoid |
| --- | --- | --- |
| `properties`, `required`, `additionalProperties` | Read together at each object level; requiredness belongs to that object/branch | Treating every listed property as required or permitting unknown siblings |
| `items`, `prefixItems`, maps | Follow item/tuple/map-value constraints and cardinality, including nested objects | Checking only the container type |
| `$ref` / `$defs` | Resolve the actual document namespace and exact pointer, retaining repeated/cyclic relationships | Flattening a reference into a field name or assuming network resolution |
| `allOf`, `anyOf`, `oneOf` | Combine constraints according to the actual validator; `oneOf` requires exactly one valid alternative | Combining all alternatives into a permissive union |
| `if` / `then` / `else` | Evaluate the condition before selecting the applicable dependent constraints | Applying both branches or treating a condition as a default |
| `not` and forbidden combinations | Preserve negation and branch polarity | Reporting a forbidden required-field pattern as a positive requirement |
| dependent rules / cross-field checks | Trace both presence relationships and executable semantic checks | Accepting individually valid fields whose relationship is invalid |
| `default`, examples, deprecation | Distinguish annotations from actual resolver mutation, fallback, migration and version policy | Treating an example as permission, or an older filename as deprecated |
| bounds, format, enum and pattern | Preserve exact type/unit/range/format enforcement at the selected validator | Converting missing numbers to zero or weakening a string to make it load |

Registered document validation uses an immutable schema and isolated validators.
The ordinary route does not insert defaults. Provider **resolve** clones input
and uses a default-inserting validator. Neither route changes grants, selects
an installed provider or promises runtime success. Platform and manual
validators have separate behavior; do not transfer this rule to Helm or CRDs.

**Source — validator/default boundary:**
[validateReferencedSchema](../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L84-L113) (`skills/common/plugin-runtime/foundation/registry/schema.ts:84–113`, current-checkout SHA-256 `eb665b9db83e0d0d1bd15fbe5c6f916f479bf8a9c049de6d90b2d6f9f59cc557`).

The generated recursive config tables distinguish supported relationships and
explicit unsupported controls. Their `flattenSchema` implementation handles
its declared recursive forms and rejects unsupported keyword/reference routes;
that is not a universal interpreter for every schema language.

**Source — recursive table meaning:**
[flattenSchema — unsupported controls, references and cycles](../../../scripts/docs-configuration-inventory.mjs#L4429-L4466) (`scripts/docs-configuration-inventory.mjs:4429–4466`, current-checkout SHA-256 `f796b673f5dac812f0fb798bdfb2ff9931a0c122f3c9fb257befca05fd49010c`). [flattenSchema — recursive children, alternatives, conditions, negation and definitions](../../../scripts/docs-configuration-inventory.mjs#L4486-L4509) (`scripts/docs-configuration-inventory.mjs:4486–4509`, current-checkout SHA-256 `f796b673f5dac812f0fb798bdfb2ff9931a0c122f3c9fb257befca05fd49010c`).

For a field task, keep a record of the root path/pointer, parent object, selected
conditional branch, referenced target, exact validator and default operation.
Then use the existing [field tables](plugin-configuration.md) or
[provider fields](buster-provider-configuration.md), not a copied field list here.
If a keyword/reference or consumer is unresolved, retain that limitation instead
of omitting the rule or substituting a simpler parser.

## Coverage and unresolved authorities

The following **12 named companions** were found beyond configuration and the
37 registration files. Their source and manual/generated consumer relationships
are distinct; no direct schema-loading or recursive parity claim follows solely
from a filename. No companion is labelled obsolete without version evidence.

| Named companion | Actual source route | Remaining interpretation boundary |
| --- | --- | --- |
| [`skills/buster/plugins/api-flow/schemas/flow.schema.json`](../../../skills/buster/plugins/api-flow/schemas/flow.schema.json) | [readFlow / validateStep](../../../skills/buster/plugins/api-flow/src/provider.js#L44-L70) | Current source reads selected flow file and checks version/keys/steps manually; no direct loading of this JSON schema proved. |
| [`skills/common/plugins/operator-messaging/schemas/payload.schema.json`](../../../skills/common/plugins/operator-messaging/schemas/payload.schema.json) | [parsePayload / assertRequest](../../../skills/common/plugins/operator-messaging/src/payload.ts#L93-L108) | Runtime manual bounded parser and named JSON test reference are different evidence. Not automatically test-only schema or proven runtime JSON loader parity. |
| [`skills/common/plugins/transport-publisher/schemas/publish.schema.json`](../../../skills/common/plugins/transport-publisher/schemas/publish.schema.json) | [publicationBody](../../../skills/common/plugins/transport-publisher/src/adapter.ts#L132-L151) | Actual capability payload is manually checked. Direct JSON schema loading and parity not established. |
| [`skills/common/plugins/transport-publisher/schemas/receipt.schema.json`](../../../skills/common/plugins/transport-publisher/schemas/receipt.schema.json) | [validateResponse / retained publication receipt](../../../skills/common/plugins/transport-publisher/src/adapter.ts#L154-L191) | Receipt/manual response checks and file declaration do not establish full recursive equivalence. |
| [`skills/nova/plugins/review/schemas/echo-review-verification.v1.schema.json`](../../../skills/nova/plugins/review/schemas/echo-review-verification.v1.schema.json) | [source object -> output / --check](../../../skills/nova/plugins/review/scripts/generate-verification-schema.mjs#L5-L21) | No generation/parity command executed. |
| [`skills/nova/plugins/review/schemas/review-bundle.v1.schema.json`](../../../skills/nova/plugins/review/schemas/review-bundle.v1.schema.json) | [reviewBundleSchema / rendered output](../../../skills/nova/plugins/review/scripts/generate-bundle-schema.mjs#L5-L21) | Legacy number is not automatic deprecated status. |
| [`skills/nova/plugins/review/schemas/review-bundle.v2.schema.json`](../../../skills/nova/plugins/review/schemas/review-bundle.v2.schema.json) | [portableReviewBundleSchema / additional](../../../skills/nova/plugins/review/scripts/generate-bundle-schema.mjs#L24-L41) | No parity or execution proof. |
| [`skills/nova/plugins/review/schemas/review-policy.v1.schema.json`](../../../skills/nova/plugins/review/schemas/review-policy.v1.schema.json) | [current parser version guard](../../../skills/nova/plugins/review/src/review-policy-parser.ts#L262-L274) | Retained v1 file is not accepted by this current parser. No automatic migration or repository-wide absence of older consumers is asserted. |
| [`skills/nova/plugins/review/schemas/review-policy.v2.schema.json`](../../../skills/nova/plugins/review/schemas/review-policy.v2.schema.json) | [schema generator](../../../skills/nova/plugins/review/scripts/generate-policy-schema.mjs#L6-L13); [resolver](../../../skills/nova/plugins/review/src/review-policy-resolver.ts#L60-L86) | Generated from the current policy source object; current parser requires v2. Schema-byte equality and runtime tests are separate checks, not implications of the filename. |
| [`skills/nova/plugins/review/schemas/review-report.v1.schema.json`](../../../skills/nova/plugins/review/schemas/review-report.v1.schema.json) | [current report validator](../../../skills/nova/plugins/review/src/review-report-contract.ts#L218-L235); [governor history consumer](../../../skills/nova/plugins/review/src/review-governor-history.ts#L49-L59) | Retained v1 schema declares `review-report.v1` and no required governor. Current validator requires a governor; history accepts v2 without semantic encoding and v3 with semantic encoding, not v1. Keep retained v1 bytes with their original reader; do not relabel them or infer automatic migration. Repository-wide absence of older consumers is not established. |
| [`skills/nova/plugins/review/schemas/review-report.v2.schema.json`](../../../skills/nova/plugins/review/schemas/review-report.v2.schema.json) | [report source object acquisition](../../../skills/nova/plugins/review/scripts/generate-bundle-schema.mjs#L24-L27) | Current report validator accepts declared/portable versions; exact JSON companion parity not proved. |
| [`skills/nova/plugins/review/schemas/review-report.v3.schema.json`](../../../skills/nova/plugins/review/schemas/review-report.v3.schema.json) | [portable report output](../../../skills/nova/plugins/review/scripts/generate-bundle-schema.mjs#L24-L41) | No generated-byte parity or runtime exercise performed. |

Manifest `schemaId` values add a different identity layer: 29 declarations in
this survey refer to six logical provider input/output artifact IDs, not six
schema files. The remaining producer/consumer validation relationships are
not all established. Do not interpret an artifact ID as a config schema path.

The finite source boundary covered named manifests beneath the three plugin
roots, named schema candidates and literal CRD/OpenAPI declarations under
`charts`, the three named Worker schemas, and named Nova project/embedded
review validator entrypoints. It did not cover every other contracts root,
telemetry/API/event authority, host/Codex plugin root, tools/ops/packaging source,
dynamic registration or arbitrary embedded TS/JS schema expression. Pruned
`tests`, `test`, `fixtures`, build and dependency directories delimit traversal;
that does not prove that a shipped example or test-derived public interface is
irrelevant. Applicability must be established for each such source.

## Validate, diagnose, and change the right contract

1. Identify the exact input/output kind and its consuming caller; record the
   path, pointer, version, package identity and non-secret diagnostic.
2. Read the complete selected constraints and actual default/manual checks.
3. Use that family's existing validation instructions. Schema syntax or a
   test declaration is not an observed validator result, deployment, or API admission.
4. On failure retain the first schema path/error pointer and original input.
   Use [Configuration errors](configuration-errors.md). Fix the owning value or
   consumer relationship; do not remove the rejecting condition.
5. For a change, follow [Compatibility](configuration-compatibility.md) and
   [Change impact](configuration-change-impact.md). A new file version does
   not migrate retained records, running package snapshots or controller state.

`REGISTRY_RESULT_INVALID` names a failed referenced value; determine whether
that caller was checking configuration, input, result or checkpoint before
editing it. `REGISTRY_MANIFEST_INVALID` can mean the schema itself is invalid.
Neither error licenses bypassing strict validation.

This catalogue is authored navigation, not a new generated schema inventory.
The config generator does not currently emit this hub. See
[Documentation maintenance](../extend/documentation-maintenance.md) for
source-owned generation/check prerequisites and partial-write recovery. Real
recursive equivalence, current-byte drift rejection, intended add/change/remove
coverage, clean reproduction and reader validation remain separate work. We ran no
schema/parser/compiler, product, Helm or API validation for this page.
