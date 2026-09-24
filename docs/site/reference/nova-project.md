# Nova Project

Status: current configuration reference
Audience: project operator, pipeline author
Owner: Nova project compiler
Evidence: skills/nova/project/compiler.ts; skills/nova/project/source.ts; skills/nova/project/coverage.ts; skills/nova/project/demo.ts; skills/nova/project/cli.ts
Applies to: `nova-project.v2`
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Purpose and compiler boundary

`nova-project.v2` is the project-level input to Nova. It binds one clean Git
baseline, an immutable architecture source, one to 128 owned modules, mandatory
quality coverage, cumulative gates, and an optional demo handoff. The compiler
turns it into a closed [`pipeline-definition.v2`](pipeline-definition.md)
graph. Nova Core remains independent of module names and project policy.

Compilation validates the resulting graph against the installed registry,
configuration schemas, providers, and grants. It starts no adapter, creates no
run state, calls no external provider, and writes the requested output with
create-only semantics.

## Commands

```bash
# Validate and write a new explicit graph; the output must not exist.
npm run pipeline -- \
  --platform "/absolute/path/platform.json" \
  --project "/absolute/path/project.json" \
  --compile "/absolute/path/compiled-pipeline.json"

# Start a new project run.
npm run pipeline -- \
  --platform "/absolute/path/platform.json" \
  --project "/absolute/path/project.json"

# Continue the same pinned run.
npm run pipeline -- \
  --platform "/absolute/path/platform.json" \
  --project "/absolute/path/project.json" \
  --recover "run:example"
```

`--compile`, `--recover`, and `--signal` are mutually exclusive. A project and
platform are always required. Normal start requires repository `HEAD` to equal
`baseRevision` and the worktree to be clean.

### Import a legacy project file

The same entry point can convert one legacy progress file into a
`nova-project.v2` document:

```bash
npm run pipeline -- \
  --import-legacy "/absolute/path/progress.json" \
  --authoring "/absolute/path/import-authoring.json" \
  --platform "/absolute/path/platform.json" \
  --output "/absolute/path/project.json"
```

All four options are required in import mode and each option takes one value.
`--import-legacy` selects the existing progress file. `--authoring` supplies
the explicit project policy that old progress data does not contain.
`--platform` selects the installed package registry and grants used to validate
the compiled result. `--output` selects a new destination file; the command
refuses to replace an existing file.

The importer resolves the legacy input to its real path and requires the
authoring document to name a canonical repository root. It imports the
project, validates the resulting pipeline against the selected platform,
writes the new project with create-only file semantics, and prints an import
report. An unknown option, a repeated option, a missing value, or any set other
than these four option/value pairs fails before the command writes output.

