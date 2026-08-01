# Plugin System Implementation Plan

Status: implemented
Audience: maintainers, pipeline developers, plugin authors
Decision status: foundational architecture accepted on 2026-07-25

Completion note: Phase 12 is implemented and v2 is the sole runtime authority.
References below to v1 authority describe the historical sequencing constraints
that governed Phases 1–11, not current behavior.

## Purpose

Turn the decisions in [Plugin System Vision](plugin-system-vision.md) into an implementation sequence with explicit cutovers, verification gates, and deletion requirements.

This document records the implementation sequence and its accepted constraints.
Current runtime behavior is documented in [Pipeline Architecture](../pipeline/architecture.md).

## Outcome

The finished system has:

- a generic core that schedules a frozen execution graph and owns lifecycle truth
- one canonical stage contract with open-ended plugin-defined stage types
- self-contained plugin packages using the same SDK and loading path for built-in and separately installed plugins
- per-stage schemas, configuration, executors, and required capabilities
- registration-specific authority, readiness, checkpoint, cancellation, and shutdown lifecycles
- per-invocation grants, isolation, timeouts, cancellation, revocation, and failure containment
- capability adapters for replaceable external operations
- immutable observers for telemetry, notification, audit, dashboard, and reporting behavior
- inert package manifests with two-phase discovery and activation
- core-generated provenance, canonical package identity, integrity verification, and pinned recovery
- append-only replayable plugin-local state and revocable invocation contexts
- no hardcoded Forge, Buster, review, approval, validator, or generator behavior in core
- no legacy aliases, compatibility adapters, fallback readers, dual writes, or dormant replacement paths

## Delivery Rules

1. There is one active implementation and one accepted contract shape after every completed cutover.
2. Contract migrations update all producers, consumers, schemas, tests, fixtures, examples, and docs, then delete the superseded path.
3. Preparatory refactors may preserve behavior, but must not add a second runtime authority.
4. Core never imports a concrete plugin.
5. Plugins never import core internals or another plugin's private files.
6. Every phase has a fail-closed verification gate before the next phase begins.
7. Planned external-plugin support is not advertised as secure until the isolated runner and integrity checks exist.
8. Infrastructure and package-preparation phases may complete while v1 remains
   the sole authority. They do not switch individual consumers or create a
   second authority. The single final authority cutover deletes every
   superseded surface in the same change.

## Per-Cutover Deletion Gate

KubeClaw uses one dependency-complete authority cutover after the v2 registry,
capability runtime, graph, state, plugins, observers, and isolation layers pass
their preparation gates. Temporary pipeline unavailability is acceptable;
temporary behavioral loss, forwarding bridges, and dual runtime authority are
not. Phase 12 performs that one cutover and deletes every superseded path in
the same change.

Every cutover must maintain a machine-readable deletion ledger containing:

```text
superseded path or symbol
replacement path or symbol
all former producers and consumers
persisted names and configuration fields
tests, fixtures, examples, docs, and generated artifacts
deletion verification
```

The cutover gate fails unless:

- every replacement producer and consumer uses the canonical contract
- every superseded source file and private implementation is deleted
- every legacy import, export, registration, schema field, result name, persisted reader/writer, normalizer, fallback, bridge, alias, and dual-write path is absent
- obsolete tests and fixtures are deleted or rewritten to assert the canonical behavior
- current documentation and examples contain only the implemented canonical mechanism
- generated inventories and dependency graphs show no owner, edge, or privileged effect assigned to the superseded path
- targeted negative scans and architecture tests prove the old contract cannot be loaded, parsed, imported, configured, or executed

Historical discussion may remain only in explicitly archived, non-normative documentation when it is useful for provenance. Archived text must never be imported, generated into active docs, referenced as current guidance, or accepted by runtime validation.

## Accepted Contract Decisions

The following rules are accepted and must be treated as constraints when the public SDK and persisted contracts are implemented.

### 1. Capability Availability

Decision:

- Every capability listed under a stage registration's canonical `requiredCapabilities` field is required.
- An enabled configured stage fails startup validation when a required capability is denied, unavailable, ambiguous, or lacks a configured adapter.
- Plugin API version 2 has no optional capabilities and no silent degraded context.
- A behavior that legitimately supports different authority is represented by a separate stage type or explicit configuration contract with independently valid capability requirements.

Reason: optional missing methods create environment-dependent behavior and fallback debt.

### 2. Execution Budgets

Decision:

- `retry` consumes the stage's execution-attempt budget.
- `request_fix` consumes a separate remediation-cycle budget.
- `orchestrator_required` does not reset either budget.
- Core owns and persists all counters.
- Exhausting the applicable budget resolves to `blocked`.
- The stage definition may declare when orchestrator intervention occurs before final exhaustion.

Reason: agent/runtime failure and inadequate work are different loops and must not share ambiguous counters.

### 3. Resume Authority

Decision:

- `orchestrator_required` creates a typed durable wait that only the configured orchestrator capability may resolve.
- The response carries the exact wait identity and optional helper prompt; core validates it and creates a new attempt.
- `blocked` has no ordinary automatic resume.
- Reopening a blocked run requires an explicit audited administrative decision containing actor, reason, and selected continuation: retry the stage, enter a declared remediation path, or cancel/start a new run.

Reason: a normal intervention pause and a stop requiring reevaluation must remain operationally distinct.

### 4. Package Version And Recovery

Decision:

- A run records the exact plugin ID, package version, content digest, API version, and stage type for every resolved owner.
- Resume requires the same package digest.
- Installing an upgrade affects new runs only.
- If the exact package is unavailable, resume fails closed instead of loading a newer implementation.
- Version one does not migrate plugin-local state across package versions.
- External-package trust additionally requires an allowlisted canonical source and digest or a verified publisher signature/attestation; a digest alone is not publisher authentication.

Reason: replay and recovery are unreliable if code changes underneath a durable run.

### 5. Plugin Dependencies

Decision:

- Plugins cannot depend on another plugin's runtime or private code.
- Pipeline graph edges compose stage behavior.
- Capability adapters provide external operations.
- Shared code is a separately versioned ordinary library or part of the public SDK.
- A plugin package may use locked internal dependencies, but the registry does not resolve plugin-to-plugin dependency graphs in version one.

Reason: runtime plugin dependencies undermine removability, ownership, startup determinism, and security review.

### 6. Isolation And External Plugins

Decision:

- Initial built-in extractions may run in-process only as explicitly trusted first-party packages.
- Restricted or external packages are rejected until the isolated invocation runner exists.
- The isolated runner enforces the invocation's effective filesystem, environment, network, subprocess, CPU, memory, and time limits.
- Context-level capability checks and sandbox policy use the same resolved grant.

Reason: hiding context methods is not a security boundary for unrestricted in-process code.

### 7. Registration Surfaces, Loading, And State

Decision:

- A cohesive package may register stages, immutable observers, and capability adapters when they share one owner, trust boundary, dependency set, and atomic release lifecycle.
- Every registration retains an independent identity, authority set, failure boundary, readiness/checkpoint behavior, and shutdown lifecycle.
- The canonical `plugin.json` manifest is inert data. Discovery validates metadata, schemas, provenance, integrity, ownership, and grants before importing executable modules.
- Activation occurs only after the registry is frozen. It imports validated modules and binds registration-specific runtime contexts.
- Plugin-local durable state is an append-only namespaced log. Mutable state is a replayable projection or cache.
- Invocation contexts are revocable leases. Calls made after completion, timeout, cancellation, or ownership loss fail.
- Package installation and capability grants are operator-controlled. Project configuration may select installed types but cannot install code, add roots, expand trust, or grant authority.

Reason: package cohesion must not become authority union; executable discovery, mutable hidden state, stale contexts, and project-controlled installation would undermine replay, failure containment, and security.

## Phase 1 Result

Phase 1 is complete. Phase 12 replaced the migration-only rules and coverage
ledgers with a manifest-derived permanent inventory. The generated report is
[Plugin System Current Inventory](plugin-system-current-inventory.md), and the
machine-readable inventory is
[`../generated/inventory/plugin-system.json`](../generated/inventory/plugin-system.json).

The extraction matrix records every current plugin-relevant behavior or exported runtime surface:

```text
current owner/path
behavior and entrypoint
current kind, hook, and stage ID
inputs, outputs, and persisted state
configuration and schemas
prompts, artifacts, fixtures, tests, and docs
direct effects and required adapters
imports from or into core
privileged escape hatches
proposed target: core, SDK, plugin, adapter, shared library, or delete
proposed package and registration ID
migration blockers
```

The inventory must also produce:

