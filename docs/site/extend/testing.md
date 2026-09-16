# Test And Manage An Extension

Status: AP08.8 lifecycle guide implemented with stated local limits
Audience: extension author, operator, maintainer
Owner: plugin-foundation
Evidence: scripts/verify-plugin-packages.mjs; skills/common/plugin-runtime/foundation/registry; packaging/runtime/roles
Evidence revision: `bcf032f241b432bf920baa9ee5f727947921447d`
Applies to: pipeline-plugin-v2, OpenClaw extensions, Codex plugins, Worker engines, runtime roles
Last verified: source and focused local checks on 2026-09-16

## Objective

Prove that an extension works at its real boundary.
Then change, disable, or remove it without losing necessary state or recovery data.

A unit test proves only one layer. A complete result connects package bytes, trust,
selection, activation, behavior, failure, and cleanup.

## Terms Used In This Guide

| Term | Meaning here |
| --- | --- |
| Discovery | Read inert metadata and build an index without loading package code |
| Activation | Load one selected executable export after trust and policy checks |
| Package check | Validate one package's manifest, modules, schemas, and tests |
| Platform check | Validate the shared contract and security boundary |
| Live check | Use the actual host, service, network, storage, or cluster |
| Remaining state | Data that an extension does not own or cannot remove safely |

## Use A Proof Ladder

Run the smallest useful check first. Continue until the test reaches the changed
boundary.

| Level | Question | Typical proof | What it does not prove |
| --- | --- | --- | --- |
| 1. Static | Are files and declarations valid? | JSON Schema, type check, import-safety check | The host can activate the package |
| 2. Package | Does owned behavior work? | Package test command | Shared policy or role inclusion |
| 3. Platform | Does the public boundary accept it? | Registry, activation, sandbox, or role check | External dependency health |
| 4. Integration | Do connected components agree? | Real adapter, provider, or engine exercise | Production topology and credentials |
| 5. Live | Does the deployed path work and recover? | Host or cluster acceptance | Behavior outside the tested configuration |

KubeClaw keeps these levels separate because a green inner test cannot prove an
outer boundary.

**Benefit:** A failure report identifies the first boundary that did not work.

**Cost:** Important changes need more than one command and one evidence record.

**Rejected alternative:** One repository-wide command hides skipped tools, missing
hosts, and unavailable live dependencies behind an aggregate result.

**Reconsider when:** A test runner can preserve each level, environment, skip reason,
and result in one machine-readable record.

