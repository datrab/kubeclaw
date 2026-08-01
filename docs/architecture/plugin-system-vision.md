# Plugin System Vision

Status: planned direction
Audience: maintainers, pipeline developers, plugin authors

## Purpose

Define the target boundary between the pipeline core and self-contained plugins. This page records agreed design decisions and provides a stable map for planning the migration. It does not describe current runtime behavior.

## Design Rules

1. Core owns how work is executed safely; plugins own what the work does.
2. Every behavior has one canonical implementation and one canonical contract shape.
3. Migrations replace old contracts atomically. Do not add aliases, compatibility adapters, fallback readers, or parallel code paths.
4. Concrete workers, gates, validators, generators, transports, and integrations are never hardcoded in core.
5. Plugins propose typed effects and results. Core validates them and commits lifecycle transitions.
6. Removing every plugin must not break core imports. Core must still load, validate configuration, maintain state, and report missing stage owners.
7. A plugin must be understandable, testable, packageable, and removable from its own directory plus the stable plugin SDK.
8. Package trust and versioning never imply package-wide runtime authority. Schemas, configuration, executors, and required capabilities belong to individual stage registrations.
9. The initial core exposes no speculative policy hooks. New lifecycle-affecting extension points require a demonstrated use case that cannot be represented by an existing core policy, stage, capability adapter, schema, or observer.
10. Discovery parses inert package metadata before any plugin code is imported. Loading a manifest must not execute package code.
11. Every registration surface has explicit ordering, error, timeout, replay, and shutdown semantics. There is no generic event bus with implicit composition rules.

## Non-Negotiable Migration Rule

There is exactly one way each behavior and contract works at any point in the target architecture. A migration replaces the previous implementation, name, field, state, reader, producer, and consumer; it does not preserve them behind compatibility code.

Specifically:

- `needs_nova` is replaced by `orchestrator_required`; it is not accepted as an alias.
- `action_required` is not a parallel synonym for `orchestrator_required` in the plugin control contract.
- `orchestrator_required` means an orchestrating agent must intervene and evaluate the situation. It does not mean that a human decision is necessarily required.
- A rejected approval resolves to `blocked`, because progression must stop for further evaluation and discussion before an explicit resume decision.
- Unknown legacy result names and fields fail validation rather than being normalized.
- The migration that introduces a replacement must update every producer, consumer, schema, test, fixture, configuration example, and document, then delete the superseded path in the same change.

Do not accumulate compatibility adapters, fallback readers, legacy aliases, dual writes, or dormant old implementations. Migration means replacement.

Deletion is an acceptance criterion of every individual cutover. A replacement is not considered migrated while the superseded source, parser, schema, state reader/writer, configuration field, import/export, fixture, test, example, generated artifact, or active documentation remains. The implementation plan maintains a machine-readable deletion ledger and negative architecture checks for each cutover. The final release gate proves repository-wide absence; it is not a deferred cleanup phase.

## Core Ownership

Core is a generic execution engine, not only a registry and telemetry bus. It owns:

- plugin discovery, manifest validation, registration, ownership resolution, and startup freeze
- the public plugin SDK and versioned invocation/result contracts
- capability enforcement and construction of bounded plugin contexts
- execution graph validation, scheduling, concurrency, and stage-attempt identity
- generic run, stage, and attempt lifecycle authority
- canonical event persistence, replay, projections, locking, cancellation, and recovery
- validation and interpretation of typed plugin control results
- generic timeout, retry, wait, resume, and terminal handling
- namespaced state and artifact APIs
- the canonical lifecycle/telemetry event spine
- configuration assembly and schema validation

Core must not own:

- Forge, Buster, review, approval, or other concrete stage behavior
- concrete stage type IDs such as `worker:module_forge` or `gate:approval`
- plugin prompts, models, tools, transports, fix cycles, or evidence interpretation
- plugin-specific lifecycle phases such as `forge`, `buster`, or `READY_FOR_TESTING`
- plugin configuration schemas, artifacts, documentation, or tests
- imports from any concrete plugin implementation

