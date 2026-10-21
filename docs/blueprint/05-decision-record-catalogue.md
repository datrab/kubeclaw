# 5. Decision preservation

Status: AP02 extraction catalogue; individual decision records are completed in AP04.

## Acceptance is not implementation

A decision can be accepted and not yet implemented. Conversely, code can exist without an explicitly accepted architecture decision. Record these facts separately. Do not demote an accepted decision to “proposed” merely because a test is pending, or promote a proposal because code happens to match it.

Each durable record contains ID/title, context, decision, actual alternatives from the source, rationale, consequences, acceptance status and source/date, implementation status/evidence, verification scope, remaining work and supersession links. Use unknown/unconfirmed when approval cannot be established. Never invent a past approval, rejected option, date or owner.

Acceptance states: proposed, accepted, superseded, rejected. Implementation states: not started, partial, implemented, retired. Verification is recorded independently under artifact 4. A local finding closure does not mean the entire associated architectural goal is complete.

## Candidate catalogue

Preserve the existing ADR identifiers during extraction. The following are themes to verify, not 22 newly approved decisions. Earlier “Accepted”, “Proposed” or “in implementation” labels were mixed with code status and must be checked against original decision sources in AP04. Historical labels remain recoverable in Git; they are not current approval evidence.

| Candidate | Reasoning to preserve | Original source family | Evidence to check |
| --- | --- | --- | --- |
| ADR-001 Core owns canonical lifecycle authority | Plugins and specialists return bounded results; core alone advances lifecycle, schedules remediation, manages waits, retries, recovery, and terminal closure. | `plugin-system-vision.md`; lifecycle and engine phase docs | `skills/nova/core/lifecycle/`; `skills/nova/core/execution/`; lifecycle/resume tests |
| ADR-002 Use one neutral Worker Core below specialist engines | Attempt lifecycle, capacity, progress, and result mechanics are specialist-neutral. Engine meaning stays above the core. | `pipeline-test-gate-design.md`; worker-core phase audits | `skills/worker/core/`; `contracts/pipeline-worker-core/v1`; worker-core checks |
| ADR-003 Separate Buster test semantics from Nova orchestration | Buster owns test-plan meaning and uses Worker Core; Nova does not embed the Buster engine. | test-gate design/implementation/phase docs | role manifests; `skills/buster/engine/`; role-surface checks |
| ADR-004 Use plugin system v2 as the sole extension runtime | No legacy fallback or dual authority in production runtime behavior. | plugin-system vision, implementation plan, phase 12 changelog | v2 manifests, role bundles, `verify:plugin-system-v2`, legacy-cutover checks |
| ADR-005 Use inert manifests and frozen registrations | Discover metadata without executing plugin code; validate provenance/digest/grants and freeze selection for a run. | plugin-system vision and registry phases | foundation package/registry source and installation/registry/import-safety checks |
| ADR-006 Extend through five registration surfaces | Stages, observers, adapters, test providers, and report adapters have distinct contracts and authority. | plugin-system vision; test-gate design | Current v2 schema and all 67 registrations, including 19 test-provider registrations |
| ADR-007 Grant capabilities instead of ambient authority | Plugins invoke bounded operations through resource-scoped grants; core-only capabilities cannot be granted. | plugin-system vision; security model | capability vocabulary and capability security/runtime checks |
| ADR-008 Isolate plugin activation and execution | Plugin code runs behind validated package and sandbox boundaries with controlled imports and capabilities. | plugin-system vision; security model; isolation phases | isolation foundation, sandbox builder, isolation/boundary/import checks |
| ADR-009 Make effects idempotent and durable | External effects use stable identity and journals so retry/resume does not duplicate authority-changing work. | plugin-system vision; lifecycle/state docs | Nova effects/state source and lifecycle/resume verification |
| ADR-010 Make waits explicit durable state | Human approvals and other signals suspend through typed durable waits rather than process-local blocking. | plugin-system vision; human-approval docs | wait-store and human-approval packages; resume/lifecycle checks |
| ADR-011 Separate observers from lifecycle mutation | Observers receive immutable events with bounded delivery policy and cannot modify canonical lifecycle. | plugin-system vision; observer phase docs | observer schema, delivery implementation, phase 11 checks |
| ADR-012 Assemble exact role-specific runtime bundles | Assemble declared role-specific packages and plugins for Nova, Buster and Prism; enforce dependency direction. | runtime-packaging design and phase audits | packaging manifests, bundle builder, ownership/role/isolation/cutover checks |
| ADR-013 Use authenticated durable Nova-to-Buster plan jobs | Nova persists dispatch before submission; Buster persists before execution; results are imported and reconciled by identity/digest. | test-gate design and phase 7 docs | remote dispatch/service/import source and phase 7 checks |
| ADR-014 Keep Buster execution separate from Nova quality judgment | Buster supplies execution evidence; Nova-owned policy plugins decide pipeline quality outcomes. | test-gate design; Buster quality-gate extraction docs | Buster suite adapter and Nova `buster-quality-gate` package/tests |
| ADR-015 Make observability delivery durable and reconcilable | Producer records, closures, outbox/admission, attempts, and Nova reconciliation form the observability foundation. | observability foundation and phase 5.7 audits | `contracts/pipeline-observability/v1`; foundation/Nova observability source and checks |
| ADR-016 Version telemetry as schema-governed events | Event envelopes, payloads, correlation, and bundles are generated from a versioned catalogue. | observability and telemetry design material | `contracts/telemetry/v1`; telemetry generator and contract checks |
| ADR-017 Dispatch Forge as a bounded implementation specialist | Forge is called through the implementation-agent protocol; returned agent output is validated and is not direct lifecycle authority. | plugin-system implementation notes; implementation-agent README | plugin manifest/source/tests; runtime-dispatch adapter; Nova configuration |
| ADR-018 Govern Echo proposals with deterministic evidence and policy | Echo proposes assessments; plugin-owned verification, frozen policy, reduction, reports, and governor decide effects. Echo cannot emit pipeline PASS/FAIL. | Echo phase designs/plans and review README | Current review implementation and applicable tests; do not retain stale merge-conflict prerequisites |
| ADR-019 Keep Prism above Worker Core without Prism types in core | Prism engine contracts fit the neutral specialist envelope; Worker Core must not import Prism policy/types. | Prism architecture, design contract, baseline documents | Prism source, role manifest and applicable worker/integration evidence; implementation and live status assessed separately |
| ADR-020 Distinguish runtime roles, engines, and dispatched specialists | Nova, Buster and Prism have runtime-role manifests; distinguish role, engine, dispatched specialist, host extension and actual activation. | scattered deployment/architecture prose | role/package inventory and plugin manifests |
| ADR-021 Use source-backed documentation with generated facts | Human prose owns explanation; code-derived inventories own exhaustive facts; release-pinned evidence links prove claims. | current docs generators/checks and this blueprint | Current docs tools plus verified AP09 changes; do not infer editorial approval from CI status |
| ADR-022 Architecture visualization approach | Preserve source reasoning for interactive architecture views, but assess them as optional presentation work; accurate SVG or Mermaid is allowed. | existing SVG diagrams and user requirement | Existing diagrams and explicit user requirements; no reference-lock or HTML rewrite prerequisite |

