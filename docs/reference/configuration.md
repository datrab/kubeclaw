# Configuration

Status: generated checked-in configuration reference; consumer boundaries below
Audience: operator, project author, plugin author, maintainer
Owner: documentation; each named consumer owns its setting semantics
Evidence: docs/generated/inventory/configuration-families.json; docs/config/configuration-family-map.json; scripts/docs-configuration-inventory.mjs
Applies to: current selected configuration families, source contracts and inverse-consumer routes
Last verified: 2026-10-31; guarded source inventory, not a deployment or live-reload observation
Source snapshot: `95d336f4e92ea4b5b1f821caefe13949d2ed6fc8`

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `docs/generated/inventory/configuration-families.json`, `docs/config/configuration-family-map.json`

## Find the setting before changing it

Start with the process or artifact that consumes the value, not its filename.
A Helm value, a platform grant and a stage setting can share a name without
sharing authority. Changing one does not override the other two.

1. Find the family or consuming component in the tables below.
2. Open its detailed reference and identify the exact field, version and default rule.
3. Follow that consumer's validation, change and recovery boundary before activation.

For input, result and checkpoint contracts that are not configuration settings,
use [Schema authorities](schemas.md). For a package versus a caller grant or
native-host permission, use [Roles and package ownership](roles-and-package-ownership.md).

## Select the configuration family

The detailed route supplies field-specific contracts. A schema shape, copied
file, generated result or successful compilation is not proof of activation.

| Family / artifact | Selection | Consumer and authority | Defaults and override boundary | Detailed route |
| --- | --- | --- | --- | --- |
| Platform JSON | `pipeline-platform.v2` | Foundation `loadPlatformConfig`; Nova receives this explicit file | One canonical file; schema validation precedes canonical-file-relative path resolution. No Helm or compact-profile merge | [Pipeline platform](pipeline-platform.md) |
| Nova project JSON | `nova-project.v2`, `--project` and `--platform` route | Nova project CLI and `compileProject`; graph preparation then checks installed registrations and grants | Closed project input compiles a separate graph; it is not an overlay on platform trust | [Nova project](nova-project.md) |
| Explicit execution graph | `pipeline-definition.v2`; no `--project` route delegates to the Core CLI | Nova graph builder and registry-backed stage validation | Stage `config` and `input` use their own installed registration authorities | [Pipeline definition](pipeline-definition.md) |
| Project authoring pair | `.swarm/pipeline.json` and `.swarm/progress.json` | Publication store, test-plan resolver, explicit project import routes | Coupled generation, not two independent editable effective files; pipeline JSON has no universal root version marker | [Project pipeline JSON](pipeline-json.md), [publication](project-pipeline-publication.md) |
| Plugin stage, observer, adapter configuration | Exact installed package registration and `configSchema` | Foundation registry; enabled owner and exact schema select meaning | Ordinary validation does not insert schema defaults; enabled observer/adapter missing config is passed as `{}` | [Plugin configuration](plugin-configuration.md), [plugin catalogue](../extend/plugin-catalogue/README.md) |
| Buster test-provider configuration | Contract ID, selected provider, `provider-configuration.v1` resolved output | Registry test-provider resolution and actual provider implementation | Resolve clones values and validates with default insertion; grants and provider availability remain separate | [Provider fields](buster-provider-configuration.md), [runtime settings](buster-runtime-configuration.md), [suites](buster-suites.md) |
| Worker resources and profile | Selected v1/v2/v3 contract path, not highest filename | Worker admission/version dispatch; Prism native worker uses v3 admission | v2 process budgets and v3 native task budgets are not interchangeable; absent measurement is not zero | [Worker profiles and roles](worker-profiles-and-roles.md), [compatibility](configuration-compatibility.md) |
| KubeClaw / Prism / GitOps deployment values | Exact chart, release values, supported overlays | Helm templates, GitOps receiver, then each workload | Ordered values merging is specific to the deployment route; absent upstream values can select receiver defaults | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| Compact swarm profile | Shipped `standard` profile; callers of its expander | Shipped classic configuration and verification-support expansion | Exact profile/features/tuning assertions; existing override leaf paths only. Not accepted by platform loader | [Host and Prism configuration](host-and-prism-configuration.md) |
| OpenClaw / Codex routing and host settings | Rendered gateway/agent input and selected runtime-dispatch target | Gateway or host plugin, not a Nova stage field alone | A target/model label neither edits gateway settings nor proves credentials or capacity | [Host and Prism configuration](host-and-prism-configuration.md), [OpenClaw](../understand/openclaw.md) |
| Runtime process environment and credentials | Exact service loader and trust mode | Each named receiving process and its field-specific environment contract | Required credentials differ by trust branch; environment is not a universal live override layer | [Environment variables](environment-variables.md), [Secrets](secrets.md), [host settings](host-and-prism-configuration.md) |
| Prism native pool host policy | Root-owned policy schema `1`, actual node and cgroup state | Native supervisor and host readiness checks | Aggregate host limits and identity are not granted by an environment pointer or worker profile | [Host and Prism configuration](host-and-prism-configuration.md), [worker roles](worker-profiles-and-roles.md) |
| Lint policy and generated tool settings | Selected policy and tool contract | Lint loader, resolver, admission and tool runners | Use the lint-specific precedence, baseline and waiver rules, not plugin-config default rules | [Lint policy](lint-policy.md), [generated facts](lint-policy-generated.md) |
| Owned CLI and maintenance inputs | The exact command parser, explicit scope and selected input file. | skills/nova/project/cli.ts | A command has no shared global precedence; its argument/duplicate/default contract applies. Maintenance evidence or a dry run is not permission to mutate product state. | [CLI](cli.md), [verification commands](verification-commands.md) |
| Durable storage, limits and retention | Explicit storage constructor, selected runtime owner and versioned durable record. | skills/common/plugin-runtime/foundation/observability/durable-records.ts | Caller-supplied limits and storage roots remain distinct from stored event/result data. A new storage root is not an automatic migration or retention waiver. | [Change impact](configuration-change-impact.md), [observability](stores-and-retention.md) |