## Generic Stage Abstraction

A stage is one configured node in the execution graph. Core needs to know its identity, dependencies, selected type, input, and execution policy. It does not need to know what that type means.

Example project configuration:

```json
{
  "stages": [
    {
      "id": "implement-api",
      "type": "agent.implementation",
      "dependsOn": [],
      "with": {
        "spec": "modules/api.md"
      }
    },
    {
      "id": "test-api",
      "type": "test.buster",
      "dependsOn": ["implement-api"],
      "with": {
        "suites": ["unit", "api"]
      }
    },
    {
      "id": "production-approval",
      "type": "decision.human-approval",
      "dependsOn": ["test-api"],
      "with": {
        "timeoutMinutes": 60
      }
    }
  ]
}
```

The strings `agent.implementation`, `test.buster`, and `decision.human-approval` are declared by installed plugins. Core does not enumerate them.

A plugin manifest contains inert registration metadata. The same registration shape is used for single-stage and multi-stage packages:

```json
{
  "id": "acme.human-approval",
  "apiVersion": "pipeline-plugin-v2",
  "packageVersion": "1.0.0",
  "stages": [{
    "type": "decision.human-approval",
    "module": "./src/stages/human-approval.ts",
    "export": "execute",
    "requiredCapabilities": [
      "state.read",
      "artifacts.write",
      "operator.request",
      "signal.wait"
    ],
    "configSchema": "./schemas/human-approval-config.json",
    "inputSchema": "./schemas/human-approval-input.json",
    "resultSchema": "./schemas/human-approval-result.json"
  }]
}
```

The canonical manifest is data, not an imported TypeScript module. Core can therefore establish package identity, canonical paths, trust, integrity, contract compatibility, ownership, schema validity, and requested authority before loading executable code. Executor modules are imported only during the activation phase after those checks pass.

At startup, core validates that exactly one enabled plugin owns each configured stage type. During execution, core:

1. Selects a ready graph node.
2. Creates an immutable stage-attempt identity.
3. Resolves the registered owner of the node's `type`.
4. Builds a capability-limited plugin context.
5. Invokes the plugin with validated configuration and a read-only state snapshot.
6. Validates the returned control result.
7. Commits the corresponding lifecycle event and projection.
8. Schedules the next legal work.

The plugin never writes scheduler status directly.

## Capabilities, Not Profiles

The foundational contract does not classify stages as workers, gates, validators, generators, or other fixed profiles. Concrete stage types remain unbounded.

Capabilities are the security and effect authority. Input and result schemas define the data contract. Plugins may provide descriptive metadata such as category, icon, and display name for documentation and UI presentation, but descriptive metadata must never control scheduler behavior.

The capability vocabulary is intentionally core-owned and security-sensitive. Stage registrations declare the complete set of capabilities they require and may not invent permission-bearing names that core does not understand. Platform policy must authorize every requirement with the applicable resource constraints before the stage can be enabled.

## Capability Decisions

### Authority

- Core and the plugin SDK define the canonical capability vocabulary, request/response schemas, semantics, audit requirements, and denial behavior.
- Each stage registration declares `requiredCapabilities`. Declaration is not authorization, and package membership does not grant a stage requirements declared by sibling registrations.
- Platform/operator policy must authorize every declared requirement with any required resource constraints.
- Every required capability must also have exactly one available configured adapter in the invocation's runtime scope.
- Core computes `required intersect granted intersect available`. The stage is enabled only when the result covers the complete required set; otherwise startup fails before execution.
- Version 2 has no optional capability declarations and no silently degraded plugin context.
- Unknown capabilities fail registry validation. Plugins cannot create permission-bearing capability names dynamically.

Concrete stage types remain open and plugin-defined; privileged capabilities remain closed and core-defined. Adding a new kind of stage requires no core change. Adding a new privileged operation requires an intentional core/SDK security-contract change.

### Resource Scoping

Sensitive grants carry constraints rather than acting as unrestricted booleans. Examples include:

