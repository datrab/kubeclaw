# Pipeline Workflow Guides

Status: workflow task index; full wait/resume lifecycle and deployment execution open
Audience: pipeline authors and operators
Owner: product integration maintainers
Evidence: docs/site/use/workflows/examples/compiled-project.mjs; docs/site/use/workflows/examples/compiled-project-input.mjs; docs/site/use/workflows/examples/compiled-project-verification.mjs; docs/site/use/workflows/examples/first-project.mjs; skills/nova/project/compiler.ts; docs/site/use/workflows/wait-resume.md; docs/site/use/workflows/buster-suite.md; docs/site/use/workflows/kubernetes-fixture.md; docs/site/use/demo-delivery.md; docs/site/use/diagnose.md; docs/site/use/recovery.md; docs/site/use/plugins.md; docs/site/use/workflows/repair-retry.md; docs/site/use/workflows/interruption-recovery.md; docs/site/use/workflows/redis-replay-recovery.md; docs/site/use/workflows/worker-result-recovery.md; docs/site/use/workflows/build-image.md; docs/site/use/workflows/tailnet-exposure.md
Applies to: pipeline workflow selection; each guide states its contracts and execution prerequisites
Last verified: 2026-10-26; one actual eight-stage compiled minimal-project run, original audit and artifact verification; compile-only task remains separate; no deployment or human acceptance claim

Use these guides to bind a pipeline task to its inputs, durable state, result
authority, and cleanup. A **wait** is a persisted request for a later decision.
A **resume signal** supplies that decision to the same run. Resuming creates a
new stage attempt; it does not change the result of the earlier attempt.

