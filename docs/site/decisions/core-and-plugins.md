# Core and plugin decisions

Status: current decisions with individual approval and implementation states

Audience: maintainers, pipeline developers and plugin authors

Owner: KubeClaw maintainers

Evidence: skills/common/plugin-runtime/foundation/registry/build.ts; packaging/runtime/roles/nova.json

Applies to: canonical lifecycle, Worker Core and plugin system v2

Last verified: 2026-09-17 (source inspection; no new runtime or live test execution)

These records define ADR-001–ADR-014. They explain lasting constraints. The test-gate identifiers are `D-001`–`D-119`; they are distinct from product decisions `D01`–`D16`.

Evidence baseline: `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`. The immutable source links below preserve the exact implementation evidence. A source that says it records “agreed decisions” supports agreement, but does not supply a missing date or named approver. This catalogue is not approval evidence. “Unconfirmed” is used where the source has no acceptance label.

The original Plugin System Vision, Test-Gate Design, Runtime Packaging and Plugin Security Model were read completely. Implementation source was inspected selectively at the boundaries described below. Linked test definitions identify applicable checks; they were not all reread or run. Implementation status is assessed separately and is bounded by the stated subsystem. Source inspection and existing test definitions are not a fresh test execution, whole-system completion or live acceptance. Remaining implementation work belongs in the [canonical issue register](../status/open-issues.md); environment acceptance belongs in [acceptance gates](../status/acceptance.md). These records do not create another task register. [Acceptance policy](acceptance.md) preserves D12 and the distinction between local completion and live proof.

The original provider decisions are preserved in [Test-gate decisions](test-gate.md), including accepted defaults, explicit non-goals and migration exceptions. ADR-015–ADR-022 and operational decisions are covered by the other decision pages.

## ADR-001: Core owns canonical lifecycle authority

**Context.** A pipeline can have several agents, providers and transports. Letting each advance its own pipeline state would create conflicting owners during retries and recovery.

**Decision.** Core alone owns the frozen execution graph, scheduling, canonical lifecycle events, retries, remediation, waits, cancellation and terminal closure. Plugins return typed results that passed validation; they never write scheduler state. Plugin-specific phases stay in namespaced domain state. Core validates a graph before a run; remediation follows declared edges. Conditional activation can skip a declared ordinary stage using an immutable ancestor fact, but cannot insert work or redirect a remediation-only target.

**Actual alternatives.** The source rejects a second Testkube workflow authority, plugin-owned pipeline history, and speculative lifecycle policy hooks. Testkube is a design reference, not a runtime dependency.

**Reason and consequences.** One transition authority makes ordering and replay understandable. It requires core-owned generic policies and explicit stages for domain judgments; plugins cannot silently extend the graph. Retry repeats failed execution; request_fix follows a declared repair path. Orchestrator intervention resets neither budget, while blocked requires an audited administrative continuation.

**Approval and provenance.** Test-Gate Design accepts D-001/D-002 on 2026-08-04 and D-087/D-091/D-096 on 2026-08-05. Plugin System Vision states agreement for its finer lifecycle rules. It gives no acceptance date or approver for those details.

**Implementation.** Partial at the complete architectural scope. Current lifecycle reducer, recovery and repair-budget modules implement the canonical state path. This source inspection does not claim acceptance for all connected pipeline flows.

**Evidence.** [skills/nova/core/lifecycle/reducer.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/lifecycle/reducer.ts), [skills/nova/core/lifecycle/recovery.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/lifecycle/recovery.ts), [skills/nova/core/lifecycle/repair-budget.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/lifecycle/repair-budget.ts), [tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs).

**Supersession and related decisions.** Retires plugin-specific core phases and direct plugin lifecycle writes. No identified successor to the core-authority rule. See ADR-010 for waits and ADR-014 for quality policy.

## ADR-002: Use one neutral Worker Core below specialist engines

**Context.** Buster, Prism and future specialists need the same attempt identity, limits, cancellation, logs and recovery mechanics while interpreting different work.