```text
git.repository.read     -> allowed repositories and paths
git.workspace.create    -> repository and branch namespace
runtime.dispatch        -> allowed runtimes, agents, and models
artifacts.write         -> plugin-owned artifact namespace
network.http            -> allowed hosts and methods
secrets.read            -> explicit secret names
operator.request        -> allowed interaction mechanism and destination
command.execute         -> executable and argument policy
```

The plugin context and the underlying runtime isolation must enforce the same resolved grant constraints.

### Capabilities And Adapters

A capability defines what operation is permitted. An adapter defines how that operation is implemented. For example, `git.workspace.create` may be implemented by a local Git worktree adapter, a remote workspace service, a Kubernetes workspace, or an ephemeral checkout. Plugins depend on the capability contract and never import the selected adapter directly.

### Core-Only Authority

The following authority is never grantable to plugins:

```text
lifecycle.write
scheduler.advance
canonical_events.modify
registry.mutate
```

Plugins return typed results and effect requests. Core alone validates and commits scheduler transitions and canonical lifecycle events. Any plugin state write is restricted to the plugin's namespace and cannot replace core lifecycle authority.

### Isolation

Capability-limited context objects are not a sufficient security boundary for unrestricted in-process code. Trusted first-party plugins may run in-process with dependency-boundary verification. Restricted or external plugins require an isolated execution boundary that enforces filesystem, environment, network, subprocess, and resource constraints. Manifest trust labels alone do not provide isolation.

Initial extractions may run in-process only as explicitly trusted first-party packages. Restricted and external packages remain rejected until the isolated invocation runner and package-integrity verification are implemented.

## Canonical Lifecycle

Core lifecycle uses only generic states.

```text
Run:     created -> running -> waiting/paused -> succeeded/failed/blocked/cancelled
Stage:   pending -> skipped/scheduled -> running -> waiting/retrying -> succeeded/failed/blocked/cancelled
Attempt: created -> dispatched -> completed/timed_out/cancelled
```

Plugin-local phases may be recorded in the plugin's namespaced state and events, but they are not core scheduler states.

A passed stage may publish immutable, scalar, namespaced decision facts. A
downstream stage may declare an activation comparison against a fact produced
by an ordinary ancestor. Core evaluates the comparison only after dependencies
are complete. A false comparison commits `stage.skipped` without creating an
attempt or granting an invocation context; skipped conditional stages satisfy
ordinary downstream dependencies. The fact, activation declaration, and skip
event are pinned in the graph and lifecycle journals, so replay makes the same
decision without rerunning the producer.

The canonical control outcomes are:

- `passed`: the stage completed and dependants may progress
- `retry`: execute another attempt of the same stage after an execution failure such as an aborted or failed agent
- `wait`: persist a resumable wait for a declared signal or condition
- `request_fix`: the produced work was inadequate and a declared remediation stage or subflow must correct it before reevaluation
- `orchestrator_required`: pause normal execution so an orchestrating agent can evaluate the situation and resume with additional guidance
- `blocked`: stop the pipeline because automatic progression is no longer legal, for example after retry-budget exhaustion or an unresolved external/infrastructure blocker
- `failed`: execution failed terminally
- `timed_out`: the attempt or wait exceeded its deadline
- `rate_limited`: execution stopped under rate-limit policy
- `cancelled`: execution was explicitly cancelled

`needs_nova` is removed rather than aliased. `orchestrator_required` is the only canonical plugin-control name and specifically signals intervention by an orchestrating agent.

An approval plugin maps its domain decisions into the generic contract:

```text
approved -> passed
pending -> wait
rejected -> blocked; evaluation and discussion are required before explicit resume
invalid/corrupt state requiring agent evaluation -> orchestrator_required
timeout -> timed_out or blocked, according to the plugin's declared policy
```

### Result And Resume Semantics

`retry` and `request_fix` are separate core results. A retry repeats the same stage because its execution failed. A fix request traverses a predeclared remediation edge because the completed work or code did not satisfy the evaluating stage.

