# Configuration Errors

Status: current diagnostic reference
Audience: operator, project author, plugin author
Owner: configuration-owning components
Evidence: skills/common/plugin-runtime/foundation/config/platform.ts; skills/nova/project/compiler.ts; skills/nova/core/execution/graph-build.ts; skills/nova/core/test-gates/pipeline.ts; skills/nova/core/test-gates/resolver.ts; skills/common/plugin-runtime/foundation/config/published-pair.ts; skills/prism/server/worker-config.ts
Applies to: current configuration loaders and compilers
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Diagnose by prefix

KubeClaw error codes identify the component that rejected the value. Preserve
the exact code and suffix. Do not remove a validation check to make an input
load.

| Prefix or message | Owner | First source to inspect |
| --- | --- | --- |
| `PLATFORM_CONFIG_INVALID` | Platform loader | The `pipeline-platform.v2` file and JSON-schema detail. |
| `PROJECT_*` | Nova project compiler/CLI | `nova-project.v2`, resolved plan binding, source paths, Git baseline. |
| `GRAPH_*` | Nova Core graph builder | Compiled or explicit `pipeline-definition.v2`. |
| `PIPELINE_STAGE_OWNER_MISSING` | Runtime preparation | Trusted installed packages and exact stage type. |
| `TEST_PLAN_PIPELINE_*` | `.swarm` loader | Canonical filename/location and coupled publication. |
| `TEST_PLAN_*` | Test-plan resolver | Suite/node declaration, provider registry, policy, links, coverage. |
| `PUBLISHED_PAIR_*` | Coupled publication store | Generation manifest, current pointer, immutable members, loose copies. |
| `RECOVERY_*`, `RUN_SNAPSHOT_*` | Nova recovery | Original graph, runtime authority, packages, snapshot integrity. |
| `WORKER_*` | Worker admission/host runtime | Profile, claim, capacity, native policy/cgroup. |
| `PRISM_*` or `<NAME> is required` from a Prism process | Prism loader/runtime | Rendered environment, Secret reference, URL/number, native host preparation. |

## Platform and registration errors

| Signal | Cause | Safe action |
| --- | --- | --- |
| `PLATFORM_CONFIG_INVALID:<canonical-path>:<Ajv-details>` | Missing/unknown field, wrong type, invalid digest/path string, duplicate item, or number outside schema range. | Use the JSON pointer/keyword in the details. Fix the one operator-owned file and validate again. |
| `PIPELINE_STAGE_OWNER_MISSING:<type>` | No trusted discovered stage registration owns the type. | Check exact stage spelling, installation roots, package manifest, and trust digest. |
| Provider or grant resolution error | Required capability has no unambiguous selected provider or resource grant. | Compare enabled registration requirements with `providers` and `grants`. Do not broaden unrelated grants. |
| Registration configuration error | A stage, adapter, observer, or provider object violates its own schema. | Use the named registration reference. Distinguish schema defaults from caller-inserted values. |
| Activation/startup failure | Schema passed but an adapter dependency, secret, path, or endpoint failed. | Treat startup rollback as bounded; inspect the original cause and do not assume partial adapters remained active. |

## Project compiler errors

