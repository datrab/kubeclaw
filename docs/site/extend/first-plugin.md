# Create And Activate A First Pipeline Plugin

Status: AP08.2 minimal stage journey implemented with stated verification limits
Audience: plugin author, maintainer
Owner: plugin-foundation
Evidence: docs/site/extend/examples/minimal-stage; scripts/check-ap08-minimal-plugin.mjs; skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; packaging/runtime/roles/nova.json
Evidence revision: `bcf032f241b432bf920baa9ee5f727947921447d`
Applies to: one capability-free `pipeline-plugin-v2` stage in the Nova role
Last verified: source and local journey check on 2026-09-16

## Objective

Create one small stage plugin and take it through the complete local plugin path:

1. inspect and test the package;
2. make the Nova role own it;
3. verify that role packaging can include it;
4. discover, register, grant, and activate it;
5. invoke it in a local runner harness and inspect its decision fact;
6. invoke one intentional failure;
7. reject one invalid input before stage execution;
8. remove the package and prove that new activation stops;
9. identify the run evidence that remains after removal.

The example does not access a network, filesystem, secret, process, or database.
It requests no capabilities and creates no external state.
This design keeps the first journey focused on package and runtime mechanics.
The `effectful-plugin` guide is planned for AP08.4.

## Scope Boundary

This guide explains plugin authoring and local plugin integration only.
It does not explain `.swarm/pipeline.json`, the project compiler, pipeline submission,
transport, a running Nova service, image deployment, or an end-to-end pipeline run.

The maintained check creates one `pipeline-definition.v2` value in memory because a
stage needs a graph entry before Nova can invoke it. That value is a test harness for
the plugin registration. It is not a project file, a reusable pipeline example, or
an end-to-end system test.

This separation keeps two different developer tasks clear:

- this guide proves that an installed plugin can register, activate, and return a
  result through the local runtime boundary;
- the Use and Operate guides own pipeline configuration, submission, observation,
  and deployed execution.

Do not copy the in-memory test definition as a `.swarm/pipeline.json` file. The two
inputs have different schemas and different owners.

## What You Will Build

The example registers `example.greeting.say`.
It reads a name and a configured prefix.
On success, it returns the decision fact `tutorial.greeting`.
When the input sets `fail` to `true`, it returns a deliberate terminal failure.

This example is a stage because the graph must order it and Core must interpret its
typed result. An observer would only consume committed events. An adapter would
provide external authority. A test provider would execute Buster test work.

The canonical example remains outside `skills/nova/plugins` by default.
This choice prevents documentation verification from changing the shipped Nova role.
You copy the example into the Nova plugin root during the exercise.
You then make role ownership explicit before packaging it.

**Benefit:** The repository keeps one executable teaching source without silently
adding tutorial behavior to a production runtime.

**Cost:** The exercise has an explicit copy and role-edit step.

**Alternative:** The repository could ship the example in every Nova bundle.
That approach would increase the trusted code set without a product requirement.

**Reconsider when:** The greeting stage becomes a supported product feature or the
project adds a dedicated development-only runtime role.

## Prerequisites

- Start from a clean checkout of the reviewed revision.
- Install Node.js major version 24.
- Run `npm ci --ignore-scripts` if dependencies are not present.
- Use a branch. The procedure changes one role manifest and creates one package copy.
- Keep released package bytes for any nonterminal run that can still recover.
- Do not use this tutorial package in a production deployment.

Confirm the starting state:

```bash
git status --short
node --version
npm run docs:ap08:minimal-plugin:check
```

The last command uses a temporary installation root.
It does not add the tutorial plugin to the checked-out Nova role.

## Understand The Package Before You Copy It

The [example package](examples/minimal-stage/) contains seven maintained files:

| File | Purpose | Why it exists |
| --- | --- | --- |
| [`plugin.json`](examples/minimal-stage/plugin.json) | Declares package and stage identity | Discovery must inspect inert metadata before code runs |
| [`package.json`](examples/minimal-stage/package.json) | Defines an isolated package test command | A package must have a repeatable local check |
| [`config.schema.json`](examples/minimal-stage/schemas/config.schema.json) | Accepts one required greeting prefix | Configuration must fail before execution when its shape is wrong |
| [`input.schema.json`](examples/minimal-stage/schemas/input.schema.json) | Accepts a name and optional failure switch | The runner validates graph input before calling the stage |
| [`result.schema.json`](examples/minimal-stage/schemas/result.schema.json) | Accepts the exact success and failure results | Core must reject output outside the declared contract |
| [`stage.js`](examples/minimal-stage/src/stage.js) | Implements the capability-free operation | The first example needs no adapter or hidden authority |
| [`stage.test.mjs`](examples/minimal-stage/tests/stage.test.mjs) | Tests success and intentional failure | Fast package feedback remains separate from runtime integration |

The manifest is the inert entry point:

```json
{
  "id": "example.greeting",
  "apiVersion": "pipeline-plugin-v2",
  "packageVersion": "1.0.0",
  "stages": [
    {
      "id": "say",
      "type": "example.greeting.say",
      "module": "src/stage.js",
      "export": "execute",
      "requiredCapabilities": [],
      "configSchema": "schemas/config.schema.json",
      "inputSchema": "schemas/input.schema.json",
      "resultSchema": "schemas/result.schema.json"
    }
  ],
  "observers": [],
  "adapters": []
}
```

The package ID and registration ID form the global identity
`example.greeting:say`. The stage type `example.greeting.say` is the name used by a
pipeline graph. These names have different purposes and must both remain unique.

`requiredCapabilities` is empty by design. Do not add a capability only to make the
example appear realistic. Each capability needs an installed adapter, operator
selection, bounded grant, denial test, and effect-recovery analysis.

## Procedure

### 1. Copy The Package Into The Nova Plugin Root

Use the exact tutorial destination so that later commands remain reproducible:

```bash
cp -R docs/site/extend/examples/minimal-stage skills/nova/plugins/tutorial-greeting
npm test --prefix skills/nova/plugins/tutorial-greeting
```

Expected package result: two tests pass.
One test checks `tutorial.greeting`. The other checks
`tutorial.requested_failure`.

The package uses JavaScript and has no compile step.
The package test is its source build gate.
Runtime-role assembly performs the deployable packaging step later.

### 2. Observe The Missing Role Ownership Failure

Run the normal role check before you edit the role:

```bash
npm run verify:runtime-packaging:roles
```

Expected failure:

```text
nova omits its plugin: example.greeting
```

This failure is useful.
A directory under `skills/nova/plugins` does not silently become shipped runtime
code. The Nova role must own the plugin explicitly.

### 3. Add The Plugin To The Nova Role

Open [`packaging/runtime/roles/nova.json`](../../../packaging/runtime/roles/nova.json).
Add `example.greeting` once to the `plugins` array.
Do not add it to `packages`, `extensions`, or `externalCapabilities`.

Run the role check again:

```bash
npm run verify:runtime-packaging:roles
```

Expected result: the command reports three valid roles.
It also reports 49 pipeline plugins while the tutorial copy exists.

Why the `plugins` array is necessary:

- the source directory declares who owns the package;
- the role manifest declares which deployable identity includes it;
- the bundle builder copies only selected role content;
- deployment receives the built bundle, not the complete repository.

The plugin requests no capabilities.
Therefore, role closure needs no additional adapter or external-capability record.

### 4. Build And Inspect A Nova Runtime Bundle

Build the isolation launcher first because runtime bundle assembly requires it.
Then build into a new temporary child path:

```bash
npm run plugin-system:sandbox:build
export KUBECLAW_TUTORIAL_TEMP=/tmp/kubeclaw-ap08-plugin
node scripts/build-runtime-role-bundle.mjs nova "$KUBECLAW_TUTORIAL_TEMP/nova" 0000000000000000000000000000000000000000 v2 2026-09-16T00:00:00Z
rg -n 'example.greeting' "$KUBECLAW_TUTORIAL_TEMP/nova/manifest.json"
```