- a dependency graph showing core-to-concrete, concrete-to-core-internal, and cross-feature imports
- a side-effect ledger covering filesystem, Git, Redis, runtime dispatch, network, secrets, commands, notifications, and telemetry
- a lifecycle-contract ledger listing every result producer, consumer, persisted name, normalizer, and projection
- a hardcoding ledger for Forge, Buster, workers, gates, validators, generators, hook families, and fixed stage IDs
- an evidence-backed confirmation or rejection of delivery lint as the first reference extraction

The permanent inventory is derived from inert package manifests and package
roots. `npm run plugin-system:inventory:check` fails when generated package,
registration, or file evidence is stale. Capability-boundary, import-safety,
package-completeness, and registration-uniqueness checks are enforced by the
permanent v2 release suite.

The evidence confirmed `kubeclaw.delivery-lint` as the first reference
extraction. Phase 8 split and deleted the former mixed
`module-validators.ts` facade instead of moving it into the plugin.

## Current Next Step

The premature big-bang cutover was rejected because it deleted the role-specific
skill bundles and verification baseline before concrete plugin behavior reached
parity. The pre-cutover Nova, Buster, Common, documentation, deployment, unit,
integration, and end-to-end sources are restored as the sole active runtime.

The role-aware Phase 3 relocation is complete. The generic v2 core, SDK,
contracts, shared packages, and role-owned package candidates now live beneath
`skills/` and materialize through the existing `/app/skills` bundle contract.
The restored v1 implementation remains the sole active runtime. Package
placement is not behavior parity: every migration unit remains
`baseline-retained`, and forwarding-only candidates cannot authorize cutover.
The Phase 7 durability preparation gate is complete. The next implementation
phase is Phase 9 concrete plugin parity migration.

## Phase Status

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1 | Ownership inventory | Complete |
| 2 | Canonical v2 contracts | Complete |
| 3 | Generic core, SDK, and role-aware plugin folder boundaries | Complete |
| 4 | Generic registry and inert discovery substrate | Complete |
| 5 | Per-registration capability runtime and replaceable adapters | Complete |
| 6 | Generic frozen graph and lifecycle cutover preparation | Complete |
| 7 | Durable effects, waits, signals, recovery, locks, and replayable plugin state | Complete |
| 8 | Reference self-contained delivery-lint plugin | Complete |
| 9 | Migration of all remaining concrete stages and adapters | Complete |
| 10 | Durable observer delivery and observer-package migration | Complete |
| 11 | Isolated runtime and transactional installation for external plugins | Complete |
| 12 | Repository-wide legacy absence proof and release gate | Not started |

Status rules:

- `Complete` means the phase's preparation or cutover exit criteria pass.
- `In progress` means implementation is active but its preparation or cutover exit criteria remain open.
- `Not started` means the phase's canonical preparation or cutover work has not begun.
- A later phase may receive incidental supporting code, but its status remains
  `Not started` until its own verification scope is being executed.

## Runtime Bundle And Source-Layout Constraint

The repository's deployment contract is role-aware and remains authoritative
throughout the migration:

```text
skills/nova    --\
                  +-- Nova bundle --> /app/skills
skills/common  --/

skills/buster  --\
                   +-- Buster bundle --> /app/skills
skills/common  ---/
```

`scripts/package-agent-skill-bundle.sh` copies the selected role first and
`skills/common` second. The Common overlay therefore owns shared runtime files.
Both the current runtime and the final v2 runtime must be valid after this exact
materialization. Top-level development directories are not a replacement for
the deployed skill bundle.

The canonical v2 target layout is:

```text
skills/
  common/
    plugin-runtime/
      core/
      sdk/
      contracts/
    plugins/
      <shared-adapter-or-observer>/
  nova/
    pipeline.ts
    pipeline/
      SKILL.md
    plugins/
      <nova-stage-or-adapter>/
  buster/
    buster-pipeline.ts
    pipeline/
    plugins/
      <buster-stage-or-adapter>/
```

The exact package set is inventory-driven, but these ownership rules are
fixed:

- Nova-specific behavior and packages live under [`skills/nova`](../../skills/nova).
- Buster-specific behavior and packages live under [`skills/buster`](../../skills/buster).
- Genuinely shared core, SDK, contracts, adapters, observers, and libraries
  live under [`skills/common`](../../skills/common).
- A package that serves both OpenClaw and the pipeline remains one isolated
  package and atomic release boundary. Both host surfaces receive the same
  package-escape and sibling-import checks.
- The role-specific and Common plugin directories merge into `/app/skills/plugins`;
  undeclared path or registration collisions fail packaging or startup.
- Existing role entrypoints and required `SKILL.md` files remain present until
  their canonical replacements are proven in the materialized bundle.
- A plugin contains its real implementation, configuration, schemas, tests,
  and documentation. A forwarding wrapper does not count as migration parity.
- The v1 runtime remains the sole active authority while v2 packages are
  prepared and tested. There is no dual production registry.
- A superseded implementation is deleted in the same cutover that switches all
  of its consumers, but only after unit, integration, bundle, and applicable
  end-to-end parity evidence passes.

## Migration Units And Parity Gates

Recovery controls 1–5 are complete:

| Control | Canonical result | Status |
| --- | --- | --- |
| 1. Restore baseline | Nova, Buster, Common, tests, E2E, deployment, and documentation restored; v1 remains sole authority | Complete |
| 2. Freeze bundle contract | Role-first/Common-second archives are exact, reproducible, role-isolated, and their complete literal TS/JS module graphs resolve against declared runtime packages | Complete |
| 3. Adopt compatible topology | Core, SDK, contracts, and package candidates live beneath role-aware `skills/` roots; AST-based checks cover imports, exports, `require()`, and dynamic imports; dependency directions are explicitly allowlisted | Complete |
| 4. Rebuild ownership ledger | Every owner expands into exact legacy and target file sets, explicit legacy-to-replacement pairings, registrations, owner-scoped tests, consumers, effects, and deletion paths | Complete |
| 5. Establish parity gates | Unit transitions execute global and unit scenarios, require package-local replacement evidence for every target, and require recomputable, hash-chained commit evidence with retained command output | Complete |

During migration, a mechanically checked ledger grouped all legacy owners into
cohesive units and recorded exact legacy-to-replacement mappings, scenarios,
digests, effects, adapters, consumers, and deletion criteria. Phase 12 removed
that temporary ledger after every deletion obligation was closed. The permanent
manifest-derived inventory and v2 boundary suites now own release verification.
separately instead of being copied onto unrelated owners. It is
derived rather than duplicated; inventory or migration-ledger drift makes the
check fail.

The initial ledger recorded every unit as `baseline-retained`, with explicit
parity blockers describing the missing real implementation or replacement
evidence. Role-aware v2 packages are
candidate destinations, not parity evidence. A unit may advance to
`implementation-in-progress` only after its inventory remains complete. It may
advance to `parity-proven` only after its source, contract, unit/integration,
materialized-bundle, unit-specific legacy and replacement scenarios, and E2E
contract gates pass. Every target package or extension requires its own
authoritative replacement scenario inside that package; one scenario cannot
authorize sibling packages in the same unit. A target-bearing unit with an
uncovered package, or any unit with an unresolved parity blocker or blocked
surface pairing, cannot claim parity.
Every parity scenario must also record an implementation decision:
`reuse`, `refactor`, or `rewrite`; the legacy and replacement behavioral
expectations; the complexity impact; and whether behavior intentionally
changed. Equivalent scenarios must keep observable behavior while remaining
free to replace the implementation wholesale. Intentionally changed or
obsolete behavior additionally requires a concrete rationale and approval
reference. Missing decisions or undocumented drift fail closed.
It may advance to
`cutover-complete` only after the real fast/full E2E and failure matrix pass and
the unit's superseded paths pass the permanent legacy-absence gate.

The real fast/full E2E harness and live failure matrix are deliberately deferred
until every active runtime surface has moved to v2. Running those agent-backed
scenarios for individual candidate packages would spend model budget while the
system still depends on v1. Per-package parity instead requires package unit
tests, package/core integration tests, assembled-role-bundle verification, and
live function tests that invoke real local tools or infrastructure adapters
without spawning agents. Offline E2E contract fixtures may remain part of the
repository-wide baseline, but they are not rerun as a per-package live gate.

The reusable extraction procedure is documented in
[`../developers/migrating-pipeline-plugins.md`](../developers/migrating-pipeline-plugins.md).
It separates non-authoritative implementation extraction from the final
system-wide activation. A plugin may own complete real behavior and reach
package parity while v1 remains authoritative; consumer switching, superseded
path deletion, and the agent-backed E2E harness occur only in the final atomic
all-v2 cutover.

