# Project Test Pipeline (`.swarm/pipeline.json`)

Status: current configuration reference
Audience: project author, test-plan author, pipeline operator
Owner: Nova test-plan resolver and project setup
Evidence: skills/nova/core/test-gates/pipeline.ts; skills/nova/core/test-gates/types.ts; skills/nova/core/test-gates/resolver.ts; skills/common/plugin-runtime/foundation/config/published-pair.ts
Applies to: current `.swarm/pipeline.json` project test declarations
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Four different artifacts

KubeClaw uses several JSON artifacts that can contain the word “pipeline.” They
are not interchangeable.

| Artifact | Author or producer | Consumer | Purpose |
| --- | --- | --- | --- |
| `.swarm/pipeline.json` | Project author, often through the project scaffold | Nova test-plan loader and resolver | Declares project test providers, fixtures, suite selections, links, conditions, and concurrency for modules and Buster gates. |
| `nova-project.v2` document | Project operator | Nova project compiler | Declares repository modules, source admission, implementation/lint/quality stages, coverage, and optional demo handoff. See [Nova project](nova-project.md). |
| `pipeline-definition.v2` document | Graph author or Nova project compiler | Nova Core | Complete executable stage graph. See [Pipeline definition](pipeline-definition.md). |
| `.swarm/progress.json` and durable run state | Scaffold for the first; Nova runtime for journals and snapshots | Project setup and runtime recovery | `progress.json` carries the compact project/module/gate authoring state. Runtime attempts, facts, waits, results, and cursors live below the platform `storageRoot`; they do not belong in either `.swarm` authoring file. |

The Core CLI flag `--pipeline` means a `pipeline-definition.v2` graph. It does
not mean `.swarm/pipeline.json`.

## Location and publication requirement

The test-plan loader accepts only a file named `pipeline.json` whose parent
directory is named `.swarm`. It reads that file together with
`.swarm/progress.json` through the coupled-publication reader. If publication
metadata exists, loose files must match the committed generation. A damaged or
partial publication does not fall back to the loose copy.

Use the scaffold's `--apply` operation to publish the pair. See
[Project pipeline publication](project-pipeline-publication.md).

## Root fields

| Path | Required state and type | Meaning |
| --- | --- | --- |
| `project` | Required non-empty string | Project identity returned with the selected test scope. It must agree with the project scaffold. |
| `lint` | Optional lint declaration | Selects project Kubernetes inputs for the full lint stage. |
| `modules` | Object keyed by module ID | A module's test scope. A module that includes Buster needs a matching object. |
| `gates` | Object keyed by gate ID | A Buster gate's cumulative test scope. |

The loader projects only these fields. Do not rely on unknown root or scope
fields being rejected: ignored input has no effect and is unsafe as policy.

`lint` is closed by the loader's checks:

| Field | Requirement |
| --- | --- |
| `uses` | Exact `kubeclaw.lint.full`. |
| `policyProject` | Non-empty string. |
| `rawManifests` | Unique array of non-empty strings. |
| `helmCharts` | Unique array of non-empty strings. |

At least one manifest or chart is required when `lint` exists. Paths are
project inputs to the lint registration; this loader does not prove that the
files exist.

## Test scope fields

Each `modules.<id>` or `gates.<id>` value can contain these fields:

| Field | Type and empty behavior | Meaning |
| --- | --- | --- |
| `coverage` | Optional `gate-coverage.v1` object | Independent mapping from requirements to mandatory declared node IDs. Usually generated from `nova-project.v2`; see below. |
| `suites` | Object from local suite instance ID to a suite selection | Expands a shipped `test-suite-template.v1`. `{}` adds no nodes. |
| `tests` | Object from stable node ID to node declaration | Direct blocking or advisory test nodes. |
| `fixtures` | Object from stable node ID to node declaration | Setup/resource nodes. Their resolved `mode` is `null`, not blocking/advisory. |
| `concurrencyLimits` | Object from stable group ID to positive integer | Narrows the limit for used concurrency groups. An unused declared group is invalid. |

A scope that resolves to no suite, test, or fixture is invalid. Test and fixture
IDs must not collide. Stable IDs are at most 256 characters, start with an
ASCII letter or digit, and then use letters, digits, `.`, `_`, `:`, `/`, or
`-`; suite-local IDs cannot contain `/`.

## Suite selection fields