> **Source evidence — legacy import command**
>
> **Claim:** Import mode requires four value pairs, validates the converted
> runtime graph, and creates the output without replacing an existing file.
>
> **Implementation:** [entry-point dispatch](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/cli.ts#L14-L17); [argument and output handling](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/legacy-import-cli.ts#L8-L27)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Root fields

The root is closed. Every listed field is required except `demo`.

| Path | Type and constraints | Meaning |
| --- | --- | --- |
| `schemaVersion` | Exact `nova-project.v2` | Selects the current project compiler contract. |
| `id` | Lowercase ID matching `^[a-z][a-z0-9-]{0,47}$` | Project identity; compiled pipeline ID becomes `project:<id>`. |
| `runId` | Non-empty string | Exact run identity. Every resolved provider plan must use it. |
| `repositoryRoot` | Normalized absolute path | The one repository publication lane. Relative paths are invalid. |
| `workspaceRoot` | Normalized absolute path outside `repositoryRoot` | Parent for temporary module worktrees. It cannot equal or be below the repository. |
| `baseRevision` | Exactly 40 lowercase hexadecimal characters | Committed source baseline used by source admission, coverage, start checks, and worktrees. |
| `architecture` | Closed source-admission object | Pins the architecture ref and control files; see below. |
| `modules` | Array of 1–128 closed module objects | Units of implementation, ownership, and module coverage. |
| `final` | Closed cumulative gate object | Full-repository lint, optional review, mandatory test, and integration requirements. |
| `demo` | Optional closed demo object | Adds candidate, delivery, and readiness stages only when the final resolved plan proves the required deployment chain. |

All string fields described as non-empty reject `""` and whitespace-only
values. Closed objects reject unknown keys.

## Architecture source admission

| Path | Required state, type, and constraints | Effect |
| --- | --- | --- |
| `architecture.ref` | Required non-empty string with no whitespace or control character | Git ref read by source preflight and Blueprint synchronization. Use a ref whose movement is controlled; `baseRevision` remains the run baseline. |
| `architecture.requiredFiles` | Required unique array of repository-relative paths; may be empty | Files included in the immutable source subject. Paths cannot be absolute, contain backslashes/control characters, or contain empty, `.` or `..` segments. |
| `architecture.review` | Optional closed `{agent,approval}` | Adds an architecture assessment and a conditional approval wait before Blueprint sync. Omission means deterministic source checks still run but these two stages do not exist. |
| `architecture.review.agent` | Required non-empty string when review exists | Runtime dispatch target for architecture assessment. |
| `architecture.review.approval` | Required closed object | Configuration of the approval stage. |
| `...approval.target` | Required non-empty string | Intended operator target. |
| `...approval.issuerId` | Required non-empty string | Expected decision issuer; platform grants and issuer policy must also authorize it. |
| `...approval.timeoutMinutes` | Accepted field; the approval registration performs its detailed schema validation | Approval deadline setting. The project parser does not insert a default. |

The compiler builds the control-path set from `requiredFiles` plus each
module's `FORGE.md` location. One source preflight and one Blueprint sync cover
the whole project. This prevents each module from admitting a different source
subject.

## Module fields

Each module is closed and has no implicit ID, task, ownership, requirement,
Blueprint, implementation, lint, or test declaration.

| Path | Type and constraints | Meaning |
| --- | --- | --- |
| `modules[].id` | Required project ID form; unique | Used in generated stage IDs, worktree paths, coverage, and plan scope. |
| `modules[].dependsOn` | Required unique array of project IDs; may be empty | Module dependency graph. Unknown IDs and cycles are invalid. The compiler also serializes the repository lane. |
| `modules[].task` | Required non-empty string | Work statement given to the implementation stage and later gates. |
| `modules[].ownedPaths` | Required non-empty unique array of safe repository-relative prefixes | Defines source ownership. Paths cannot overlap exactly, as parent/child, or across modules. |
| `modules[].requirements` | Required non-empty array of closed `{id,statement}` | Product requirements for independent coverage. IDs must be non-empty and unique within the module; statements are non-empty. |
| `modules[].blueprint` | Required closed object | Identifies module control files and explicit deliverable selectors. |
| `modules[].implementation` | Required closed agent object | Selects the implementation agent. |
| `modules[].lint` | Required closed lint object | Selects full-lint policy. |
| `modules[].review` | Optional closed `{agent}` | Adds a blocking module review stage. Omission means lint flows directly to test. |
| `modules[].test` | Required closed test object | Supplies independent required checks and a fully resolved provider plan. |

### Blueprint fields

| Path | Requirement |
| --- | --- |
| `blueprint.modulePath` | Required safe relative path to the module directory. |
| `blueprint.substeps` | Optional non-empty, unique array of safe relative path segments/paths. If present, each control path is `<modulePath>/<substep>/FORGE.md`; an empty array is invalid. |
| `blueprint.serveDockerfile` | Required safe relative path or `null`. `null` states that this module does not declare that deliverable selector. |
| `blueprint.apiSpecFile` | Required safe relative path or `null`. `null` states that this module does not declare that deliverable selector. |

The compiler checks path form and binding. Source preflight checks the committed
files and their declared content. `null` is different from omission: omission
is invalid because the project must make the boundary explicit.

### Agent and lint fields

| Path | Requirement and default |
| --- | --- |
| `implementation.agent` | Required non-empty runtime target. |
| `implementation.agentRole` | Optional non-empty role string passed to dispatch configuration. No compiler default. |
| `review.agent` | Required non-empty runtime target when review exists. |
| `lint.policyPath` | Required normalized absolute path. |
| `lint.policyProject` | Required non-empty policy project. |

## Test and provider-plan fields

Module `test` and `final.test` use the same closed shape:

| Path | Required state and rule |
| --- | --- |
| `agent` | Optional non-empty runtime target; default `buster`. |
| `agentRole` | Optional role string passed through when present. |
| `testAgentEnabled` | Optional boolean; default `true`. `false` suppresses test-agent dispatch, not provider execution or coverage checks. |
| `requiredChecks` | Required by project policy and used to build coverage. Each entry uses the coverage check shape described in [Project test pipeline](pipeline-json.md#coverage-object). |
| `providerPlan` | Required closed resolved-plan envelope; see below. |

The authored provider-plan envelope contains exactly these fields:

| Path | Type and constraints | Meaning |
| --- | --- | --- |
| `repositoryId` | Required non-empty string, maximum 256 at the quality-stage contract | Stable repository identity for remote execution. |
| `plan` | Required complete `resolved-test-plan.v1` object with valid `planDigest` | Immutable resolved nodes, providers, links, coverage, limits, and registry digest. It must be produced by the resolver, not edited by hand. |
| `grants` | Required object from resolved node ID to a unique array of non-empty capability strings | Remote per-node capability boundary. Empty grants do not imply permission. |
| `maximumConcurrency` | Required integer 1–64 | Remote plan execution ceiling. It coexists with per-group limits inside `plan`. |
| `submittedAt` | Required RFC 3339 date-time | Submission timestamp bound into the request. |
| `timeoutMs` | Required integer 1–7,200,000 | Whole remote plan request deadline. |

Do not author `repositoryRoot`, `sourceStageId`, or `revision` in a
`nova-project.v2` provider plan. The compiler adds `repositoryRoot` and
`sourceStageId` from the owned repository and implementation stage. This
prevents the project document from pointing a quality stage at unrelated
source. Caller-supplied success evidence is not accepted.

The resolved plan must satisfy all of these bindings:

- `planDigest` matches the plan without the digest field.
- `plan.runId` equals root `runId` and `plan.project` equals root `id`.
- A module plan has `{moduleId: <module.id>, gateId: null}`.
- The final plan has `{moduleId: null, gateId: "final-test"}`.
- A module plan contains at least one non-skipped blocking test.
- Its coverage policy maps the module's exact ownership and requirements to
  resolved declaration IDs. The final plan covers every module plus all
  integration requirements.

Use the authored and resolved field references in
[Project test pipeline](pipeline-json.md) to construct these plans.

## Final gate

`final` is closed:

| Path | Requirement |
| --- | --- |
| `final.lint` | Required `{policyPath,policyProject}` with the same rules as module lint. |
| `final.test` | Required test/provider-plan object. Its plan scope is the `final-test` gate. |
| `final.review` | Optional closed `{agent}`. Omission removes the final review stage. |
| `final.integrationRequirements` | Required array, which may be empty. Each useful entry is a closed `{id,statement}` coverage requirement and must be mapped by `final.test.requiredChecks`. |

The final lint depends on all module tests. Optional final review follows lint;
final test follows lint or review; the project summary follows final test.

## Optional demo fields

`demo` is closed:

| Path | Requirement and default |
| --- | --- |
| `authNodeId` | Required non-empty string, maximum 2,048; names the blocking demo-auth node in the final plan. |
| `protocol` | Exact `json-session.v1`. |
| `operatorTarget` | Required ID matching `^[a-z0-9][a-z0-9._:-]{0,127}$`. |
| `retentionSeconds` | Optional safe integer 1–9,223,372,036; default 604,800 (seven days). |

Demo compilation is deliberately strict. The final plan must connect an
immutable container build and checked manifest to a Kubernetes fixture, then
to a Tailscale exposure in `await-readiness` mode, then pass deployment,
credentials, and exposure into the required blocking demo-auth node. The auth
node must be mandatory in coverage. If any binding is absent, compilation
fails; the compiler does not invent a public endpoint or credentials.

## Generated graph and scheduling

The compiler sorts modules topologically with an ID tie-break, independent of
their JSON array order. It then builds:

1. `source-preflight`.
2. Optional `architecture-review` and `architecture-approval`.
3. `blueprint-sync`.
4. For each module: `implement-<id>`, `lint-<id>`, optional `review-<id>`, and
   `test-<id>`.
5. `final-lint`, optional `final-review`, `final-test`, and `project-summary`.
6. Optional `demo-candidate`, `demo-delivery`, and `demo-ready`.

The resulting definition has `maxConcurrency: 1`. This is a deliberate single
repository publication lane: checks complete before another implementation can
advance shared `HEAD`. Provider plans can still execute their own nodes up to
their declared and group limits.

Module implementation owns repair budgets. Each lint, review, and test checker
can request the implementation stage again. Current compilation gives two
orders to each present category, one orchestrator order, and one technical
retry, then calculates `maxAttempts` to cover that bounded policy.

## Change and recovery rules

Normal start checks the declared commit and a clean worktree. Compilation alone
does not. After run creation, recovery reconstructs compiler encoding choices
from the stored graph and verifies the whole graph digest. It also verifies
platform configuration and pinned packages. A changed task, requirement,
ownership prefix, plan, agent, policy path, demo setting, or source ref can
change the graph digest. Use the unchanged project and platform to continue;
start a new run for intended changes.

Compilation output reports `status: "compiled"`, `runId`, `stageCount`,
`definitionDigest`, and `completionScope`. A successful compile proves static
contracts and grants only. A successful run is not by itself human acceptance.

## Diagnostic guide

| Code family | Meaning |
| --- | --- |
| `PROJECT_OBJECT_INVALID`, `PROJECT_SOURCE_INVALID` | Unknown field, missing object, array where object expected, or wrong closed shape. |
| `PROJECT_TEXT_REQUIRED`, `PROJECT_ID_INVALID`, `PROJECT_ABSOLUTE_PATH_REQUIRED` | Invalid scalar identity or path. |
| `PROJECT_MODULES_INVALID`, `PROJECT_MODULE_DUPLICATE`, `PROJECT_DEPENDENCY_*` | Module count, identity, unknown dependency, or cycle failed. |
| `PROJECT_OWNERSHIP_INVALID`, `PROJECT_OWNERSHIP_OVERLAP` | Unsafe or overlapping repository ownership. |
| `PROJECT_SOURCE_PATH_*`, `PROJECT_ARCHITECTURE_*` | Architecture/Blueprint source selection is incomplete or unsafe. |
| `PROJECT_REQUIREMENTS_REQUIRED`, `PROJECT_REQUIREMENT_DUPLICATE` | Requirements are empty or repeat an ID. |
| `PROJECT_PLAN_DIGEST_MISMATCH`, `PROJECT_PLAN_SCOPE_MISMATCH`, `PROJECT_FINAL_PLAN_SCOPE_MISMATCH` | Resolved plan is changed or bound to another run/project/scope. Regenerate it. |
| `PROJECT_BLOCKING_TEST_REQUIRED` | Module plan has no active blocking test. |
| `PROJECT_DEMO_*` | Demo fields or the required provider-link chain are invalid. |
| `PROJECT_BASELINE_CHANGED`, `PROJECT_REPOSITORY_DIRTY` | New-run source no longer matches the declared clean baseline. |
| `PROJECT_RECOVERY_*`, `RECOVERY_GRAPH_DIGEST_MISMATCH` | Supplied project cannot reconstruct the pinned graph. Use the original input. |
| `LEGACY_A11Y_THRESHOLDS_RETIRED` | A project uses numeric accessibility thresholds instead of explicit rule, route, selector, reason, and expiry acceptances. Replace the threshold with the required acceptance records. |
| `LEGACY_A11Y_TIMEOUT_INVALID` | The earlier accessibility timeout is not a positive integer. Move the supported timeout to the provider node and use a valid bounded value. |
| `LEGACY_PERF_CONFIGURATION_RETIRED` | A project uses the earlier performance block or has no explicit `kubeclaw.lighthouse@1` node. Define named Lighthouse profiles and budgets in `.swarm/pipeline.json`. |
| `LEGACY_VISUAL_CONFIGURATION_RETIRED` | A project uses the earlier visual block or has no explicit `kubeclaw.visual@1` node. Define reviewed baseline, profile, and provider nodes in `.swarm/pipeline.json`. |
| `LEGACY_E2E_CONFIGURATION_RETIRED` | A project uses the earlier end-to-end block or has no explicit `kubeclaw.playwright@1` node. Add a project-owned Playwright configuration and an explicit provider node. |
| `LEGACY_SECURITY_CONFIGURATION_RETIRED` | A project uses one combined security block. Define the five explicit security provider nodes so each decision has its own evidence and policy. |

These diagnostics stop project scaffolding before provider execution. Repeating
the command with unchanged input produces the same stop. Correct the project
definition; do not disable the check.

> **Source evidence — unsupported project shapes fail at discovery**
>
> **Implementation:** [accessibility and performance guards](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/nova/project_setup/tools/progress-scaffold-discovery.ts#L269-L403) ·
> [visual, end-to-end, and security guards](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/nova/project_setup/tools/progress-scaffold-discovery.ts#L403-L413).

> **Source evidence — compiler contract**
>
> **Claim:** The compiler validates a closed v2 project, ownership, and resolved-plan bindings before emitting one deterministic sequential graph.
>
> The CLI validates the installed runtime before it creates compile output.
>
> **Implementation:** [requirements, plan binding, and module validation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/compiler.ts#L89-L134); [stable ordering and graph compilation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/compiler.ts#L137-L192)
>
> [Source admission](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/source.ts#L19-L66); [CLI behavior](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/cli.ts#L13-L59)
>
> **Contract or setting:** [coverage binding](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/coverage.ts#L11-L67); [demo binding](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/demo.ts#L3-L54)
>
> **Test evidence:** [deterministic graph shape and optional-stage behavior](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-project-compiler.mts#L80-L119); [dependency, ownership, and plan rejection checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-project-compiler.mts#L121-L130)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Static compilation does not execute providers, confirm endpoint reachability, or establish product acceptance.