Also inspect durable reasoning about local completion versus live acceptance (D12), two repair attempts and escalation, one-week demo retention, canonical configuration/version ownership, recovery consistency, and the supported operations access path. These are extraction candidates from existing decisions and instructions, not new defaults imposed by this catalogue. Preserve existing IDs or map them explicitly to the eventual records; do not collapse different rules merely because they share a topic.

## Extraction method

1. Read the original document and relevant explicit decisions completely.
2. Identify the lasting constraint, its original authority and whether it is still intended.
3. Group duplicate explanations of the same decision; preserve distinct trade-offs and relevant supersession.
4. Compare with current implementation. Record gaps as gaps rather than rewriting the original intent.
5. Write a concise standalone record. Retain only real alternatives and useful rationale.
6. Link every source document's migration row to the resulting record, or explain why its content is not a durable decision.
7. Move open implementation/verification tasks to their canonical registers, not into a second task list inside every ADR.

## Publication and removal

Current accepted decisions may be linked from the explanation they support. Clearly labeled proposals explain intended future behavior without promising availability. Superseded records may remain when their rationale is useful; keep them concise and linked to the successor, not as duplicate current guidance. Do not publish raw conversations, phase logs or obsolete review reports.

Before removing a source, every lasting decision must have a record or an explicit disposition. The migration ledger preserves source-to-decision mapping. Acceptance verification and implementation verification are different checks; both must be recorded accurately.
