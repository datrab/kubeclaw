# Configuration

Status: bounded reference; discovery limitations stated below
Audience: operator, project author, plugin author, maintainer
Owner: documentation; consumer semantics belong to the named component
Evidence: skills/common/plugin-runtime/foundation/config/platform.ts; skills/common/plugin-runtime/foundation/registry/configuration.ts; skills/common/plugin-runtime/foundation/registry/schema.ts; skills/nova/project/cli.ts; skills/prism/server/control-config.ts; scripts/docs-configuration-inventory.mjs
Applies to: the consumer families and source boundaries listed on this page
Last verified: 2026-10-15; source behavior checked from current files; no validation or deployment run

## Find the setting before changing it

Start with the process or artifact that consumes the value, not its filename.
A Helm value, a platform grant, and a stage setting can share a name without
sharing authority. Changing one does not override the other two.

1. Find the consumer in the family table below.
2. Open its detailed reference and identify the exact field, version, and default rule.
3. Use the change class and diagnostic route for that consumer before activation.

For a schema keyword or a contract that describes an input or result, use
[Schema authorities](schemas.md). For a package name versus a caller grant or
native-host permission, use [Roles and package ownership](roles-and-package-ownership.md).

## Select the configuration family

The component in the Consumer column owns the behavior. These routes describe
named, supported source families; they are not a claim that every possible
configuration source in the repository has been catalogued.

| Artifact or setting | Version / selection | Consumer and authority | Defaults and override boundary | Detailed route |
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
| Prism process environment and credentials | Exact service loader and trust mode | `loadControlCompositionConfig` snapshots environment at startup; other services have their own loaders | Required credentials differ by trust branch; environment is not a universal live override layer | [Environment variables](environment-variables.md), [Secrets](secrets.md), [host settings](host-and-prism-configuration.md) |
| Prism native pool host policy | Root-owned policy schema `1`, actual node and cgroup state | Native supervisor and host readiness checks | Aggregate host limits and identity are not granted by an environment pointer or worker profile | [Host and Prism configuration](host-and-prism-configuration.md), [worker roles](worker-profiles-and-roles.md) |
| Lint policy and generated tool settings | Selected policy and tool contract | Lint loader, resolver, admission and tool runners | Use the lint-specific precedence, baseline and waiver rules, not plugin-config default rules | [Lint policy](lint-policy.md), [generated facts](lint-policy-generated.md) |