Migration status transitions required committed immutable evidence pinning
source and replacement digests, scenario inputs, commands, outputs, and role
bundles. Phase 12 retired the temporary evidence schema and output logs after
the source side was deleted. Permanent tests now verify the installed v2 system
directly.

The canonical permanent release wrapper is:

```bash
npm run verify:plugin-system-v2
```

It verifies contracts, core and package typechecks, discovery/import safety,
capability enforcement, lifecycle, durability, package isolation, installation,
all package-local live tests, crash containment, and the final absence gate.
The real OpenClaw-backed harness is executed explicitly for release evidence.

## Execution Checklist

This is the canonical actionable checklist. Check an item only when its implementation, tests, documentation, inventory updates, and applicable deletion-ledger entries pass. A phase is complete only when every item in that phase is checked.

### Phase 1: Ownership Inventory

- [x] Define the machine-readable inventory rules and reviewed coverage baseline.
- [x] Classify every plugin-relevant runtime and support file by canonical target owner.
- [x] Inventory all exported runtime surfaces and cross-owner imports.
- [x] Inventory privileged filesystem, Git, Redis, runtime, network, secret, command, notification, and telemetry effects.
- [x] Inventory lifecycle-result producers, consumers, persisted names, normalizers, and projections.
- [x] Inventory concrete kinds, hook families, fixed stage IDs, and privileged escape hatches.
- [x] Generate the human-readable extraction matrix and machine-readable dependency evidence.
- [x] Add fail-closed checks for unclassified files, stale evidence, undeclared effects, duplicate registrations, and missing entrypoints.
- [x] Confirm `kubeclaw.delivery-lint` as the first reference extraction.
- [x] Document the inventory method, ownership map, findings, and selected reference extraction.
- [x] Pass the Phase 1 verification gate.

### Phase 2: Canonical V2 Contracts

- [x] Define the inert `plugin.json` manifest contract.
- [x] Define package identity, provenance, trust, source, digest, and publisher-attestation contracts.
- [x] Define independent stage, observer, and adapter registration contracts.
- [x] Define configured stage, execution-budget, attempt, and pinned-owner contracts.
- [x] Define every canonical `StageResult` variant and its closed schema.
- [x] Define logical digest-addressed artifact references.
- [x] Define core-issued effect requests and durable adapter receipts.
- [x] Define durable waits and authorized resume signals.
- [x] Define invocation leases, bounded contexts, grants, revocation, and resource-limit contracts.
- [x] Define canonical lifecycle events and namespaced plugin-domain events.
- [x] Define observer delivery and checkpoint contracts.
- [x] Define adapter activation, readiness, health, cancellation, locking, receipt, and shutdown contracts.
- [x] Define append-only plugin-state entry contracts.
- [x] Add negative tests for all legacy names, shapes, kinds, hook families, fixed IDs, and package-level capabilities.
- [x] Generate SDK types from the canonical JSON Schema and verify schema/type drift.
- [x] Document every canonical v2 contract, invariant, identity, and rejected legacy shape.
- [x] Pass the Phase 2 verification gate.

### Phase 3: Generic Core, SDK, And Folder Boundaries

- [x] Relocate the generic core into the planned Common plugin-runtime core directory.
- [x] Relocate the public SDK into the planned Common plugin-runtime SDK directory.
- [x] Materialize canonical contracts beneath the planned Common plugin-runtime contract directory.
- [x] Create the planned Nova, Buster, and Common plugin package roots shown in the target-layout block above.
- [x] Classify every existing top-level package as Nova-owned, Buster-owned, shared, or rejected scaffolding.
- [x] Classify forwarding-only packages as non-authoritative candidates that cannot claim migration parity.
- [x] Add strict TypeScript boundaries for core and SDK.
- [x] Prevent core from importing concrete plugins.
- [x] Prevent the SDK from importing core runtime internals or plugins.
- [x] Prevent v2 plugins from escaping their package through relative imports.
- [x] Provide SDK testing helpers without core-runtime dependencies.
- [x] Prove that core starts with a frozen empty registry and zero plugins.
- [x] Restore and document the Nova/Buster role-first, Common-second bundle contract.
- [x] Add executable packaging verification for both `/app/skills` bundles.
- [x] Document the target core, SDK, contract, and plugin ownership boundaries.
- [x] Prove the relocated v2 foundation builds and tests from both materialized role bundles.
- [x] Pass the Phase 3 verification gate.

### Phase 4: Generic Registry And Discovery

- [x] Define operator-controlled plugin installation-root configuration.
- [x] Discover only inert `plugin.json` files without importing executable modules.
- [x] Resolve canonical real paths and reject duplicate source spellings or symlink aliases.
- [x] Compute canonical package identity, source provenance, content digest, and trust evidence in core.
- [x] Validate API version, package version, manifest schemas, module paths, schema paths, and package completeness.
- [x] Validate globally unique plugin IDs, registration IDs, and stage types.
- [x] Resolve exactly one owner for every configured stage type.
- [x] Resolve observer subscriptions and adapter-provider registrations.
- [x] Resolve registration-specific required capabilities and platform grants before activation.
- [x] Validate registration-owned configuration without interpreting plugin fields in core.
- [x] Freeze the complete registry before importing executable registration modules.
- [x] Record the frozen package and registration snapshot with each v2 run.
- [x] Activate registrations transactionally after discovery, validation, ownership, integrity, trust, and grant checks pass.
- [x] Implement readiness, cancellation, rollback, and idempotent shutdown for activated adapters.
- [x] Verify trusted first-party imports are side-effect-free before host import.
- [x] Prove project definitions cannot install code, add roots, establish trust, select providers, or expand grants.
- [x] Document the prepared v2 registry/discovery path and final authority-cutover boundary.
- [x] Pass the Phase 4 verification gate with `npm run verify:plugin-system:phase4`.

### Phase 5: Capability Runtime And Adapters

- [x] Freeze the initial closed capability vocabulary and resource-constraint schemas.
- [x] Map every inventoried privileged effect to one canonical capability.
- [x] Implement required, granted, and available capability resolution per registration.
- [x] Require complete coverage of every registration's `requiredCapabilities`.
- [x] Construct independently bounded contexts for stage invocations, observer deliveries, and adapter lifecycles.
- [x] Enforce repository, path, runtime, agent, host, secret, command, namespace, and other resource constraints.
- [x] Revoke contexts after completion, timeout, cancellation, or ownership loss.
- [x] Reject late asynchronous calls through revoked contexts.
- [x] Select exactly one configured adapter per required capability in runtime scope.
- [x] Detect adapter dependency cycles and ambiguous providers at startup.
- [x] Emit audit events for every privileged operation.
- [x] Prevent plugins from receiving lifecycle, scheduler, canonical-event, or registry mutation authority.
- [x] Add grant, denial, escalation, sibling-authority, and trusted-source direct-import compliance tests.
- [x] Delete direct privileged-operation paths replaced by canonical adapters.
- [x] Close the Phase 5 deletion ledger.
- [x] Document the capability vocabulary, constraint schemas, grant resolution, adapter selection, auditing, and denial behavior.
- [x] Pass the Phase 5 verification gate.

The Phase 5 deletion ledger covers the prepared v2 execution boundary. Direct
privileged stage/observer paths, package-wide authority union, unbounded
contexts, and unaudited adapter operations are absent from v2. V1 privileged
paths are not superseded yet because v1 remains the sole production authority;
they are deleted only in the dependency-complete Phase 12 cutover. The
machine-readable vocabulary, side-effect mapping, and deletion evidence live in
[`plugin-system-phase5-capabilities.json`](plugin-system-phase5-capabilities.json).

Phase 5 does not claim that static source inspection sandboxes adversarial
JavaScript. The import/global checks prove policy compliance for the audited,
trusted first-party packages allowed during this phase. Restricted and external
code remains rejected. Enforcing effective grants against hostile executable
code is the process/worker/container boundary delivered in Phase 11.

### Phase 6: Generic Graph And Lifecycle Cutover

- [x] Define and validate the configured generic execution graph.
- [x] Freeze nodes, ordinary edges, and declared remediation edges at run start.
- [x] Enforce acyclic ordinary dependencies with supported fan-out and fan-in.
- [x] Implement generic readiness and dependency evaluation.
- [x] Implement replayable conditional activation from immutable namespaced
  decision facts, with attempt-free `stage.skipped` transitions.
