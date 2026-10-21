# Pipeline Workflow Guides

Status: workflow task index; full wait/resume lifecycle and deployment execution open
Audience: pipeline authors and operators
Owner: product integration maintainers
Evidence: docs/site/use/workflows/examples/first-project.mjs; skills/nova/project/compiler.ts; docs/site/use/workflows/wait-resume.md; docs/site/use/workflows/buster-suite.md; docs/site/use/workflows/kubernetes-fixture.md; docs/site/use/demo-delivery.md
Applies to: pipeline workflow selection; each guide states its contracts and execution prerequisites
Last verified: 2026-10-20; first-project local compilation and greeting assertion; other journey boundaries stated separately; no full project execution or deployment evidence

Use these guides to bind a pipeline task to its inputs, durable state, result
authority, and cleanup. A **wait** is a persisted request for a later decision.
A **resume signal** supplies that decision to the same run. Resuming creates a
new stage attempt; it does not change the result of the earlier attempt.

| Task | Reader path | Evidence boundary |
| --- | --- | --- |
| Run and audit a local Core graph | [Local durable Core pipeline](local-core.md) | Actual shipped stage, adapters, filesystem journals/artifact and negative checks; no project compiler, Forge, remote Buster or deployment. |
| Compile a complete first project | [Materialize and compile a first project](#materialize-and-compile-a-first-project) | Real local compiler and resolver; no platform admission, adapter activation, agent execution, or delivery. |
| Wait, approval, and resume | [Rehearse Human Approval and Resume](wait-resume.md) | Complete inputs, host prerequisites, and ordered local rehearsal; no successful full local lifecycle evidence. The required deployment run remains open. |
| Run a Buster suite with a fixture, matrix, and report | [Run a Buster Suite](buster-suite.md) | Use that guide's declared local and deployment checks. |
| Prepare and release a Kubernetes fixture | [Prepare and Release a Kubernetes Fixture](kubernetes-fixture.md) | Separates local plan validation from deployed fixture lifecycle. |
| Deliver a demo and request human acceptance | [Deliver a Demo](../demo-delivery.md#canonical-demo-delivery-procedure) | Local contract rehearsal and explicit live-delivery prerequisites. |

## Materialize and compile a first project

This exercise produces a complete `nova-project.v2` input and its complete
compiled `pipeline-definition.v2` graph. It is a **compile-only** journey.
It does not implement the project, activate a platform, run Forge/Buster,
collect run artifacts or establish human acceptance.

### Prepare the source and destination

Use a repository checkout with Node.js 24, Git, and the locked workspace
runtime dependencies prepared by the [developer handbook](../../extend/developer-handbook.md).
Run from its repository root. The source selection is this checkout's actual
compiler and installed Buster provider packages; the helper discovers their
current manifests and computes real coverage and plan digests. Do not copy
resolved plans between releases or edit their digests.

The [maintained example](examples/first-project.mjs) needs permission to create
one new private local directory, initialize a disposable Git repository in it,
and write the materialized JSON. It uses no network, agent credentials,
cluster context or live runtime role. Missing workspace imports are a stop:
prepare the documented dependency environment rather than changing a package
lock or disabling admission to make the example work.

```bash
# Keep the chosen path: the final component must not already exist.
export FIRST_PROJECT="$(mktemp -d)/first-project"
node docs/site/use/workflows/examples/first-project.mjs "$FIRST_PROJECT"
```

The JSON status must have `status: "compiled-example"`, `stageCount: 8`,
`execution: false`, and `platformAdmission: false`. It also prints the actual
baseline commit and compiled-definition digest. Paths and the new baseline
commit are local to this materialization, so their digests are not universal
constants. If the command fails, stop and inspect its first error; it does not
resume a partial directory. Use a different new directory after correcting the
prerequisite. Do not erase an unknown directory to retry.

### Read the authored project and the result

The directory contains:

- `repository/`: a clean disposable Git baseline with `README.md`,
  `modules/app/FORGE.md`, a greeting module and its Node assertion.
- `workspaces/`: an empty sibling, not a directory inside the repository.
- `project.json`: the full materialized `nova-project.v2`, including absolute
  repository/workspace paths, actual baseline revision, architecture source,
  one module and final checks, real resolved provider plans and their coverage.
- `compiled.json`: the full canonical graph produced by the real project
  compiler using the same source/report/review/delivery encodings selected by
  the project CLI. Compiling twice is checked for identical definitions.

```bash
node -e 'const fs=require("node:fs"),p=require("node:path");const d=process.argv[1];console.log(fs.readFileSync(p.join(d,"project.json"),"utf8"));const g=JSON.parse(fs.readFileSync(p.join(d,"compiled.json"),"utf8"));for(const s of g.stages)console.log(s.id,s.type,JSON.stringify(s.dependsOn),JSON.stringify(s.on||{}));' "$FIRST_PROJECT"
node --test "$FIRST_PROJECT/repository/app/greeting.test.mjs"
```

The second command runs only the already-written greeting assertion. It does
not execute the provider plan, the compiled graph or any implementation agent.
The helper selects an explicit blocking direct-command node with zero retries
for both module and cumulative checks; it does not manufacture passing results.
`testAgentEnabled: false` disables an additional test agent, not those mandatory
provider checks. No optional review or demo stages are selected.

| Compiled stage | Ordinary dependency | Why the compiler adds it |
| --- | --- | --- |
| `source-preflight` | none | Bind the actual architecture/module source and declared requirements. |
| `blueprint-sync` | `source-preflight` | Synchronize admitted source before implementation. |
| `implement-app` | `blueprint-sync` | Forge implementation for the one owned `app` prefix. |
| `lint-app` | `implement-app` | Check the module under its selected lint policy. |
| `test-app` | `lint-app` | Run the module's mandatory coverage-bound provider plan. |
| `final-lint` | `test-app` | Check the integrated repository. |
| `final-test` | `final-lint` | Run the cumulative coverage-bound provider plan. |
| `project-summary` | `final-test` | Construct the technical project summary after gates pass. |

`lint-app` and `test-app` additionally route `request_fix` to `implement-app`;
those repair edges are not ordinary dependency edges. The module implementation
has lint/test repair categories with two orders each, one orchestrator order,
and one technical retry. Its attempt ceiling is seven. Compiling those bounds
is not evidence that a retry, repair or stage execution happened. The actual
full stage configs, source bindings, budgets, inputs and digests are in
`compiled.json`; the table does not replace that artifact.

### Stop before runtime admission

The compiler accepts a lint policy **path**, but does not read or validate the
policy file. This example deliberately names
`operator-selected-lint-policy.json` without fabricating a valid policy.
Before a runtime CLI compilation, the operator must provide that actual policy,
select the same discovered provider/package identities, and prepare a matching
[platform configuration](../../reference/pipeline-platform.md).
The Nova role needs the implementation, source-preflight, blueprint-sync,
lint, quality-evaluation and project-summary registrations; Forge dispatch,
remote test execution, repository/workspace, state, artifact and lint adapters
must have their separately validated paths, grants, identities and secrets.
A role manifest alone supplies none of that authority.

Only after those prerequisites pass, the product CLI syntax is:

```bash
node skills/nova/pipeline.ts --project "$FIRST_PROJECT/project.json" \
  --platform "$FIRST_PROJECT/platform.json" \
  --compile "$FIRST_PROJECT/runtime-admitted.json"
```

`platform.json` and `runtime-admitted.json` are **not** outputs of this exercise.
Do not run that command with an invented platform or overwrite `compiled.json`:
the CLI validates installed stage configurations and grants before writing a new
graph with exclusive creation. A rejected platform is not a compiler-example
failure or a reason to broaden grants. Follow [run control](../operate.md#canonical-run-control-procedure)
for any separately authorized execution; do not remove `--compile` casually.
No runtime success, audit journal, external effect or artifact receipt exists
from this exercise.

### Cleanup and ownership

Keep `project.json` and `compiled.json` while comparing their inputs and graph.
This helper creates no Core storage or adapter state. After inspection,
delete only the new directory recorded in `FIRST_PROJECT`, including its
private disposable repository and empty workspace directory. Do not delete
an operator-selected policy, real project checkout, platform storage or any
other path. If you separately executed the project, stop using this compile-only
cleanup boundary: follow the [recovery and retained-state procedure](../recovery.md)
for the actual run and its external effects first.

## Wait, Approval, and Resume

Start with [the complete approval input set](wait-resume.md#input-set).
It uses the installed human-approval stage, durable wait store, and operator
notification adapter. Follow the guide through the first wait, wrong wait and
wrong issuer, one valid decision, exact replay, audit comparison, and cleanup.
Retain the original request, notification receipt, signal bytes, and attempt
counts. A notification receipt proves delivery; the signal and journal prove
the later Core transition.

[Configure and Operate](../operate.md#canonical-run-control-procedure) owns run
control, signal authority, interruption, and the cancellation boundary. The
workflow guide supplies concrete inputs and observations for that procedure.
[Nova Core](../../understand/nova-core.md) explains the mechanism.
[Workflow Reference](../../reference/workflows.md) describes the input contracts.

## Select the Execution Scope

Local schema and plugin tests check their stated contracts. A supported-host
rehearsal checks a disposable local run with a loopback notification receiver.
A deployment run additionally needs a registered runtime, operator access,
durable storage, package identities, receiver, and secret authority. Record each
scope separately. Neither a unit test nor a loopback run proves deployment
behavior.

The full deployment wait/resume run is mandatory and remains unexecuted. Use
[the deployment registration and stop conditions](wait-resume.md#deployment-registration)
to identify the missing inputs. Do not infer completion from an example file,
a successful notification, or a source link.