**Decision.** One shared Worker Core executes one immutable specialist attempt. It owns local attempt lifecycle, authenticated claim/ownership checks where applicable, bounded execution, evidence collection, resource accounting and cancellation/cleanup. Specialist engines sit above it; test, design, security, prompts and gate policy do not belong in core. The first implementation is TypeScript/Node, with language-neutral versioned JSON messages.

**Actual alternatives.** D-103 defers a Go host until measurements show need. Separate specialist-specific cores and a second runtime bridge are avoided. Different images remain valid because tools and resources differ.

**Reason and consequences.** Shared mechanics can be fixed once and reused. The protocol must remain small: each field needs a real execution, recovery or proof consumer. A language change must preserve provider, result and evidence contracts. Shared source does not imply one process, image or capacity pool.

**Approval and provenance.** Test-Gate Design D-096–D-104 records acceptance on 2026-08-05. It names no individual approver.

**Implementation.** Partial for the whole distributed-worker vision. Shared core source and Buster/Prism role dependencies exist. Queue topology, worker-loss behavior and actual host containment require their own evidence; role membership alone cannot prove them.

**Evidence.** [skills/worker/core/worker/local-runtime.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/worker/core/worker/local-runtime.ts), [skills/worker/core/worker/native-attempt-executor.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/worker/core/worker/native-attempt-executor.ts), [contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v1.schema.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v1.schema.json), [packaging/runtime/roles/buster.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles/buster.json), [packaging/runtime/roles/prism.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles/prism.json), [tests/verification/contracts/check-pipeline-worker-core-contracts.mts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-pipeline-worker-core-contracts.mts).

**Supersession and related decisions.** Replaces specialist-owned copies of common worker mechanics. D-110 narrows the initial Buster connection to plan jobs; it does not prove rejection of the longer-term shared queue in D-098. See ADR-013.

## ADR-003: Keep Buster test semantics outside Nova and Worker Core

**Context.** Test plans need provider, fixture, dependency, retry and evidence semantics. Neither generic attempt execution nor pipeline orchestration should contain those domain rules.

**Decision.** Buster owns the test-plan engine above Worker Core. Providers perform declared tests or fixture operations and return facts. Suites are immutable declarative composition, not executable schedulers. Nova resolves the required work and owns the canonical pipeline graph; Buster coordinates bounded local attempts without creating a second pipeline authority.

**Actual alternatives.** The sources reject embedding specialist providers in Nova, executable suites, and a second independent test workflow/control plane. Reusable tools live in packages; project tests and suites are data.

**Reason and consequences.** A provider can change without changing Nova or neutral core. The runtime must validate dependencies and typed outputs before execution. Fixtures own preparation and cleanup, not product quality. Independent work can continue after another independent test fails.

**Approval and provenance.** Accepted: Test-Gate Design D-001 (2026-08-04), D-068/D-087/D-091/D-095–D-097 (2026-08-05), D-105 (2026-08-09).

**Implementation.** Partial for the complete test-gate design. Current Buster engine and explicit role package sets establish the source boundary. Complete provider behavior, migration parity and production operation are separate proof scopes.

**Evidence.** [packaging/runtime/roles/nova.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles/nova.json), [packaging/runtime/roles/buster.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles/buster.json), [skills/buster/engine/test-gates/remote-plan-runtime.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/buster/engine/test-gates/remote-plan-runtime.ts), [tests/verification/contracts/check-runtime-package-cutover.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-runtime-package-cutover.mjs).

**Supersession and related decisions.** Supersedes the implicit Common-directory deployment boundary through ADR-012. It preserves D-001 terminology; detailed test choices are retained in [Test-gate decisions](test-gate.md).

## ADR-004: Use plugin system v2 as the sole extension runtime

**Context.** Keeping old and new contracts active after a replacement creates ambiguous authority and requires every future consumer to understand both.

**Decision.** pipeline-plugin-v2 is the incompatible canonical extension contract. A cutover updates all producers, consumers, schemas, configuration, tests, fixtures and active documentation, then deletes superseded paths. v1 manifests, package-wide capabilities, legacy result names and fallback readers must fail rather than be normalized. Deletion is part of each completed cutover.