`orchestrator_required` is a normal resumable lifecycle option, not a terminal blocker. For example, policy may allow three attempts but request orchestrator intervention after the second failure. Core pauses the run, sends the intervention event to the configured orchestrator, and resumes with a new attempt plus the orchestrator's helper prompt while preserving the remaining retry budget.

`blocked` stops the pipeline execution. It is used when retry budget is exhausted, an unresolved external or infrastructure condition prevents legal progress, an approval is rejected, or another blocking policy applies. Further evaluation may eventually lead to an explicit operator/orchestrator resume or a new run, but core does not automatically continue from `blocked`.

## Core Execution Decisions

### Frozen Graph And Declared Remediation

The complete execution graph is validated and frozen at run start. Plugins cannot insert arbitrary stages while a run is active. A `request_fix` result follows a remediation stage or subflow declared in the graph, then returns to the evaluating path. Missing or ambiguous remediation targets fail validation.

Conditional activation is distinct from remediation. It decides whether a
predeclared ordinary stage is applicable; it never adds a node or redirects a
failed result. The activation source must be an ordinary ancestor, and
conditional activation is forbidden on remediation-only targets.

Example:

```json
{
  "id": "test-api",
  "type": "test.buster",
  "on": {
    "request_fix": "fix-api"
  }
}
```

### Durable Waits And Signals

Every wait declares its expected signal or condition, identity fields, authorized issuer, and expiry policy. Core persists that contract, rejects duplicate or stale signals, and records signal acceptance canonically. Resolving a wait does not reuse active execution identity; resumed execution creates a new attempt.

### Plugin Failure Classification

Core distinguishes a valid domain result of `failed` from an unexpected plugin exception, invalid result contract, unavailable adapter, crashed plugin runtime, cancellation, and timeout. Invalid contracts and runtime failures fail closed under dedicated core reason codes and are never normalized into an ordinary domain result.

### Effects And Idempotency

External side effects use core-issued identities, idempotency keys, and durable receipts. Core records `effect.requested`, `effect.accepted`, `effect.completed`, or `effect.failed`. Plugins request effects; capability adapters execute them. Recovery checks the durable receipt before repeating an effect.

Execution-attempt and remediation-cycle budgets are distinct. `retry` consumes the execution-attempt budget; `request_fix` consumes the remediation-cycle budget; `orchestrator_required` resets neither. Core persists all counters, may pause for orchestrator intervention at the stage's declared threshold, and resolves exhausted budgets to `blocked`.

### Identity, Versions, And Registry Freeze

Plugin IDs and stage types are globally namespaced. Each manifest declares an exact supported plugin API version and package version. Unsupported contract versions, duplicate ownership, missing dependencies, and dependency-version conflicts fail startup. They are not normalized through compatibility paths. The resolved registry and loaded plugin code are frozen for the run; installation or file changes affect only later runs.

Each run records the resolved plugin ID, stage type, API version, package version, and content digest. Resume requires the same package digest; upgrades affect new runs only. Version one of the new architecture does not migrate plugin-local state across package versions.

Plugins do not have runtime dependencies on other plugins. Graph edges compose behaviors, capability adapters provide external operations, and shared code is either an ordinary separately versioned library or part of the public SDK.

### Discovery And Adapter Selection

Core loads plugins only from configured installation roots using the canonical manifest and package structure. A required capability has exactly one configured adapter provider in a runtime scope. Missing or ambiguous providers fail startup; core does not guess by priority or discovery order.

### State And Artifact Namespaces

Core state and each plugin's state/artifacts occupy separate namespaces, for example:

```text
core/runs/<run-id>/
plugins/<plugin-id>/stages/<stage-id>/attempts/<attempt>/
```

Plugins cannot write canonical core state or another plugin's namespace. Contracts use logical artifact references rather than exposing unrestricted filesystem paths where practical.

### Registration Composition And Failure

There is no generic plugin hook bus. Each supported registration surface defines its own composition contract:

- stage ownership is exclusive; duplicate owners fail startup
- observers consume immutable journal events through explicit subscriptions and durable delivery rules
- capability adapters are selected explicitly; missing or ambiguous providers fail startup

