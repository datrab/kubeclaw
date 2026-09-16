# Understand The Five Pipeline Extension Contracts

Status: AP08.3 contract guide implemented with local verification limits
Audience: plugin author, runtime maintainer, reviewer
Owner: plugin-foundation
Evidence: skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; skills/common/plugin-runtime/foundation/registry/build.ts; skills/nova/core/execution/stage-executor.ts; skills/nova/core/telemetry/observers.ts; skills/buster/engine/test-gates/provider-loader.ts; skills/buster/engine/test-gates/report-adapter-runtime.ts
Evidence revision: `bcf032f241b432bf920baa9ee5f727947921447d`
Applies to: `pipeline-plugin-v2`
Last verified: source and contract checks on 2026-09-16

## Objective

Select and implement the correct registration inside a pipeline plugin package.
KubeClaw supports five registration contracts:

1. stage;
2. observer;
3. capability adapter;
4. test provider;
5. report adapter.

They share package discovery and immutable package identity. They do not share the
same caller, data, authority, retry rules, or failure meaning. A package can contain
more than one registration and more than one registration type.

This page explains contracts. It does not explain `.swarm/pipeline.json`, pipeline
submission, or an end-to-end pipeline run.

## Terms Used In This Guide

| Term | Meaning here |
| --- | --- |
| Registration | One manifest entry that connects an identity to a schema and executable export |
| Canonical state | The authoritative run and stage state that Core records |
| Capability | One named type of bounded external authority |
| Grant | An operator rule that permits one registration to use one capability within constraints |
| Receipt | A durable record of an adapter result for one effect identity |
| Checkpoint | The last observer delivery state that Nova can resume |
| Port | A typed value or artifact connection between Buster nodes |
| Immutable identity | Package or plan identity that changes when its bound content changes |

## Why KubeClaw Uses Five Contracts

One generic plugin hook would make the package format smaller. It would also hide
who can change state, who can use external authority, and who owns retry behavior.

KubeClaw therefore selects five narrow contracts. Each contract gives one host a
clear responsibility. Core can then validate data and authority before code runs.

**Benefit:** A reviewer can identify the caller, allowed effects, result owner, and
recovery rule from the registration type.

**Cost:** Authors must learn several contracts. A package that has two
responsibilities can need two registrations.

**Rejected alternative:** One callback with optional fields would permit invalid
combinations. For example, an observer could appear to return a stage result.

**Reconsider when:** A repeated responsibility cannot fit one existing contract and
has a stable authority model of its own.

## Start With The Owner Of The Decision

| Registration | Use it when | Caller | Can return a result that Core maps to stage state? |
| --- | --- | --- | --- |
| Stage | Ordered project work must return a typed result | Nova stage executor | Yes, through `stage-result.v2`; Core still owns the transition |
| Observer | Committed events need a side effect or projection | Nova observer runtime | No |
| Capability adapter | A stage or observer needs controlled external authority | Nova adapter runtime | No |
| Test provider | Buster must execute one test or fixture contract | Buster test-plan runner | No; Buster imports its result |
| Report adapter | Buster must normalize an existing report artifact | Buster report runtime | No |

Choose the contract from the owner of the result, not from the programming language
or process that performs the work. A command can belong behind an adapter, a test
provider, or a stage. The deciding question is which host owns its meaning.

## Shared Package Envelope

Every package has one inert `plugin.json`. Discovery reads this file before it
imports executable code. The manifest supplies a package ID, API version, semantic
package version, and registration arrays. At least one registration array must be
non-empty.

Foundation calculates a content digest over the selected package files. Registry
identity therefore contains four different values:

- package ID identifies the product-owned package name;
- package version communicates author compatibility intent;
- content digest identifies the exact bytes;
- registration ID identifies one contract inside the package.

The runtime does not treat a matching version string as proof of matching bytes.
This decision makes recovery and audit records precise. Its cost is that every byte
change creates a new immutable package identity.