**Actual alternatives.** The vision explicitly rejects compatibility aliases, dual writes, parallel authority, dormant fallbacks and reusing the v1 identifier for a changed schema. Test-gate D-083/D-095/D-112 allowed a narrowly ledger-controlled bridge only for suites not yet migrated.

**Reason and consequences.** One contract reduces long-term complexity, but cutovers require complete consumer inventories and negative absence checks. A temporary not-yet-migrated suite bridge never authorizes the same successor test and must disappear when migration completes.

**Approval and provenance.** Plugin System Vision states an agreement but gives no approval date or individual approver. Test-Gate Design accepts the bounded suite-migration decisions D-083/D-095 on 2026-08-05. D-112 has no separate acceptance or date label.

**Implementation.** Partial across the complete repository. The v2 registry, contracts, and connected remote-test-gate path exist. This record does not certify every legacy consumer as removed.

**Evidence.** [skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json), [skills/common/plugin-runtime/foundation/registry/schema.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/schema.ts), [skills/nova/plugins/remote-test-gate/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/remote-test-gate/README.md), [tests/verification/contracts/check-plugin-system-v2-phase12.mts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-plugin-system-v2-phase12.mts).

**Supersession and related decisions.** v2 replaces v1 and `needs_nova` with `orchestrator_required`. Historical suite bridge permission is time/suite bounded, not a permanent exception to one authority. D-119 reiterates single gate authority during comparison/cutover.

## ADR-005: Discover inert manifests and freeze exact registrations

**Context.** Importing code merely to discover an extension can execute it before trust or permissions are checked. Mutable selection also makes resumed work non-repeatable.

**Decision.** Discovery parses plugin.json and referenced schemas as data. Core canonicalizes roots and paths, checks provenance, digest, API compatibility, ownership and grants, then freezes the registry. Activation imports only validated selected registration modules. A run pins package ID/version/digest and registration identity; resume requires the same bytes. Installation is operator-controlled, staged and transactional.

**Actual alternatives.** The vision rejects executable convention-based discovery, hot reload inside a run, discovery-order conflict resolution, project-controlled installation and anonymous provenance. A digest proves bytes, not publisher identity; trust additionally needs an allowed source/digest or verified attestation.

**Reason and consequences.** Startup can fail before any plugin work begins. Upgrades affect later runs; exact package bytes must remain available for resume. Private locked dependencies avoid shared mutable roots, and package-controlled install scripts cannot execute on the trusted host.

**Approval and provenance.** Source-attested agreement in Plugin System Vision (date/approver unknown). Frozen provider selection and locked packages are explicitly accepted in Test-Gate Design D-067/D-069/D-081 on 2026-08-05.

**Implementation.** Implemented for the inspected registry substrate. Source inspection does not certify end-to-end installation or every possible external-package deployment.

**Evidence.** [skills/common/plugin-runtime/foundation/registry/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/README.md), [skills/common/plugin-runtime/foundation/registry/discovery.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/discovery.ts), [skills/common/plugin-runtime/foundation/registry/build.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/build.ts), [skills/common/plugin-runtime/foundation/registry/activation.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/activation.ts), [tests/verification/contracts/check-plugin-system-v2-registry.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-plugin-system-v2-registry.mjs).

**Supersession and related decisions.** Supersedes executable metadata loading and implicit load-order choice. Exact role assembly is ADR-012. No identified successor to immutable run selection.

## ADR-006: Use five explicit registration surfaces

**Context.** Stages, notifications, external operations and test/report execution have different contracts. A generic hook bus would hide ordering and authority rules.

**Decision.** The v2 registry distinguishes stages, observers, capability adapters, test providers and report adapters. Stage ownership is exclusive; observers have explicit subscriptions and delivery policy; adapters have an explicitly selected provider and resource lifecycle. Test-provider registrations declare inputs, outputs, schemas and authority. Report adapters normalize declared report formats without deciding gates.