Use a different empty `KUBECLAW_TUTORIAL_TEMP` path if that path already exists.
The builder refuses an existing output directory.

Expected result: the bundle manifest contains one plugin record for
`example.greeting`. This proves deployable role inclusion. It does not prove that a
cluster runs the new bundle.

### 5. Run The Complete Local Activation Journey

Run the maintained journey check:

```bash
npm run docs:ap08:minimal-plugin:check
```

The check performs these operations with the real KubeClaw components:

1. copy the canonical example to a temporary installation root;
2. parse the manifest and all referenced schemas;
3. build the registry and resolve the empty capability grant set;
4. reject the owned package before the Nova role selects it;
5. accept a Nova role addition through the normal role checker;
6. activate exactly one stage through Foundation;
7. invoke that stage through a local Nova `PipelineRunner` harness;
8. inspect the successful decision fact;
9. run the explicit failure input;
10. reject an empty name through the input schema;
11. remove the temporary package and require stage-owner failure.

Expected output includes these fields:

```text
"roleOmission":"rejected"
"activatedStages":1
"successFact":"Hello, KubeClaw!"
"intentionalFailure":"failed"
"invalidInput":"rejected"
"removal":"stage-owner-missing"
```

The journey check uses an in-memory event journal.
The current local BusyBox `flock` lacks GNU `flock --timeout`, which the persistent
file journal requires. Registry, grants, activation, schema checks, `PipelineRunner`,
stage execution, lifecycle reduction, and role validation use production code.
Persistent file-lock and recovery verification remain outside this local result.

### 6. Read The Result As A Runtime Contract

The successful result has three separate meanings:

- `activatedStages: 1` proves that Foundation loaded the selected stage export;
- `successFact` proves that Nova invoked the export with validated config and input;
- the succeeded stage state proves that Core interpreted the typed result.

The intentional harness failure also has three meanings:

- the plugin ran and returned a valid `failed` result;
- Core recorded the stage as failed;
- the local one-stage harness ended as failed because no later stage can repair it.

The invalid-name case fails earlier.
Nova validates the input schema before it calls the plugin.
This distinction helps you locate a defect: input rejection is not stage failure.

### 7. Inspect The Runtime Path In Source

Use these sources when the observed result differs from the expected result:

> **Discovery:** [`discoverPackages()` reads manifests and package identity without importing the stage](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/discovery.ts#L118-L137).
>
> **Registration:** [`buildRegistry()` validates files and assigns the global registration identity](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/build.ts#L285-L317).
>
> **Grant resolution:** [Foundation enables registrations and creates their exact grant sets](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L176-L212).
>
> **Activation:** [`activateRegistry()` checks package integrity and loads only selected stage exports](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/activation.ts#L103-L137).
>
> **Input validation:** [`PipelineRunner` validates stage configuration and input before execution](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/runner.ts#L39-L53).
>
> **Invocation:** [`StageExecutor` creates a bounded lease, invokes the stage, and validates its result](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/stage-executor.ts#L33-L74).
>
> **Lifecycle:** [Core maps `passed` and `failed` results to canonical stage state](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/lifecycle/reducer.ts#L55-L101).
>
> **Role closure:** [The role checker resolves selected plugin capabilities and rejects owned plugins that the role omits](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/check-runtime-role-manifests.mjs#L99-L145).
>
> **Bundle selection:** [The bundle builder copies only plugins listed by the selected role](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/build-runtime-role-bundle.mjs#L117-L183).

The links above use the AP08 assessment revision.
The tutorial fixture and journey checker are new AP08.2 sources.
Use their relative links until a later commit can supply immutable GitHub links.

## Expected Result

You have four different proofs when the procedure succeeds:

| Proof | Expected observation | What it does not prove |
| --- | --- | --- |
| Package | Two package tests pass | Registry discovery or runtime activation |
| Role | Runtime-role check accepts the Nova selection | A bundle or deployment contains the bytes |
| Bundle | Nova bundle manifest names `example.greeting` | A running pod uses that bundle |
| Runtime harness | One stage succeeds, one fails intentionally, and invalid input is rejected | `.swarm/pipeline.json`, submission, service transport, persistent recovery, or cluster behavior |

Do not combine these states into one statement such as “the plugin works.”
Name the proof that you have.

## Verification

Run the focused checks after the exercise:

```bash
npm test --prefix skills/nova/plugins/tutorial-greeting
npm run verify:runtime-packaging:roles
npm run docs:ap08:minimal-plugin:check
npm run docs:ap08:choice:check
npm run docs:check:refs
```

The complete package verifier runs every current plugin package and takes longer:

```bash
npm run verify:plugin-packages
```

The full plugin-system verifier currently reaches the separately tracked
`DOC-AP08-BOUNDARY-CHECK-001` failure. Do not report that suite as green until the
Buster quality-gate import boundary is corrected.

An end-to-end pipeline exercise requires a project or explicit pipeline definition,
submission through the supported command path, a running Nova service, transport,
and result observation. AP08.2 did not perform or document those steps because they
are outside this plugin-authoring task.

## Common Failures

| Symptom | Cause | Correction |
| --- | --- | --- |
| `nova omits its plugin: example.greeting` | Package exists under the Nova root but the role does not select it | Add the ID once to `roles/nova.json` |
| `selects unknown plugin` | Role entry exists but the package path or manifest ID does not match | Restore the package or correct the exact ID |
| `PIPELINE_STAGE_OWNER_MISSING` | Installation roots do not contain the package, or the stage type differs | Inspect the effective root and `stages[].type` |
| `REGISTRY_PACKAGE_UNTRUSTED` | The package is neither a trusted built-in nor an approved external digest | Keep operator trust separate from project input |
| `REGISTRY_RESULT_INVALID` before execution | Manifest, config, input, or result violates its schema | Fix the named contract; do not weaken the schema |
| `PIPELINE_STAGE_NOT_ACTIVATED` | Discovery succeeded but enablement or activation did not select the stage | Inspect the graph, registration identity, and grants |
| Pipeline status is `failed` | The tutorial used `fail: true` or the stage returned a terminal failure | Inspect the stage result and reason code |
| Bundle output already exists | Bundle assembly requires a new output path | Select a new empty child path |
| `flock: unrecognized option: timeout` | BusyBox `flock` lacks the GNU timeout option | Use a supported host for persistent-run verification |

Do not solve a trust, role, or activation error by importing private Core modules.
Each failure identifies a different ownership boundary.

## Recovery

Reverse the tutorial changes as one reviewed change:

1. Remove `example.greeting` from `packaging/runtime/roles/nova.json`.
2. Remove only `skills/nova/plugins/tutorial-greeting`.
3. Remove the temporary bundle directory that you created.
4. Run the role and AP08 journey checks again.

Example commands after you have removed the role entry:

```bash
rm -r skills/nova/plugins/tutorial-greeting
rm -r /tmp/kubeclaw-ap08-plugin
npm run verify:runtime-packaging:roles
npm run docs:ap08:minimal-plugin:check
git status --short
```

Confirm the exact paths before either removal command.
Do not remove a released bundle that a nonterminal run still needs for recovery.

Removing the package prevents new discovery and activation.
It does not erase old event journals, snapshots, logs, artifacts, or released images.
The AP08 journey check confirms that its earlier success and failure evidence remains
readable after it removes the temporary package.

This example creates no external effect and no persistent plugin-owned state.
Therefore, it needs no adapter reconciliation or plugin cleanup operation.
AP08.4 owns those lifecycle concerns for an effectful example.