Every surface specifies ordering, concurrency, timeout, error isolation, retry, replay, cancellation, and shutdown behavior. No surface relies on load order, first-registration-wins, last-result-wins, or undocumented exception handling. Observer failures do not change lifecycle truth unless the observer is explicitly configured as a required audit sink; required sink failure fails closed under the audit-delivery contract.

### Configuration Ownership

- Core configuration owns scheduler, storage, registry, isolation, adapter selection, and global policy.
- Pipeline configuration owns the frozen stage graph and execution policies.
- Stage configuration is namespaced by plugin and stage type, then validated exclusively against that stage registration's configuration schema.
- Secret values are never embedded in plugin configuration; plugins receive authorized references through the secret capability.

Core does not interpret plugin-specific configuration fields.

### Event Ownership

Core owns canonical `run.*`, `stage.*`, `attempt.*`, and `effect.*` lifecycle events. Plugins own namespaced domain events under `plugin.<plugin-id>.*`. Plugin events provide domain evidence but never become scheduler authority.

### Plugin-Local Durable State

Plugin-local durable state is append-only and replayable. Plugins append namespaced domain entries through the state capability; mutable views are projections or caches that can be rebuilt from those entries. A plugin cannot overwrite historical entries, core lifecycle events, or another plugin's namespace.

Each entry records the package digest, registration identity, stage and attempt identity when applicable, schema version, and idempotency key. Version one does not migrate entries across package digests. Recovery either loads the exact pinned package or fails closed.

### Cancellation And Cleanup

Core propagates cancellation to active plugin invocations and adapters, enforces cleanup deadlines, and records cleanup failures separately from the original result. Resource contracts declare whether resources are durable or disposable. Cancellation is terminal for the active attempt; any later continuation creates a new attempt under explicit resume policy.

Every invocation context is a revocable lease. Core permanently invalidates it when the attempt completes, times out, is cancelled, or loses ownership. Capability calls made by late asynchronous work fail after revocation. Long-lived adapter resources start only after registry freeze, expose readiness, and stop through an explicit, idempotent shutdown lifecycle.

`orchestrator_required` is resumed only by a typed response from the configured orchestrator with matching wait identity. `blocked` has no automatic or ordinary resume path; reopening it requires an audited administrative decision that records actor, reason, and the selected continuation.

### Minimum Plugin Verification

Every plugin must verify manifest validity, input/result schemas, capability grants and denials, idempotent effects, timeout and cancellation handling, dependency boundaries, and package completeness. Verification rejects imports from core internals or another plugin's private files.

## Extension Surfaces

### Stage execution

Stage-owner plugins execute configured graph nodes. Concrete type IDs are unbounded and registry-owned.

### Immutable lifecycle observers

Notification, telemetry, audit, dashboard, and reporting plugins subscribe to semantic events such as:

```text
run.created
run.started
run.completed
stage.scheduled
stage.started
stage.waiting
stage.retrying
stage.completed
attempt.started
attempt.completed
artifact.created
orchestrator.required
```

Observers cannot mutate scheduler truth.

Observer registrations declare their stable registration ID, subscribed event types, delivery mode, checkpoint namespace, and their own `requiredCapabilities`. They do not inherit authority from stages or adapters in the same package.

### Capability adapters

External operations are supplied behind replaceable capability contracts, for example:

```text
git.repository
git.workspace
git.commit
git.merge
runtime.dispatch
artifact.store
state.store
signal.wait
operator.request
secret.resolve
transport.publish
```

Core requests a capability without importing its implementation. Git worktree behavior, runtime dispatch, Redis transport, and operator messaging can therefore be replaced independently.

Adapter registrations declare a stable provider ID and the core-defined capabilities they implement. Operator configuration selects providers explicitly. Adapter activation, health, resource locking, cancellation, receipts, and shutdown follow the adapter contract; adapters do not receive the union of authority requested by sibling registrations.

### Policy hooks