| Signal | Meaning and correction |
| --- | --- |
| `PROJECT_ARGUMENT_INVALID`, `PROJECT_AND_PLATFORM_REQUIRED`, `PROJECT_COMMAND_CONFLICT` | Correct CLI spelling, supply both required paths, and select only one of compile/recover/signal. |
| `PROJECT_OBJECT_INVALID:<label>` | The labeled value is not a plain closed object or contains an unsupported field. |
| `PROJECT_TEXT_REQUIRED`, `PROJECT_ID_INVALID` | Supply the documented non-empty string or project ID form. |
| `PROJECT_ABSOLUTE_PATH_REQUIRED` | Normalize and make the path absolute. Do not rely on working-directory resolution. |
| `PROJECT_WORKSPACES_INSIDE_REPOSITORY` | Move worktree storage outside the publication repository. |
| `PROJECT_BASE_REVISION_INVALID` | Supply a full 40-character lowercase Git commit. |
| `PROJECT_MODULES_INVALID`, `PROJECT_MODULE_DUPLICATE` | Supply 1–128 unique modules. |
| `PROJECT_DEPENDENCY_UNKNOWN`, `PROJECT_DEPENDENCY_CYCLE` | Correct module IDs or break the cycle. Array order is not a fix. |
| `PROJECT_OWNERSHIP_INVALID`, `PROJECT_OWNERSHIP_OVERLAP` | Use safe relative non-overlapping prefixes. |
| `PROJECT_REQUIREMENTS_REQUIRED`, `PROJECT_REQUIREMENT_DUPLICATE` | Add non-empty unique requirements. |
| `PROJECT_SOURCE_*`, `PROJECT_ARCHITECTURE_*` | Correct architecture ref, required files, Blueprint paths, or optional assessment/approval fields. |
| `PROJECT_PLAN_DIGEST_MISMATCH` | The resolved plan changed after digesting. Regenerate the plan; do not recompute only the digest around untrusted edits. |
| `PROJECT_PLAN_SCOPE_MISMATCH`, `PROJECT_FINAL_PLAN_SCOPE_MISMATCH` | Plan belongs to another run/project/module/gate. Resolve it for the exact scope. |
| `PROJECT_BLOCKING_TEST_REQUIRED` | The module has no active blocking test. Add one and map coverage. |
| `PROJECT_DEMO_*` | Optional demo fields or required build/deploy/exposure/auth links are incomplete. Correct the final resolved plan or omit `demo`. |
| `PROJECT_BASELINE_CHANGED`, `PROJECT_REPOSITORY_DIRTY` | Commit intended files, update the declared baseline for a new run, or restore the original clean baseline. |

## Graph errors

| Signal | Meaning |
| --- | --- |
| `GRAPH_EMPTY`, `GRAPH_DUPLICATE_STAGE` | No stage or duplicate ID. |
| `GRAPH_DEPENDENCY_MISSING`, `GRAPH_SELF_DEPENDENCY`, `GRAPH_DUPLICATE_DEPENDENCY`, `GRAPH_CYCLE` | Invalid ordinary dependency edge. |
| `GRAPH_ATTEMPT_BUDGET_INVALID`, `GRAPH_REMEDIATION_BUDGET_INVALID`, `GRAPH_TIMEOUT_INVALID`, `GRAPH_ORCHESTRATOR_THRESHOLD_INVALID` | Execution number violates semantic bounds. |
| `GRAPH_ACTIVATION_SOURCE_MISSING`, `GRAPH_SELF_ACTIVATION`, `GRAPH_ACTIVATION_SOURCE_NOT_ANCESTOR`, `GRAPH_ACTIVATION_ON_REMEDIATION_TARGET` | Conditional fact source is unsafe or unordered. |
| `GRAPH_REMEDIATION_MISSING`, `GRAPH_SELF_REMEDIATION`, `GRAPH_REMEDIATION_TARGET_UNORDERED`, `GRAPH_REMEDIATION_PREREQUISITE_DEADLOCK`, `GRAPH_SHARED_REMEDIATION_TARGET`, `GRAPH_REMEDIATION_TARGET_NOT_LEAF` | Repair edge cannot produce one safe ordered return path. |
| `GRAPH_REPAIR_CATEGORY_UNDECLARED`, `GRAPH_REPAIR_CATEGORY_REQUIRED`, `GRAPH_REPAIR_BUDGET_INVALID`, `GRAPH_REPAIR_ATTEMPT_CEILING_INVALID` | Categorized repair ownership or total attempt ceiling is inconsistent. |

## Test-plan errors

