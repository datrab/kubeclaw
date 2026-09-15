# Echo: evidence, decisions, and controlled repair

Status: decision extraction; implementation and live acceptance are separate
Audience: developers, operators, and architecture readers
Owner: review-plugin maintainers
Applies to: source revision `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`
Last verified: 2026-09-15; source inspection, not model execution
Language: English editorial review; full ASD-STE100 verification remains an AP11 gate

## Why these boundaries exist

A review model can find a real problem. It can also cite the wrong version or mistake a suspicion for a defect.
The system must therefore check the evidence before it asks a worker to change code.
Echo proposes findings. The review plugin checks their evidence and applies the selected policy.
Core records the result and controls repair, retry, waiting, and recovery.

This division avoids a second controller hidden inside the review model.
It also has a cost: missing evidence can stop a review even when its proposed finding sounds convincing.
That stop is deliberate. An unverified claim must not become an instruction to repair code.

The original phase documents record design and implementation decisions.
A phase marked complete is not separate proof of operator approval or production acceptance.
Individual approval actors and dates are not recorded for every decision below; they remain unconfirmed.
The table preserves each original ID and its requirement. It does not invent new approvals.
The later rules in the next section qualify the earlier decisions.

## Current rules and replaced intermediate rules

| Earlier rule | Current interpretation and reason |
| --- | --- |
| D-ER-008: consolidate the old PASS/FAIL contract | Historical intermediate step. D-ER-009 and D-ER-029 replace it with structured assessments and proposals. The old parser must not return as a fallback. |
| D-ER-031: no proposal may request repair | Replaced by D-ER4-016–022. Only independently confirmed, eligible findings may request repair. The temporary blanket block is obsolete. |
| D-ER-006 and D-ER-018: preserve resolved policy | D-ER-034 clarifies storage: Core preserves the complete graph configuration. The plugin freezes its resolved policy without a second mutable policy store. |
| D-ER-012/025/032: policy v1; report v1 in phase 7 | Phase 8 adds governor controls in policy v2 and report v2. Current semantic encoding also supports versioned report identities. Preserve each historical version's bytes and hash rules. |
| D-ER-017: authorized run override | The resolver supports an explicitly authorized complete value. This is not evidence that the public stage exposes an arbitrary per-run override. |
| D-ER3-001/004/019: no repository discovery | Phase 9 adds bounded discovery at the same frozen Git revision. Normal review remains focused on the diff. A separate repository-audit registration owns whole-repository review. |
| D-ER3-005/016: one expansion | The focused flow retains one cumulative expansion. Large changes can use deterministic slices, with one merged verification and report. They cannot omit a changed file silently. |
| D-ER4-003: optional separate verifier target | D-ER4-011 selects a fresh invocation on the configured review target. Do not document a second model setting as an exposed capability without source proof. |
| D-ER4-013/015/018: temporary reconciliation and mapping blocks | D-ER4-021 removes these intermediate blocks after the complete private proof chain is established. |
| D-ER4-001/013: transport exceptions belong to Core | Still the general rule. Phase 9 makes one explicit exception: failure to read governor history creates certified invalid state, a report, and a blocked result. |
| PT001–008 simplification rules | Historical proposal. The versioned SIM001–SIM008 registry owns current rule identities. Simplification advice cannot cause automatic repair. |
| Plugin counts its own repair cycles | Replaced by Core-certified remediationCyclesUsed. Retries and repair cycles are different counters. |
| Audit findings can ask Core for repair | Not true for repository-audit. It produces a nonblocking report after complete coverage and verification. The audit itself blocks if its evidence is incomplete. |

## Original phase 2 decisions

These decisions establish authority, policy, and evidence limits.
Their shared reason is to make the same input produce the same bounded decision without trusting model control instructions.
Complete policy replacement avoids hidden values from partial merges.
Fixed trust limits prevent configuration from granting additional authority.

