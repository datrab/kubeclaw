# Pipeline Definition

Status: current configuration reference
Audience: pipeline author, plugin author, operator
Owner: Nova Core
Evidence: skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; skills/nova/core/execution/graph-build.ts; skills/nova/core/execution/pipeline-loop.ts
Applies to: `pipeline-definition.v2`
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Purpose and boundary

A pipeline definition is the executable graph consumed by Nova Core. It says
which registered stage types run, their dependency order, their typed
plugin-owned configuration and input, and the limits on attempts and repair.
It does not install plugins, grant capabilities, choose adapters, hold
credentials, or record runtime progress. Those concerns belong to the
[platform configuration](pipeline-platform.md) and the durable run store.

The Core CLI accepts this document through `--pipeline`. The Nova project
compiler also produces this exact contract from `nova-project.v2`.

## Top-level fields

The object is closed. All four fields are required and have no implicit
default.

| Field | Type and constraints | Meaning |
| --- | --- | --- |
| `schemaVersion` | Exact `pipeline-definition.v2` | Selects this contract. |
| `id` | 1–192 characters; starts with an ASCII letter or digit; remaining characters are letters, digits, `.`, `_`, `:`, or `-` | Stable pipeline identity stored in the graph snapshot. |
| `maxConcurrency` | Integer ≥ 1 | Maximum graph stages that Core may execute at once. It does not override a provider's own concurrency group. |
| `stages` | Non-empty array of stage objects | Nodes in the graph. Declaration order is not execution order. |

Stage IDs and dependency IDs use the local-ID form: 1–96 lowercase characters,
starting with a letter or digit and continuing with lowercase letters, digits,
`.`, `_`, or `-`. A stage `type` is a namespaced ID of at most 160 lowercase
characters and must contain at least one `.`, `_`, or `-` separator.

## Complete stage field reference

Every stage is a closed object. `activation` and `on` are optional; every other
top-level stage field in this table is required.

| Path | Type, required state, and constraints | Consumer and meaning |
| --- | --- | --- |
| `stages[].id` | Required local ID; unique in the graph | Core identity for events, dependencies, and persisted state. |
| `stages[].type` | Required namespaced ID | Registry resolves the one installed stage owner. Missing ownership stops preparation. |
| `stages[].dependsOn` | Required array of unique local IDs; may be empty | Ordinary edges. All dependencies must finish as `succeeded` or `skipped` before this stage becomes ready. |
| `stages[].config` | Required JSON object; `{}` is allowed by the envelope | The owner registration validates it against its configuration schema before activation. |
| `stages[].input` | Required JSON object; `{}` is allowed by the envelope | The owner registration validates it against its input schema at execution. Do not put results from prior runs here. |
| `stages[].activation` | Optional closed object | Adds a fact-based condition. The stage is skipped if the exact condition is not met. |
| `stages[].activation.sourceStage` | Required when `activation` exists; local ID | Must identify an ordinary ancestor, not the stage itself. |
| `stages[].activation.fact` | Required namespaced ID | Key read from the source stage's successful result facts. |
| `stages[].activation.equals` | Required string, number, boolean, or `null` | Compared with `Object.is`; a missing fact does not equal `null` and causes a skip. |
| `stages[].execution` | Required closed object | All budgets and deadlines for this node. |
| `stages[].execution.maxAttempts` | Required integer ≥ 1 | Total invocation ceiling, including initial work and attempts needed for configured repair policy. |
| `stages[].execution.maxRemediationCycles` | Required integer ≥ 0 | Direct repair-cycle ceiling when no category budget owns the repair. |
| `stages[].execution.maxTechnicalRetries` | Optional integer 0–100 | Technical retry allowance. If omitted, category-budget validation treats it as zero. |
| `stages[].execution.repairCategory` | Optional local ID | Charges a failed check's repair request to a category on its repair owner. The owner must declare that category. |
| `stages[].execution.repairBudget` | Optional closed object | Declares categorized repair limits owned by this stage. |
| `...repairBudget.categories` | Required non-empty object with at most 32 local-ID keys; each value integer 0–100 | Per-category maximum repair orders. A zero explicitly denies the category. |
| `...repairBudget.maximumOrchestratorOrders` | Required integer 0 or 1 | Additional human/orchestrator-directed order allowance. |
| `stages[].execution.orchestratorAfterAttempt` | Optional integer ≥ 1 and strictly less than `maxAttempts` | On the matching retry outcome, pause for an orchestrator rather than immediately schedule the next attempt. |
| `stages[].execution.timeoutMs` | Required integer ≥ 1 | Deadline passed to stage execution. It is not a whole-run timeout. |
| `stages[].on` | Optional closed object | Outcome routes. It may be `{}`. |
| `stages[].on.request_fix` | Optional local ID | Target stage to run when this stage returns `request_fix`. |

JSON values under `config` and `input` may contain null, booleans, finite
numbers, strings, arrays, and objects. The envelope does not set size limits;
the selected registration schema can impose them.

## Graph rules beyond JSON Schema

Core builds and validates the graph after contract validation:

- Stage IDs are unique; every dependency, activation source, and repair target
  exists; self edges are invalid.