| Family | Check |
| --- | --- |
| `TEST_PLAN_PIPELINE_NAME_INVALID`, `...LOCATION_INVALID` | Use exactly `.swarm/pipeline.json`. |
| `TEST_PLAN_DECLARATION_INVALID`, `...FIELD_UNKNOWN`, `...ID_INVALID` | Correct shape, field spelling, JSON value, or stable ID. |
| `TEST_PLAN_SUITE_*`, `...EXCLUDE_INVALID`, `...OVERRIDE_INVALID` | Select an installed template and existing local nodes. |
| `TEST_PLAN_PROVIDER_INVALID`, `...PROVIDER_MISSING`, `...CONFIGURATION_INVALID` | Use an installed provider contract and its exact configuration schema. |
| `TEST_PLAN_DEPENDENCY_*` | Correct missing/self/conflicting/cyclic dependency. |
| `TEST_PLAN_INPUT_*`, `TEST_PLAN_LINK_*`, `TEST_PLAN_PORT_MISSING` | Link one existing source output to a compatible required input kind/schema/media type. |
| `TEST_PLAN_MATRIX_INVALID`, `...MATRIX_LIMIT`, `...MATRIX_LINK_AMBIGUOUS` | Use provider-allowed matrix fields within product limits; do not link from a many-node source. |
| `TEST_PLAN_TIMEOUT_INVALID`, `...LIMIT_INVALID`, `...RETRY_INVALID`, `...RETRY_UNSAFE` | Stay inside operator resolver policy and provider retry safety. |
| `TEST_PLAN_EVIDENCE_INVALID`, `...REPORT_ADAPTER_*` | Request only supported evidence and resolve one adapter for each required report format. |
| `TEST_PLAN_CONCURRENCY_INVALID`, `...CONCURRENCY_UNUSED` | Use positive limits for groups that nodes actually use; do not widen template/operator caps. |
| `COVERAGE_*`, `PROJECT_*PLAN*` | Regenerate the independently bound coverage and resolved plan; never hand-edit a digest. |

## Coupled publication errors

Every `PUBLISHED_PAIR_*` error is fail-closed. `UNCOMMITTED` means the
publication directory exists without a committed pointer. `MANIFEST_INVALID`,
`MEMBER_INVALID`, and `MATERIALIZATION_DIVERGED` mean metadata/content/copies
do not agree. `CHANGED` detects a concurrent or substituted path.
`TARGET_INVALID` rejects a symlink, non-file, or multi-link target.
`GENERATION_CONFLICT` means immutable bytes already exist under the same
generation identity but differ.

Do not delete the publication directory to force loose-file fallback. Preserve
it for diagnosis, correct the scaffold, and run supported `--apply` publication
again.

## Recovery and Prism errors

`RECOVERY_RUNTIME_CONFIGURATION_MISMATCH`, `RECOVERY_GRAPH_DIGEST_MISMATCH`,
and `RECOVERY_PINNED_PACKAGE_*` mean the current inputs differ from recorded
authority. Restore the recorded inputs. `RUN_SNAPSHOT_INTEGRITY_INVALID` means
the durable snapshot itself fails its digest/version contract; stop and use the
documented recovery procedure.

Prism loader errors usually name the exact environment variable. Number errors
such as `PRISM_WORKER_INGRESS_INVALID:<NAME>` and
`PRISM_NATIVE_CONFIG_INVALID:<NAME>` require a positive safe integer within the
documented maximum. `PRISM_NATIVE_PATH_REQUIRED:<NAME>` requires a normalized
absolute non-root path. Trust errors require a complete SPIFFE identity set or
the required shared secrets, never a mixture inferred from another mode.

## Information to retain

For any configuration failure, retain: exact command form without secret
values, error code and structured detail, source revision, input digest and
canonical path, rendered non-secret configuration, package/image digests, and
whether any run/effect had started. This evidence distinguishes safe correction
from a repeated external effect.

> **Source evidence — fail-closed diagnostics**
>
> **Claim:** Each major loader rejects invalid input before returning an effective object.
>
> The coupled publisher never falls back after detecting a damaged committed generation.
>
> **Implementation:** [platform error construction](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.ts#L53-L69); [project validation helpers](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/compiler.ts#L11-L45); [published-pair reader](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/published-pair.ts#L45-L76)
>
> **Contract or setting:** [graph semantic errors](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/graph-build.ts#L8-L44)
>
> **Test evidence:** [project compiler rejection cases](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-project-compiler.mts#L99-L130)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Error prefixes classify local rejection. They do not by themselves prove whether an earlier external effect occurred.
