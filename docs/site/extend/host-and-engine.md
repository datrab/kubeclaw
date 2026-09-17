# Extend Hosts, Worker Engines, And Runtime Roles

Status: implemented with stated local limits
Audience: host-extension author, Worker engine maintainer, runtime packager
Owner: plugin-foundation
Evidence: skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json; skills/prism/openclaw-plugin/openclaw.plugin.json; plugins/kubeclaw-ops/.codex-plugin/plugin.json; skills/worker/core/worker/attempt-executor.ts; contracts/pipeline-worker-core/v1/src/types.ts; packaging/runtime/roles
Evidence revision: `bcf032f241b432bf920baa9ee5f727947921447d`
Applies to: OpenClaw extensions, Codex plugins and skills, Worker Core engines, runtime roles
Last verified: source, package, role, and focused host checks on 2026-09-16

## Objective

Extend the correct host without treating every extension as a pipeline plugin.
Build a Worker engine or runtime role only when a stage cannot own the work.

This guide covers four separate boundaries:

1. OpenClaw loads hooks and tools.
2. Codex discovers plugins and skills.
3. Worker Core runs bounded specialist attempts.
4. Runtime roles assemble exact deployable identities.

These boundaries have different manifests, loaders, state, and failure behavior.
A file in one package tree does not activate code in another host.

## Terms Used In This Guide

| Term | Meaning here |
| --- | --- |
| Host extension | Code that OpenClaw or Codex discovers through its own manifest |
| Worker Core | Shared attempt mechanics for limits, logs, cancellation, evidence, and cleanup |
| Specialist engine | Buster or Prism code that interprets one domain operation |
| Worker profile | A digest-bound connection between worker type, engine, contract, and capabilities |
| Runtime role | An exact package, plugin, extension, entrypoint, and external-authority set |
| Bundle | The immutable filesystem assembly produced for one runtime role |

## Why These Boundaries Stay Separate

One universal plugin format would look simpler. It would hide which process loads
the code and which component owns its result.

KubeClaw keeps host extensions, pipeline registrations, engines, and roles separate.
The selected host remains responsible for activation and lifecycle.

**Benefit:** A package cannot gain pipeline, host, or worker authority through an
unrelated manifest.

**Cost:** A feature that crosses hosts needs separate packages and verification
paths.

**Rejected alternative:** A `pipeline-plugin-v2` manifest cannot register OpenClaw
tools, and an OpenClaw manifest cannot create a Nova stage.

**Reconsider when:** A future host defines a stable shared contract with the same
identity, authority, isolation, and recovery rules.

## Select The Correct Extension Path

| Need | Correct path | What it cannot do |
| --- | --- | --- |
| Observe OpenClaw hooks | OpenClaw service or hook extension | Change Nova lifecycle state |
| Add an OpenClaw tool | OpenClaw tool extension | Install a pipeline registration |
| Give Codex a guided workflow | Codex plugin and skill | Make the workflow run inside Nova |
| Execute one bounded specialist operation | Worker engine integration | Change the neutral Worker Core protocol privately |
| Deploy a new process identity | Runtime role | Let project input select arbitrary packages |
| Add ordered pipeline work | Pipeline stage | Register host tools or hooks |

## Build An OpenClaw Hook Extension

Use `kubeclaw-agent-observer` as the maintained hook reference. It converts OpenClaw
events to the agent-observability contract and writes bounded Redis records.

Its OpenClaw manifest owns startup activation and configuration. It does not use the
pipeline registration arrays. The configuration schema names Redis connection,
payload, queue, retry, retention, priority, and hook-timeout fields. It marks the
password as sensitive for the host UI.