**Actual alternatives.** The vision excludes speculative policy hooks. D-054 rejects package boundaries as the test activation unit; D-090 replaces hardcoded report parsing with registered adapters. Several adapters may be installed for a format, but a resolved plan selects exactly one.

**Reason and consequences.** Each surface needs explicit ordering, failure, timeout, replay and shutdown behavior. Package is the trust/version/removal unit; registration is the contract/permission-request unit; invocation gets effective grants. One stage per package is the default; cohesive multi-registration packages must share ownership, trust and atomic release, with no union of sibling authority.

**Approval and provenance.** Current contracts define the three foundational surfaces. The provider decisions add test providers and report adapters. The combined five-surface ADR records those established boundaries; it does not grant new authority.

**Implementation.** Implemented in the inspected registry: build.ts defines and indexes all five surface types. This structural check does not verify all installed registrations or provider behavior.

**Evidence.** [skills/common/plugin-runtime/foundation/registry/build.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/build.ts), [skills/common/plugin-runtime/foundation/registry/types.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/types.ts), [skills/common/plugin-runtime/foundation/registry/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/README.md).

**Supersession and related decisions.** Extends the earlier three-surface vision with test providers and report adapters. Exact installed counts belong in the generated inventory, not a permanent architectural default.

## ADR-007: Grant bounded capabilities instead of ambient authority

**Context.** A trusted package can expose several unrelated operations. Granting its union of permissions to every invocation would let one registration act with sibling authority.

**Decision.** Core/SDK own the closed capability vocabulary. Each registration declares required capabilities; operator policy grants resource constraints; exactly selected adapters supply them. The full required set must be available and granted or enablement fails. Project configuration cannot install code, expand trust or grant authority. lifecycle.write, scheduler.advance, canonical_events.modify and registry.mutate are never plugin grants.

**Actual alternatives.** The source replaces package-level manifest.capabilities, unrestricted permission booleans and profile-based scheduler authority. It rejects optional requirements that silently degrade the context and dynamically invented privilege names.

**Reason and consequences.** Concrete stage types remain open while privileged operations require an intentional security-contract change. Secret references, path/repository scope, allowed hosts, commands and runtime targets need enforcement in both context and execution boundary. Package trust is not permission.

**Approval and provenance.** Plugin System Vision states an agreement but gives no date or approver. Test-Gate Design D-082 accepts operator-limited provider access on 2026-08-05. The current Plugin Security Model describes implementation, not a separate approval event.

**Implementation.** Implemented in the inspected stage/observer/adapter grant resolver; test providers use their separately resolved plan and isolated execution path. Universal enforcement across every host is outside this verification scope.

**Evidence.** [skills/common/plugin-runtime/foundation/registry/capabilities.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/capabilities.ts), [skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts), [skills/common/plugin-runtime/foundation/registry/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/registry/README.md), [tests/verification/contracts/check-plugin-system-v2-capability-security.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-plugin-system-v2-capability-security.mjs).

**Supersession and related decisions.** Replaces package-wide grants; registration-specific capabilities in ADR-006 remain authoritative. No identified successor.

## ADR-008: Isolate activation and execution according to trust

**Context.** A limited context object does not stop unrestricted process code from accessing files, network or subprocesses directly.

**Decision.** Trusted first-party code activates only after inert discovery, integrity checks and import-side-effect auditing. Restricted/external packages require a real isolated execution boundary covering files, environment, network, processes, time and resources. Invocation leases are revoked at completion/cancellation/timeout/ownership loss; late calls fail. Long-lived resources start through explicit adapter activation, readiness and idempotent shutdown.

**Actual alternatives.** The vision rejects a trust label or context object as isolation proof and rejects restricted packages until isolation exists. The current security model explicitly rejects a V8 heap limit or protocol-only child-pipe test as proof of kernel memory/process containment.

**Reason and consequences.** Deployment must provide the actual Linux/cgroup/UID/GID prerequisites. Native isolation needs delegated cgroup-v2, exact memory-limit readback, swap disabled, an external supervisor and verified group cleanup. Missing prerequisites or cleanup failure fail closed.