- [x] Implement immutable run, stage, and attempt identities.
- [x] Implement generic concurrency, timeout, cancellation, retry, and remediation-budget policy.
- [x] Map every canonical result to exactly one lifecycle transition.
- [x] Implement `retry` as a new attempt of the same stage.
- [x] Implement `request_fix` as a bounded traversal of a predeclared remediation path.
- [x] Implement `orchestrator_required` as a resumable typed wait without resetting budgets.
- [x] Implement `blocked` as a stop requiring audited administrative reopening.
- [x] Reject `needs_nova` and `action_required` throughout the v2 contract and executable surface.
- [x] Map rejected approval to canonical `blocked` results in the v2 approval package.
- [x] Schedule arbitrary registered stage types without concrete plugin branches in v2 core.
- [x] Record concrete v1 scheduler and lifecycle deletion as an atomic Phase 12 cutover obligation.
- [x] Prove replay reconstructs identical graph, lifecycle, budget, wait, and remediation state.
- [x] Close the Phase 6 v2-preparation deletion ledger.
- [x] Update architecture, pipeline-author, operator, and troubleshooting documentation for the generic graph and canonical lifecycle.
- [x] Pass the Phase 6 verification gate.

Phase 6 completes the generic v2 graph and lifecycle authority but does not
activate it as the production scheduler. Every run pins a canonical graph
digest beside the registry snapshot; resume rejects graph drift. Attempts,
budgets, waits, remediation returns, conditional activation decisions, skipped
stages, and administrative reopening are journaled and replayable. V2 core
contains no Forge, Buster, gate, validator, generator, or fixed-stage
scheduling branch.

The repository-wide removal of v1 scheduler branches, lifecycle names,
readers, writers, fixtures, and documents remains deliberately deferred to the
single Phase 12 authority switch. Running v1 remains the production baseline
until Phases 7–11 preserve the remaining behavior. This is not a compatibility
bridge or dual scheduler: v1 and v2 remain separate, and only one becomes
authoritative after final cutover.

### Phase 7: Durable Effects, Waits, And Recovery

- [x] Generate stable effect identities and idempotency keys in core.
- [x] Persist effect requested, accepted, completed, and failed transitions.
- [x] Persist and verify adapter receipts before repeating effects.
- [x] Define wait identity, authorized issuer, expiry, and expected signal schema.
- [x] Reject duplicate, stale, unauthorized, expired, and mismatched resume signals.
- [x] Create a new attempt when execution resumes.
- [x] Propagate cancellation through plugins and adapters with cleanup deadlines.
- [x] Enforce exact package version and content digest on recovery.
- [x] Reject recovery when pinned code is unavailable.
- [x] Persist plugin-local state as append-only namespaced entries.
- [x] Rebuild plugin projections deterministically from their log.
- [x] Persist append-only observer checkpoints.
- [x] Implement deterministic observer redelivery from the canonical journal.
- [x] Implement adapter-owned resource locks with fencing tokens.
- [x] Add crash and concurrency tests proving effects cannot duplicate or corrupt shared resources.
- [x] Delete superseded v2 mutable-state and in-memory lock paths.
- [x] Close the Phase 7 v2-preparation deletion ledger.
- [x] Document effect idempotency, waits/signals, recovery, cancellation, state replay, observer checkpoints, and resource-lock semantics.
- [x] Pass the Phase 7 verification gate.

### Phase 8: Reference Delivery-Lint Plugin

- [x] Split delivery-lint behavior out of the mixed `module-validators.ts` facade.
- [x] Create the self-contained delivery-lint package beneath the canonical plugin root.
- [x] Add inert manifest, source, generated distribution, schemas, tests, fixtures, and package-local documentation.
- [x] Move all delivery-lint behavior and domain reason codes into the package.
- [x] Use only SDK contracts, ordinary declared libraries, and granted capabilities.
- [x] Implement canonical `passed`, `request_fix`, and `blocked` results.
- [x] Own delivery-lint configuration and artifacts inside the package boundary.
- [x] Add package-completeness and prohibited-import checks.
- [x] Test install, execute, fail, remediation, block, remove, and replacement scenarios.
- [x] Delete the former delivery-lint implementation, facade branch, built-in registration, and bridge.
- [x] Prove no source outside the package owns delivery-lint behavior.
- [x] Close the delivery-lint v2-preparation deletion ledger.
- [x] Publish package-local usage, configuration, result, artifact, capability, testing, installation, removal, and replacement documentation.
- [x] Pass the Phase 8 verification gate.

### Reusable Per-Package Extraction Gate

Before the final all-v2 activation, each package extraction must:

- [ ] identify one cohesive behavior and all of its consumers, effects, schemas, and configuration;
- [ ] place the complete deterministic implementation in the owning package;
- [ ] keep privileged behavior behind independently granted adapter registrations;
- [ ] move or reproduce authoritative package-local unit and integration tests that execute real behavior;
- [ ] run live function tests with real tools/adapters and no agent spawn;
- [ ] execute from the assembled Nova or Buster bundle;
- [ ] prove the package does not import or forward to the retained v1 implementation;
- [ ] record package parity while retaining v1 as the sole active runtime;
- [ ] defer consumer switching and deletion until the final atomic all-v2 cutover;
- [ ] run the real fast/full E2E harness and failure matrix once, after every active surface uses v2;
- [ ] delete all superseded implementations and add exact negative absence checks in that same final cutover.

Extraction progress:

All declared pipeline-v2 package protocols are now extracted: **31 of 31
pipeline packages** containing **39 of 39 registrations** (15 stages, 6
observers, and 18 adapters). In addition, the dual-host OpenClaw package
`kubeclaw.openclaw-agent-observer` is now covered by the same package-local
test and boundary gate, bringing the discovered package-suite baseline to
**32 of 32 package roots**. There are no open package-protocol extractions.
The active runtime and E2E harness are v2-only; production certification still
requires a successful full live E2E run and the remaining failure matrix.

- `kubeclaw.lint`: package extraction complete. The package owns the
  deterministic pre-check/full engine, schemas, adapter, artifacts, unit
  tests, denial/cancellation tests, package-boundary guards, and an
  agent-free live function test through the real v2 runner. It remains
  non-authoritative until the final atomic all-v2 consumer cutover, at which
  point the retained v1 implementation and registration must be deleted.
- `kubeclaw.delivery-lint`: package extraction complete. Its real live
  function test executes the stage through the v2 registry with the repository
  and artifact adapters and verifies pass, remediation, missing-file, unsafe
  path, and no-Dockerfile behavior. It remains non-authoritative until the
  final atomic cutover.
- `kubeclaw.preflight-contract`: package extraction complete. It owns
  module-level and substep blueprint loading, owned-deliverable declaration
  rules, schemas, artifacts, and real-runner verification for passing,
  remediation, missing-blueprint, invalid-path, and multi-substep cases.
  Consumer switching remains deferred to the final atomic cutover.
- `kubeclaw.artifact-store`: package extraction complete. It owns canonical
  JSON serialization, immutable SHA-256-addressed blobs, exact verified reads,
  catalog append, size limits, cancellation, and real-filesystem integrity
  tests. Existing v2 stage tests provide consumer-driven integration coverage.
  The retained v1 artifact surfaces remain authoritative until final cutover.
- `kubeclaw.repository-adapter`: package extraction complete. It owns bounded
  UTF-8 repository reads with traversal, absolute-path, symlink-escape,
  directory, missing-file, oversize, and cancellation enforcement. Its direct
  real-filesystem suite and the delivery/preflight consumer suites pass.
- `kubeclaw.command-runner`: package extraction complete. It owns direct
  executable spawning with canonical executable and working-directory
  allowlists, an empty environment, bounded output and runtime, cancellation,
  graceful-to-forced termination, idempotent shutdown behavior, and real
  subprocess tests. It never invokes a shell. This is a new bounded v2
  foundation capability and explicitly does not claim to replace the retained
  operator control-command lifecycle, which needs a separate v2 owner.
- `kubeclaw.state-store`: package extraction complete as new v2 foundation.
  It owns namespace-safe append-only journals, monotonic sequence assignment,
  core-issued idempotency-key replay, fsync-before-acknowledgement, bounded
  entries, record validation, cancellation, and real restart/filesystem tests.
  It does not claim parity with the retained Redis transport or Nova status
  projections.
- `kubeclaw.network-http`: package extraction complete as new v2 foundation.
  It owns exact origin, method, and header authorization; redirect denial;
  request/response and timeout bounds; cancellation; JSON/text response
  handling; and real local-server tests. It does not claim parity with agent
  dispatch, Discord delivery, or Redis transport.