> **Host manifest:** [The observer manifest declares startup activation, strict configuration, and the sensitive password field](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#L1-L35).

Follow this path:

1. Create one package with `openclaw.plugin.json` and `package.json`.
2. Define host activation and a strict configuration schema.
3. Normalize hook data before it enters a durable stream.
4. Bound depth, size, queue length, retry, timeout, and retention.
5. Remove or protect credentials before diagnostics and events leave the host.
6. Make duplicate detection depend on stable source identity.
7. Start no writer when configuration disables the extension.
8. Flush accepted work and stop subscriptions during shutdown.
9. Test disabled, healthy, invalid, degraded, duplicate, and shutdown behavior.
10. Add the extension to every intended runtime role and built image.

The observer starts its writer only after it resolves configuration. It drops invalid
events with one bounded warning. It records deduplication only after queue admission.

> **Runtime lifecycle:** [The observer resolves configuration, starts the writer, normalizes events, flushes, and stops subscriptions](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/src/index.ts#L41-L149).
>
> **Admission and deduplication:** [The observer records a dedupe key only after the writer accepts the event](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/src/index.ts#L176-L192).
>
> **Package exercise:** [The live-function test covers disabled, healthy, invalid, and degraded startup paths](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-observer/tests/live-function.test.ts#L9-L130).

The runtime-role builder packages this extension separately from pipeline plugins.
The role manifest must select it. Source presence alone is not activation.

> **Extension bundle path:** [The role builder synchronizes the observer contract and copies selected extension bytes](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/build-runtime-role-bundle.mjs#L190-L204).

## Build An OpenClaw Tool Extension

Use `kubeclaw-prism` when OpenClaw must expose a tool to the Prism control
service. The extension registers two tools. One commits a three-design set. The
other commits a complete revision.

The manifest declares tool names, coding profiles, startup activation, and the
control URL. OpenClaw validates tool parameters before the extension sends the HTTP
request. Prism control validates and persists the request after transport.

> **Tool manifest:** [The Prism manifest declares two tool contracts and one strict control URL field](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/openclaw.plugin.json#L1-L17).
>
> **Tool registration:** [The extension defines the complete design-set and revision parameter contracts and posts them to Prism control](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/index.mjs#L22-L80).

The current Prism tools bound the design count, but not every text or document
size. Their HTTP request has no explicit timeout or cancellation signal. The
registration test does not prove parameter validation by a real OpenClaw host.
The limits below are requirements for a new extension, not proof that Prism
already implements every limit.

Build a new tool extension as follows:

1. Give each tool one stable name and one clear responsibility.
2. Reject extra fields and require every identity or fence value.
3. Keep host configuration separate from tool arguments.
4. Bound collections and text at the tool schema.
5. Treat service errors as tool errors; do not return a false success.
6. Test registration names and the most important schema invariant.
7. Copy the extension into the intended image.
8. Add it to the OpenClaw allowlist and configured entries.
9. Inspect the effective host configuration after migration.
10. Invoke the real tool before live acceptance.

> **Registration test:** [The Prism test verifies both tool names and the exact three-design bound](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/openclaw-plugin/index.test.mjs#L1-L16).
>
> **Image inclusion:** [The Prism agent image copies the extension to the OpenClaw extension directory](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/docker/Dockerfile.prism-agent#L111-L119).
>
> **Role-specific host configuration:** [The chart allows and configures the Prism extension only for the Prism role](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/charts/kubeclaw/templates/configmap-gateway.yaml#L262-L320).

## Build A Codex Plugin Or Skill

The current `kubeclaw-ops` package is a Codex plugin. Its manifest points to a skill
directory and declares a read-only interface. The skill tells Codex how to combine
Argo CD, Kubernetes, logs, and Hubble observations.

The package contains no pipeline manifest and no OpenClaw manifest. It also contains
no MCP server declaration. The required read-only Ops tools must already be
available through the Codex environment. The skill cannot create that connection.

> **Codex manifest:** [The Ops manifest declares the skill directory, read capability, interface text, and example prompts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/plugins/kubeclaw-ops/.codex-plugin/plugin.json#L1-L26).

Use this authoring path:

1. Create `.codex-plugin/plugin.json` with stable package metadata.
2. Point `skills` to a package-owned skill directory.
3. Declare the smallest truthful interface capability.
4. Give the skill a narrow trigger and concrete evidence workflow.
5. Separate observation, inference, and recommended action.
6. State prohibited mutations and sensitive-data rules.
7. Explain pagination, retention, partial output, and missing coverage.
8. Test the skill with connected tools and with missing-tool conditions.
9. Install or update it through the Codex plugin lifecycle.
10. Remove the plugin without claiming that external tool data was removed.

The current package has no package-local automated test. Its catalogue record must
show that limit. Repository inspection proves only its manifest and skill content.

## Extend Worker Core With A Specialist Engine

Worker Core is not a generic plugin host. It executes one attempt envelope through a
source-integrated operation. The engine supplies domain meaning.

The attempt envelope binds pipeline, node, attempt, claim, profile, package,
capability, limit, input, operation, cancellation, and deadline identity. A worker
profile binds one worker type to one exact engine identity and digest.

> **Profile and envelope:** [The Worker contract binds engine identity, packages, capabilities, limits, inputs, operation, and cancellation](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/contracts/pipeline-worker-core/v1/src/types.ts#L28-L49).
>
> **Attempt data:** [The attempt envelope carries immutable identity, limits, inputs, and the specialist operation](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/contracts/pipeline-worker-core/v1/src/types.ts#L113-L154).

Worker Core calls a narrow operation lifecycle:

- `prepare` applies limits before specialist work starts;
- `execute` performs the specialist operation;
- `terminate` stops owned work;
- `measure` reports cumulative owned resources;
- optional cleanup and evidence hooks finish the attempt;
- optional finalization adds evidence-derived facts before durability.

> **Operation boundary:** [The shared executor defines prepare, execute, terminate, measurement, cleanup, evidence, and finalization hooks](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/worker/core/worker/attempt-executor.ts#L62-L93).

Use a new engine only when one stage or provider cannot express the specialist
operation. Then follow this path:

1. Define a versioned operation contract and input and result schema identities.
2. Define one immutable engine identity and Worker profile.
3. Implement a Worker operation without changing neutral Core semantics.
4. Apply resource limits synchronously before specialist execution.
5. Pass cancellation to every child process and external call.
6. Bound logs, results, evidence files, evidence bytes, and resource observations.
7. Make cleanup safe after success, failure, timeout, cancellation, and interruption.
8. Bind the engine into its runtime service and role packages.
9. Test trust, duplicate claim, recovery, cleanup, and resource accounting.
10. Build and inspect the role image before live execution.

Prism shows the contract binding. It accepts only the Prism engine contract and five
known operations. It verifies request and result schema identities around execution.

> **Prism binding:** [The Prism binding checks contract, operation, schema identity, input, execution, and result before it returns Worker data](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/engine/worker-binding.ts#L8-L49).

Buster also uses Worker Core, but Buster owns test-plan meaning. Its runtime exports
the neutral Core and Buster's provider, report, evidence, and remote-plan services.

> **Buster boundary:** [The Buster runtime exports its engine while the engine exports Worker Core and Buster-owned test services](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/src/index.ts#L1-L13).

There is no installable Worker-engine manifest or generic engine loader at this
revision. A new engine is a product integration and packaging change. Do not present
it as a drop-in plugin.

## Follow One Real Prism Worker Attempt

Prism provides the maintained end-to-end Worker example. This path connects control,
transport, Worker Core, the Prism engine, evidence, and durable completion.

The path starts in Prism control. Control stores the operation input as an artifact.
It creates a version-three attempt envelope with that artifact reference. It then
reserves the idempotency key and complete envelope in PostgreSQL before dispatch.

> **Submission and completion:** [Prism stores input, reserves the attempt, dispatches it, records the result, hydrates evidence, and marks completion](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/control/native-operation.ts#L12-L29).
>
> **Durable identity:** [The operation store rejects conflicting reuse and preserves the original envelope and terminal result](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/control/native-operation-store.ts#L25-L67).

Control sends the exact envelope to `POST /v1/attempts`. It uses SPIFFE transport
identity when enabled. Otherwise, it signs the body with a timestamp and nonce. The
transport limits dispatch time and response bytes.

> **Worker transport:** [The client submits one signed or SPIFFE-authenticated envelope and rejects oversized or unsuccessful responses](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/control/worker-operation-transport.ts#L8-L35).

The worker accepts only JSON at the attempt route. It bounds request bytes, verifies
the caller, validates the envelope, and checks native readiness. A busy or unavailable
worker returns `503`. Invalid input or execution returns `422`.

> **Worker ingress:** [The Prism worker authenticates, validates, dispatches, and returns one bounded attempt result](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/server/worker-service.ts#L28-L69).
>
> **Readiness and contract check:** [Dispatch rejects an invalid envelope or a native runtime that needs reconciliation](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/server/worker-service.ts#L89-L106).

The Prism operation implements the neutral Worker hooks. Preparation is synchronous.
Execution reads the declared input artifact and calls only a supported Prism operation.
Termination aborts owned work and waits for settlement. Evidence uploads remove large
binary values from the specialist result.

> **Specialist operation:** [The Prism operation implements prepare, execute, terminate, measurement, artifact input, and bounded evidence output](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/server/worker-operation.ts#L9-L98).

Worker Core emits ordered progress for acceptance, start, operation completion, and
cleanup. Progress delivery is best effort. The signed terminal result remains the
authority when a progress consumer is unavailable.

Cancellation aborts the operation signal. Core calls `terminate`, bounds settlement,
measures resources, and runs cleanup. It reports unresolved execution or failed
cleanup instead of detaching owned work.

> **Execution and cancellation:** [Worker Core applies deadlines, races cancellation, terminates work, measures resources, and runs cleanup](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/worker/core/worker/attempt-executor.ts#L360-L465).
>
> **Progress and terminal result:** [Worker Core emits best-effort progress and creates a digest-bound authoritative result](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/worker/core/worker/attempt-executor.ts#L590-L689).

Control validates the result against the original attempt before it reads evidence.
It checks attempt identity, claim generation, result digest, state, and specialist
schema. It stores the bound terminal result before evidence hydration. A hydration
failure therefore cannot cause an automatic second execution.

> **Result import:** [Prism binds the result to the attempt and validates the specialist schema before acceptance](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/control/worker-results.ts#L19-L57).
>
> **Evidence import:** [Prism enforces evidence count, byte, type, media, location, and full-log requirements before hydration](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/prism/control/worker-evidence.ts#L5-L37).

This example has one deliberate limitation. The HTTP response carries the terminal
result. Progress events do not replace it and do not provide a separate completion
channel. A new engine must not infer successful completion from progress alone.

Use this implementation sequence for a new specialist engine:

1. Define the versioned operation and result schemas.
2. Create the immutable profile and attempt envelope.
3. Persist the idempotency key and envelope before dispatch.
4. Authenticate and bound the transport request and response.
5. Validate the envelope before specialist work starts.
6. Bind a narrow operation to Worker Core hooks.
7. Propagate cancellation to all owned work.
8. Emit progress without making it the result authority.
9. Produce a digest-bound result and bounded evidence.
10. Store the result before evidence hydration or later projection.
11. Validate the result against the original attempt.
12. Retain the old engine bytes while recovery can request them.

## Create Or Change A Runtime Role

A runtime role defines one deployable identity. It selects an entrypoint, packages,
pipeline plugins, host extensions, and external capability sources.

Use an existing role when it already owns the required behavior. Create a role only
when process identity, package set, or external authority must remain separate.

**Benefit:** A deployed process receives only its intended code and authority.

**Cost:** Every new role needs build, image, deployment, upgrade, operations, and
acceptance work.

**Rejected alternative:** Project input cannot add a role or package because the
project does not own installation authority.

**Reconsider when:** Two roles have the same entrypoint, package set, authority,
scaling, and operational lifecycle over several releases.

Follow this path:

The current builder accepts only `nova`, `buster`, and `prism`. A fourth role
requires changes to the builder, checker, images, and deployment templates.
Adding a role manifest alone is not supported. The extension catalogue in the
role checker also lists only `kubeclaw-agent-observer`; a new host extension
requires an explicit packaging integration.

> **Fixed role and extension sets:** [The checker lists supported identities](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/check-runtime-role-manifests.mjs#L6-L85), and [the builder rejects other roles](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/build-runtime-role-bundle.mjs#L7-L14).

For an existing role:

1. Add package ownership before the role selects a package.
2. Define the entrypoint package, source path, output, and import.
3. List every required package, plugin, and host extension once.
4. Declare external capability sources with a concrete reason.
5. Run role closure and correct every missing dependency or provider.
6. Build the role bundle from a clean source tree.
7. Inspect its bundle manifest and source digests.
8. Build the image and run its role-specific image check.
9. Render deployment configuration and verify the selected role.
10. Perform startup, readiness, one real task, shutdown, and recovery acceptance.

> **Three role shapes:** [The ownership map assigns shared, Nova, Worker, Buster, and Prism packages to allowed roles](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/packaging/runtime/package-ownership.json#L8-L26).
>
The role checker collects required capabilities from stages, observers, and
adapters. It does not prove Buster test-provider capability closure; run the
provider registry, plan resolver, and provider execution checks separately.

> **Role closure:** [The role checker validates ownership, dependency closure, capability providers, and complete owned-plugin selection](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/check-runtime-role-manifests.mjs#L77-L145).
>
> **Bundle selection:** [The builder copies only role-selected plugin packages and preserves their source digests](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/build-runtime-role-bundle.mjs#L169-L187).

## Compatibility And Replacement

OpenClaw and Codex host contracts have their own versions. A pipeline API version
does not establish host compatibility. Test each host with the exact packaged bytes.

Worker profiles bind engine version and digest. Do not replace engine bytes under a
recoverable attempt. Direct new attempts to the new profile, drain old work, and
retain old bytes while recovery can still request them.

Role changes create a new bundle identity. Roll back with the prior complete bundle
and configuration. Do not copy selected files between role versions.

Removing a host extension stops later hook or tool activation. It does not remove
Redis records, Prism data, Codex conversation data, Worker evidence, or old bundles.
Apply the data owner's retention procedure separately.

## Common Failures

| Symptom | Meaning | Correction |
| --- | --- | --- |
| Host manifest exists but no hook or tool appears | Host did not install, allow, or activate the extension | Inspect image bytes, allowlist, entry configuration, and host status |
| OpenClaw extension works from source only | Built image does not contain the packaged extension | Correct image inclusion and run the role-image check |
| Codex skill mentions unavailable tools | Plugin supplies guidance but no connected tool provider | Connect the approved tool provider or report the missing dependency |
| Worker rejects contract or schema | Engine and attempt profile do not agree | Restore exact contract bytes or issue a new profile and attempt |
| Attempt stops during cleanup | Specialist operation did not finish owned cleanup within limits | Preserve evidence, repair cleanup, and use recovery policy |
| Role checker reports an omitted plugin | Owned source package is absent from its role | Add the exact package or remove the unsupported source package |
| Role lacks a capability provider | Selected code requests authority absent from the role | Select a provider or approved external source |

## Verification

Run the checks that match the changed boundary:

```bash
npm test --prefix skills/common/plugins/openclaw-agent-observer
node --test skills/prism/openclaw-plugin/index.test.mjs
npm run verify:runtime-packaging:roles
npm run verify:runtime-packaging:builder
npm run verify:runtime-packaging:isolation
npm run verify:prism:images
```

The observer package and Prism tool registration tests can run without a live host.
They do not prove OpenClaw installation or Redis and Prism service reachability.

The role check passed locally for three roles and 48 pipeline packages. Bundle and
image checks require a C compiler, built images, or container tooling that this host
does not provide. Record them as unavailable until a suitable build host runs them.

The Codex plugin has no package-local automated test. Perform its connected-tool and
missing-tool reader exercises before acceptance.

## Author Review

Before you accept a host, engine, or role extension, answer these questions:

- Which process discovers and activates the code?
- Which manifest and version define compatibility?
- Who owns canonical state and durable evidence?
- Which authority crosses the boundary?
- How does duplicate work keep stable identity?
- What does cancellation stop, and what can remain external?
- Which cleanup runs after every terminal path?
- Which bytes must remain for recovery?
- How does the operator observe activation and one failure?
- Which data remains after disablement or removal?

If one answer depends on hidden setup, the extension is not ready for acceptance.