**Approval and provenance.** Source-attested agreement in Plugin System Vision (date/approver unknown). Plugin Security Model supplies current implementation constraints; its existence does not establish an additional dated acceptance.

**Implementation.** Partial for the deployed guarantee. The isolated runner and native supervisor implementation exist. Kernel/resource containment remains conditional on a provisioned host and acceptance evidence.

**Evidence.** [skills/common/plugin-runtime/foundation/isolation/runner.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/foundation/isolation/runner.ts), docs/architecture/security-model.md, [tests/verification/contracts/check-plugin-system-v2-isolation.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-plugin-system-v2-isolation.mjs), [tests/verification/contracts/check-plugin-system-v2-isolation-kernel.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-plugin-system-v2-isolation-kernel.mjs).

**Supersession and related decisions.** A configured isolated runner can execute supported external packages. This does not permit arbitrary external code in-process. ADR-007 grants still apply inside isolation.

## ADR-009: Use durable idempotent effects and canonical resource locks

**Context.** A crash after a remote mutation but before local completion can otherwise duplicate that mutation. Concurrent legitimate effects can also corrupt a shared resource.

**Decision.** Core issues stable effect identity and idempotency keys and journals requested, accepted, completed or failed states. Capability adapters execute effects and return durable receipts. Recovery checks the original receipt; an accepted effect without recoverable outcome requires explicit reconciliation rather than blind replay. Canonical resource locks and fencing prevent concurrent conflicting mutations.

**Actual alternatives.** The vision rejects plugin-owned side effects outside the capability path, mutable history and path-spelling-based lock identity. Current effect ownership rejects inferring arbitrary subprocess/HTTP outcome from a missing local receipt.

**Reason and consequences.** Journal and receipt durability are part of correctness, not optional logging. Large results use verified content-addressed sidecars. Lock cleanup remains explicit even when the primary operation fails; lease expiry alone cannot justify taking a resource from an executing owner.

**Approval and provenance.** Source-attested agreement in Plugin System Vision (date/approver unknown). The current effect ownership document records more precise implementation behavior without a separate dated approval.

**Implementation.** Implemented in the inspected effect subsystem. Its durability, receipt, and fencing design is source-backed. No complete crash-and-recovery matrix proves every external adapter receipt implementation.

**Evidence.** [skills/nova/core/effects/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/effects/README.md), [skills/nova/core/effects/coordinator.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/effects/coordinator.ts), [skills/nova/core/effects/journal.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/effects/journal.ts), [skills/nova/core/effects/locks.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/effects/locks.ts).

**Supersession and related decisions.** No identified successor. Reconciles the general recovery promise with the explicit fail-closed case where a remote system cannot return an authoritative receipt.

## ADR-010: Represent waits and approvals as durable typed state

**Context.** Human responses and delayed signals can outlive a process. A process-local promise cannot establish who may resume which attempt after a restart.

**Decision.** A wait records expected signal/condition, identities, authorized issuer and expiry. Core persists and validates signal acceptance, rejects duplicate/stale authority, and resumes with a new attempt identity. Approval maps approved to passed, pending to wait and rejected to blocked. Orchestrator-required means an orchestrating agent must evaluate; it is not automatically a human approval request.

**Actual alternatives.** The source rejects `needs_nova` and `action_required` aliases. It also rejects automatic continuation from blocked and coupling durable waiting to an active process. Architecture and visual approval use the existing wait mechanism instead of another approval system.

**Reason and consequences.** Wait persistence does not itself authorize a response: the wait-store adapter stores intent; core owns expiry, signal authorization and lifecycle resume. Architecture approval is bound to the report and source subject, so changed source/plan cannot reuse old approval. Source-less approval is report-only evidence.

**Approval and provenance.** Source-attested agreement in Plugin System Vision (date/approver unknown). Conditional visual approval is explicitly accepted in Test-Gate Design D-040 on 2026-08-04.