- `kubeclaw.telemetry-store`: package extraction complete as new local v2
  foundation. It owns monotonic append-only evidence, idempotent delivery
  acceptance, fsync-before-acknowledgement, recursive sensitive-field
  redaction, replay validation, size limits, cancellation, and real journal
  tests. Redis stream retention and consumer semantics remain a separate
  retained authority.
- `kubeclaw.telemetry-observer`: package extraction complete for canonical v2
  lifecycle delivery. It maps immutable core events into a stable envelope
  preserving event identity, sequence, causation, registration provenance, and
  delivery attempt, then emits through the bounded telemetry capability. Its
  package tests and the real observer-runtime engine test pass; legacy Redis
  presentation/retention parity remains blocked.
- `kubeclaw.secret-resolver`: package extraction complete as confidential v2
  foundation. Logical names are explicitly mapped to operator environment
  variables and unknown, absent, empty, or cancelled requests fail closed.
  Core executes `secrets.read` transiently: secret payloads and results are
  deliberately excluded from effect journals, receipts, lifecycle events, and
  replay state, with a contract test proving the absence.
- `kubeclaw.git-workspace`: package extraction complete for its declared
  create, scoped-commit, and merge capabilities. It owns canonical repository
  and workspace roots, symlink/ref/path/message denial, empty-environment
  subprocesses, configured Git identity, hook suppression, output/timeout/
  cancellation bounds, process-group termination, shutdown, and real
  disposable-repository tests. Broader retained pull/rebase/push/recovery
  behavior remains outside this package parity claim.
- `kubeclaw.review`: deterministic protocol extraction complete. The package
  owns the reviewer instruction envelope, strict closed-output parser,
  contradiction checks, verdict-to-stage-result reduction, schemas, fixtures,
  unit tests, package-boundary checks, and an agent-free live function test
  through the real v2 registry, runtime-dispatch, confidential secret, and
  bounded HTTP adapters. Actual reviewer-agent judgment and remediation parity
  remain deferred to the final all-v2 E2E proof.
- `kubeclaw.human-approval`: deterministic approval protocol extraction
  complete. The package owns closed input/configuration/guidance validation,
  authenticated approved/rejected decisions, bounded pending waits, canonical
  operator requests, and result reduction. Unit and agent-free live-function
  tests exercise the real runner, operator messaging, confidential secret,
  bounded HTTP, and wait journal. Its wait consumer validates the complete
  public `{ created, wait }` adapter response while treating the journal's
  record envelope as adapter-owned storage. Full external signal delivery, restart
  recovery, and timeout-resolution parity remain final-cutover requirements.
- `kubeclaw.operator-messaging`: package extraction complete as the bounded
  target-scoped `operator.request` foundation. It owns closed configuration
  and payload validation, canonical target selection, request/response bounds,
  cancellation and shutdown behavior, idempotent delivery, and real local
  HTTP integration. Authentication uses an idempotency-bound HMAC so resolved
  secrets never enter nested effect requests or journals. Legacy Discord
  presentation, compaction, gating, audit, rate-limit, and health telemetry
  remain explicitly blocked for their later owning packages.
- `kubeclaw.transport-publisher`: package extraction complete as a new bounded
  target-scoped HTTP `transport.publish` foundation. It owns closed
  configuration, message, and acknowledgement contracts; canonical target
  selection; recursive JSON and byte bounds; idempotent publication; HMAC
  authentication; response validation; and real local-server integration.
  It does not claim Redis streams, durable queues, retry scheduling, or
  post-response delivery parity. Mid-flight nested cancellation remains a
  core-runtime prerequisite before authoritative activation.
- `kubeclaw.wait-store`: package extraction complete as durable v2 wait-intent
  storage. It owns append-only fsync-backed records, core-idempotency replay,
  conflict detection, exact canonical wait/issuer validation on create and
  replay, strict RFC 3339 date-time validation, bounded entries, corruption and symlink failure,
  cancellation, and real restart/filesystem tests. Malformed authorization
  records are rejected before persistence and during journal replay. Core still
  owns issuer authorization, expiry enforcement, resume-signal validation, and
  new-attempt creation.
- Adapter-runtime prerequisite: nested capability invocations now inherit the
  outer invocation's cancellation signal through the complete dependency
  chain. A real slow HTTP integration test proves mid-flight socket closure;
  this removes the activation blocker recorded for secret-bearing HTTP
  adapters and runtime dispatch. Adapter startup is transactional across the
  registry: a readiness failure shuts down the failing instance and every
  earlier ready instance in reverse startup order, while each adapter remains
  responsible for making its shutdown idempotent.
- `kubeclaw.runtime-dispatch`: bounded dispatch-protocol extraction complete.
  It owns target-scoped endpoint selection, closed JSON and byte/depth bounds,
  idempotency, strict response validation, confidential HMAC authentication,
  nested cancellation, shutdown, real local-server integration, and a journal
  scan proving raw secrets are absent. It is new protocol foundation: legacy
  session spawn, monitor, transcript, handoff, termination, and recovery
  remain explicit blockers rather than being misreported as parity.
- `kubeclaw.openclaw-agent-events`: event-source extraction complete. It owns
  the supported hook allowlist, identity normalization, source-side bounded
  metadata projection before durable journaling, serialized emission, failure
  accounting, status, transactional subscription rollback, teardown, and
  package boundary tests. A real journal regression test proves raw hook
  prompts, credentials, and tokens are absent. The
  dual-host OpenClaw plugin remains the concrete host contract; preventing
  duplicate source activation remains a final system E2E assertion.
- `kubeclaw.agent-observability`: both `ingester` and `evidence` observer
  registrations are extracted. They own a shared bounded/redacted event
  projection while retaining independent grants and checkpoints. A real
  observer-runtime test proves telemetry/artifact effects, two independent
  checkpoints, duplicate-drain suppression, and secret absence.
- `kubeclaw.notification-observer`: both `notifications` and
  `preview-delivery` are extracted. Lifecycle presentation and bounded preview
  metadata are package-owned; arbitrary artifact bodies are not forwarded.
  A real observer-runtime/local-HTTP test proves independent checkpoints,
  duplicate suppression, authenticated operator delivery, and secret absence.
- `kubeclaw.architecture-validator`: deterministic protocol extraction
  complete. It owns instruction construction, a closed response parser,
  contradiction checks, result reduction, and immutable reports. Its local
  runtime test traverses real v2 dispatch and artifact adapters without
  spawning an agent; actual architecture judgment remains final E2E evidence.
- `kubeclaw.blueprint-sync`: deterministic repository synchronization
  extraction complete. It owns blueprint/control-path validation, missing-file
  remediation, state and artifact reporting, and scoped commit orchestration.
  The Git adapter owns exact `ref:path` materialization and validates roots,
  refs, paths, cancellation, and changed files. A real disposable-repository
  test executes the stage through the v2 runner and verifies checkout, commit,
  state, and artifact effects without an agent spawn.
- `kubeclaw.implementation-agent`: deterministic Forge attempt protocol
  extraction complete. It owns request identity, strict completion parsing,
  stale-attempt and contradiction rejection, canonical result reduction, and
  immutable completion evidence. A local authenticated runtime-dispatch test
  executes through the real v2 runner without spawning an agent. Repository
  diff verification, lifecycle monitoring, transcript/handoff evidence,
  rate-limit handling, termination, and recovery remain explicit parity
  blockers.
- `kubeclaw.pipeline-review`: deterministic post-run review protocol extraction
  complete. It owns evidence-pinned requests, run/attempt correlation, a closed
  five-dimension report, strict parsing, and immutable report evidence. Its
  local authenticated runtime test uses the real v2 runner without agent
  spawning. Reviewer judgment, transcripts, no-output retry, rate-limit
  recovery, presentation, and full non-critical failure parity remain blocked.
- `kubeclaw.project-summary`: deterministic summary extraction complete. The
  package no longer dispatches an agent; it owns a closed facts contract,
  aggregate validation, stable metric calculation, Markdown rendering, and
  immutable JSON evidence. A real v2 runner/artifact-store test passes.
  Repository and Git census, lifecycle fact collection, latest-pointer
  publication, operator presentation, and the split from core terminal
  evidence remain explicit parity blockers.
- `kubeclaw.case-study`: grounded narrative protocol extraction complete. It
  owns a bounded fact contract, no-fabrication instructions, project/run
  correlation, a strict six-section Markdown validator, and immutable accepted
  output. A real local authenticated dispatch test passes without an agent
  spawn. Writer judgment, source-artifact factuality, lifecycle/transcript
  handling, file watching, rate-limit recovery, and presentation remain final
  parity blockers.