| Task | Reader path | Evidence boundary |
| --- | --- | --- |
| Run and audit a local Core graph | [Local durable Core pipeline](local-core.md) | Actual shipped stage, adapters, filesystem journals/artifact, same-run local telemetry and negative checks; no project compiler, Forge, remote Buster or deployment. |
| Compile a complete first project | [Materialize and compile a first project](#materialize-and-compile-a-first-project) | Real local compiler and resolver; no platform admission, adapter activation, agent execution, or delivery. |
| Compile, run, audit and clean up one minimal project | [Run one compiled minimal project](#run-one-compiled-minimal-project) | One actual compiler-produced graph, implementation, two lint/test gates, audit, original artifacts and owned cleanup; no deployment or human acceptance. |
| Wait, approval, and resume | [Rehearse Human Approval and Resume](wait-resume.md) | Complete inputs, host prerequisites, and ordered local rehearsal; no successful full local lifecycle evidence. The required deployment run remains open. |
| Run a Buster suite with a fixture, matrix, and report | [Run a Buster Suite](buster-suite.md) | Use that guide's declared local and deployment checks. |
| Prepare and release a Kubernetes fixture | [Prepare and Release a Kubernetes Fixture](kubernetes-fixture.md) | Separates local plan validation from deployed fixture lifecycle. |
| Deliver a demo and request human acceptance | [Deliver a Demo](../demo-delivery.md#canonical-demo-delivery-procedure) | Local contract rehearsal and explicit live-delivery prerequisites. |
| Diagnose an uncertain external effect | [Lost Responses and Uncertain Effects](../diagnose.md#lost-responses-and-uncertain-effects), then [Pipeline State Recovery](../recovery.md#pipeline-state-recovery) | Preserve stopped-writer raw state before audit; match the original request, resource and receipt through an authorized owner read. Stop while the outcome or supported reconciliation path remains unknown. |
| Activate, replace, or remove a plugin | [Canonical Plugin Lifecycle Procedure](../plugins.md#canonical-plugin-lifecycle-procedure) | Separate package discovery, configuration/grant admission, actual activation/result, drain and retained state. The procedure routes OpenClaw and Codex hosts to their own controls; no generic install/remove CLI or deployed proof is implied. |
| Inspect technical retry, repair and mandatory rechecks | [Retry and repair rehearsal](repair-retry.md) | Actual Core/file journals/native Git/artifact-store rehearsal with explicitly trusted test checkers; not application quality or a compiled implementation project. |
| Recover an interrupted Core attempt | [Interruption and original checkpoint recovery](interruption-recovery.md) | Actual owned child interruption/recovery and external-effect stop controls; preserve original run and raw state before recovery. |
| Reconcile Redis delivery after an outage | [Redis replay and deduplication](redis-replay-recovery.md) | Separate readiness, canonical event, observer attempt/checkpoint, exact Redis stream and receiver acknowledgement. Native outage remains an owner-executed procedure, not a claimed result. |
| Recover an accepted Worker attempt result | [Worker interruption and result recovery](worker-result-recovery.md) | Same-host ownership/spool/journal/result reconciliation; do not invent a generic kill/recover CLI or a fresh claim to bypass fencing. |
| Build, publish and inspect the original image on its node | [BuildKit image-to-node workflow](build-image.md) | Separates client preparation, actual remote build/manifest/import and the owner-provided uncached node/application procedure; no live build/pull or missing original-state reconciliation is implied. |
| Expose, hand off and release one Tailnet fixture | [Tailnet exposure lifecycle](tailnet-exposure.md) | Distinguishes ephemeral release from retained readiness handoff, allowed/denied client proof and successor-safe cleanup; no live OAuth/ACL/Tailnet result is implied. |

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


## Run one compiled minimal project

This journey compiles one `nova-project.v2` and gives that exact `compiled.json`
to Core. It does not join the compile-only exercise above with an unrelated
explicit graph. The real implementation agent corrects an initially wrong
`greeting()` result. The same run then performs module lint, a mandatory Buster
provider test, final lint, a cumulative provider test and the technical summary.

Use the fixed executable Source baseline below. It contains all three workflow
helpers and the product code used by this journey. Later guide-only corrections
do not change that executable baseline. Do not substitute the developer
handbook's older example baseline. These commands replace its clone/revision
selection steps:

```bash
set -euo pipefail
COMPILED_SOURCE_REVISION=3d52c76087201ac068bd80357d66612797c02c02
export COMPILED_SOURCE_REVISION
git clone https://github.com/datrab/kubeclaw.git kubeclaw-compiled-source
cd kubeclaw-compiled-source
git fetch origin "$COMPILED_SOURCE_REVISION"
git checkout --detach "$COMPILED_SOURCE_REVISION"
test "$(git rev-parse HEAD)" = "$COMPILED_SOURCE_REVISION"
test -z "$(git status --porcelain)"
for helper in compiled-project.mjs compiled-project-input.mjs compiled-project-verification.mjs; do
  git cat-file -e "$COMPILED_SOURCE_REVISION:docs/site/use/workflows/examples/$helper"
done
```

All commands must exit zero; the checkout is clean at the requested full commit
and contains all three helpers. Then follow the
[handbook's host-tool and locked development-dependency steps](../../extend/developer-handbook.md#prepare-a-clean-checkout)
in this same checkout, keeping this revision. Use its explicit `--include=dev`
installation and module-resolution checks, not a production-only dependency tree.

Install Semgrep separately from the npm tools. The npm lockfile does not include
this Python tool. Use the repository's complete hash-locked Nova requirements
in an owned environment; Python 3 with `venv` support must be available. Stop
on a venv, wheel, hash or dependency failure rather than changing the lockfile.

```bash
export COMPILED_JOURNEY_PARENT="$(mktemp -d /tmp/kubeclaw-compiled.XXXXXX)"
python3 -m venv "$COMPILED_JOURNEY_PARENT/semgrep"
"$COMPILED_JOURNEY_PARENT/semgrep/bin/python" -m pip install --require-hashes --only-binary=:all: -r docker/python-tools/semgrep-nova.txt
export PATH="$COMPILED_JOURNEY_PARENT/semgrep/bin:$PATH"
export SEMGREP_SETTINGS_FILE="$COMPILED_JOURNEY_PARENT/semgrep-settings.yml"
export SEMGREP_LOG_FILE="$COMPILED_JOURNEY_PARENT/semgrep.log"
```

Before creating a fixture, check the exact executable paths used by the helper:

```bash
node --version
npm --version
/usr/bin/git --version
/usr/bin/flock --version
/usr/bin/tar --version
/usr/bin/script --version
cc --version
semgrep --version
```

Node must be major 24. `/usr/bin/flock` and `/usr/bin/script` must be GNU
util-linux, and `/usr/bin/tar` must be GNU tar. Git must exist at `/usr/bin/git`;
a different executable found only through `PATH` is not sufficient. Use the
Semgrep executable from the hash-locked environment installed above. Stop on a missing or wrong
host dependency. These steps do not provision a Gateway or grant a model account.

The operator must supply an approved OpenClaw Gateway tools endpoint, its bearer
authentication, an existing implementation agent and that agent's configured
model. The Gateway must permit this selected product runtime's session creation,
status, history and cleanup operations. The helper creates an attempt-owned
implementation session, not a new continuation worker. It fixes only the private
fixture's `app` prefix. Do not select a real project repository for this exercise.

From the selected repository root:

```bash
set -euo pipefail
export COMPILED_JOURNEY="$COMPILED_JOURNEY_PARENT/journey"
mkdir "$COMPILED_JOURNEY_PARENT/nova-tools"
cp docker/nova-tools/package.json docker/nova-tools/package-lock.json "$COMPILED_JOURNEY_PARENT/nova-tools/"
npm ci --prefix "$COMPILED_JOURNEY_PARENT/nova-tools" --ignore-scripts --no-audit --no-fund --cache "$COMPILED_JOURNEY_PARENT/npm-cache"
export COMPILED_TOOLS_BIN="$COMPILED_JOURNEY_PARENT/nova-tools/node_modules/.bin"
npm run plugin-system:sandbox:build
node docs/site/use/workflows/examples/compiled-project.mjs prepare "$COMPILED_JOURNEY"
```

Expected: `status: "prepared-compiled-project"`, `execution: false` and
`stageCount: 8`. Inspect `project/project.json`, `project/compiled.json`,
`project/operator-selected-lint-policy.json` and
`compiled-platform.local-providers.json` under the new destination.
The owner marker records the exact prepared project and compiler-output digests.
Run, verification and cleanup reject either file if it changes after preparation.
The source includes `package.json` and reserves only `.kubeclaw-results/` for
generated runtime receipts; actual application changes remain tracked and
subject to the source guard. The architecture ref is the exact baseline commit.

The policy retains the shipped tools and an empty suppression baseline. For this
JavaScript-only fixture, full lint selects ESLint, Knip, Dependency Cruiser,
JSCPD, Semgrep and OpenAPI contract validation. An unavailable or failing required
tool blocks the workflow; it is not converted to a successful check.

Select the actual authorized endpoint and runtime identities. For a local
Gateway the endpoint commonly ends in `/tools/invoke`; a Gateway root URL is
not a tools endpoint. Read the credential without echoing it:

```bash
(
  trap 'unset COMPILED_GATEWAY_TOKEN' EXIT
  read -r -p "Approved Gateway tools URL: " COMPILED_GATEWAY_ENDPOINT
  read -r -p "Existing implementation agent id: " COMPILED_AGENT_ID
  read -r -p "Configured model id: " COMPILED_MODEL
  read -rs -p "Gateway bearer credential: " COMPILED_GATEWAY_TOKEN
  printf '\n'
  export COMPILED_GATEWAY_ENDPOINT COMPILED_AGENT_ID COMPILED_MODEL COMPILED_GATEWAY_TOKEN
  node docs/site/use/workflows/examples/compiled-project.mjs run "$COMPILED_JOURNEY"
)
```

The helper starts the real shipped Buster production runtime on an ephemeral
loopback listener, with a generated fixture-only authentication value and
source-attestation key. These values remain in memory, not in JSON configuration or command output.
The trusted Core child receives only its required credential references and
runtime variables. The Buster loader receives only its own authentication and
public verification key; the provider and command runtime use their original
sanitized child environments. The credential prompt is scoped to a subshell with
an EXIT cleanup trap, including failed runs. Core uses the
original compiled graph, narrow provider selections and explicit grants. Buster
executes the declared `node --test app/greeting.test.mjs` provider checks on
signed committed-source snapshots for both test stages. The additional test
agent is disabled; the mandatory provider checks are not disabled.
The selected direct-command policy uses the supported sampled process limit,
not a claim of cgroup-qualified isolation. No cluster, image delivery, deployment,
screenreader exercise, human acceptance or release gate is proved.

Expected final status: `verified-actual-compiled-workflow`, eight successful
stages, two passed native test-gate decisions, actual audit and byte-verified
artifacts from that same run. The helper preserves raw run/artifact bytes before
it invokes the original Core audit CLI. It uses a PTY for that CLI so a large
JSON audit is not cut off by pipe shutdown. The verifier checks the complete
journal hash chain, audit digest/head, normalized compiler graph, original
artifact bytes and producing run/stage/attempt. It does not rerun a stage:

```bash
node docs/site/use/workflows/examples/compiled-project.mjs verify "$COMPILED_JOURNEY"
```

### Keep proof and remove only this fixture

A failed attempt keeps its first errors, owned workspace and durable state.
Do not overwrite its graph, delete its journal or rerun `run` into that same
root. Diagnose the exact missing prerequisite and prepare a fresh complete
journey. A failed session cleanup needs actual reconciliation before its owned
workspace can be removed; a timeout is not evidence of successful cleanup.

After successful verification, retain the proof outside the deletion target:

```bash
mkdir "$COMPILED_JOURNEY_PARENT/proof"
cp "$COMPILED_JOURNEY/native-verification.json" "$COMPILED_JOURNEY_PARENT/proof/"
cp "$COMPILED_JOURNEY/project/compiled.json" "$COMPILED_JOURNEY_PARENT/proof/"
cp "$COMPILED_JOURNEY/compiled-run-command.json" "$COMPILED_JOURNEY_PARENT/proof/"
cp "$COMPILED_JOURNEY/compiled-run.stdout" "$COMPILED_JOURNEY_PARENT/proof/"
cp "$COMPILED_JOURNEY/compiled-audit-pty.stdout" "$COMPILED_JOURNEY_PARENT/proof/"
cp -a "$COMPILED_JOURNEY/raw-before-audit" "$COMPILED_JOURNEY_PARENT/proof/"
node docs/site/use/workflows/examples/compiled-project.mjs cleanup "$COMPILED_JOURNEY"
test ! -e "$COMPILED_JOURNEY"
rm -rf -- "$COMPILED_JOURNEY_PARENT/nova-tools" "$COMPILED_JOURNEY_PARENT/npm-cache" "$COMPILED_JOURNEY_PARENT/semgrep"
```

Expected cleanup status: `verified-owned-cleanup`. Cleanup rechecks the selected
Source, verification, clean fixture repository and absence of retained Git
worktrees before removing the exact owned journey root. It does not remove an
OpenClaw installation, another checkout or an operator's credentials. Keep the
small `proof` directory while the result is needed. The sandbox build remains
a generated dependency in the isolated checkout; retain it while another check
uses it and remove only a build owned by this exercise when no process uses it.