**Source — explicit platform and project acquisition:**
[loadPlatformConfig / resolvePaths](../../../skills/common/plugin-runtime/foundation/config/platform.ts#L53-L69) (`skills/common/plugin-runtime/foundation/config/platform.ts:53–69`, current-checkout SHA-256 `4bce96fe0b9556266c7586aa7803f6ff790dfd7f74e4952ddc5ebd25f9ebc7e8`). [project CLI acquisition and runtime preparation](../../../skills/nova/project/cli.ts#L16-L39) (`skills/nova/project/cli.ts:16–39`, current-checkout SHA-256 `6dbf4cb0a699b1e4c5e64c7f94d1bcbe9bdba1fcd1cf5232d81d7ad45ea5f366`).

## Determine the effective value

There is no global last-writer-wins rule. Record the family first, then apply
its [precedence rules](configuration-precedence.md). Keep these cases distinct:

| Case | What to establish | What not to infer |
| --- | --- | --- |
| Omitted field | Whether the exact schema requires it; whether the actual resolver or consumer supplies it | A displayed schema `default` means every caller inserts it |
| Empty string | Whether that field permits it, uses `??`, or requires non-empty text | Empty equals omitted; `??` only replaces null or undefined |
| `null` | Whether schema type/branch allows null before consumer fallback | A null value always clears a setting |
| `false` or `0` | Exact type and allowed range, then the real consumer condition | False/zero means missing or disable everywhere |
| Object / array | Exact family merge or replacement behavior | Helm, compact profiles, provider config and platform JSON share one merge algorithm |
| Relative path | The loader's path origin and canonical-file handling | Every path is relative to the shell working directory |
| Secret reference | Named Secret/key or file plus the actual receiving process | A reference proves the credential exists, is valid, or is authorized |

The platform loader uses strict validation without a default-insertion option.
It resolves installation roots, trusted built-in roots, storage root and
optional cgroup root relative to the real platform file's directory, then
freezes the result. It does not merge an environment object into that file.

Registered configuration has two deliberately different operations:

- **Validate:** check the provided value without inserting defaults. Stage,
  enabled observer/adapter, and `validateTestProviderConfiguration` use this route.
- **Resolve provider configuration:** clone the supplied value, validate the
  clone with default insertion, and return a `provider-configuration.v1` record
  with contract ID, schema digest and resolved values. The original input is
  not rewritten. Resolution still does not install or grant a provider.

**Source — validation versus resolution:**
[validateReferencedSchema](../../../skills/common/plugin-runtime/foundation/registry/schema.ts#L84-L113) (`skills/common/plugin-runtime/foundation/registry/schema.ts:84–113`, current-checkout SHA-256 `eb665b9db83e0d0d1bd15fbe5c6f916f479bf8a9c049de6d90b2d6f9f59cc557`). [validateTestProviderConfiguration / resolveTestProviderConfiguration](../../../skills/common/plugin-runtime/foundation/registry/configuration.ts#L82-L121) (`skills/common/plugin-runtime/foundation/registry/configuration.ts:82–121`, current-checkout SHA-256 `94f711ce386148d0aa3e114512afb3fcf8b69ef41c14b7e5215d17881fe66a2f`).

### Concrete route: a missing provider option

Suppose a provider field has a default in its registered schema. First open
[Provider configuration](buster-provider-configuration.md) and identify the
contract ID and field. Check whether your caller resolves configuration or
only validates it. A successful validation alone does not prove that the
provider received a filled-in value. Retain the non-secret resolved contract
ID/schema digest and the exact provider field, rather than printing the whole
resolved object. If the provider is unavailable, diagnose installation,
selection, grants and service availability separately from field validity.

### Concrete route: a Prism URL

`loadControlServerConfig` uses `PRISM_WORKER_URL ?? 'http://prism-worker:8080'`
and constructs a URL. An omitted variable selects that loader fallback; an
empty string is not replaced by `??` and must still be a valid URL. The
composition function copies the environment before asynchronous authority
loading. Changing a deployment Secret or shell variable does not update the
already captured process configuration.

**Source — startup capture and URL fallback:**
[loadControlServerConfig / loadControlCompositionConfig](../../../skills/prism/server/control-config.ts#L36-L72) (`skills/prism/server/control-config.ts:36–72`, current-checkout SHA-256 `9da649103dd1bf2c1a95f533725942bd760e80f1353d4e0db924c4053c8dcd7a`).

## Change and reload boundaries

Use [Configuration change impact](configuration-change-impact.md) for the
complete procedure. The following distinctions prevent unsafe shortcuts:

| Changed authority | Required boundary to check | Preserve before changing |
| --- | --- | --- |
| Platform packages, providers, grants, adapters, observers or graph | Existing run snapshots pin effective authority and graph/package identities; changed authority normally belongs to a new run | Prior platform, original graph, package identities and run ID |
| Platform shutdown/effect-lock timeouts | Recreate the consuming objects; new CLI invocation or restart if startup-loaded. Timeout-only change is not itself a new-run requirement in the recorded runtime subset | Original values, drain state and first shutdown diagnostic |
| Provider plan or coupled `.swarm` files | Republish a consistent generation, then use its new resolved plan/run | Original pair/generation and plan digest; do not fix only one loose copy |
| Pod template, environment or startup-mounted configuration | Identify the rendered receiving workload and its restart/rollout behavior; no general hot reload promise | Redacted rendered values, workload identity and previous generation |
| Signing material or trust identity | Component-specific coordinated credential rotation and restart/reload rule | Old/new acceptance window and identity; never publish private bytes |
| Native pool policy or capacity | Host preparation, actual cgroup/identity checks, then worker readiness | Policy identity, host state, active attempts and drain status |
| Persistent location or data format | Component backup/restore/migration procedure, not just a values edit | Proven backup and restore route, ownership and store identity |

These are selection rules, not permission to run a deployment or migration.
A value is **hot** only where the named consumer explicitly watches or rereads it.
See the source-linked change matrix for recovery pins and field-specific exceptions.

## Diagnose without exposing secrets

1. Retain the first diagnostic, artifact version, canonical input path and
   source/package identity. Redact tokens, private keys, Secret contents and
   credential-bearing URLs. Do not paste a full environment or config dump.
2. Match the prefix to [Configuration errors](configuration-errors.md).
3. Correct the owning input, not a different layer with a similar name.
4. Follow that family's validation route before restart, republish or new run.
   Preserve the prior working bytes and unresolved cleanup state if activation fails.

| Signal / question | First route | Stop condition |
| --- | --- | --- |
| `PLATFORM_CONFIG_INVALID` | Platform JSON pointer and [platform fields](pipeline-platform.md) | Unknown version/key/type; do not coerce it to another family |
| `REGISTRY_REGISTRATION_MISSING` / missing stage owner | Exact package registration, enabled owner and grants | Do not widen unrelated grants or pretend schema success activates a package |
| `REGISTRY_RESULT_INVALID` | Named schema path and validator errors | Determine config/input/result/checkpoint route before modifying a value |
| `PROJECT_*` / graph error | [Project](nova-project.md), then [graph](pipeline-definition.md) | Compilation is not proof of plugin execution or a valid deployment |
| Prism required value or URL failure | Exact service loader, rendered environment and [Secrets](secrets.md) | Credential presence is not downstream authentication success |
| Worker admission failure | Selected resource version and [host policy](host-and-prism-configuration.md) | Do not convert missing accounting to zero or bypass native readiness |

## Facts, generated tables, and coverage limits

[Plugin configuration](plugin-configuration.md), [Helm values](helm-values.md)
and [Environment variables](environment-variables.md) retain their existing
field inventories. This page is an authored selector; it is not another
manually copied field table and is not a newly generated inventory output.
The documentation generator's current write map does not generate this hub.

The current configuration discovery has separate YAML/Helm, runtime environment
and owned CLI routes. Its registered-schema selector covers platform plus
`configSchema` registrations under `skills/common/plugins`, `skills/nova/plugins`
and `skills/buster/plugins`. That selector does not discover every contract,
embedded validator, host input or dynamically constructed source.

**Source — declared discovery boundaries:**
[registeredSchemaAuthorities](../../../scripts/docs-configuration-inventory.mjs#L3073-L3103) (`scripts/docs-configuration-inventory.mjs:3073–3103`, current-checkout SHA-256 `f796b673f5dac812f0fb798bdfb2ff9931a0c122f3c9fb257befca05fd49010c`). [buildRuntimeInputInventory](../../../scripts/docs-configuration-inventory.mjs#L8422-L8455) (`scripts/docs-configuration-inventory.mjs:8422–8455`, current-checkout SHA-256 `f796b673f5dac812f0fb798bdfb2ff9931a0c122f3c9fb257befca05fd49010c`).

To maintain these references, use the prerequisite and failure guidance in
[Documentation maintenance](../extend/documentation-maintenance.md). Inventory
checks and mutation tests can launch external tools; they are not passive
reads. A missing source/tool guard is a stop, not a reason to skip semantics.
No check, reload, live consumer or deployment was executed to produce this page.

Global family discovery and inverse consumer coverage are still incomplete.
In particular, unsupported/unresolved sources must be classified before this
selector can be treated as an all-family inventory. Use [Schema coverage
limits](schemas.md#coverage-and-unresolved-authorities) for the finite companion,
contract-root and embedded-validator boundaries; do not infer support from a
filename or infer exclusion from a pruned directory.