- `kubeclaw.test-agent`: bounded post-suite Buster judgment protocol extraction
  complete. It owns suite-evidence input, run/task/attempt correlation, strict
  PASS/FAIL parsing, contradiction checks, result reduction, and immutable
  verdict evidence. The real local v2 dispatch test spawns no agent.
  Deterministic suites, queues, Git/deployment/browser tooling, leases,
  cleanup, signaling, session lifecycle, transcripts, rate limits, and
  recovery remain explicitly outside this narrow extraction.
- `kubeclaw.buster-quality-gate`: Nova-owned quality-decision protocol
  extraction complete. The package was moved from the Buster bundle to the
  consuming Nova bundle and now owns run/gate/attempt correlation, a closed
  failure-class registry, contradiction checks, finding normalization,
  canonical result reduction, and immutable evaluation evidence. Its local
  authenticated dispatch test spawns no agent. Buster task publication,
  completion races/recovery, active sessions, fix/retest orchestration,
  transcripts, and full suite execution remain system parity blockers.

### Phase 9: Remaining Concrete Plugins And Adapters

Status: **complete for package parity**. Six migration units are
`parity-proven`; v1 remains production authority until the Phase 12 atomic
cutover. Observer migration remains Phase 10 and restricted external package
execution remains Phase 11.

The per-extension reuse/refactor/rewrite decisions, architecture assessment,
behavioral contracts, test plans, and missing target packages are recorded in
[`plugin-system-phase9-extension-assessment.md`](plugin-system-phase9-extension-assessment.md).
Implementation findings and atomic batch history are recorded in
[`plugin-system-phase9-changelog.md`](plugin-system-phase9-changelog.md).
The completed decisions remain summarized in the assessment and changelog;
their migration-only machine ledger was retired at cutover.

- [x] Migrate remaining deterministic validators one ownership boundary at a time.
- [x] Migrate generators and reporting stages.
- [x] Migrate review, approval, and Buster decision stages.
- [x] Migrate Forge implementation behavior.
- [x] Migrate Buster testing behavior.
- [x] Migrate Git capability adapters.
- [x] Migrate runtime-dispatch capability adapters.
- [x] Migrate Redis/state capability adapters.
- [x] Migrate operator/orchestrator messaging capability adapters.
- [x] Migrate every other inventoried privileged effect to its canonical adapter.
- [x] Verify package completeness, grants, denials, results, timeout, cancellation, crash, recovery, idempotency, replay, revocation, uninstall, and replacement for every package.
- [x] Record every superseded implementation and contract for deletion during the Phase 12 atomic cutover.
- [x] Close every Phase 9 parity blocker; final deletion-ledger closure remains a Phase 12 release condition.
- [x] Prove the v2 core has no concrete-plugin imports; repository-wide legacy absence remains a Phase 12 release condition.
- [x] Add or update package-local documentation for every migrated stage and adapter; superseded v1 documentation is removed at cutover.
- [x] Pass the Phase 9 verification gate.

### Phase 10: Observer Delivery And Observer Packages

Status: **complete for observer parity**. The observability-and-notifications
migration unit is parity-proven. V1 callback and presentation paths remain
recorded for deletion in the Phase 12 atomic authority cutover; they are not a
second v2 authority.

- [x] Implement immutable subscriptions over canonical lifecycle and plugin-domain events.
- [x] Implement at-least-once journal delivery.
- [x] Preserve stable event identity and ordering within a run.
- [x] Implement replay checkpoints and deterministic redelivery.
- [x] Define best-effort observer failure behavior.
- [x] Define required-audit-sink failure behavior.
- [x] Enforce observer-specific grants, contexts, revocation, and checkpoints.
- [x] Require sink idempotency for externally visible effects.
- [x] Migrate notification observers.
- [x] Migrate telemetry observers.
- [x] Migrate audit observers.
- [x] Migrate dashboard and reporting projections into canonical telemetry and notification feeds; no separate privileged dashboard plugin exists.
- [x] Record every legacy hook family, notification path, observer bridge, test, fixture, and document for Phase 12 deletion.
- [x] Prove observers cannot return scheduler results or mutate lifecycle state.
- [x] Close every observer parity blocker; final deletion-ledger closure remains a Phase 12 release condition.
- [x] Document observer subscriptions, delivery guarantees, checkpoints, idempotency, failure modes, audit-sink policy, and package operation.
- [x] Pass the Phase 10 verification gate.

### Phase 11: Isolated External Plugin Runtime

Status: **complete**.

- [x] Define the isolated invocation protocol.
- [x] Implement operator-controlled staged and transactional installation.
- [x] Reject project-controlled installation roots and trust expansion.
- [x] Reject package-controlled install and lifecycle scripts on the trusted host.
- [x] Isolate required package builds and verify produced artifacts before activation.
- [x] Keep ordinary locked dependencies private to each package.
- [x] Verify canonical source, package digest, and publisher trust evidence.
- [x] Enforce effective grants at the process, worker, container, or operating-system boundary.
- [x] Restrict filesystem, environment, network, subprocess, CPU, memory, and wall time.
- [x] Propagate cancellation and report plugin crashes without crashing core.
- [x] Prevent direct access to core state and credentials.
- [x] Add malicious, malformed, tampered, and unauthenticated-package tests.
- [x] Prove failed installation or activation cannot leave partial runtime state.
- [x] Enable restricted/external discovery only after every isolation gate passes.
- [x] Document installation, provenance verification, trust policy, isolation guarantees, resource limits, failure behavior, and security limitations.
- [x] Pass the Phase 11 verification gate.

### Phase 12: Final Deletion And Release Gate

Status: **complete**. V2 is the sole runtime authority; v1 source, workers,
tests, fixtures, deployment surfaces, and compatibility paths are absent.

- [x] Atomically switch every production registry consumer from v1 to the frozen v2 registry.
- [x] Convert production configuration to platform-owned roots, trust, providers, grants, and registration configuration.
- [x] Reject v1 manifests before any executable import.
- [x] Close all deletion ledgers and remove bridges, aliases, fallbacks, and dormant replacement paths.
- [x] Prove fixed plugin kinds, executable manifests, concrete scheduler branches, and privileged core escape hatches are absent.
- [x] Remove superseded tests, fixtures, examples, generated artifacts, configuration, documentation, and the Buster worker image.
- [x] Run core, SDK, package, observer, adapter, graph, lifecycle, replay, recovery, cancellation, concurrency, security, and malicious-package suites.
- [x] Run clean install, pinned resume, uninstall, replacement, deduplication, transactional activation, state replay, revocation, locking, readiness, and shutdown scenarios.
- [x] Verify side-effect-free discovery/import and project-authority denial.
- [x] Replace migration inventory controls with the permanent manifest-derived inventory.
- [x] Publish the implemented architecture, operator guidance, plugin-author guidance, migration notes, security model, and troubleshooting reference.
- [x] Prove core starts with zero plugins, imports zero concrete plugins, grants per registration, and alone commits lifecycle transitions.
- [x] Prove every plugin is removable from its own directory and no v1 contract is accepted, importable, configurable, or executable.
- [x] Pass the final release gate and real OpenClaw-backed end-to-end harness.

## Phase 2 Preflight Audit

The phase sequence was re-audited after the accepted Pi-derived architecture decisions. No foundational contradiction remains. The audit incorporated the following requirements into the delivery phases:

- inert discovery and side-effect-free executable-module import are separate verified properties
- package, registration, and invocation boundaries retain separate identity, authority, and failure semantics
- provenance, trust evidence, canonical source identity, content digest, and exact-code recovery are explicit contracts
- capability resolution applies independently to stage, observer, and adapter registrations rather than only to stages
- plugin-local durable entries and observer checkpoints are append-only, replayable, and digest-pinned
- observer delivery is implemented before observer packages are migrated
- adapter readiness, resource locking, cancellation, receipts, and idempotent shutdown are verified explicitly
- configuration ownership is enforced: core owns platform policy, pipeline configuration selects registered types, registrations own their configuration schemas, and secret values are capability-resolved references
- project configuration cannot install packages, add roots, establish trust, or expand grants
- external activation requires both byte integrity and authenticated/allowlisted provenance

The remaining Phase 2 work is contract design, not unresolved architecture. Exact field names, identifier grammars, schema composition, reason-code namespaces, and protocol envelopes must now be selected once, tested, and frozen before runtime implementation.

## Phase 1: Ownership Inventory

Create a generated or mechanically checked inventory of:

- every current built-in stage and its implementation entrypoint
- prompts, schemas, config fields, fixtures, tests, docs, adapters, and artifacts used by each behavior
- every import from concrete behavior into core
- every concrete Forge, Buster, gate, validator, or generator branch in scheduler/lifecycle code
- every direct filesystem, Git, Redis, runtime, network, secret, command, notification, and telemetry side effect
- every current result producer and consumer

Classify each file or exported symbol as:

```text
core
plugin-sdk
plugin:<target-package-id>
adapter:<capability-id>
shared-library:<library-id>
delete
```

Exit criteria:

- every concrete runtime file has one target owner
- all cross-boundary imports and privileged effects are visible
- the reference plugin choice is confirmed from evidence

Reference plugin decision: delivery lint is confirmed. It is deterministic, has meaningful `passed`, `request_fix`, and `blocked` outcomes, and exercises repository reads plus artifact output without requiring agent dispatch or human waits. It will be extracted as the single-stage `kubeclaw.delivery-lint` package; pre-check and full-lint are not implicitly bundled with it.

## Phase 2: Canonical Contracts

Status: canonical schemas implemented and frozen; runtime enforcement belongs to Phases 3–7.

Define and test:

- `PluginManifest`
- `PackageIdentity`, `PackageProvenance`, and `PackageTrustEvidence`
- `RegistrationIdentity` and `RegistrationProvenance`
- `StageRegistration`
- `ObserverRegistration`
- `AdapterRegistration`
- `StageDefinition`
- `StageAttempt`
- `PluginContext` and revocable `InvocationLease`
- `StageResult`
- `ArtifactRef`
- `EffectRequest` and `EffectReceipt`
- `WaitRequest` and `ResumeSignal`
- `PluginStateEntry`
- `ObserverDelivery` and `ObserverCheckpoint`
- adapter readiness, health, cancellation, lock, receipt, and shutdown envelopes
- canonical lifecycle events and registration-local event envelopes
- core, pipeline, registration, grant, and secret-reference configuration boundaries
- canonical lifecycle and reason-code envelopes

The inert `plugin.json` manifest uses one shape:

```json
{
  "id": "acme.example",
  "apiVersion": "pipeline-plugin-v2",
  "packageVersion": "1.0.0",
  "stages": [{
    "type": "acme.example-stage",
    "module": "./src/stages/example.ts",
    "export": "execute",
    "requiredCapabilities": ["state.read"],
    "configSchema": "./schemas/example-config.json",
    "inputSchema": "./schemas/example-input.json",
    "resultSchema": "./schemas/example-result.json"
  }],
  "observers": [],
  "adapters": []
}
```

Every result variant has an exact schema and lifecycle mapping. Observer and adapter registrations have explicit identity, subscription/provision, authority, ordering, error, timeout, replay/readiness, cancellation, and shutdown contracts. Package provenance is core-generated rather than accepted from executable plugin code. Durable entries identify their package digest and registration owner. The contract rejects executable manifests, `needs_nova`, `action_required`, package-level capabilities, optional undeclared authority, fixed plugin kinds, fixed hook families, and hardcoded built-in stage-ID allowlists.

The new manifest API version is `pipeline-plugin-v2`. The cutover rejects existing `pipeline-plugin-v1` manifests; core does not adapt or load both versions.

The authoritative schema uses JSON Schema 2020-12 with closed protocol objects and explicit discriminators. It includes both contract groups: execution records plus provenance, leases/contexts, events, observer delivery/checkpoints, adapter lifecycle/locks, and plugin state. State-aware invariants that JSON Schema cannot prove—such as registration-ID uniqueness, graph acyclicity, remediation-target existence, timestamp ordering, issuer authorization, sequence monotonicity, fencing-token progression, and effect/receipt correlation—must fail through registry or journal validation and receive dedicated tests in the implementing phase.

Exit criteria:

- contract tests cover every valid result and invalid cross-variant field
- unsupported versions and legacy fields fail validation
- no contract contains Forge, Buster, worker, gate, validator, or generator dispatch semantics
- every package, registration, attempt, effect, wait, signal, event, checkpoint, and state entry has an unambiguous stable identity
- configuration and trust schemas cannot grant authority from project-controlled configuration
- registration contracts cannot inherit or union sibling-registration capabilities
- discovery tests prove that parsing and validation import no plugin executable module

## Phase 3: Core And SDK Structure

Status: complete as a structural boundary; all behavioral migration units
remain `baseline-retained`.

Create the target directories:

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
        effects/
        telemetry/
        packages/
      sdk/
      contracts/
    plugins/
  nova/
    plugins/
  buster/
    plugins/
```

Move only genuinely generic code into core or SDK. Do not move current mixed files wholesale when they contain concrete behavior.

Add dependency rules:

- core local imports may resolve only within core, SDK, canonical contracts, or
  an explicitly approved shared-runtime library; the rest of `skills/common`
  is not implicitly trusted
- SDK local imports may resolve only within SDK or canonical contracts and
  cannot import core runtime internals
- plugins may import only the SDK and declared ordinary libraries
- plugins cannot import sibling plugins through relative paths, deep imports,
  or package names
- role-owned packages cannot escape their declared role plugin package
- shared packages cannot import Nova- or Buster-owned runtime code

Exit criteria:

- empty-plugin startup loads core without broken imports
- architecture checks fail on prohibited imports
- SDK types and testing helpers can be consumed without core internals
- the Nova and Buster bundle packager materializes the relocated foundation at
  `/app/skills` without missing files, undeclared collisions, or broken imports
- required role entrypoints and skill manifests remain present
- every package is classified as shared, Nova-owned, or Buster-owned
- candidate packages with incomplete behavior remain explicitly
  non-authoritative and cannot satisfy a unit parity gate

The former role-agnostic pipeline and plugin scaffolding roots have been fully
relocated. Those roots no longer exist. Their absence is intentional; the
canonical source and deployment boundary is the role-aware `skills/` tree.
- v2 plugin packages cannot use relative imports to escape their own package
- zero-plugin startup creates a frozen empty registry without concrete imports

## Phase 4: Generic Registry And Discovery

Implement:

- configured plugin installation roots
- inert `plugin.json` loading without executing package code
- canonical source identity and real-path deduplication
- core-generated package and registration provenance
- package identity, API version, package version, and digest validation
- globally namespaced plugin IDs and stage types
- exactly one owner per configured stage type
- explicit observer subscriptions and adapter-provider registrations
- startup-frozen registry snapshots recorded with each run
- fail-closed package loading and integrity behavior
- activation only after complete discovery, validation, grant resolution, and registry freeze
- side-effect-free import verification for trusted first-party executable modules
- explicit registration activation, readiness, cancellation, and idempotent shutdown
- platform-owned installation roots, trust policy, grants, and adapter selection
- registration-owned configuration validation without core interpretation of plugin fields

Prepare the canonical registry without creating a second runtime authority.
After Phases 5–11 prove complete behavior, Phase 12 performs one atomic
authority cutover that:

- convert every active built-in definition to `stages[]`
- convert grant configuration and context assembly to stage registrations
- update all registry consumers and tests
- delete kind, hook-family, fixed-stage-ID, and package-capability contract paths
- close the registry deletion ledger and prove every v1 manifest producer, consumer, parser, fixture, and configuration field is absent

Until that final cutover, v1 remains the only active production runtime and v2
is exercised through its explicit verification harness. No v2 registration may
claim behavioral parity merely because it is discoverable or activatable.

Phase 4 preparation exit criteria:

- the v2 registry accepts only registration-local required capabilities
- the v2 registry contains no branch dispatching by worker/gate/validator/generator kind
- duplicate, missing, legacy, or ambiguous ownership fails startup
- alternate source spellings and symlinks cannot load the same package twice or bypass policy
- a failing package cannot register only a subset of its registrations
- importing plugin executable modules is impossible during discovery
- importing a trusted first-party executable registration cannot open sockets, spawn processes, start timers, access the network, or mutate external state
- project configuration cannot install code, add roots, establish trust, select an uninstalled provider, or expand a registration's grants

## Phase 5: Capability Runtime And Adapters

Define the initial closed capability vocabulary and constrained grant schemas. At minimum inventory:

- state and artifact reads/writes
- runtime dispatch
- Git repository/workspace/commit/merge operations
- signal wait and resume
- operator/orchestrator request
- telemetry/event emission
- secrets
- network and command execution where unavoidable

Implement:

- required, granted, and available resolution per registration, with complete required-set coverage
- per-resource constraints
- stage-invocation, observer-delivery, and adapter-lifecycle bounded contexts
- revocation of contexts after completion, timeout, cancellation, or ownership loss
- denial tests for every capability
- exactly one configured adapter per required capability in runtime scope
- audit events for every privileged operation
- dependency and cycle validation for adapter provisioning

Core-only authority remains ungrantable:

```text
lifecycle.write
scheduler.advance
canonical_events.modify
registry.mutate
```

Exit criteria:

- sibling stages in one package cannot receive each other's grants
- stage, observer, and adapter registrations in one package cannot inherit sibling authority
- late asynchronous capability calls fail after context revocation
- direct privileged imports in trusted first-party packages fail dependency/compliance verification
- denied or missing required capabilities fail before execution
- adapter-provider ambiguity and provisioning cycles fail startup deterministically

## Phase 6: Generic Graph And Lifecycle Cutover

Replace module/gate-specific scheduling authority with:

- a validated frozen graph
- generic readiness and dependency evaluation
- immutable stage-attempt identity
- generic timeout, cancellation, concurrency, and budget policy
- exact result-to-transition mapping
- declared remediation paths
- durable waits and signals

Graph rules:

- ordinary dependencies form a directed acyclic graph
- fan-out and fan-in are allowed
- a declared remediation edge is a bounded core-owned loop, not arbitrary dynamic graph mutation
- completing remediation schedules a new evaluation attempt
- plugins cannot add nodes or edges during a run

Perform the lifecycle-name cutover atomically:

- replace `needs_nova` with `orchestrator_required`
- remove `action_required` as a plugin-control synonym
- map rejected approval to `blocked`
- update every producer, consumer, projection, event, test, fixture, example, and document
- delete legacy readers and normalizers
- close the lifecycle deletion ledger with negative scans for every superseded name and persisted field

Exit criteria:

- core schedules arbitrary registered stage types
- deleting Forge/Buster plugin packages does not break core imports
- replay reconstructs identical run, stage, attempt, budget, wait, and remediation state

## Phase 7: Durable Effects, Waits, And Recovery

Implement:

- core-issued effect identities and idempotency keys
- `effect.requested`, `effect.accepted`, `effect.completed`, and `effect.failed`
- durable adapter receipts checked before recovery repeats an effect
- typed wait identity, authorized issuer, expiry, duplicate rejection, and stale-signal rejection
- cancellation propagation and cleanup deadlines
- package-version/digest checks on resume
- append-only plugin-local domain entries and replayable projections
- append-only observer checkpoints and deterministic redelivery from the canonical journal
- adapter-owned canonical resource locks for conflicting mutable operations

Exit criteria:

- crash tests cannot duplicate dispatch, Git, notification, or artifact effects
- concurrent valid effects cannot corrupt the same Git workspace, artifact path, or adapter resource
- stale completion and resume signals are rejected
- recovery never reuses an active attempt identity
- plugin projections rebuild identically from the namespaced append-only log

## Phase 8: Reference Self-Contained Plugin

Extract delivery lint into:

```text
skills/
  nova/
    plugins/
      delivery-lint/
        plugin.json
        src/
        schemas/
        tests/
        fixtures/
        docs/