| Path | Type and rule |
| --- | --- |
| `suites.<instance>.uses` | Required versioned contract ID such as `kubeclaw.unit-suite@1`; the template must be installed in the resolver catalogue. |
| `suites.<instance>.exclude` | Optional string array of template-local node IDs. Every ID must exist in the selected template. Exclusion is recorded for coverage; it is not a passing result. |
| `suites.<instance>.overrides.<node>` | Optional partial node declaration without `uses`. The node must exist. `config` deep-merges; arrays and scalar values replace; evidence outcome lists merge by field. |
| `suites.<instance>.add.<node>` | Optional complete test-node declaration. The ID must not collide with a template node. |

Template-local references in `needs` and `inputs.from` receive the suite
instance prefix. A reference already containing `/` is treated as explicit.

## Complete node declaration

`uses` is required for a direct node and forbidden in a suite override. All
other fields are optional. Unknown fields are invalid.

| Path | Type, default, and constraints | Effect |
| --- | --- | --- |
| `uses` | Versioned provider contract ID matching `name@positive-version` | Selects an installed test-provider registration. |
| `config` | JSON object; default `{}` | Deep-merged with matrix values, then validated against the selected provider schema. Provider defaults are resolved there. |
| `mode` | `blocking` or `advisory`; test default `blocking`; fixtures resolve to `null` | Blocking failures affect the gate. Advisory results remain evidence without failing the gate. |
| `review.agent` | Closed object with required stable `agent` ID | Requests provider-result assessment by that agent where the runtime supports it. |
| `needs[]` | String node ID, or closed `{nodeId, acceptedResults?}` | Adds a dependency. A string means only `passed` is accepted. |
| `needs[].acceptedResults` | Non-empty unique subset of `passed`, `failed`, `skipped`, `errored`, `cancelled`, `timed_out` | Allows a downstream node to run after the listed effects. |
| `inputs.<port>.from` | Required stable source node ID | Source node for a typed value or artifact link. |
| `inputs.<port>.output` | Required stable output-port name | Source output. Provider port kind and schema must match the target input. |
| `inputs.<port>.mediaType` | Optional non-empty string | Selects one common artifact media type. It is invalid on a value link. |
| `when.changedPaths` | Optional non-empty array of relative glob patterns | Node is skipped unless at least one changed path matches. Absolute and parent-traversal patterns are invalid. |
| `when.moduleType` | Optional non-empty string or non-empty string array | Node is skipped unless the resolver fact matches. |
| `when.pipelineStage` | Optional non-empty string or non-empty string array | Node is skipped unless the resolver fact matches. |
| `timeoutMs` | Positive integer; defaults to resolver policy `defaultTimeoutMs`; cannot exceed `maximumTimeoutMs` | Per-node execution timeout. Resolver policy is supplied by the caller, not this file. |
| `limits` | Partial object with `cpuMillis`, `memoryBytes`, `logBytes`, `artifactBytes`, `artifactFiles`, `processes` | Missing values come from resolver policy. CPU, memory, and processes are at least 1; log/artifact counts and bytes may be 0; all are capped by policy. |
| `retries` | Integer from 0 through policy maximum; default 1 for retry-safe providers, otherwise 0 | Number of retries after the first execution. |
| `acceptUnsafeRetry` | Boolean; default false | Required to request retries from a provider that does not declare retry safety. It accepts duplicate-effect risk; it does not make the operation idempotent. |
| `concurrencyGroup` | Stable ID | Places the node under the resolved group limit. |
| `matrix.<field>` | Non-empty array of JSON values | Produces the Cartesian product of fields. The provider must allow each matrix field and the total must fit policy. Matrix values override matching `config` fields. |
| `evidence.onPass` | String array | Evidence types retained for passed execution. |
| `evidence.onFail` | String array | Evidence types retained for failed execution. |
| `evidence.onError` | String array | Evidence types retained for errors. Every type must be supported by the provider. |

An `inputs` link also creates a `passed` dependency. A conflicting explicit
dependency is invalid. All required provider input ports must be linked. A
matrix source cannot feed one link because it would be ambiguous. Dependencies
must be acyclic.

Provider-specific `config` is exhaustively listed in
[Buster provider configuration](buster-provider-configuration.md).

## Coverage object

`coverage` is a closed `gate-coverage.v1` object. It is independent of provider
selection so that choosing a suite cannot silently define what “enough testing”
means.