No policy-hook contract is required before the first plugin extraction. The initial core and SDK expose no speculative `before_schedule`, `before_execute`, `after_result`, `retry`, `concurrency`, or `artifact_acceptance` plugin hooks.

Decision: policy hooks are excluded from the initial public SDK and core contract. This is an intentional reliability, maintainability, and security boundary, not a deferred requirement that implementations should anticipate with placeholders.

The existing contracts cover the demonstrated needs:

- graph and scheduling rules belong to core and pipeline execution policy
- retry, timeout, and concurrency rules belong to generic core execution policy
- Git operations and other side effects use capability adapters
- structural artifact validity is enforced by the artifact capability and result schemas
- domain artifact acceptance is modeled as an explicit stage in the frozen graph
- notifications, telemetry, audit, and reporting consume immutable lifecycle events

This keeps lifecycle control on one visible path: configured stage execution followed by a validated result and a core-owned transition. A policy hook is added only after a concrete cross-cutting requirement cannot be represented correctly as core policy, a stage, a capability adapter, schema validation, or an observer. Adding a hook is a core/SDK contract change and must define its typed input and decision, ordering, timeout, conflict handling, failure behavior, capabilities, and replay semantics.

## Target Package Structure

```text
skills/
  common/
    plugin-runtime/
      core/
        config/
        execution/
        lifecycle/
        registry/
        state/
        artifacts/
        telemetry/
      sdk/
        manifest/
        context/
        results/
        events/
        testing/
      contracts/
    plugins/
      <shared-adapter-or-observer>/
  nova/
    plugins/
      implementation-worker/
      review-gate/
      approval-gate/
      architecture-validator/
  buster/
    plugins/
      buster-worker/
```

Each role bundle overlays its role-specific source with Common and materializes
the result at `/app/skills`. Each plugin owns its manifest, implementation,
prompts, schemas, adapters, tests, fixtures, and documentation beneath that
role-aware tree. Dependency
enforcement parses the TypeScript/JavaScript syntax tree, including static
imports and exports, `require()` calls, import-equals declarations, and literal
dynamic imports. Core cannot resolve concrete role or plugin code, SDK cannot
resolve core or concrete packages, and neither core nor SDK may treat the rest
of `skills/common` as an implicit dependency allowlist. A plugin cannot resolve
a local module outside its own package or import a sibling plugin by package
name. Runtime-bundle verification applies the same parser
to every materialized module and rejects undeclared non-builtin packages.
Shared code
between plugins must become either a separately owned library or an explicit
SDK/core contract; plugins must not reach into one another's private
directories.

A dual-host package may be both an OpenClaw plugin and a pipeline extension.
It remains one package-isolation and atomic-release boundary even when the two
hosts use different manifests. Both host surfaces receive the same
package-escape and sibling-import checks; neither manifest grants access to
repository-local or sibling-package internals.

The structural boundary is implemented under
[`../../skills/common/plugin-runtime/core`](../../skills/common/plugin-runtime/core),
[`../../skills/common/plugin-runtime/sdk`](../../skills/common/plugin-runtime/sdk),
[`../../skills/common/plugins`](../../skills/common/plugins),
[`../../skills/nova/plugins`](../../skills/nova/plugins), and
[`../../skills/buster/plugins`](../../skills/buster/plugins). SDK types are
generated from the canonical v2 schema, and architecture checks enforce the
allowed dependency direction. Package placement alone is never behavior-parity
evidence.

### Package Cohesion

A plugin package is one independently owned, versioned, installed, trusted, tested, and removable product boundary. It may expose one stage type or a small cohesive family of stage types.

Decision: package identity is the provenance, trust, installation, and atomic-version boundary; it is not the permission boundary for stage execution. Stage registration is the contract and permission-request boundary. Invocation is the effective-grant and failure-containment boundary. Core remains the lifecycle-authority boundary.

One stage type per package is the default. A package may own multiple stage types only when all of them:

- represent one coherent feature
- share implementation or domain contracts that should version atomically
- use substantially the same dependency and trust boundary
- have the same ownership and release lifecycle
- are expected to be installed, upgraded, and removed together