| Original decision | Preserved requirement |
| --- | --- |
| [D-ER-001](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-001-echo-owns-observations-not-lifecycle-verdicts) | Echo reports assessments and proposed findings; it cannot issue lifecycle verdicts or verified identities. |
| [D-ER-002](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-002-the-review-plugin-owns-review-domain-policy) | The plugin owns review contracts, verification, policy, ranking, and reduction to StageResult. |
| [D-ER-003](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-003-core-remains-the-only-lifecycle-authority) | Core alone owns durable attempts, transitions, retries, repairs, waits, and recovery. |
| [D-ER-004](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-004-no-new-review-lifecycle-result-contract) | Reuse StageResult. Review input and policy contracts do not create another lifecycle result. |
| [D-ER-005](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-005-missing-evidence-is-not-a-code-failure) | Distinguish missing evidence, invalid output, verified defects, and repairs outside the permitted scope. |
| [D-ER-006](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-006-policy-is-frozen-per-attempt) | Freeze the complete policy for the attempt. Later configuration needs explicit Core provenance. |
| [D-ER-007](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-007-configuration-cannot-weaken-trust-invariants) | Configuration cannot weaken trust invariants, discard required evidence, or grant lifecycle authority. |
| [D-ER-008](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-008-one-executable-contract-authority) | Consolidate executable contract authority before migration. The old PASS/FAIL implementation is superseded. |
| [D-ER-009](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-009-agent-output-contains-assessments-and-proposals-only) | Accept a closed structured assessment/proposal object. Require complete requirement IDs and cited inspected evidence. |
| [D-ER-010](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-010-agent-relations-remain-claims) | Treat model-authored priority, scope, change relation, and root-cause hints as claims until verified. |
| [D-ER-011](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-011-evidence-references-are-content-addressed) | Identify evidence by kind and digest. Cited evidence must belong to inspected and offered evidence. |
| [D-ER-012](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-012-one-full-declarative-policy-shape) | Use one complete declarative policy shape for files and future UI; lifecycle settings remain Core-owned. |
| [D-ER-013](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-013-configuration-uses-knobs-not-code-paths) | Use bounded typed values and versioned SIM rules. Reject partial policy patches and impossible follow-up capacity. |
| [D-ER-014](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-014-priority-meaning-is-fixed) | Keep P0–P3 meanings fixed. A policy can select blocking priorities but cannot redefine them. |
| [D-ER-015](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-015-trust-invariants-are-stable-and-non-configurable) | Retain mandatory P0 correctness, security, and contract coverage through non-configurable trust invariants. |
| [D-ER-016](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-016-one-hard-limit-authority) | Use one hard-limit authority. Per-attempt configuration may lower limits but cannot raise hard ceilings. |
| [D-ER-017](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-017-complete-policies-replace-by-explicit-precedence) | Resolve complete built-in, settings, then explicitly authorized run values. Validate every supplied source. |
| [D-ER-018](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-018-one-immutable-value-and-canonical-digest-per-attempt) | Freeze resolved value, source history, and digest. D-ER-034 clarifies that no second persistence store is needed. |
| [D-ER-019](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-019-reduction-consumes-verified-plugin-state-only) | Reduce only certified plugin state. Raw model output and a claimed verified marker are insufficient. |
| [D-ER-020](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-020-reduction-returns-the-existing-stageresult) | Return passed, request_fix, blocked, or orchestrator_required through the existing StageResult contract. |
| [D-ER-021](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-021-decision-precedence-is-fixed) | Apply fixed decision precedence. Integrity and missing required evidence cannot be hidden by a clean finding list. |
| [D-ER-022](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-022-insufficient-evidence-is-not-a-verified-finding) | Insufficient evidence is not a verified finding and cannot create a repair request. |
| [D-ER-023](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-023-schema-and-semantic-parser-must-agree) | Check JSON Schema and semantic-parser agreement with the same valid and invalid corpus. |
| [D-ER-024](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-024-plugin-decisions-must-satisfy-the-platform-contract) | Check plugin outcomes against the canonical StageResult schema, including each non-pass path. |
| [D-ER-025](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-025-profiles-are-complete-values-not-code-paths) | Use complete gate, lean, and audit profiles with the same implementation. Profiles do not own retries. |
| [D-ER-026](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-026-evaluation-changes-values-not-implementations) | Evaluate different policy values instead of adding profile-specific reducers or parsers. |
| [D-ER-027](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-027-decisions-expose-comparable-facts) | Publish comparable version, policy, source, verification, and count facts on the appropriate result fields. |
| [D-ER-028](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-028-performance-telemetry-remains-deferred) | Do not invent latency, token, or cost measurements without actual instrumentation and an execution context. |
| [D-ER-029](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-029-the-live-stage-uses-the-review-domain-contract) | Use only the structured review-domain response on the live stage; remove the legacy verdict parser. |
| [D-ER-030](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-030-stage-evidence-is-immutable-and-content-addressed) | Freeze exact evidence and requirements before dispatch. Reject missing, duplicate, unknown, and over-limit data. |
| [D-ER-031](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-031-unverified-proposals-cannot-request-repair) | Historically block unverified proposals during cutover. Semantic verification later replaces this temporary restriction. |
| [D-ER-032](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-032-one-policy-schema-serves-runtime-and-future-ui) | Generate configuration schemas from one TypeScript authority. A future UI must use the same contract. |
| [D-ER-033](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-033-runtime-hashing-uses-the-trusted-sdk-surface) | Use the trusted SDK hash utility rather than privileged Node crypto imports inside the plugin graph. |
| [D-ER-034](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-034-core-freezes-policy-source-plugin-freezes-resolution) | Core freezes graph configuration; the plugin freezes resolution. Recovery checks the original graph identity. |
| [D-ER-035](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-035-review-escalation-names-its-real-issuer) | Use the actual review-specific orchestrator issuer; Core persists and validates the resulting wait. |
| [D-ER-036](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-2-design.md#d-er-036-the-byte-ceiling-applies-before-hashing) | Check bytes and supported JSON shape before allocation and hashing. Raw overflow blocks; valid parsed limit excess can escalate. |

## Original phase 3 decisions

| Original decision | Preserved requirement |
| --- | --- |
| [D-ER3-001](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-001-phase-3-adds-immutable-git-reads-not-repository-discovery) | Read immutable authorized Git data through the existing repository adapter; require an ancestor base and frozen head. |
| [D-ER3-002](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-002-upstream-producers-supply-candidates-review-owns-selection) | Upstream analyzers supply candidate paths and provenance. The plugin selects context; the adapter supplies source bytes. |
| [D-ER3-003](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-003-immutable-revisions-and-normalized-repository-paths-are-mandatory) | Require full immutable revisions and normalized repository-relative paths. |
| [D-ER3-004](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-004-normal-review-receives-no-unrestricted-repository-view) | Keep focused review bounded by file, byte, depth, ownership, and inclusion-reason limits. |
| [D-ER3-005](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-005-one-expansion-is-review-data-not-lifecycle-control) | Permit one structured context expansion; this is review input, not lifecycle control. |
| [D-ER3-006](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-006-the-bundle-is-review-data-not-a-lifecycle-result) | Use a frozen bundle with task, revision, scope, evidence, context, selection, and policy identity; keep its digest outside it. |
| [D-ER3-007](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-007-one-executable-schema-authority) | Generate the bundle schema from TypeScript. Enforce UTF-8 byte and depth limits at the semantic boundary. |
| [D-ER3-008](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-008-semantic-parsing-is-the-bundle-trust-boundary) | Strictly parse and normalize bundle fields, paths, identities, scope, evidence, and limits before freezing. |
| [D-ER3-009](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-009-bundle-identity-is-external-and-reproducible) | Hash normalized frozen content and retain private certification. Equivalent input ordering must not alter identity. |
| [D-ER3-010](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-010-candidate-provenance-is-closed-and-ordered) | Require ordered typed candidate provenance rooted in changed files. Reject cycles, invalid depth, and undeclared relations. |
| [D-ER3-011](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-011-context-limits-are-active-policy-not-reserved-configuration) | Apply active context limits and record why candidates are omitted. Hard ceilings remain fixed. |
| [D-ER3-012](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-012-echo-requests-context-it-does-not-browse) | Accept requests only for known omitted candidates and unverified requirements. Consume the initial selection after expansion. |
| [D-ER3-013](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-013-expansion-is-cumulative-and-uses-reserved-capacity) | Use reserved file and byte capacity for cumulative expansion. Never remove previously supplied context. |
| [D-ER3-014](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-014-repository-proof-precedes-every-echo-dispatch) | Prove the repository manifest and every selected source before dispatch. Missing changed-file context requires orchestration. |
| [D-ER3-015](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-015-the-live-agent-input-is-exactly-one-certified-snapshot) | Dispatch exactly one certified bundle snapshot; callers cannot supply authoritative head, source bytes, or changed paths. |
| [D-ER3-016](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-016-one-expansion-causes-one-newly-proved-redispatch) | Reprove the expanded bundle and redispatch once. Transport failures remain Core-owned. |
| [D-ER3-017](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-017-normal-review-freezes-the-completed-implementation) | Freeze HEAD when review begins, after implementation commits. Keep the attempt-bound HMAC proof private from Echo. |
| [D-ER3-018](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-018-changed-context-is-derived-optional-context-remains-extensible) | Derive changed-file context automatically. Rank and bound optional candidates before reading their source. |
| [D-ER3-019](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-3-design.md#d-er3-019-whole-project-audit-remains-a-separate-authorized-source-mode) | Keep whole-project audit a separate authorized mode; do not widen the normal gate implicitly. |

## Original phase 4 decisions

| Original decision | Preserved requirement |
| --- | --- |
| [D-ER4-001](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-001-runtime-failure-remains-core-retry-authority) | Keep runtime exceptions under Core retry authority; a malformed completed verifier response is an integrity failure. |
| [D-ER4-002](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-002-verification-uses-the-final-echo-bundle) | Verify against the final expanded bundle, never the obsolete first bundle. |
| [D-ER4-003](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-003-independence-does-not-require-a-new-plugin) | Reuse runtime.dispatch with a fresh verifier invocation instead of adding a service or queue. |
| [D-ER4-004](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-004-phase-4-confirms-proposals-not-review-completeness) | Verify eligible proposals only. This verifier does not prove that Echo found every defect. |
| [D-ER4-005](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-005-one-closed-internal-verifier-response) | Require an exact digest-bound result per proposal: confirmed, rejected, or insufficient_evidence. |
| [D-ER4-006](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-006-the-verifier-cannot-rewrite-the-proposal) | The verifier cannot rewrite a proposal, add a finding, or choose a pipeline outcome. |
| [D-ER4-007](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-007-typescript-is-the-schema-authority) | Generate verifier schemas from TypeScript and strictly parse and freeze completed responses. |
| [D-ER4-008](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-008-git-proves-changed-head-line-ranges) | Use bounded changed-head-line ranges from Git. A changed file alone does not prove an introduced defect. |
| [D-ER4-009](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-009-deterministic-facts-replace-echo-relation-claims) | Derive scope and change relation from reviewed locations and line proof, not Echo's claims. |
| [D-ER4-010](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-010-exact-duplicate-collapse-is-mechanical) | Collapse exact proposals by canonical digest, but enforce raw proposal limits before deduplication or repository work. |
| [D-ER4-011](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-011-reuse-one-fresh-runtime-dispatch) | Use one fresh invocation on the configured review target only for eligible proposals. |
| [D-ER4-012](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-012-bind-the-exact-attempt-and-immutable-inputs) | Bind run, stage, attempt, bundle, policy, and proposal set. Reject requests above the 24 MiB hard ceiling. |
| [D-ER4-013](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-013-runtime-failure-is-not-a-verdict) | A transport error is not rejection or uncertainty. Later reconciliation replaces the temporary response block. |
| [D-ER4-014](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-014-reconcile-against-plugin-authored-request-facts) | Require exact response digests, eligible ID set, and offered evidence. Keep verdict classes separate. |
| [D-ER4-015](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-015-failure-and-rejection-remain-different-states) | Missing or mismatched output is integrity failure, not rejection. Clear all unbound verdicts. |
| [D-ER4-016](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-016-only-confirmed-ids-can-create-reducer-findings) | Only reconciled confirmed IDs create certified findings. Insufficient evidence cannot enter this path. |
| [D-ER4-017](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-017-fingerprints-exclude-line-number-hints) | Hash semantic finding content and repository base, excluding line hints. Normalize path/symbol sets before hashing. |
| [D-ER4-018](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-018-repairability-is-bounded-by-frozen-scope) | Require proved scope and reviewed source for repairability. Bind the entire private policy-to-finding proof chain. |
| [D-ER4-019](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-019-every-verifier-mode-controls-live-eligibility) | The configured verifier mode controls eligibility: disabled, p0-only, or all-blockers. |
| [D-ER4-020](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-020-uncertainty-is-a-policy-result-never-a-repair-result) | Route uncertainty through rejection, follow-up, or orchestration. No uncertainty path can request repair. |
| [D-ER4-021](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-021-certified-state-is-the-only-reducer-input) | Remove intermediate blocks only when certified state feeds the complete reducer. A violation without a proposal is invalid. |
| [D-ER4-022](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-022-gate-uncertainty-requires-orchestration) | Gate uncertainty requires orchestration; lean and audit retain it as nonblocking follow-up. |
| [D-ER4-023](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-4-design.md#d-er4-023-evaluation-records-verifier-execution-facts) | Record actual verifier execution identities and verdict counts. Do not fabricate cost or latency measurements. |

## Simplification, shared causes, and reports

A partial source view cannot prove that a symbol is unused everywhere.
Optional analyzer facts must therefore identify the exact base, head, and changed manifest.
Missing or malformed optional facts produce diagnostics, not a correctness blocker.
An internally corrupted certified manifest still blocks the review.

SIM001–SIM008 have fixed versioned meanings.
The miner checks the enabled rule, confidence, reviewed location, and source identity.
It resolves duplicates through a stable source-digest/fact-ID order.
The plugin alone creates the reserved candidate manifest and binds it to its policy and revision.
Expansion rebuilds this manifest for the expanded source set.
Simplification proposals remain advisory, even when a caller tries to bypass the parser.
Phase 9 adds a conservative SIM002 producer for forwarding-only functions.
A wrapper that owns compatibility or policy must be preserved.

A verifier-confirmed stable root-cause slug can group related findings.
A missing or invalid slug creates a separate group for that finding.
The group identity includes the repository base and certified semantic fields, not free text or line hints.
Private proof binds a cause to the exact finding fingerprint.
Integer weights rank groups; fingerprints and group IDs break ties deterministically.

Every verified blocker affects the result before report limits apply.
A short repair batch cannot hide an omitted blocker or change a failure to a pass.
Record omitted groups and instances, and bind the selected set by digest against later mutation.
The advisory limit is the smaller of maxAdvisories and maxRecommendations.
Follow-up limits also retain omitted counts.

Each completed attempt with an established bundle writes one immutable report.
The returned artifact must match namespace, report ID, digest, bytes, run, stage, and attempt.
An invalid write result blocks. Failure after expansion uses the latest established bundle.
If confirmed finding normalization fails, preserve the certified proposal as follow-up; do not invent a repairable finding.
The report uses the existing StageResult attachment, not another controller or result contract.

These choices preserve complete decision evidence while keeping the operator's report usable.
They avoid another database or mutable report ledger. The cost is strict identity checking on every report read and write.

## Repair growth and history

The first completed review records a baseline in its immutable report.
Later repair attempts read it through the exact prior ArtifactRef from Core.
A missing baseline after a repair cannot be replaced by a newly invented baseline.
A history-provider failure becomes certified invalid state and produces a blocked report.
Other transport errors remain Core-owned.

The governor uses Core's remediationCyclesUsed, not the number of attempts.
At this source revision, built-in profiles use two repair cycles, a growth multiplier of two,
an allowance of two additional files, and 100 additional non-test lines.
The effective growth limit is the larger of relative growth and the absolute allowance.
This gives a small change useful room without permitting unlimited growth.
Most-specific ownership prefixes determine owners. Canonical test paths do not consume the non-test line budget.

Scope or ownership excess requires orchestration before the cycle check.
A clean last repair can pass only when it remains within scope.
The governor cannot turn a blocker into a pass or create a new model finding.
It is an earlier policy threshold; Core still owns the hard lifecycle budget.

Source evidence: [built-in governor profile](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-policy-profiles.ts#L56)
sets the limits. [applyReviewGovernor](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-governor-decision.ts#L20-L35)
keeps a result that does not request another repair when only the cycle limit is exhausted.
It separately escalates scope breaches and blocks invalid state. These links support the source behavior;
this documentation recheck did not execute a repair cycle.

## Large changes and repository audits

Frozen reviewed source becomes citeable evidence through its digest.
Every cited location needs the matching source citation and applicable changed-line proof.
Bounded discovery includes imports, callers, tests, contracts, configuration, ownership, and public exports.
Resolve emitted .js imports back to tracked TypeScript where the source rules require it.
Apply a result limit after proving real matches, with a separate scan ceiling.

For a large diff, preserve connected source groups as atomic slices.
If a group or the complete changed set exceeds limits, request orchestration.
Merge slice results once, preserve blocking citations before optional evidence, and create one verifier result and report.

Whole-repository audit is a separate registration.
Its map uses sorted JSONL files, relations, exclusions, slices, and boundary streams with independent counts and digests.
Strongly connected components remain whole. Cut edges need exact endpoint evidence.
Unresolved relations, missing files, overflow, or incomplete jobs block the audit itself.
Component jobs inspect source; boundary jobs inspect exact relation excerpts; holistic jobs inspect bounded system topology.
A topology expansion does not grant arbitrary browsing.

Cache keys bind unit content, policy, protocol, model identity, and evidence version.
An imported cache result must also prove an earlier attempt of the same stage and run.
Corrupt or conflicting cache records block. Missing records execute normally.
A prepared plan can pass to a dependent execute stage in the same run, after identity checks.
Completed results are saved immediately so another failed job does not erase them.

Token budgets use the actual tokenizer, including the final runtime envelope.
The source contract specifies o200k_base, 900,000 prompt bytes, 120,000 input tokens,
128,000 context tokens, and 6,000 output tokens. These are source-version limits, not universal model capacities.
The old byte count presented as tokens is superseded.
Historical cost estimates and million-line compilation timings do not prove live model performance.

Repository audit never requests repair. Its report is nonblocking only when the audit itself has complete evidence.
The older final sentence that suggests P0 audit findings can request repair is superseded by this explicit registration boundary.

## Evidence, implementation, and acceptance

The source files below implement the inspected boundaries.
This extraction does not claim a new run of their package tests or a complete production review.
The historical local HTTP fixtures replace the external model service; they cannot establish model accuracy.
Echo production promotion remains a separate [G15 acceptance gate](../status/acceptance.md#g15).
The old biased clean samples and incomplete paired batches must not be used to claim a promotion percentage.

- [echo-review-governance-implementation-plan.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-governance-implementation-plan.md)
- [echo-review-phase-1-baseline.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-1-baseline.md)
- [echo-review-phase-5-design.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-5-design.md)
- [echo-review-phase-6-design.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-6-design.md)
- [echo-review-phase-7-design.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-7-design.md)
- [echo-review-phase-8-design.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-8-design.md)
- [echo-review-phase-9-hardening.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-phase-9-hardening.md)
- [echo-review-scalability-plan.md](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/architecture/echo-review-scalability-plan.md)
- [review-policy-profiles.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-policy-profiles.ts)
- [review-governor-decision.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-governor-decision.ts)
- [review-governor-history.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-governor-history.ts)
- [review-semantic-flow.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-semantic-flow.ts)
- [review-report-flow.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-report-flow.ts)
- [repository-audit-stage.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/repository-audit-stage.ts)
- [review-semantics.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-semantics.ts)
