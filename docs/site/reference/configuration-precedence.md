# Configuration Precedence and Effective Values

Status: current cross-component reference
Audience: operator, pipeline author, maintainer
Owner: platform operations
Evidence: skills/common/plugin-runtime/foundation/config/platform.ts; skills/nova/core/execution/engine-runtime.ts; skills/nova/core/test-gates/resolver.ts; tests/verification/e2e/support/platform-config.ts; charts/prism/templates/workloads.yaml
Applies to: current pipeline, project, chart, host, and Prism configuration
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

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
| Explicit pipeline graph | Registration schema defaults → exact `stage.config`/`stage.input` values in the one loaded definition | `pipeline-definition.v2` fields do not inherit from `nova-project.v2`; the compiler materializes a new graph. |
| Nova project | Compiler constants → optional project fields → compiler-derived repository/source bindings | Array order does not control module order. The topological graph and ID tie-break do. |
| `.swarm/pipeline.json` test nodes | Suite template → suite exclusion/override/add → direct scope nodes → matrix values → provider schema defaults → resolver policy defaults/caps | Scope concurrency may narrow a suite ceiling, never widen it. Provider plan output is resolved data, not another authoring layer. |
| Coupled `.swarm` files | Committed generation selected by `.scaffold-publication/current.json` | When publication metadata exists, loose `progress.json` and `pipeline.json` must match it. No fallback on damage. |
| Helm | Chart defaults → supplied values files/CLI values in Helm's order → rendered manifest | The running process sees only the rendered result. GitOps can reapply its declared source after manual cluster edits. |
| Kubernetes environment | Literal rendered value or selected ConfigMap/Secret key → process loader default only when the variable is absent | A pod does not reload most environment values. Secret changes require rollout unless a component explicitly watches files. |
| Compact swarm profile | Standard profile → recursive `overrides` → runtime-derived `project`, `repo_root`, `paths`, `run_id` → template substitution | Applies only to callers of the compact expander; it is not the pipeline-platform authority. |
| Prism | Prism Helm values → rendered environment/files → loader defaults for absent variables → root-owned native pool policy for aggregate capacity | Environment cannot override host cgroup capacity. SPIFFE mode changes which credential variables are authoritative. |
| Plugin configuration | Registration schema defaults → exact platform/stage/provider config supplied to that registration | Unknown fields and types fail; grants remain separate and cannot be created by plugin config. |

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
> **Implementation:** [platform load and path base](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.ts#L36-L69); [suite expansion and lowest requested concurrency](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/resolver.ts#L304-L353)
>
> [Suite overrides, direct nodes, and project concurrency](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/resolver.ts#L354-L393); [known-path compact overrides](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/e2e/support/platform-config.ts#L98-L129)
>
> **Contract or setting:** [runtime records the effective authority subset](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-runtime.ts#L29-L42)
>
> **Test evidence:** [platform configuration contract checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L32-L65)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** This precedence map does not replace Helm's own multi-file ordering or an external GitOps controller's declared reconciliation policy.