Stage types belong in separate packages when any one must be independently replaceable, installable, versioned, permissioned, or removed. Similarity of implementation category is not sufficient: two agent-backed stages are not one plugin merely because both dispatch agents.

Examples:

- Forge and Buster remain separate packages because they are independently replaceable behaviors.
- Architecture validation remains separate from linting because the domains and dependencies differ.
- Pre-check, delivery-lint, and full-lint may form one lint plugin only if they are modes over one shared policy engine and always version together; otherwise they remain separate.

A multi-stage package has one manifest and package version, with distinct stage-type registrations. Every registration declares its own input schema, result schema, executor, configuration schema, and required capabilities. Capabilities are resolved for the invoked stage type, not granted as the union of every requirement declared anywhere in the package. Core constructs a new bounded context for each invocation and does not expose sibling registrations or their authority.

A cohesive package may contain stage, observer, and adapter registrations together only when they share one owner, trust boundary, dependency set, and atomic release lifecycle. This does not merge their runtime authority or lifecycle:

- each stage invocation receives only that stage registration's effective grants
- each observer receives only its own event subscription and effective grants
- each adapter is activated only as the explicitly selected provider for its declared capability
- failure, cancellation, checkpointing, readiness, and shutdown remain registration-specific

The boundaries are intentionally different:

```text
package            -> ownership, provenance, integrity, trust, installation, version
stage registration -> type ownership, schemas, configuration, required capabilities, executor
invocation         -> attempt identity, effective grants, timeout, cancellation, resource limits
core               -> lifecycle truth, scheduling, canonical events, recovery
```

A load or integrity failure rejects the complete package at startup because its stage types version atomically. An invocation crash is contained to that attempt and cannot crash core or mutate sibling stage state. Combining stage types increases release and defect blast radius, so the cohesion exception must remain narrow.

### Loading, Provenance, And Installation

Plugin loading has two phases:

1. Discovery parses `plugin.json` and referenced schemas without importing plugin code. Core computes trusted provenance, canonicalizes paths, verifies package identity and content digest, checks trust and API compatibility, validates every registration, resolves ownership and grants, and freezes the registry.
2. Activation imports only the validated registration modules, binds registration-specific contexts or adapter lifecycles, verifies readiness, and begins execution or event delivery.

Core, not the plugin, supplies provenance for every registration:

```text
package ID
package version
plugin API version
content digest
installation source
canonical resolved path
trust scope
registration ID
```

Package installation is an operator-controlled action outside pipeline/project configuration. A project may select installed stage types but cannot add installation roots, install code, expand trust, or grant capabilities. Installation is staged and transactional: acquire into a temporary location, resolve locked private dependencies without executing package-controlled lifecycle scripts on the trusted host, verify the full package and digest, then atomically activate it. Any required native build occurs in an isolated build environment and the resulting artifact is verified before activation. Failed validation never leaves a partially active package.

A content digest proves that resumed runs use identical bytes; it does not prove who published those bytes. External-package activation therefore also requires an operator trust decision backed by an allowlisted canonical source and digest or a verified publisher signature/attestation. The exact signing mechanism is an implementation decision, but anonymous unauthenticated provenance is not accepted as trusted.

Canonical package identity and real paths are used for deduplication so alternate URL syntax, relative paths, or symlinks cannot load the same code twice or bypass policy. Ordinary package dependencies are private and locked per package; separate installations do not share mutable dependency roots. Plugins still cannot depend on another plugin's runtime or private files.

Importing an executable registration module must not open sockets, spawn processes, start timers, access the network, or mutate external state. The inert manifest lets core complete discovery without importing those modules; trusted first-party packages enforce side-effect-free imports through architecture tests, while restricted/external packages are activated only inside isolation. Long-lived resources belong to explicitly activated adapters and are covered by readiness and shutdown contracts.