**Implementation.** Implemented in the inspected wait/approval path, with connected transport and recovery acceptance assessed separately. The 60-minute human-approval default is a package setting, not a universal expiry for all waits.

**Evidence.** [skills/common/plugins/wait-store/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugins/wait-store/README.md), [skills/nova/plugins/human-approval/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/human-approval/README.md), [skills/nova/core/lifecycle/wait-request.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/lifecycle/wait-request.ts), [tests/verification/contracts/check-plugin-system-v2-resume.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-plugin-system-v2-resume.mjs).

**Supersession and related decisions.** Replaces process-local waiting and legacy control aliases; no successor to durable typed waits. See ADR-001 for budgets and administrative continuation.

## ADR-011: Observers consume immutable events without lifecycle mutation

**Context.** Notifications and audit presentation must not become a second path for changing pipeline state or inherit stage privileges.

**Decision.** Observers receive immutable canonical events through explicit subscriptions. Each observer owns its delivery policy, attempts, checkpoint namespace and grants. Delivery gets a bounded revocable context. Domain events remain namespaced evidence; core owns run/stage/attempt/effect truth. An explicitly required sink can make delivery a fail-closed condition through its contract, but does not gain scheduler mutation authority.

**Actual alternatives.** The vision rejects a generic event bus with implicit load order or exception semantics. The notification implementation retired the redundant required audit observer and artifact writes; canonical audit is derived from the authoritative journal.

**Reason and consequences.** Display delivery failures and canonical evidence integrity are distinct. Notification shortening must remain marked and retain event identity. Existing runs pinned to the retired audit registration must drain on their original runtime; replay does not need to re-send observer messages to reconstruct audit.

**Approval and provenance.** Source-attested agreement in Plugin System Vision (date/approver unknown). The audit-observer retirement is implementation/source evidence in the notification package; no separate approval date or actor is established.

**Implementation.** Implemented for the inspected observer delivery and notification/audit boundary. This does not claim successful external message delivery or production sink availability.

**Evidence.** [skills/nova/core/telemetry/observer-delivery.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/telemetry/observer-delivery.ts), [skills/nova/core/telemetry/observers.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/telemetry/observers.ts), [skills/common/plugins/notification-observer/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugins/notification-observer/README.md), [tests/verification/contracts/check-plugin-system-v2-phase11.mts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-plugin-system-v2-phase11.mts).

**Supersession and related decisions.** The old requirement for a separate audit observer is retired; journal-derived audit is its replacement. The optional required-sink contract remains distinct from a mandate to reinstall that removed observer.

## ADR-012: Assemble exact role-specific runtime bundles

**Context.** Copying all shared source into every image leaks authority across roles and makes filesystem placement an accidental deployment API.

**Decision.** Runtime package manifests declare contracts/SDK, Nova core, neutral Worker Core, specialist engines and selected plugins separately. A role receives only the resolved declared dependency set. Nova has no worker execution or specialist engine authority; Buster and Prism receive shared Worker Core plus their declared engine. Immutable installed bytes can exist in several images while retaining one source and version.

**Actual alternatives.** D-105 and Runtime Packaging explicitly replace the role-first/Common-second directory overlay. A single all-Common runtime package and role-private imports are rejected.

**Reason and consequences.** The builder must reject missing/undeclared packages, cross-role imports, runtime-path conflicts and digest mismatch. Shared libraries need explicit ownership; dual OpenClaw/pipeline hosts remain one atomic package boundary and cannot use the other manifest to escape package isolation.

**Approval and provenance.** Test-Gate Design D-105 records acceptance on 2026-08-09. Runtime Packaging states implemented and authoritative. The record names no individual approver.

**Implementation.** Implemented for the inspected role manifests and bundle-assembly boundary. Current roles are Nova, Buster and Prism; DeepSec remains a design example until an actual declared role exists. Image build and deployment acceptance are separate.