- Ordinary dependency edges must be acyclic.
- An activation source must be an ordinary ancestor. An activation-controlled
  node cannot also be a repair target.
- A repair edge must be ordered relative to the requesting stage. Two unordered
  requesters cannot share one repair target.
- A repair-only target is a leaf. This prevents ordinary downstream work from
  running as a side effect of repair.
- A declared `repairCategory` must exist on its repair owner. The owner's
  `maxAttempts` must be at least one plus all category allowances, the
  orchestrator allowance, and technical retries.

These restrictions remove ambiguous execution and deadlock-prone repair
graphs. They also mean that a JSON-Schema-valid document can still fail graph
construction.

## Minimal executable shape

The stage type and its two JSON objects must match an installed registration.
This example shows the graph contract; it does not promise that
`example.validate` is installed.

```json
{
  "schemaVersion": "pipeline-definition.v2",
  "id": "example:validate",
  "maxConcurrency": 1,
  "stages": [
    {
      "id": "validate",
      "type": "example.validate",
      "dependsOn": [],
      "config": {},
      "input": { "subject": "candidate" },
      "execution": {
        "maxAttempts": 1,
        "maxRemediationCycles": 0,
        "timeoutMs": 60000
      }
    }
  ]
}
```

Run it only after validating the platform and installed registration:

```bash
npm run pipeline -- \
  --platform "/absolute/path/platform.json" \
  --pipeline "/absolute/path/definition.json" \
  --run-id "run:example-001"
```

## Activation, results, and empty values

An absent `activation` means unconditional scheduling after dependencies. An
activation mismatch produces a durable `stage.skipped` event; skipped stages
satisfy downstream ordinary dependencies. This makes optional branches
explicit without changing graph structure.

The graph does not declare a generic result schema. Each stage registration
validates its own input and returns the shared stage-result contract. A
non-passing result must include a reason. `passed` can publish scalar facts for
later activation. Runtime results, attempts, facts, waits, and artifacts belong
to journals and snapshots, never back into the definition.

Empty `dependsOn`, `config`, or `input` values are meaningful and valid at the
envelope level. An empty `stages` array, empty `repairBudget.categories`, or
unknown field is invalid. An empty `on` object has no effect.

## Precedence, changes, and recovery

There is no field-level merge. Core uses the single loaded definition. Plugin
schemas determine defaults inside `config` and `input`; Core does not insert
them into this file.

At run creation, Core stores a normalized graph snapshot and digest. Recovery
rebuilds the graph from the supplied definition using the stored snapshot
version and rejects a different pipeline ID or digest. Changes to stage order
alone do not change execution semantics, but normalized snapshot ordering can
affect historical digest formats. Do not edit a definition to continue an
existing run. Use the original bytes and packages, or start a new run.

## Failure index

| Error family | Typical cause | Corrective action |
| --- | --- | --- |
| Contract validation error | Wrong version, ID form, missing required field, unknown field, or invalid bound | Correct the field before runtime preparation. |
| `GRAPH_DUPLICATE_STAGE`, `GRAPH_DEPENDENCY_MISSING`, `GRAPH_CYCLE` | Invalid ordinary graph | Make IDs unique and dependencies present and acyclic. |
| `GRAPH_ACTIVATION_*` | Source missing, self-referential, not an ancestor, or attached to a repair target | Put the fact source on the ordinary path before the conditional node. |
| `GRAPH_REMEDIATION_*`, `GRAPH_SHARED_REMEDIATION_TARGET` | Repair target missing, unordered, shared ambiguously, or not a leaf | Redesign the repair edge so its execution order and return path are unique. |
| `GRAPH_REPAIR_*`, `GRAPH_TECHNICAL_RETRY_BUDGET_INVALID` | Category missing or total attempt ceiling too small | Recalculate the owner budget; do not increase retries without bounding effects. |
| `PIPELINE_STAGE_OWNER_MISSING` | No trusted installed registration owns `type` | Correct the stage type or platform package set. |
| Registration configuration/input error | `config` or `input` violates the selected plugin schema | Use the plugin's exact contract; Core cannot reinterpret the value. |
| `RECOVERY_GRAPH_DIGEST_MISMATCH` | Definition changed after run creation | Restore the original definition for recovery or start a new run. |

> **Source evidence — graph validation and scheduling**
>
> **Claim:** The schema defines the complete field envelope, while graph construction adds dependency, activation, repair-order, and budget invariants before execution.
>
> **Implementation:** [stage, dependency, and repair-edge validation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/graph-build.ts#L8-L44); [cycle, ordering, activation, and leaf validation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/graph-build.ts#L47-L96); [activation scheduling](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/pipeline-loop.ts#L86-L115)
>
> **Contract or setting:** [`stageDefinition` identity, data, activation, and execution fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L450-L503); [repair and pipeline envelope fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L506-L529)
>
> **Test evidence:** [ordinary and repair graph checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-plugin-system-v2-phase6.mjs#L75-L123); [execution and activation rejection checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-plugin-system-v2-phase6.mjs#L124-L152)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** A valid graph proves neither that an external effect succeeds nor that the selected stages provide sufficient product coverage.