> **Discovery boundary:** [The registry builder validates package declarations and creates separate indexes](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/build.ts#L265-L317).
>
> **Activation boundary:** [Foundation checks selected package integrity before it imports executable code](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/activation.ts#L103-L137).

## Record A Reproducible Result

For each command, record these facts:

- the complete command and working directory;
- the reviewed Git revision;
- the package version and digest when the runtime reports them;
- required environment variables without their secret values;
- the host, operating system, and external services;
- passed, failed, skipped, unavailable, and not-run results as different states;
- the first relevant error and the retained evidence location;
- the boundary that the command did not reach.

Do not change `unavailable` to `passed` without running the check.
The original AP08.7-AP08.9 host lacked timeout-capable `flock` and a C compiler.
Check the current host before reusing that result.
The [AP08.10 checkpoint](../../blueprint/AP08.10-checkpoint.md) records the new environment and results.

## Test A Pipeline Stage

Use the minimal plugin journey for the complete first stage. For later stages, apply
this focused procedure:

1. Validate the manifest and every referenced schema.
2. Import the declared module and named export.
3. Invoke success with the smallest valid input.
4. Invoke one invalid input and verify rejection before work starts.
5. Deny each requested capability and verify the public denial result.
6. Exercise timeout, cancellation, and duplicate input when they apply.
7. Verify every declared artifact and output against its schema.
8. Activate the stage through Foundation with the intended grant.
9. Run it through Nova and inspect the committed lifecycle result.
10. Remove the stage from the graph and verify that no new invocation occurs.

Core owns lifecycle changes. A stage test must not accept direct journal mutation as
proof of a supported plugin result.

> **Invocation boundary:** [The SDK context exposes bounded capability, event, and artifact services](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/sdk/src/runtime.ts#L21-L43).
>
> **Result interpretation:** [Nova validates the result, records it, applies lifecycle rules, and always cleans the attempt](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/stage-executor.ts#L31-L52).

## Test An Observer

An observer consumes committed events. It must not control the pipeline.

1. Validate subscriptions and checkpoint schema.
2. Deliver one matching committed event.
3. Verify one non-matching event causes no delivery.
4. Repeat the same event and verify the declared duplicate behavior.
5. Stop delivery during an external write.
6. Restart from the durable checkpoint.
7. Exhaust the retry policy and inspect the terminal delivery record.
8. Disable the observer and verify later events remain available to Core.

An observer can fail its delivery. That failure does not reverse the committed
pipeline event.

> **Bounded delivery:** [Nova binds the observer identity, delivery attempt, lease, grants, timeout, and cleanup](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/telemetry/observer-delivery.ts#L15-L43).

## Test A Capability Adapter

An adapter test must prove policy and the external effect.

1. Validate the provided capability ID against the closed vocabulary.
2. Verify provider selection from platform configuration.
3. Invoke with no grant and expect denial before the external call.
4. Invoke at each important constraint boundary.
5. Verify the external receipt and the redacted audit record.
6. Interrupt after dispatch and before receipt persistence.
7. Reconcile the uncertain effect by stable operation identity.
8. Verify cancellation stops owned local work.
9. Disable the adapter and verify selection fails closed.

Do not prove an effect only with a mock. Use a mock for deterministic inner tests,
then use the real protocol in an integration or live check.

> **Provider resolution:** [Foundation maps each capability to one installed adapter and rejects invalid mappings](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L75-L119).
>
> **Effect recovery:** [The durable invocation records request and acceptance, recovers receipts, fences calls, and records completion](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/effects/durable-invocation.ts#L88-L157).

## Test A Provider Or Report Adapter

Buster binds both surfaces through a resolved test plan.

For a test provider:

1. Validate its provider contract and declared matrix fields.
2. Run the smallest valid plan in the provider sandbox.
3. Deny one required grant and verify failure before provider work.
4. Exercise fixture prepare, health, test, collect, and cleanup paths.
5. Verify evidence size, count, type, and retention bounds.
6. Exercise timeout, cancellation, retry safety, and remote interruption.
7. Import the signed result through Nova.

For a report adapter:

1. Validate the format identity and accepted media type.
2. Parse a small valid report.
3. Reject malformed and oversized input.
4. Preserve executed, failed, skipped, and error counts.
5. Verify bounded diagnostic output.

The provider produces facts. The report adapter normalizes facts. Gate policy decides
whether those facts pass.

> **Provider binding:** [Buster verifies the plan digest, registry snapshot, provider identity, and report-adapter identity](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/test-gates/runner.ts#L234-L267).
>
> **Package snapshot:** [The provider loader verifies the digest and copies exact package bytes into the attempt workspace](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/test-gates/provider-loader.ts#L52-L79).

## Test An OpenClaw Or Codex Extension

Test the host contract, not only the exported function.

For OpenClaw:

1. Validate `openclaw.plugin.json` with the target host version.
2. Verify the built image contains the package.
3. Verify allowlist and entry configuration.
4. Start with the extension disabled.
5. Start with valid and invalid configuration.
6. Invoke every hook or tool through OpenClaw.
7. Stop during queued work and verify bounded shutdown.
8. Restart and inspect external records for duplicates.

For Codex:

1. Validate `.codex-plugin/plugin.json` and every skill path.
2. Install the exact package version.
3. Exercise trigger and non-trigger prompts.
4. Exercise connected and missing external tools.
5. Verify that read-only guidance does not perform mutations.
6. Update the package and repeat its critical workflow.
7. Remove it and verify that the skill is no longer discoverable.

The current Ops package has no package-local automated test. Its connected-tool and
missing-tool exercises remain required acceptance work.

## Test A Worker Engine Or Runtime Role

A Worker engine test starts with its versioned attempt envelope.

1. Reject the wrong contract, engine digest, or schema identity.
2. Apply resource limits before specialist execution.
3. Execute success, domain failure, timeout, and cancellation.
4. Terminate all owned child work.
5. Collect bounded evidence and cumulative resource facts.
6. Run cleanup after every terminal path.
7. Retry or recover with the same immutable attempt identity.

A role test proves packaging around that engine:

1. Run ownership and role-closure checks.
2. Build a clean role bundle.
3. Inspect selected packages, extensions, entrypoint, and digests.
4. Build the role image.
5. Start the process and verify readiness.
6. Run one real task and one failure.
7. Stop and restart while recoverable work exists.

> **Attempt lifecycle:** [Worker Core invokes preparation, execution, termination, measurement, cleanup, and evidence hooks](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/worker/core/worker/attempt-executor.ts#L62-L93).
>
> **Role closure:** [The role checker verifies ownership, dependencies, capability providers, and plugin selection](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/check-runtime-role-manifests.mjs#L77-L145).

## Install And Activate By Surface

| Surface | Install action | Activation action | Positive observation |
| --- | --- | --- | --- |
| Stage or observer | Stage approved package bytes in an installation root | Select it in graph or platform configuration | Registry identity and successful invocation or delivery |
| Capability adapter | Stage package and configure its provider mapping | Add it to active adapters with a bounded grant | Receipt plus redacted effect record |
| Test provider or report adapter | Include package in the Buster role | Bind it into a resolved test plan | Provider result or normalized report |
| OpenClaw extension | Copy package into the role image | Allow and configure it in OpenClaw | Registered hook or tool and one real event |
| Codex plugin | Install the plugin package | Make its skill available in the Codex environment | Triggered workflow with expected tools |
| Worker engine | Integrate engine and exact profile | Route a matching attempt to its role | Accepted attempt and durable result |
| Runtime role | Build and deploy immutable bundle or image | Start its entrypoint with role configuration | Readiness and one real task |

Installation authority belongs to the operator. Project input can select approved
behavior, but it cannot install executable code or grant itself authority.

## Update Or Replace

Use an update when identity and compatible contracts remain stable. Use a replacement
when identity, host contract, authority, state format, or recovery bytes change.

1. Record the old package version, digest, configuration, and state owners.
2. Read the new compatibility and migration notes.
3. Run static, package, and platform checks against the new bytes.
4. Build a new complete role when role contents change.
5. Stop new selection of the old implementation.
6. Drain work that must finish with the old bytes.
7. Migrate owned state only through a documented migration.
8. Activate the new identity for new work.
9. Run one success, one denial, and one recovery exercise.
10. Retain old bytes while an attempt can still request them.

Do not replace files inside a running bundle. That action breaks the connection
between evidence, digest, and behavior.

## Disable Safely

Disablement stops new use. It does not mean removal.

| Surface | Disable control | Required check |
| --- | --- | --- |
| Stage | Remove it from new graphs | Existing recoverable runs keep resolvable bytes |
| Observer | Remove the configured observer ID | Core continues to commit source events |
| Adapter | Remove active selection or provider mapping | Requests fail closed with no external call |
| Provider or report adapter | Stop binding it into new plans | Existing plans keep exact implementation identity |
| OpenClaw | Disable or remove its configured entry | Later hooks or tools do not invoke it |
| Codex | Disable plugin availability | Later prompts do not discover its skill |
| Engine or role | Stop routing new attempts | In-flight and recoverable work has a drain plan |

## Remove And Inspect Remaining State

Remove package bytes only after selection stops and recovery no longer needs them.

| State | Typical owner | Removal consequence |
| --- | --- | --- |
| Nova journal and pipeline records | Core | Package removal does not delete them |
| Observer checkpoints and delivery attempts | Observer runtime or store | Keep them for replay policy and audit |
| External effects and receipts | External system plus effect journal | Reconcile or retain them separately |
| Buster evidence and resolved plans | Test evidence store | Keep them for result verification and recovery |
| OpenClaw Redis records | Observer and Redis retention policy | Host-extension removal does not delete them |
| Codex conversation or external tool data | Codex or connected service | Plugin removal does not delete them |
| Worker evidence and attempt records | Worker and pipeline stores | Keep them while audit or recovery requires them |
| Role bundles and images | Artifact or image store | Retain referenced versions, then apply store policy |

After removal, verify package discovery, configuration references, running processes,
queued work, external credentials, durable records, and retention rules. Delete data
only through its owner's procedure.

## Diagnose A Failure

Follow the first failed boundary:

1. If discovery fails, inspect the manifest, schema paths, exports, and package digest.
2. If selection fails, inspect graph, platform mapping, plan binding, or host entry.
3. If activation fails, inspect trust, grants, allowlists, and role contents.
4. If invocation fails, inspect bounded input, dependency health, timeout, and logs.
5. If recovery fails, inspect stable identity, checkpoint, retained bytes, and cleanup.
6. If removal fails, find the remaining selector or state owner before deletion.

Do not start by increasing authority or retry limits. First identify whether the
failure occurred before dispatch, during work, or after an uncertain external effect.

## Commands

Run the commands that match the changed surface:

```bash
npm run verify:plugin-packages
npm run verify:plugin-live-capabilities
npm run verify:plugin-system:phase12
npm run verify:worker-core:attempt-executor
npm run verify:runtime-packaging:roles
npm test --prefix skills/common/plugins/openclaw-agent-observer
node --test skills/prism/openclaw-plugin/index.test.mjs
```

Package-specific commands appear on each catalogue page. Live checks require their
named host, credentials, external services, or cluster. Record those prerequisites
instead of silently skipping them.

## Completion Checklist

- The test reached the real changed boundary.
- The record identifies environment, revision, package identity, and result state.
- Success, invalid input, denial, timeout, cancellation, and cleanup have coverage.
- Duplicate and uncertain-effect behavior has coverage when an external effect exists.
- Role or host installation has direct proof.
- Update or replacement preserves recoverable work.
- Disablement stops new use and fails closed.
- Removal checks every remaining state owner.
- Unavailable and live checks remain explicit.
- Every behavior claim links to current contract, implementation, configuration, or test evidence.