Registration modules and schemas use package-relative paths. They cannot use an
absolute path or escape through `..`. Registry construction checks referenced files,
schema validity, registration conflicts, and global ownership before activation.

> **Manifest shape:** [The schema defines all five registrations and requires at least one non-empty registration array](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L410-L455).
>
> **Discovery:** [Foundation reads manifests, establishes trust, and calculates package provenance](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/discovery.ts#L105-L137).
>
> **Registry:** [Registry construction assigns stages, observers, adapters, test providers, and report adapters to immutable maps](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/build.ts#L265-L317).

## Stage Contract

A stage is an ordered unit in a Nova execution graph. Its manifest names a stage
type, executable export, required capabilities, and three schemas:

- configuration describes operator- or graph-selected behavior;
- input describes data supplied to this stage instance;
- result constrains the returned `stage-result.v2` value.

Nova validates configuration and input before it invokes the export. The stage
receives the validated input, a bounded invocation context, and an abort signal.
The context contains immutable attempt identity, configuration, prior artifacts,
grants, and lifecycle budgets. The stage can request only declared and granted
capabilities.

The result does not mutate Core state directly. Core validates it and maps its
outcome to lifecycle state. `passed`, `retry`, `request_fix`, `wait`, `blocked`,
`failed`, `timed_out`, `rate_limited`, `cancelled`, and
`orchestrator_required` have different stop and recovery meanings. A plugin must not
invent a new outcome or a private lifecycle transition.

Use a stage when graph order and canonical state are part of the feature. Do not use
a stage only to mirror events or to gain direct network, filesystem, Git, secret, or
process access.

> **Stage registration:** [The manifest requires type, module, export, capabilities, and three schemas](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L221-L248).
>
> **Pre-invocation validation:** [Nova resolves ownership and validates stage configuration and input](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/runner.ts#L39-L53).
>
> **Invocation boundary:** [The executor creates a lease, invokes the activated export, validates the result, and records it](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/stage-executor.ts#L33-L74).

### Stage failure and recovery

Schema rejection means the call did not start or its returned value was not accepted.
A thrown exception becomes a runtime-controlled result. Timeout and cancellation
revoke the lease and abort the signal. The plugin must stop its own asynchronous work
and must not retain the invocation context after completion.

`retry` requests another attempt within the declared attempt budget.
`request_fix` uses a remediation edge and its separate budget. A retry does not prove
that an earlier external effect did not occur. An effectful stage must reconcile that
uncertainty before it repeats the mutation.

## Observer Contract

An observer consumes committed lifecycle or plugin-domain events after their source
operation. Its manifest declares subscriptions, configuration, checkpoint schema,
capabilities, delivery mode, ordering, and failure policy.

Current contracts fix delivery to `at_least_once` and ordering to `per_run`.
Therefore, an observer handler must accept duplicate delivery. It must use the
delivery identity or an idempotent target operation. It cannot assume global ordering
between different runs.

The observer runtime records every started, completed, or failed delivery. It commits
a checkpoint only after successful handling. On restart, recovery reconstructs prior
attempts and completed deliveries. A `required` observer stops draining on exhausted
delivery. A `best_effort` observer records the failure and blocks later events for
that run during the current drain, but it does not change the pipeline result.

Observers cannot edit canonical lifecycle state. Use them for telemetry, notification,
evidence projection, and other reactions to committed facts.

> **Observer registration:** [The contract fixes at-least-once delivery, per-run ordering, retry fields, and checkpoint schema](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L249-L294).
>
> **Drain behavior:** [The runtime filters subscriptions, resumes checkpoints, retries delivery, and applies required or best-effort policy](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/telemetry/observers.ts#L48-L104).

## Capability Adapter Contract

An adapter owns external authority. Its manifest lists capabilities that it provides,
capabilities that it needs from other adapters, a configuration schema, and an
activation factory.

Operator configuration selects one provider for each requested capability and gives
each caller a bounded grant. Declaration, provider selection, and caller grant are
three separate controls. A package cannot grant itself authority by adding a string
to `requiredCapabilities`.

Activation creates a long-lived instance with `ready`, `invoke`, and `shutdown`
operations. Ordinary effect calls carry a resource lock and fence. The adapter must
check the fence before a mutation and again where a long operation can outlive its
authority. Confidential operations omit the durable payload and resource identity;
only capabilities explicitly classified as confidential can use that path.

The effect coordinator records request, acceptance, and receipt around ordinary
mutations. A durable receipt prevents the same effect key from invoking the adapter
again. An accepted request without a receipt has an uncertain outcome. Core must not
guess whether the external system changed.

> **Adapter registration:** [The manifest distinguishes provided capabilities from adapter dependencies](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L295-L320).
>
> **Grant resolution:** [Foundation verifies enabled registrations, provider choice, constraints, and exact grants](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L176-L212).
>
> **Runtime invocation:** [Nova selects the configured adapter, requires readiness, and sends ordinary calls through the effect coordinator](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/adapters.ts#L53-L68).

### Adapter failure and recovery

Startup is all-or-nothing. If one selected adapter cannot activate or become ready,
the runtime tears down started and pending instances. Shutdown has a bounded timeout
and aborts active work.

The adapter can implement `receipt()` when the external system can answer whether a
previous operation completed. Reconciliation must compare stable external identity,
not only a transient process result. Cleanup authority is bounded and does not add
new capabilities.

## Test Provider Contract

A test provider implements one stable Buster contract such as a command test, HTTP
test, browser test, build fixture, or deployment fixture. Buster, not Nova's stage
executor, loads and calls it.

Its registration declares:

- a versioned `contractId` used by suites and direct test declarations;
- `test` or `fixture` meaning;
- configuration schema;
- typed value and artifact input/output ports;
- required capabilities;
- whether a retry is safe;
- allowed matrix fields and report formats;
- evidence types and default evidence policy.

The resolver binds the exact package version and digest into an immutable test plan.
It validates configuration, connects compatible ports, expands bounded matrices,
applies conditions, and gives retries only to providers that declare `retrySafe`.
The declaration is not a promise that arbitrary retry is safe. The provider author
must make that statement true for the provider's external effects.

Buster snapshots the package before execution and loads it in the plugin sandbox.
The provider receives a bounded workspace, abort signal, log sink, and only its
allowed capability invoker. It does not receive Nova's `PluginInvocationContext`.
Cleanup is optional in the SDK, but a fixture or provider that creates temporary
state must implement and test it.

> **Provider registration:** [The contract defines ports, retry safety, matrices, reports, and evidence policy](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L338-L390).
>
> **Provider isolation:** [Buster verifies the package digest, creates an immutable snapshot, and starts the sandboxed provider session](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/test-gates/provider-loader.ts#L37-L86).
>
> **Plan resolution:** [Nova resolves suites and direct declarations into a deterministic immutable plan](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/test-gates/resolver.ts#L720-L754).

## Report Adapter Contract

A report adapter parses an artifact that a provider already produced. It does not run
the test and does not decide whether the provider process succeeded. Its registration
declares a format, contract version, supported media types, module, and export.

Buster selects an adapter during plan and report resolution. More than one installed
adapter can support the same format, so configuration must resolve ambiguity. The
runtime accepts only `test-report` artifacts with a declared media type. It bounds
source bytes, execution time, cases, findings, and findings per case.

The adapter returns normalized counts, cases, findings, duration, and explicit
truncation facts. It cannot hide omitted data. Finalization combines provider outcome
and normalized report outcome. A command failure remains a failure even when its
report contains no failed case. A required-execution policy rejects an all-skipped
report without inventing a fake test case.

> **Report registration:** [The manifest binds format, contract version, export, and accepted media types](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L391-L409).
>
> **Runtime limits:** [Buster validates the artifact type and media type before it reads and isolates the adapter](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/test-gates/report-adapter-runtime.ts#L118-L153).
>
> **Final decision:** [Report finalization preserves command failure and rejects a required all-skipped result](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/test-gates/report-finalizer.ts#L3-L39).

## Data And Authority Comparison

| Contract | Input | Output | Persistent evidence | Authority source |
| --- | --- | --- | --- | --- |
| Stage | Validated graph input and invocation context | `stage-result.v2` | Lifecycle events, artifacts, facts | Operator grants selected for registration |
| Observer | One committed event delivery | No canonical stage result | Delivery journal and checkpoint | Observer grant set |
| Adapter | Effect request and bounded activation config | Result or durable receipt | Effect journal and external receipt | Provider selection, caller grant, lock fence |
| Test provider | Resolved provider invocation and workspace | `provider-result.v1` | Attempt records, logs, artifacts, reports | Buster policy and allowed capability invoker |
| Report adapter | Bounded report bytes and limits | Normalized report result | Imported report evidence | Selected format adapter; no external capability context |

## Move From A Need To An Implemented Registration

Use this sequence before you write the executable module:

1. State the result that the new code must own.
2. Select the caller from the comparison table.
3. List every input, output, durable record, and external mutation.
4. Select one registration type. Split unrelated responsibilities.
5. Define strict schemas before implementation code.
6. Declare each required capability and its resource type.
7. Define duplicate, retry, cancellation, recovery, and cleanup behavior.
8. Add the package manifest and test inert discovery first.
9. Test activation or Buster binding through the real registry path.
10. Test one success, one validation rejection, and each recovery class.
11. Add explicit role ownership and inspect the built bundle.

Do not start implementation if step 4 or step 6 has no supported answer. That gap
means the work needs a different contract, an engine change, or a Core review.

The [minimal stage journey](first-plugin.md) supplies the package and activation
procedure. The effect, Buster, and Nova guides apply the remaining steps to their
specific contracts.

## Compatibility Rules

`apiVersion` selects the package contract and currently equals
`pipeline-plugin-v2`. Package semantic version and content digest describe the
implementation. A stage type, provider contract ID, and report format are consumer
selection keys; changing them can break existing definitions or suites.

Adding an optional registration can remain compatible for existing consumers, but
it changes the package digest. Removing or renaming a selected registration is
breaking. Tightening a schema can reject stored configuration. Changing artifact
media type, value schema ID, evidence name, capability, retry safety, or result
meaning also requires consumer review.

Active runs retain exact package provenance in their snapshots and events. Do not
replace package bytes underneath a recoverable run. Install a new version, direct new
work to it, drain old work, and remove old bytes only after recovery no longer needs
them.

## Unsupported Shortcuts

- A stage cannot call the network or process API merely because Node exposes it.
- An observer cannot change a failed stage to passed.
- An adapter cannot create a capability outside the closed vocabulary without Core
  and policy work.
- A test provider cannot bypass Buster evidence normalization.
- A report adapter cannot execute a test or manufacture missing execution evidence.
- A manifest does not load a Worker Core engine.
- Project input cannot install package code or create a runtime role.

## Verification

Run the focused checks that match the contract you changed:

```bash
node tests/verification/contracts/check-plugin-system-v2-contracts.mjs
node tests/verification/contracts/check-plugin-system-v2-registry.mjs
node tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs
node scripts/check-ap08-observers.mjs
node tests/verification/contracts/check-pipeline-test-provider-registry.mts
node tests/verification/contracts/check-pipeline-report-adapter-registry.mts
```

These are local contract checks. They do not deploy a role or perform an end-to-end
pipeline run. Package-specific behavior needs its own test and boundary check.

The original observer command only loaded assertion definitions. It did not execute them.
The corrected observer command checks registry identities, role inclusion, and activation.
Run observer recovery separately to test delivery behavior.
The other recorded checks cover contract and registry behavior.
They do not prove package-specific effects, persistent recovery, or deployment.

## Continue

- [Build an effectful plugin](effectful-plugin.md)
- [Extend Buster](buster.md)
- [Extend Nova](nova.md)
- [Test a plugin](testing.md)