**Evidence.** [packaging/runtime/roles/nova.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles/nova.json), [packaging/runtime/roles/buster.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles/buster.json), [packaging/runtime/roles/prism.json](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/packaging/runtime/roles/prism.json), [scripts/build-runtime-role-bundle.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/scripts/build-runtime-role-bundle.mjs), [tests/verification/contracts/check-runtime-package-cutover.mjs](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/tests/verification/contracts/check-runtime-package-cutover.mjs).

**Supersession and related decisions.** Supersedes the overlay wording still present in the historical Plugin System Vision target layout. D-105 and exact manifest assembly are the later source-backed direction; do not recreate that overlay.

## ADR-013: Use authenticated durable Nova-to-Buster plan jobs

**Context.** Nova can restart while Buster is executing, and a network timeout does not prove submission failed. Evidence must remain attributable and importable exactly once.

**Decision.** Nova persists one immutable resolved-plan job before submission. Buster durably retains a bounded repository archive or authenticated reference, verifies its digest, and stores results/evidence before completion. Nova reconnects by identity, verifies job/plan/node/attempt/receipt/result/evidence identities and bounded size/digest, copies evidence durably, then performs idempotent authoritative import. The connected gate owns dispatch, reconnect, verification, transfer and policy.

**Actual alternatives.** D-110 chooses replaceable authenticated submit/status/cancel transport first; horizontal durable queue dispatch remains a later option. D-098 describes the broader shared-queue/claim target. Neither fixed Pod addresses nor unverified terminal responses establish pipeline authority.

**Reason and consequences.** Cancellation/timeouts need bounded reconciliation: a 404 can race a previously in-flight submit and is not cancellation proof. Evidence identity and exactly-once authority are separate from successful HTTP delivery. Nova applies blocking/advisory rules only after verified import.

**Approval and provenance.** D-110–D-113 in Test-Gate Design contain decisions but no individual accepted/date labels: approval status unconfirmed, date/approver unknown. Related queue/identity design D-098–D-102 is explicitly accepted on 2026-08-05. Implementation does not silently promote the unlabeled additions to accepted.

**Implementation.** Implemented in the inspected connected dispatch/import source. This is not a fresh end-to-end authenticated service, PostgreSQL or cluster acceptance result.

**Evidence.** [skills/nova/core/test-gates/dispatch-operation.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/test-gates/dispatch-operation.ts), [skills/nova/core/test-gates/remote-dispatch.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/test-gates/remote-dispatch.ts), [skills/nova/core/test-gates/remote-result-import.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/test-gates/remote-result-import.ts), [skills/buster/engine/test-gates/remote-plan-service.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/buster/engine/test-gates/remote-plan-service.ts), [skills/nova/plugins/remote-test-gate/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/remote-test-gate/README.md).

**Supersession and related decisions.** D-110 refines the first transport scope relative to D-098; full withdrawal of the later queue target is not established. The remote-test-gate adapter explicitly does not invoke the historical suite bridge.

## ADR-014: Separate Buster execution evidence from Nova quality judgment

**Context.** Executing a test and deciding whether its evidence permits pipeline progress are different responsibilities. Mixing them gives a specialist pipeline authority.

**Decision.** Buster and providers return typed execution facts and durable artifacts. Nova-owned policy plugins validate completion identity, contradictions, failure classes and results, then apply declared blocking/advisory/review rules. Deterministic failures remain facts; configured agent judgment is separately linked evidence. Report adapters normalize exact declared reports and never replace provider outcomes or make gate decisions.

**Actual alternatives.** D-080 rejects silently rewriting provider/agent results. D-089 rejects a generic expectedFailure conversion; advisory is the explicit nonblocking option. D-111 says clear failed/errored reports do not start an agent; uncertain evidence can only request the agent named in the frozen plan.

**Reason and consequences.** Evidence remains inspectable independently of policy. A passing report cannot override failed execution, and successful execution cannot override failing required evidence. Moving a quality plugin into Nova proves ownership, not completion of task publication, session recovery, fix/retest or transcript behavior.

**Approval and provenance.** Accepted: Test-Gate Design D-080/D-089/D-090 (2026-08-05), D-108/D-109 (2026-08-09), D-115 (2026-08-12). D-111 elaborates import policy but has unconfirmed acceptance/date.