```

The plugin must:

- own all delivery-lint behavior and domain reason codes
- use only SDK contracts and granted capabilities
- return canonical generic results
- own its configuration and artifacts
- pass package-completeness and import-boundary checks
- be removable without breaking core imports

Delete the superseded implementation and built-in bridge in the same cutover.

Exit criteria:

- install, execute, fail, request fix, remove, and replace scenarios pass
- no source file outside the package owns delivery-lint behavior
- the package serves as the template for later extractions
- the delivery-lint deletion ledger has no unresolved producer, consumer, fixture, documentation, or generated-inventory entry

## Phase 9: Migrate Concrete Plugins

Migrate one ownership boundary at a time, deleting each superseded path:

1. Remaining deterministic validators.
2. Generators and reporting stages.
3. Review, approval, and Buster decision stages.
4. Forge implementation behavior.
5. Buster testing behavior.
6. Git, runtime dispatch, Redis, operator messaging, and other capability adapters whose canonical runtime contracts are already active.

Notification, telemetry, audit, dashboard, and reporting observers migrate in Phase 10 after durable observer delivery exists. They must not be moved onto a temporary delivery bridge.

Recommended package boundaries:

- Forge and Buster remain separate.
- Architecture validation remains separate from linting.
- Pre-check, delivery-lint, and full-lint share one lint package only if the inventory proves one inseparable engine and atomic lifecycle.
- Notification and telemetry packages remain observational unless explicitly configured as required audit sinks.

Each migration verifies:

- package completeness
- manifest and schema validity
- an explicit reuse/refactor/rewrite decision based on behavior and complexity,
  never source-shape parity
- legacy-versus-replacement behavioral expectations, with reviewed rationale
  for every intentional difference
- capability grants and denials
- success and every supported control result
- timeout, cancellation, crash, and recovery
- effect idempotency
- no core/internal/cross-plugin imports
- uninstall and replacement behavior
- registration-specific authority when a cohesive package contains more than one surface
- plugin-local state replay and stale-context revocation where applicable
- closure of the package's deletion ledger, including negative proof that its former implementation and contract cannot be reached
- TypeScript tests for TypeScript packages, or tests in the implementation's
  native language otherwise

## Phase 10: Observer Delivery

Implement immutable observer subscriptions over canonical events:

- at-least-once delivery from the journal
- stable event identity and sink idempotency
- ordering within a run
- replay checkpoints
- best-effort default behavior
- explicit required-audit-sink mode that fails closed
- registration-specific capabilities and checkpoints

After the delivery contract and recovery behavior pass their verification gate, migrate notification, telemetry, audit, dashboard, and reporting observers one ownership boundary at a time. Delete each former hook/notification path in the same cutover; do not retain a compatibility event bridge.

Observers cannot return scheduler results or mutate lifecycle state.

Exit criteria:

- sink outage cannot silently lose required audit events
- ordinary notification failure cannot alter scheduler truth
- replay does not duplicate externally visible effects when the sink honors idempotency
- migrated observer packages use only the canonical journal delivery contract
- no legacy hook-family or observer-delivery bridge remains active

## Phase 11: Isolated External Plugin Runtime

Before enabling restricted or external packages:

- define the isolated invocation protocol
- implement operator-controlled, staged, transactional installation
- reject package-controlled lifecycle/install scripts on the trusted host and project-controlled installation roots
- isolate any required build and verify the produced artifact before activation
- keep ordinary locked dependencies private to each package
- enforce effective grants at OS/container/worker boundaries
- verify package provenance and content digest
- require an allowlisted canonical source and digest or verified publisher signature/attestation for external trust
- restrict filesystem, environment, network, subprocess, CPU, memory, and wall time
- provide cancellation and crash reporting
- prohibit direct access to core state and credentials
- test malicious and malformed packages

Exit criteria:

- external plugin code cannot exceed its resolved grants
- a plugin process crash cannot crash core
- package tampering fails startup
- unauthenticated external provenance cannot be treated as trusted
- failed installation or validation cannot leave a partially active package
- restricted/external discovery remains disabled until all checks pass

## Phase 12: Final Deletion And Release Gate

This phase verifies repository-wide absence after the earlier atomic deletions. It must not become a compatibility-removal sprint or justification for retaining stale code through Phases 4–11.

Remove:

- built-in bridges
- fixed plugin kinds and hook families
- fixed stage-ID dictionaries
- package-level capabilities
- executable manifests and load-time side effects
- concrete scheduler branches
- privileged `coreRuntime` escape hatches
- legacy lifecycle names and normalizers
- direct Git/Redis/runtime/notification side effects bypassing capability adapters
- superseded docs, examples, fixtures, and tests

Run:

- unit tests for core, SDK, every package, and every adapter
- graph/lifecycle/replay/recovery contract tests
- security and malicious-plugin tests
- full pipeline E2E matrix
- clean install, upgrade-for-new-run, pinned-resume, uninstall, and replacement scenarios
- package deduplication, transactional activation, append-only plugin-state replay, context revocation, adapter locking, readiness, and shutdown tests
- side-effect-free discovery/import tests and project-configuration authority-escalation tests
- documentation, generated inventory, reference, and deployment verification

Final architecture checks:

```text
core starts with zero plugins
core imports zero concrete plugins
every configured stage type has exactly one frozen owner
every invocation receives only its stage-specific grants
every lifecycle transition is committed by core
every plugin is removable from its own directory
no legacy contract is accepted
```

## Completion Definition

The migration is complete only when current user documentation describes the generic contract as implemented behavior, the planned-status warnings are removed, generated inventory proves package ownership, and no current source or fixture contains a superseded plugin contract.