| Path | Requirement |
| --- | --- |
| `schemaVersion` | Exact `gate-coverage.v1`. |
| `projectId` | Stable ID matching the resolved plan project. |
| `kind` | `module` or `cumulative`. Module coverage has exactly one module and no integration requirements. |
| `baseRevision` | 40- or 64-character lowercase hexadecimal revision. |
| `modules[]` | 1–128 closed objects with unique `moduleId`, non-empty unique `ownedPaths`, and non-empty requirements. |
| `modules[].requirements[]` | Closed `{id,statement}`; IDs are unique within the complete policy and statements are non-empty. |
| `integrationRequirements[]` | Closed `{id,statement}` objects. Their references use `moduleId: null`. |
| `requiredChecks[]` | Non-empty closed `{checkId,requirementRefs,nodeIds}` objects. IDs and references within a check are unique. |
| `requiredChecks[].requirementRefs[]` | Closed `{moduleId,requirementId}`; must name a declared requirement. |
| `requiredChecks[].nodeIds[]` | Pre-matrix declaration IDs. Every resulting matrix node is required. |
| `policyDigest` | `sha256:` digest calculated from the object without this field. |

Every declared requirement must be referenced by at least one required check.
An excluded, missing, skipped, fixture, or advisory node does not satisfy a
mandatory blocking check.

## Working direct-node example

This scope declares one blocking command and makes the group limit explicit.
The installed `kubeclaw.direct-command@1` schema validates its `config`.

```json
{
  "project": "sample",
  "modules": {
    "api": {
      "tests": {
        "unit": {
          "uses": "kubeclaw.direct-command@1",
          "mode": "blocking",
          "retries": 0,
          "concurrencyGroup": "unit",
          "config": {
            "executable": "npm",
            "args": ["test"],
            "workingDirectory": ".",
            "resultMode": "exit-code"
          }
        }
      },
      "concurrencyLimits": { "unit": 1 }
    }
  },
  "gates": {}
}
```

This JSON alone is not executable. It must be paired with matching
`progress.json`, resolved with an installed registry and caller policy, and
embedded as a verified provider plan in the Nova project flow.

## Precedence and defaults

Resolution order is:

1. A selected suite supplies its template nodes and concurrency ceilings.
2. `exclude` removes named template nodes.
3. `overrides` changes remaining template nodes; nested `config` objects merge.
4. `add`, direct `tests`, and direct `fixtures` add project nodes.
5. Scope `concurrencyLimits` may narrow, never widen, a suite limit.
6. Matrix values override provider configuration fields for each variation.
7. Provider schema defaults resolve configuration.
8. Resolver policy fills timeouts, resource limits, retries, and maximums.

There is no precedence from `.swarm/progress.json` into a field of this file.
The scaffold generates both from one edited scaffold, and consumers use each
for its own contract.

## Errors and safe correction

`TEST_PLAN_PIPELINE_NAME_INVALID` and `TEST_PLAN_PIPELINE_LOCATION_INVALID`
mean that the file is not the canonical `.swarm/pipeline.json`. A wrapped
`TEST_PLAN_PIPELINE_INVALID` can mean malformed JSON, a bad publication pair,
or a missing root/scope object.

Resolver errors begin with `TEST_PLAN_`. The suffix identifies the boundary:
`FIELD_UNKNOWN`, `SUITE_MISSING`, `NODE_DUPLICATE`, `PROVIDER_INVALID`,
`CONFIGURATION_INVALID`, `DEPENDENCY_*`, `INPUT_*`, `LINK_*`, `MATRIX_*`,
`TIMEOUT_INVALID`, `LIMIT_INVALID`, `RETRY_*`, `EVIDENCE_INVALID`,
`CONCURRENCY_*`, or `COVERAGE_*`. Correct the declaration or its operator-owned
resolver policy; do not edit a resolved plan digest.

> **Source evidence — authored test declaration**
>
> **Claim:** The loader selects one module or gate scope only from a coupled `.swarm/pipeline.json`.
>
> The resolver validates and expands nodes, suites, links, conditions, limits, evidence, matrices, and concurrency.
>
> **Implementation:** [canonical scope loader](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/pipeline.ts#L12-L51); [lint loader](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/pipeline.ts#L54-L78); [links and conditions](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/resolver.ts#L113-L156)
>
> [Limits and matrix fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/resolver.ts#L159-L196); [retry, concurrency, and evidence fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/resolver.ts#L197-L220)
>
> **Contract or setting:** [node declaration interfaces](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/types.ts#L4-L43); [suite and scope interfaces](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/test-gates/types.ts#L46-L69); [coverage contract](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/contracts/pipeline-test-gate/v1/src/coverage.ts#L4-L27)
>
> **Test evidence:** [coupled pipeline scope and lint loading](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-pipeline-test-suite-resolver.mts#L155-L209); [resolution, expansion, bounds, and determinism](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-pipeline-test-suite-resolver.mts#L219-L260)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Project setup and resolution validate declared local contracts. They do not prove that a remote provider ran or that the selected checks are sufficient unless the independent coverage policy requires them.
