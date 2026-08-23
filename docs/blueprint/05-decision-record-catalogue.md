# 5. Decision-record catalogue

## Purpose

Decision records retain **why the platform works this way** without retaining phase plans, audit trails, and temporary implementation bookkeeping in the public documentation.

Each target record uses:

- Status: proposed, accepted, superseded, rejected, or deprecated.
- Context and forces.
- Decision.
- Alternatives considered.
- Consequences and trade-offs.
- Current implementation evidence.
- Verification evidence.
- Supersedes/superseded-by relationships.
- Date and release in which the decision became effective.

An accepted record requires current code or contract evidence. A design without implementation remains proposed even if its prose says “accepted.”

## Consolidation catalogue

| Target record | Status at blueprint baseline | Durable decision to preserve | Principal source material | Current evidence or promotion gate |
| --- | --- | --- | --- | --- |
| ADR-001 Core owns canonical lifecycle authority | Accepted | Plugins and specialists return bounded results; core alone advances lifecycle, schedules remediation, manages waits, retries, recovery, and terminal closure. | `plugin-system-vision.md`; lifecycle and engine phase docs | `skills/nova/core/lifecycle/`; `skills/nova/core/execution/`; lifecycle/resume tests |
| ADR-002 Use one neutral Worker Core below specialist engines | Accepted | Attempt lifecycle, capacity, progress, and result mechanics are specialist-neutral. Engine meaning stays above the core. | `pipeline-test-gate-design.md`; worker-core phase audits | `skills/worker/core/`; `contracts/pipeline-worker-core/v1`; worker-core checks |
| ADR-003 Package Buster as the first Worker Core engine | Accepted | Buster owns test-plan meaning and uses Worker Core; Nova does not embed the Buster engine. | test-gate design/implementation/phase docs | role manifests; `skills/buster/engine/`; role-surface checks |
| ADR-004 Use plugin system v2 as the sole extension runtime | Accepted | No legacy fallback or dual authority in production runtime behavior. | plugin-system vision, implementation plan, phase 12 changelog | v2 manifests, role bundles, `verify:plugin-system-v2`, legacy-cutover checks |
| ADR-005 Use inert manifests and frozen registrations | Accepted | Discover metadata without executing plugin code; validate provenance/digest/grants and freeze selection for a run. | plugin-system vision and registry phases | foundation package/registry source and installation/registry/import-safety checks |
| ADR-006 Extend through five registration surfaces | Accepted with unused test-provider slot | Stages, observers, adapters, test providers, and report adapters have distinct contracts and authority. | plugin-system vision; test-gate design | v2 schema and generated manifest inventory |
| ADR-007 Grant capabilities instead of ambient authority | Accepted | Plugins invoke bounded operations through resource-scoped grants; core-only capabilities cannot be granted. | plugin-system vision; security model | capability vocabulary and capability security/runtime checks |
| ADR-008 Isolate plugin activation and execution | Accepted | Plugin code runs behind validated package and sandbox boundaries with controlled imports and capabilities. | plugin-system vision; security model; isolation phases | isolation foundation, sandbox builder, isolation/boundary/import checks |
| ADR-009 Make effects idempotent and durable | Accepted | External effects use stable identity and journals so retry/resume does not duplicate authority-changing work. | plugin-system vision; lifecycle/state docs | Nova effects/state source and lifecycle/resume verification |
| ADR-010 Make waits explicit durable state | Accepted | Human approvals and other signals suspend through typed durable waits rather than process-local blocking. | plugin-system vision; human-approval docs | wait-store and human-approval packages; resume/lifecycle checks |
| ADR-011 Separate observers from lifecycle mutation | Accepted | Observers receive immutable events with bounded delivery policy and cannot modify canonical lifecycle. | plugin-system vision; observer phase docs | observer schema, delivery implementation, phase 11 checks |
| ADR-012 Assemble exact role-specific runtime bundles | Accepted | Nova and Buster receive only owned/shared packages and declared plugins; dependency direction is enforced. | runtime-packaging design and phase audits | packaging manifests, bundle builder, ownership/role/isolation/cutover checks |
| ADR-013 Use authenticated durable Nova-to-Buster plan jobs | Accepted | Nova persists dispatch before submission; Buster persists before execution; results are imported and reconciled by identity/digest. | test-gate design and phase 7 docs | remote dispatch/service/import source and phase 7 checks |
| ADR-014 Keep Buster execution separate from Nova quality judgment | Accepted | Buster supplies execution evidence; Nova-owned policy plugins decide pipeline quality outcomes. | test-gate design; Buster quality-gate extraction docs | Buster suite adapter and Nova `buster-quality-gate` package/tests |
| ADR-015 Make observability delivery durable and reconcilable | Accepted | Producer records, closures, outbox/admission, attempts, and Nova reconciliation form the observability foundation. | observability foundation and phase 5.7 audits | `contracts/pipeline-observability/v1`; foundation/Nova observability source and checks |
| ADR-016 Version telemetry as schema-governed events | Accepted | Event envelopes, payloads, correlation, and bundles are generated from a versioned catalogue. | observability and telemetry design material | `contracts/telemetry/v1`; telemetry generator and contract checks |
| ADR-017 Dispatch Forge as a bounded implementation specialist | Accepted, parity boundaries must be documented | Forge is called through the implementation-agent protocol; returned agent output is validated and is not direct lifecycle authority. | plugin-system implementation notes; implementation-agent README | plugin manifest/source/tests; runtime-dispatch adapter; Nova configuration |
| ADR-018 Govern Echo proposals with deterministic evidence and policy | In implementation; do not mark accepted until conflicts and tests close | Echo proposes assessments; plugin-owned verification, frozen policy, reduction, reports, and governor decide effects. Echo cannot emit pipeline PASS/FAIL. | Echo phase designs/plans and review README | current `skills/nova/plugins/review/` source/tests after merge resolution and full package verification |
| ADR-019 Keep Prism above Worker Core without Prism types in core | Proposed | Prism engine contracts fit the neutral specialist envelope; Worker Core must not import Prism policy/types. | Prism architecture, design contract, baseline documents | Promote only when engine package, role manifest, verification, and deployment exist |
| ADR-020 Distinguish runtime roles, engines, and dispatched specialists | Accepted by current packaging | Nova/Buster are packaged roles; Buster is an engine; Forge/Echo are dispatched specialists; Prism is designed only. | scattered deployment/architecture prose | role/package inventory and plugin manifests |
| ADR-021 Use source-backed documentation with generated facts | Proposed by this blueprint | Human prose owns explanation; code-derived inventories own exhaustive facts; release-pinned evidence links prove claims. | current docs generators/checks and this blueprint | Promote when the new generator, site build, coverage checks, and publication gate run in CI |
| ADR-022 Replace static vectors with accessible data-driven HTML architecture views | Proposed by this blueprint | One canonical architecture data model renders interactive and no-script accessible views instead of hand-maintained SVG facts. | existing SVG diagrams and user requirement | Promote after visual reference lock, implementation, accessibility tests, and parity checks |

## Source-document handling

The catalogue is intentionally thematic. Hundreds of phase-local decision IDs can collapse into one durable record when they implemented the same lasting constraint. During extraction:

1. Parse existing decision ledgers and headings.
2. Group entries by lasting platform constraint.
3. Discard task sequencing and temporary phase state.
4. Verify the resulting decision against current code.
5. Record alternatives only when the source explains a real rejected option.
6. Mark the record proposed if current implementation does not prove it.
7. Add source-document rows to the migration ledger completion proof.

## Publication policy

- Accepted decisions may appear in public `/decisions` and be linked from “Why it works this way.”
- Proposed decisions are clearly labeled and live under designed/not-implemented navigation.
- Superseded records remain reachable for link stability but never describe current behavior.
- Internal deliberation, conversational notes, review logs, and phase checklists are not published.
- Security-sensitive rationale may have a public summary and a restricted internal record.

## Completion test

Before an old design/plan/audit document is deleted, every durable decision it contains must map to a target record above, a new target record, or an explicit “not durable” ledger note. Accepted status must have implementation and verification evidence.