Adapters serialize conflicting mutations through resource-scoped locks in addition to effect idempotency. Lock identity uses the canonical resource identity rather than caller-provided path spelling. Idempotency prevents duplicate effects across recovery; locking prevents concurrent valid effects from corrupting the same resource.

This replaces the current package-level `manifest.capabilities` shape. Migration introduces the canonical `stages[]` registration shape, updates every producer, consumer, grant policy, schema, test, fixture, and document, and removes the superseded package-level capability field in the same change. Package-level capabilities are not retained as a fallback or alias.

The new incompatible manifest contract is `pipeline-plugin-v2`. The existing `pipeline-plugin-v1` identifier is not reused for a different shape. After the atomic registry cutover, version 1 manifests are rejected rather than adapted, normalized, or loaded beside version 2.

The complete canonical machine-readable contracts are frozen in [`../../skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json`](../../skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json). They cover inert manifests and registrations, configured stages, attempts, result variants, effects/receipts, waits/signals, artifacts, provenance, grants, invocation leases/contexts, lifecycle and plugin events, observer delivery/checkpoints, adapter lifecycle/locks, and append-only plugin state. Protocol objects reject unknown properties. Cross-record invariants remain core validation responsibilities rather than being approximated through permissive schema fields.

## Migration Principles

- Define the target contract before moving implementations.
- Move one low-risk built-in end to end to prove the package structure.
- Change all producers, consumers, tests, fixtures, and docs for a renamed contract in one migration.
- Delete superseded code in the same change that activates its replacement.
- Reject unknown legacy fields and result names rather than normalizing them.
- Add dependency checks that prohibit core-to-plugin imports and cross-plugin private imports.
- Make built-in plugins use exactly the same SDK and loading path as separately installed plugins.
- Reject executable manifests, install-time scripts, partial package activation, and project-controlled installation or grants.

## Reference Review: Pi

The design was checked against Pi at commit [`5bc1c2c`](https://github.com/earendil-works/pi/tree/5bc1c2c0a6f07e00e8c240304182f213ab8d311f). Pi provides useful evidence for:

- separating registration from later runtime binding and invalidating stale contexts
- documenting composition and short-circuit semantics per event surface
- retaining package source/provenance and canonical package identity
- isolating ordinary dependencies by package installation
- deferring long-lived resource startup and providing explicit shutdown
- reconstructing extension state from durable append-only entries
- serializing concurrent mutations of the same resource
- resolving project trust before loading project-local executable code

Relevant sources: [extension loader](https://github.com/earendil-works/pi/blob/5bc1c2c0a6f07e00e8c240304182f213ab8d311f/packages/coding-agent/src/core/extensions/loader.ts), [extension runner](https://github.com/earendil-works/pi/blob/5bc1c2c0a6f07e00e8c240304182f213ab8d311f/packages/coding-agent/src/core/extensions/runner.ts), [extension documentation](https://github.com/earendil-works/pi/blob/5bc1c2c0a6f07e00e8c240304182f213ab8d311f/packages/coding-agent/docs/extensions.md), [package documentation](https://github.com/earendil-works/pi/blob/5bc1c2c0a6f07e00e8c240304182f213ab8d311f/packages/coding-agent/docs/packages.md), and [security model](https://github.com/earendil-works/pi/blob/5bc1c2c0a6f07e00e8c240304182f213ab8d311f/packages/coding-agent/docs/security.md).

KubeClaw deliberately does not copy Pi's full host-process authority, hot reload during active work, load-order conflict resolution, compatibility normalization, convention-based executable discovery, or project-controlled package installation. Pi's action stubs prevent use of its API before binding, but importing an executable extension can still run arbitrary top-level code. KubeClaw therefore uses an inert manifest and performs trust, integrity, ownership, schema, and grant validation before importing executable modules.

## Planning Sequence

The complete phased migration, decision gates, verification requirements, and deletion criteria are recorded in [Plugin System Implementation Plan](plugin-system-implementation-plan.md).

## Open Design Questions

No foundational questions currently remain open at this level. Extraction planning may expose concrete contract questions; they must be decided from demonstrated requirements and added to this map before implementation.