**Implementation.** Partial for the full quality-gate parity scope. The Nova-owned buster-quality-gate protocol implements evaluation boundaries; its README explicitly lists system parity blockers and must not be read as a complete suite execution claim.

**Evidence.** [skills/nova/plugins/buster-quality-gate/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/buster-quality-gate/README.md), [skills/nova/plugins/buster-quality-gate/src/protocol.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/buster-quality-gate/src/protocol.ts), [skills/nova/core/test-gates/remote-result-authority.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/core/test-gates/remote-result-authority.ts), [skills/buster/plugins/junit-report-adapter/README.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/buster/plugins/junit-report-adapter/README.md).

**Supersession and related decisions.** Replaces Buster-owned final pipeline judgment. No identified successor. Exact unit-result and report rules remain separately identifiable as D-108/D-109/D-114–D-118 in [Test-gate decisions](test-gate.md).

## Portable JSON encoding and preserved historical identities

**Context and decision.** Canonical JSON was ordered using localeCompare, so distinct locales could produce different bytes and digests. Composed and decomposed Unicode keys could also compare equal while remaining distinct keys. A global in-place serializer change would silently change existing effect, wait, artifact, worktree and review identities. Use explicit versioned portable encoding for new paths, preserve original historical bytes and select historical verification by recorded format. Never try several codecs until a digest happens to match, normalize distinct keys into one, or silently rehash accepted work.

**Approval and supersession.** The SDK portability plan authorized read and design only. Its proposed new-run/storage epoch was not an approved migration instruction. Current implementation uses **kubeclaw-json.utf16.v1** and explicit encoding choices for new projects. It stores the selections for recovery. D12 records PCR-SDK-001 as locally complete. That closure does not approve every proposed step or authorize a new storage migration.

**Actual alternatives and rationale.** Do not replace historical canonicalJson in place, rewrite journals/blobs/worktrees, or derive old semantic provenance from a guessed locale. UTF-16 code-unit ordering removes locale dependence without claiming full RFC 8785 compliance. Array order and ordinary JSON scalar spelling remain significant. Raw content hashes and independent observability/worker/signature codecs retain their own contracts and must not be resigned or migrated merely because an SDK helper changes. A digest is byte integrity, not an asymmetric signature.

**Implementation and evidence limits.** Source inspection confirms portableJson and its named encoding, retained historical canonicalJson, explicit new-project choices, and original-byte verification before artifact consumption. Local checks cover semantic, historical-reader, and delivery consumers. They do not prove a complete model, browser, or cluster run. One parallel run failed two cases; later serial reruns passed. The initial failure cause remains unknown. Existing Unicode provenance that cannot be verified remains an explicit limitation.

**Pinned sources.** [Codec implementation](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/sdk/src/values.ts), [authenticated artifact bytes](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/common/plugin-runtime/sdk/src/artifact-json.ts), and [new-project selection](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/project/cli.ts). The [evidence policy](acceptance.md#d12--accepted-local-completion-policy) defines the verification limit.

## Integration evidence: asynchronous lint execution

The two historical lint integration logs establish an interface-integration failure, not a separate accepted ADR. Git-based evidence partitioning must await the bounded asynchronous executor; its callers and tests must also await the result and preserve cancellation/failure. The first log fails Git enumeration. Despite its filename, lint-integration-fixed.log also fails: a test compares a Promise with a completed result. Neither is a passing integration proof.

Current source awaits safeExec in evidence-file-partition.ts, and the empty-target test awaits adapter.run before asserting its result. This is a targeted source check, not a newly passing whole-lint run. The lasting consequence under ADR-008 is that moving execution behind an asynchronous bounded boundary requires updating all consumers; a renamed “fixed” log cannot establish completion. No new approval is inferred from these diagnostics.

**Pinned sources.** first failed integration, second failed integration, [awaited Git execution](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/lint/src/engine/evidence-file-partition.ts), [awaited test consumer](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/lint/tests/eslint-type-evidence.test.mjs).
