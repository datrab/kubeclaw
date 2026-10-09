# Configuration Precedence and Effective Values

Status: current cross-component reference
Audience: operator, pipeline author, maintainer
Owner: platform operations
Evidence: skills/common/plugin-runtime/foundation/config/platform.ts; skills/nova/core/execution/engine-runtime.ts; skills/nova/core/test-gates/resolver.ts; tests/verification/e2e/support/platform-config.ts; charts/prism/templates/workloads.yaml
Applies to: current pipeline, project, chart, host, and Prism configuration
Last verified: 2026-10-09 at source revision `68fec9f604a116d67fde83206fcb4016fdb503e3`

## The governing rule

Precedence exists only inside a consumer that implements a merge. Two files
that configure different consumers do not override each other. For example,
Helm values can render a Nova pod environment, but they do not merge into the
`pipeline-platform.v2` JSON passed to Nova.

Use this sequence to find an effective value:

1. Identify the process or registration that consumes the field.
2. Identify the one loaded artifact or implemented merge for that consumer.
3. Apply only the documented defaults and override order below.
4. Record the effective value at the point the consumer loads it.

## Precedence by family

| Family | Lowest to highest precedence | Important boundary |
| --- | --- | --- |
| Pipeline platform | Schema-required value → optional consumer default (`effectLockTtlMs` only) | One `--platform` file; no second file or project merge. Relative paths resolve from its canonical directory. |
| Explicit pipeline graph | Exact `stage.config`/`stage.input` values → defaults or derived values implemented by that stage | Stage validation does not insert schema defaults. `pipeline-definition.v2` fields do not inherit from `nova-project.v2`; the compiler materializes a new graph. |
| Nova project | Compiler constants → optional project fields → compiler-derived repository/source bindings | Array order does not control module order. The topological graph and ID tie-break do. |
| `.swarm/pipeline.json` test nodes | Suite template → suite exclusion/override/add → direct scope nodes → matrix values → provider schema defaults → resolver policy defaults/caps | Scope concurrency may narrow a suite ceiling, never widen it. Provider plan output is resolved data, not another authoring layer. |
| Coupled `.swarm` files | Committed generation selected by `.scaffold-publication/current.json` | When publication metadata exists, loose `progress.json` and `pipeline.json` must match it. No fallback on damage. |
| Helm | Chart defaults → supplied values files/CLI values in Helm's order → rendered manifest | The running process sees only the rendered result. GitOps can reapply its declared source after manual cluster edits. |
| Kubernetes environment | Literal rendered value or selected ConfigMap/Secret key → fallback under the exact process loader condition | An empty value selects a fallback for `||` and shell `:-`, but stays explicit for `??` and shell `-`. A pod does not reload most environment values. Secret changes require rollout unless a component explicitly watches files. |
| Compact swarm profile | Standard profile → recursive `overrides` → runtime-derived `project`, `repo_root`, `paths`, `run_id` → template substitution | Applies only to callers of the compact expander; it is not the pipeline-platform authority. |
| Prism | Prism Helm values → rendered environment/files → defaults under each loader's empty-value rule → root-owned native pool policy for aggregate capacity | Environment cannot override host cgroup capacity. SPIFFE mode changes which credential variables are authoritative. |
| Plugin configuration | Exact supplied stage/observer/adapter config → that consumer's implemented fallback; test-provider authored values → schema-default resolution → provider fallback | The registry validates stages, observers, and adapters without inserting defaults. Its test-provider resolver clones values and inserts schema defaults. Grants remain separate and cannot be created by plugin config. |

## Where defaults are applied

A schema `default` is an annotation. It becomes an effective value only when a
consumer inserts it or implements the same fallback itself. Stage, observer,
and adapter validation leaves omitted optional fields absent. The stage executor
passes `definition.config` unchanged, and adapter startup returns the validated
configuration unchanged. The test-provider resolver instead clones its input
and validates that clone with default insertion enabled.

For example, the human-approval schema advertises `timeoutMinutes: 60`. The
registry leaves an omitted timeout absent. The approval parser then applies
`config.timeoutMinutes ?? DEFAULT_APPROVAL_TIMEOUT_MINUTES`, whose constant is
60. An explicit valid integer wins. An empty string fails schema validation,
and zero fails the minimum of 1. A schema annotation therefore does not prove
that the registry applied this timeout.

Collections can also have effective defaults and conditions. The direct-command
provider uses `args: []`, `workingDirectory: "."`, and `environment: {}` when
those fields are absent. It then inserts `CI: "true"`. Empty arguments remain
empty; an empty environment map still produces the CI entry. `reports: []` is
valid only with `resultMode: "exit-code"`; `"junit-required"` requires a report.
The shipped common command-runner rejects any command environment payload, so
this provider needs a compatible executor before it can run through that
boundary. The [plugin configuration reference](plugin-configuration.md) records
these conditions beside the affected fields.

Environment defaults also depend on the exact operator. Buster's generated
runtime file uses `Number(process.env.BUSTER_V2_MAX_ACTIVE_JOBS || 2)`. Both an
absent value and an empty string select 2. The non-empty string `"0"` selects
numeric zero; it does not select the fallback. Do not replace this behavior
with an absent-only rule.