## Start from a consumer

Use the consumer below to return to its configuration family. The complete index of recorded
field contracts and whole-file delivery boundaries, including registration, transport, runtime and
explicit non-delivery roles, is in [`docs/generated/inventory/configuration-families.json`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/docs/generated/inventory/configuration-families.json#L1-L1).
A registration declaration or ConfigMap copy remains distinct from a runtime reader.
A payload source tree is not field-level runtime behavior: delivery of a whole file
does not prove that its tool or image reads every key or inserts a default.

| Consuming source | Configuration family | Detailed route |
| --- | --- | --- |
| [`charts/kubeclaw/values.yaml`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/charts/kubeclaw/values.yaml#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`contracts/pipeline-worker-core/v1/src/resource-validation-v3.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/contracts/pipeline-worker-core/v1/src/resource-validation-v3.ts#L1-L1) | Worker resources and profile | [Worker profiles and roles](worker-profiles-and-roles.md), [compatibility](configuration-compatibility.md) |
| [`scripts/argocd-self-management.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/argocd-self-management.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/build-runtime-role-bundle.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/build-runtime-role-bundle.mjs#L1-L1) | Owned CLI and maintenance inputs | [CLI](cli.md), [verification commands](verification-commands.md) |
| [`scripts/gitops-continuous.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/gitops-continuous.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/gitops-owner.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/gitops-owner.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/gitops.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/gitops.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/install/register-runtime-argo.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/install/register-runtime-argo.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/observability-retirement-plan.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/observability-retirement-plan.mjs#L1-L1) | Owned CLI and maintenance inputs | [CLI](cli.md), [verification commands](verification-commands.md) |
| [`scripts/recover-openclaw-audit-input.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/recover-openclaw-audit-input.mjs#L1-L1) | Owned CLI and maintenance inputs | [CLI](cli.md), [verification commands](verification-commands.md) |
| [`scripts/render-stateful-network-policies.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/render-stateful-network-policies.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/updates/deployment-release.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/updates/deployment-release.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/updates/materialize-release.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/updates/materialize-release.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/updates/refresh-versions.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/updates/refresh-versions.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/updates/release-images.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/updates/release-images.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`scripts/versions.mjs`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/scripts/versions.mjs#L1-L1) | KubeClaw / Prism / GitOps deployment values | [Helm values](helm-values.md), [precedence](configuration-precedence.md), [API updates](api-object-updates.md) |
| [`skills/buster/engine/test-gates/artifacts.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/buster/engine/test-gates/artifacts.ts#L1-L1) | Buster test-provider configuration | [Provider fields](buster-provider-configuration.md), [runtime settings](buster-runtime-configuration.md), [suites](buster-suites.md) |
| [`skills/buster/engine/test-gates/runner.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/buster/engine/test-gates/runner.ts#L1-L1) | Buster test-provider configuration | [Provider fields](buster-provider-configuration.md), [runtime settings](buster-runtime-configuration.md), [suites](buster-suites.md) |
| [`skills/common/plugin-runtime/foundation/config/platform.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/common/plugin-runtime/foundation/config/platform.ts#L1-L1) | Platform JSON | [Pipeline platform](pipeline-platform.md) |
| [`skills/common/plugin-runtime/foundation/config/published-pair.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/common/plugin-runtime/foundation/config/published-pair.ts#L1-L1) | Project authoring pair | [Project pipeline JSON](pipeline-json.md), [publication](project-pipeline-publication.md) |
| [`skills/common/plugin-runtime/foundation/observability/durable-attempts.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/common/plugin-runtime/foundation/observability/durable-attempts.ts#L1-L1) | Durable storage, limits and retention | [Change impact](configuration-change-impact.md), [observability](stores-and-retention.md) |
| [`skills/common/plugin-runtime/foundation/observability/durable-delivery.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L1-L1) | Durable storage, limits and retention | [Change impact](configuration-change-impact.md), [observability](stores-and-retention.md) |
| [`skills/common/plugin-runtime/foundation/observability/durable-records.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/common/plugin-runtime/foundation/observability/durable-records.ts#L1-L1) | Durable storage, limits and retention | [Change impact](configuration-change-impact.md), [observability](stores-and-retention.md) |
| [`skills/common/plugin-runtime/foundation/registry/configuration.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/common/plugin-runtime/foundation/registry/configuration.ts#L1-L1) | Plugin stage, observer, adapter configuration; Buster test-provider configuration | [Plugin configuration](plugin-configuration.md), [plugin catalogue](../extend/plugin-catalogue/README.md)<br>[Provider fields](buster-provider-configuration.md), [runtime settings](buster-runtime-configuration.md), [suites](buster-suites.md) |
| [`skills/common/plugins/runtime-dispatch/src/openclaw-result.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/common/plugins/runtime-dispatch/src/openclaw-result.ts#L1-L1) | OpenClaw / Codex routing and host settings | [Host and Prism configuration](host-and-prism-configuration.md), [OpenClaw](../understand/openclaw.md) |
| [`skills/common/plugins/runtime-dispatch/src/openclaw.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/common/plugins/runtime-dispatch/src/openclaw.ts#L1-L1) | OpenClaw / Codex routing and host settings | [Host and Prism configuration](host-and-prism-configuration.md), [OpenClaw](../understand/openclaw.md) |
| [`skills/nova/core/execution/graph-build.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/nova/core/execution/graph-build.ts#L1-L1) | Explicit execution graph | [Pipeline definition](pipeline-definition.md) |
| [`skills/nova/core/observability/reconciler.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/nova/core/observability/reconciler.ts#L1-L1) | Durable storage, limits and retention | [Change impact](configuration-change-impact.md), [observability](stores-and-retention.md) |
| [`skills/nova/plugins/lint/src/engine/policy.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/nova/plugins/lint/src/engine/policy.ts#L1-L1) | Lint policy and generated tool settings | [Lint policy](lint-policy.md), [generated facts](lint-policy-generated.md) |
| [`skills/nova/project/cli.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/nova/project/cli.ts#L1-L1) | Nova project JSON; Owned CLI and maintenance inputs | [Nova project](nova-project.md)<br>[CLI](cli.md), [verification commands](verification-commands.md) |
| [`skills/nova/project_setup/tools/progress-scaffold.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/nova/project_setup/tools/progress-scaffold.ts#L1-L1) | Project authoring pair | [Project pipeline JSON](pipeline-json.md), [publication](project-pipeline-publication.md) |
| [`skills/prism/config/database-bootstrap.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/prism/config/database-bootstrap.ts#L1-L1) | Runtime process environment and credentials | [Environment variables](environment-variables.md), [Secrets](secrets.md), [host settings](host-and-prism-configuration.md) |
| [`skills/prism/config/native-worker.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/prism/config/native-worker.ts#L1-L1) | Prism native pool host policy | [Host and Prism configuration](host-and-prism-configuration.md), [worker roles](worker-profiles-and-roles.md) |
| [`skills/prism/server/control-config.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/prism/server/control-config.ts#L1-L1) | Runtime process environment and credentials | [Environment variables](environment-variables.md), [Secrets](secrets.md), [host settings](host-and-prism-configuration.md) |
| [`skills/prism/server/ingestion.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/prism/server/ingestion.ts#L1-L1) | Runtime process environment and credentials | [Environment variables](environment-variables.md), [Secrets](secrets.md), [host settings](host-and-prism-configuration.md) |
| [`skills/worker/core/worker/ownership-store.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/skills/worker/core/worker/ownership-store.ts#L1-L1) | Durable storage, limits and retention | [Change impact](configuration-change-impact.md), [observability](stores-and-retention.md) |
| [`tests/verification/e2e/support/platform-config.ts`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/tests/verification/e2e/support/platform-config.ts#L1-L1) | Compact swarm profile | [Host and Prism configuration](host-and-prism-configuration.md) |

## Determine the effective value

There is no global last-writer-wins rule. Record the family first, then use
[Configuration precedence](configuration-precedence.md).

| Input state | What to establish | Do not infer |
| --- | --- | --- |
| Omitted field | Exact schema requirement and actual resolver/consumer fallback. | A displayed schema default is inserted by every caller. |
| Empty string | Whether the receiver permits it, uses a nullish fallback or requires nonempty text. | Empty equals omitted. |
| null, false or zero | The exact type/branch and the consumer condition. | All false-like values disable or clear a setting. |
| Object or array | This family’s merge, replacement and resolution rules. | Helm, compact profiles and plugin configuration share one merge algorithm. |
| Relative path | The loader’s canonical input and path origin. | Every path is relative to the current shell directory. |
| Secret reference | Named Secret/key/file and the actual receiving process. | A reference proves contents, authorization or successful authentication. |

### Example: a provider default

Identify the contract ID and field in [Provider configuration](buster-provider-configuration.md).
Check whether the caller only validates or resolves provider configuration.
Ordinary validation does not insert defaults. Resolution clones values and
validates with default insertion; it does not install, grant or execute a provider.
Retain the non-secret contract/schema identity and selected field, not the resolved object.

### Example: an empty Prism URL

The control loader uses `PRISM_WORKER_URL ?? 'http://prism-worker:8080'`.
Omission selects that fallback; an empty string does not. It must still be a
valid URL. Composition captures the process environment before asynchronous
loading, so editing a Secret does not update an already captured configuration.
Use [Environment variables](environment-variables.md) and the exact receiving contract.

## Change and reload boundaries

A setting is hot only when its named consumer explicitly watches or rereads it.
Use [Configuration change impact](configuration-change-impact.md) for the procedure.

| Configuration family | Change / retention boundary |
| --- | --- |
| Platform JSON | Recreate the consuming objects or invoke the CLI with the new file; retain existing run snapshot pins. A recorded timeout-only runtime change is not itself proof that every change requires a new run. |
| Nova project JSON | Compile/prepare a new project/graph input and preserve the prior run inputs; compilation does not prove installed-stage execution. |
| Explicit execution graph | Use the explicit new graph with its registry/grant validation. Existing run/package/graph pins remain authoritative for an existing run. |
| Project authoring pair | Publish one consistent pair generation and retain prior generation/pins; do not edit loose members independently or infer live-run activation. |
| Plugin stage, observer, adapter configuration | The exact registry operation and consumer own loading. Ordinary validation does not insert defaults; a changed package/config does not automatically alter an existing snapshot. |
| Buster test-provider configuration | Resolve a new plan/configuration through the selected provider. Resolution clones/validates with defaults, but does not execute or grant the provider. |
| Worker resources and profile | Use the selected contract/version admission path for new work. Keep actual accounting and host authorization distinct; do not replace missing observations with zero. |
| KubeClaw / Prism / GitOps deployment values | Review the rendered receiver and reconcile through its deployment owner. A Pod-template/startup input can require rollout; rendering is not admission or rollout completion. |
| Compact swarm profile | Follow the shipped profile/expander and actual consuming image/support boundary. This is not platform-loader acceptance or a universal runtime merge/reload rule. |
| OpenClaw / Codex routing and host settings | Change the selected gateway/host/adapter authority through its owner. A target label or model selection does not prove credentials, available capacity or an updated existing session. |
| Runtime process environment and credentials | Follow the individual receiving contract. Startup-captured services require process recreation; no universal hot-reload rule is inferred for all variables or credentials. |
| Prism native pool host policy | Use host preparation, drain/active-attempt ownership and readiness checks before new work. Policy identity and actual node/cgroup state cannot be granted by a pointer. |
| Lint policy and generated tool settings | The next owning policy load applies its baseline/waiver/admission rules. Preserve current report/baseline/approval evidence and expiry rather than suppressing failures implicitly. |
| Owned CLI and maintenance inputs | A new invocation rereads explicit arguments/scope. Mutation, apply, import, rotation or deletion requires its own command boundary; dry-run evidence does not grant those actions. |
| Durable storage, limits and retention | Reconfigure via the owning constructor/runtime and preserve store identities, locks, journals and retention/migration rules. Changing a path does not migrate or authorize retiring data. |

## Diagnose without exposing secrets

1. Retain the first diagnostic, input version, canonical source and redacted owner identity.
2. Follow the family’s schema, registration, grant and receiver route. Do not widen unrelated authority.
3. Keep the prior working generation and unresolved cleanup state if activation fails.
4. Verify the actual receiving process before retiring a prior Secret or input generation.

Use [Common errors](common-errors.md) for a named diagnostic and
[Secrets](secrets.md) for redacted source/consumer/rotation boundaries.

## Source coverage and explicit limits

The current composition retains the selected YAML/Helm authority and receiver
checks, registered schemas, deployed and undeployed payload boundaries,
owned runtime/CLI inputs, configured environment selectors and direct host,
publication and durable-storage source contracts. The inverse index records
actual field contracts rather than promoting every candidate source file to a reader.

Local validation fixtures and documentation output do not become configuration
emitters because their bytes happen to be JSON, YAML or Kubernetes-shaped.
Dynamic or external input without qualified provenance is not evaluated as a
working setting. Generic acquisition limitations do not supply facts or defaults:
the included facts require their direct source and receiving contracts.

The broad executable program-output API discovery path is separate and is not
certified by this composition. It does not replace [API fields](api-object-updates.md),
prove a deployed effective value or establish successful reload, admission or rotation.

### Payloads without a proved checked-in runtime reader or delivery

| Source payload | Declared boundary |
| --- | --- |
| [`charts/kubeclaw/files/config/lint-policy.json`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/charts/kubeclaw/files/config/lint-policy.json#L1-L1) | The repository proves a parser for request.policyPath, but it does not bind that request field to /runtime-config/lint-policy.json. Materialization and parsing are separate proved boundaries, not a continuous runtime chain. |
| [`charts/kubeclaw/files/config/swarm.config.json`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/charts/kubeclaw/files/config/swarm.config.json#L1-L1) | The chart materializes the file and injects its mounted path through SWARM_CONFIG. The image-owned process reader and field behavior are not checked in, so path injection does not prove field-level runtime meaning. |
| [`charts/kubeclaw/files/config/kubernetes-policy-pack-default.json`](https://github.com/datrab/kubeclaw/blob/95d336f4e92ea4b5b1f821caefe13949d2ed6fc8/charts/kubeclaw/files/config/kubernetes-policy-pack-default.json#L1-L1) | The checked-in chart does not embed or copy kubernetes-policy-pack-default.json. The deployed lint policy references this file, so the runtime loader rejects that reference unless another unsupported process supplies the missing file. |

A source file or stored payload is not a working operator option when its reader or delivery is unproved.

## Maintain this reference

Generate the guarded configuration artifacts with
`node scripts/docs-configuration-inventory.mjs --configuration-reference-only`,
then the hub with `node scripts/docs-generate.mjs --only configuration-hub --revision COMMIT`.
Use a reviewed commit containing the current source, map and inventory bytes.
This bounded route does not advance the shared documentation source lock.
Use their `--check` modes for drift. A changed selected source, missing family,
inverse consumer or source authority is a stop, not permission to relabel unknown data.
These commands do not claim the normal global configuration/API command passed.



<!-- END GENERATED -->