> **Source evidence — default application**
>
> **Claim:** Registration validation preserves authored values; test-provider resolution inserts schema defaults in a clone; individual consumers apply their own fallbacks and collection rules.
>
> **Implementation:** [stage, observer, and adapter validation](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/common/plugin-runtime/foundation/registry/configuration.ts#L48-L81); [test-provider resolution](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/common/plugin-runtime/foundation/registry/configuration.ts#L102-L121); [validation and cloned default insertion](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/common/plugin-runtime/foundation/registry/schema.ts#L94-L113)
>
> [Stage configuration handoff](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/nova/core/execution/stage-executor.ts#L70-L74); [adapter configuration handoff](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/nova/core/execution/adapter-startup.ts#L50-L53); [approval timeout fallback](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/nova/plugins/human-approval/src/approval.ts#L67-L80)
>
> [Command defaults and report-mode conditions](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/buster/plugins/direct-command/src/provider.js#L58-L84); [common command-runner environment rejection](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/common/plugins/command-runner/src/adapter.ts#L54-L59); [Buster empty-string fallback](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/docker/buster-runtime-entrypoint.sh#L178-L187)
>
> **Contract or setting:** [approval timeout type and range](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/nova/plugins/human-approval/schemas/config.schema.json#L24-L29)
>
> **Test evidence:** [platform configuration contract checks](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L32-L65) passed locally with Node 24.21.0. This contract check does not execute a deployed plugin.
>
> **Revision:** `68fec9f604a116d67fde83206fcb4016fdb503e3`
>
> **Limit:** Source evidence establishes default selection and the executor incompatibility. It does not establish successful direct-command execution through the shipped common command-runner.

## Absence, empty, null, and false

These values are not interchangeable:

- Absent optional field: the named consumer may apply its default.
- Empty object: explicit object with no entries. It can mean “enable none,” but
  only if the containing schema permits it.
- Empty array: explicit zero selections. Some fields accept it
  (`activeAdapters`); others reject it (`installationRoots`).
- `null`: a value only where the schema explicitly admits it. Nova Blueprint
  deliverable selectors use `null` to state “not declared.”
- `false`: explicit disablement. For example, `testAgentEnabled: false` does not
  disable provider execution.
- Empty string: often invalid, but a few chart values use it as an unconfigured
  placeholder that must become non-empty when a feature is enabled.

Do not use truthiness as a general precedence rule. Check the exact loader.

## Safe effective-value inspection

Use artifacts that the consumer already exposes. Do not print secret values.

| Consumer | Safe proof |
| --- | --- |
| Nova platform | Record the platform file digest, canonical path, schema check, resolved non-secret paths, registration IDs, provider IDs, and redacted configuration keys. The run snapshot records the effective provider/grant/adapter/observer authority. |
| Project compiler | Use `--compile` to a new file and record `definitionDigest`, `stageCount`, stage types, dependency edges, and non-secret configuration. Compilation has no runtime effects. |
| `.swarm` test authoring | Run scaffold `--check`/`--print`; resolve a plan in an isolated check; record `planDigest`, node IDs, provider digests, limits, coverage, and concurrency. |
| Helm | Run schema validation and render manifests. Inspect image digests, resource limits, volume paths, identity names, and Secret references, not Secret data. |
| Kubernetes | Compare workload generation/checksum and environment sources. Use the Secret name/key pair as evidence, never decoded contents. |
| Prism native | Inspect the policy digest, node identity, cgroup files, and readiness result. Do not treat Helm requests as actual host capacity. |

Redaction must preserve structure. Replace a secret value with `<redacted>` and
retain its source name/key. Hashing a low-entropy token is not safe redaction.

## Conflicts and common mistakes

- A stage agent name does not override the runtime-dispatch adapter target.
- Provider configuration does not grant the provider a capability.
- `activeAdapters` controls activation; an entry in `adapters` alone does not.
- A project's `maximumConcurrency`, a graph's `maxConcurrency`, a test plan's
  group limits, and a worker's capacity govern different schedulers.
- Editing a live ConfigMap does not change GitOps authority and may be reverted.
- Editing a materialized `.swarm/pipeline.json` without publishing its pair
  produces divergence, not a higher-precedence project value.
- Changing environment after a process captured its startup snapshot has no
  effect on that process.

> **Source evidence — implemented merges**
>
> **Claim:** Platform paths resolve from one canonical file, test scopes have an explicit template/project/policy resolution order, and compact profile overrides can change only known paths.
>
> **Implementation:** [platform load and path base](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/common/plugin-runtime/foundation/config/platform.ts#L36-L69); [suite expansion and lowest requested concurrency](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/nova/core/test-gates/resolver.ts#L304-L353)
>
> [Suite overrides, direct nodes, and project concurrency](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/nova/core/test-gates/resolver.ts#L354-L393); [known-path compact overrides](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/tests/verification/e2e/support/platform-config.ts#L98-L129)
>
> **Contract or setting:** [runtime records the effective authority subset](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/skills/nova/core/execution/engine-runtime.ts#L29-L42)
>
> **Test evidence:** [platform configuration contract checks](https://github.com/datrab/kubeclaw/blob/68fec9f604a116d67fde83206fcb4016fdb503e3/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L32-L65)
>
> **Revision:** `68fec9f604a116d67fde83206fcb4016fdb503e3`
>
> **Limit:** This precedence map does not replace Helm's own multi-file ordering or an external GitOps controller's declared reconciliation policy.
