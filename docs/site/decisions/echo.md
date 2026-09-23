# Echo: evidence, decisions, and controlled repair

Status: current decisions; implementation and live acceptance are separate
Audience: developers, operators, and architecture readers
Owner: review-plugin maintainers
Evidence: skills/nova/plugins/review/src/review-policy-profiles.ts; skills/nova/plugins/review/src/review-governor-decision.ts; skills/nova/plugins/review/src/repository-audit-stage.ts
Applies to: source revision `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`
Last verified: 2026-09-15; no model execution result is available

## Why these boundaries exist

A review model can find a real problem. It can also cite the wrong version or mistake a suspicion for a defect.
The system must therefore check the evidence before it asks a worker to change code.
Echo proposes findings. The review plugin checks their evidence and applies the selected policy.
Core records the result and controls repair, retry, waiting, and recovery.

This division avoids a second controller hidden inside the review model.
It also has a cost: missing evidence can stop a review even when its proposed finding sounds convincing.
That stop is deliberate. An unverified claim must not become an instruction to repair code.

## Grouped Record Contract

The original Echo source contains many small decisions that share one context,
reason, and implementation boundary. The tables below retain each stable ID and
its exact requirement. The following group records supply the fields that those
rows share. This avoids repeating the same explanation for every ID without
removing its identity.

| Decision group | Context and selected approach | Recorded alternatives | Consequences | Approval | Implementation and verification | Supersession |
| --- | --- | --- | --- | --- | --- | --- |
| Authority and policy | A model can propose findings but cannot own lifecycle truth. The plugin verifies evidence and applies one frozen policy. | Model-owned verdicts, partial policy merges, and configurable trust limits are rejected. | Missing required evidence stops or escalates the review. This costs execution time but prevents unsupported repair. | The retained source describes these as agreed rules but names no individual approver or approval date. | The policy, parser, reducer, and report implement the bounded paths described here. No model or production execution result is available. | D-ER-009 and D-ER-029 replace D-ER-008. D-ER-034 clarifies D-ER-006 and D-ER-018. |
| Evidence verification | Echo receives a bounded, immutable source bundle. Independent code verifies paths, revisions, scope, and cited evidence. | Unbounded repository access, model-supplied authoritative source, and repeated expansion are rejected. | Review input becomes reproducible. Limits can require orchestration when safe evidence does not fit. | The retained source gives no separate approver or approval date for this group. | Bundle construction and semantic verification exist. A complete production review result is not available. | The hardened discovery rules qualify the earlier no-discovery rules. Large-change slicing qualifies the earlier single-expansion rule. |
| Governor and repair | Only independently confirmed and eligible findings can request repair. Core retains lifecycle and repair-budget authority. | Trusting Echo's verdict, allowing a verifier to rewrite findings, and treating transport failure as rejection are rejected. | The proof chain is longer, but uncertainty cannot silently mutate source. | The retained source gives no separate approver or approval date for this group. | Governor, verification, reduction, and history source exist. Live model quality remains an acceptance gate. | D-ER4-016–022 replace the temporary repair prohibition and reconciliation blocks. |
| Simplification and reporting | Optional simplification facts and grouped causes can improve a report but cannot create authority. | Automatic repair from advisory simplification and a second mutable report database are rejected. | Reports remain bounded and useful while every blocker still affects the result. | The retained source gives no separate approval event for this editorial group. | Current source implements inspected rule, grouping, and report paths. This page does not claim model-accuracy proof. | SIM001–SIM008 replace PT001–008. Current report identity rules replace earlier report-v1 assumptions where stated. |
| Repair history | Core-certified remediation cycles and the immutable prior report control repair growth. | Attempt count as a repair counter and a fabricated replacement baseline are rejected. | A missing or corrupt history blocks instead of resetting the budget. | The source records the rule without a named approver or separate date. | The governor history contains the required state. No live repair-cycle result is available. | Core-certified `remediationCyclesUsed` replaces plugin-owned cycle counting. |
| Large changes and audit | Large reviews use deterministic slices. Whole-repository audit is a separate non-repairing registration. | Silent file omission, arbitrary browsing, and audit-triggered repair are rejected. | Complete evidence needs more planning and can require orchestration for oversized connected groups. | The retained source gives no separate approver or approval date for this group. | Repository-audit source exists. Production model performance and completeness remain unverified. | The separate audit registration replaces the earlier implication that audit findings can request repair. |

The records below preserve stable decision IDs and their current requirements.
Implementation does not by itself prove operator approval or production acceptance.
The current rules in the next section replace intermediate rules explicitly.

## Current rules and replaced intermediate rules

| Earlier rule | Current interpretation and reason |
| --- | --- |
| D-ER-008: consolidate the old PASS/FAIL contract | Historical intermediate step. D-ER-009 and D-ER-029 replace it with structured assessments and proposals. The old parser must not return as a fallback. |
| D-ER-031: no proposal may request repair | Replaced by D-ER4-016–022. Only independently confirmed, eligible findings may request repair. The temporary blanket block is obsolete. |
| D-ER-006 and D-ER-018: preserve resolved policy | D-ER-034 clarifies storage: Core preserves the complete graph configuration. The plugin freezes its resolved policy without a second mutable policy store. |
| D-ER-012/025/032: policy v1 and report v1 | Policy v2 and report v2 add governor controls. Current semantic encoding also supports versioned report identities. Preserve each stored version's bytes and hash rules. |
| D-ER-017: authorized run override | The resolver supports an explicitly authorized complete value. This is not evidence that the public stage exposes an arbitrary per-run override. |
| D-ER3-001/004/019: no repository discovery | The hardened design adds bounded discovery at the same frozen Git revision. Normal review remains focused on the diff. A separate repository-audit registration owns whole-repository review. |
| D-ER3-005/016: one expansion | The focused flow retains one cumulative expansion. Large changes can use deterministic slices, with one merged verification and report. They cannot omit a changed file silently. |
| D-ER4-003: optional separate verifier target | D-ER4-011 selects a fresh invocation on the configured review target. Do not document a second model setting as an exposed capability without source proof. |
| D-ER4-013/015/018: temporary reconciliation and mapping blocks | D-ER4-021 removes these intermediate blocks after the complete private proof chain is established. |
| D-ER4-001/013: transport exceptions belong to Core | Still the general rule. One explicit exception exists: failure to read governor history creates certified invalid state, a report, and a blocked result. |
| PT001–008 simplification rules | Historical proposal. The versioned SIM001–SIM008 registry owns current rule identities. Simplification advice cannot cause automatic repair. |
| Plugin counts its own repair cycles | Replaced by Core-certified remediationCyclesUsed. Retries and repair cycles are different counters. |
| Audit findings can ask Core for repair | Not true for repository-audit. It produces a nonblocking report after complete coverage and verification. The audit itself blocks if its evidence is incomplete. |

## Authority and Policy Decisions

These decisions establish authority, policy, and evidence limits.
Their shared reason is to make the same input produce the same bounded decision without trusting model control instructions.
Complete policy replacement avoids hidden values from partial merges.
Fixed trust limits prevent configuration from granting additional authority.

| Original decision | Preserved requirement |
| --- | --- |
| D-ER-001 | Echo reports assessments and proposed findings; it cannot issue lifecycle verdicts or verified identities. |
| D-ER-002 | The plugin owns review contracts, verification, policy, ranking, and reduction to StageResult. |
| D-ER-003 | Core alone owns durable attempts, transitions, retries, repairs, waits, and recovery. |
| D-ER-004 | Reuse StageResult. Review input and policy contracts do not create another lifecycle result. |
| D-ER-005 | Distinguish missing evidence, invalid output, verified defects, and repairs outside the permitted scope. |
| D-ER-006 | Freeze the complete policy for the attempt. Later configuration needs explicit Core provenance. |
| D-ER-007 | Configuration cannot weaken trust invariants, discard required evidence, or grant lifecycle authority. |
| D-ER-008 | Consolidate executable contract authority before migration. The old PASS/FAIL implementation is superseded. |
| D-ER-009 | Accept a closed structured assessment/proposal object. Require complete requirement IDs and cited inspected evidence. |
| D-ER-010 | Treat model-authored priority, scope, change relation, and root-cause hints as claims until verified. |
| D-ER-011 | Identify evidence by kind and digest. Cited evidence must belong to inspected and offered evidence. |
| D-ER-012 | Use one complete declarative policy shape for files and future UI; lifecycle settings remain Core-owned. |
| D-ER-013 | Use bounded typed values and versioned SIM rules. Reject partial policy patches and impossible follow-up capacity. |
| D-ER-014 | Keep P0–P3 meanings fixed. A policy can select blocking priorities but cannot redefine them. |
| D-ER-015 | Retain mandatory P0 correctness, security, and contract coverage through non-configurable trust invariants. |
| D-ER-016 | Use one hard-limit authority. Per-attempt configuration may lower limits but cannot raise hard ceilings. |
| D-ER-017 | Resolve complete built-in, settings, then explicitly authorized run values. Validate every supplied source. |
| D-ER-018 | Freeze resolved value, source history, and digest. D-ER-034 clarifies that no second persistence store is needed. |
| D-ER-019 | Reduce only certified plugin state. Raw model output and a claimed verified marker are insufficient. |
| D-ER-020 | Return passed, request_fix, blocked, or orchestrator_required through the existing StageResult contract. |
| D-ER-021 | Apply fixed decision precedence. Integrity and missing required evidence cannot be hidden by a clean finding list. |
| D-ER-022 | Insufficient evidence is not a verified finding and cannot create a repair request. |
| D-ER-023 | Check JSON Schema and semantic-parser agreement with the same valid and invalid corpus. |
| D-ER-024 | Check plugin outcomes against the canonical StageResult schema, including each non-pass path. |
| D-ER-025 | Use complete gate, lean, and audit profiles with the same implementation. Profiles do not own retries. |
| D-ER-026 | Evaluate different policy values instead of adding profile-specific reducers or parsers. |
| D-ER-027 | Publish comparable version, policy, source, verification, and count facts on their specified result fields. |
| D-ER-028 | Do not invent latency, token, or cost measurements without actual instrumentation and an execution context. |
| D-ER-029 | Use only the structured review-domain response on the live stage; remove the legacy verdict parser. |
| D-ER-030 | Freeze exact evidence and requirements before dispatch. Reject missing, duplicate, unknown, and over-limit data. |
| D-ER-031 | Historically block unverified proposals during cutover. Semantic verification later replaces this temporary restriction. |
| D-ER-032 | Generate configuration schemas from one TypeScript authority. A future UI must use the same contract. |
| D-ER-033 | Use the trusted SDK hash utility rather than privileged Node crypto imports inside the plugin graph. |
| D-ER-034 | Core freezes graph configuration; the plugin freezes resolution. Recovery checks the original graph identity. |
| D-ER-035 | Use the actual review-specific orchestrator issuer; Core persists and validates the resulting wait. |
| D-ER-036 | Check bytes and supported JSON shape before allocation and hashing. Raw overflow blocks; valid parsed limit excess can escalate. |

## Evidence Verification Decisions

| Original decision | Preserved requirement |
| --- | --- |
| D-ER3-001 | Read immutable authorized Git data through the existing repository adapter; require an ancestor base and frozen head. |
| D-ER3-002 | Upstream analyzers supply candidate paths and provenance. The plugin selects context; the adapter supplies source bytes. |
| D-ER3-003 | Require full immutable revisions and normalized repository-relative paths. |
| D-ER3-004 | Keep focused review bounded by file, byte, depth, ownership, and inclusion-reason limits. |
| D-ER3-005 | Permit one structured context expansion; this is review input, not lifecycle control. |
| D-ER3-006 | Use a frozen bundle with task, revision, scope, evidence, context, selection, and policy identity; keep its digest outside it. |
| D-ER3-007 | Generate the bundle schema from TypeScript. Enforce UTF-8 byte and depth limits at the semantic boundary. |
| D-ER3-008 | Strictly parse and normalize bundle fields, paths, identities, scope, evidence, and limits before freezing. |
| D-ER3-009 | Hash normalized frozen content and retain private certification. Equivalent input ordering must not alter identity. |
| D-ER3-010 | Require ordered typed candidate provenance rooted in changed files. Reject cycles, invalid depth, and undeclared relations. |
| D-ER3-011 | Apply active context limits and record why candidates are omitted. Hard ceilings remain fixed. |
| D-ER3-012 | Accept requests only for known omitted candidates and unverified requirements. Consume the initial selection after expansion. |
| D-ER3-013 | Use reserved file and byte capacity for cumulative expansion. Never remove previously supplied context. |
| D-ER3-014 | Prove the repository manifest and every selected source before dispatch. Missing changed-file context requires orchestration. |
| D-ER3-015 | Dispatch exactly one certified bundle snapshot; callers cannot supply authoritative head, source bytes, or changed paths. |
| D-ER3-016 | Reprove the expanded bundle and redispatch once. Transport failures remain Core-owned. |
| D-ER3-017 | Freeze HEAD when review begins, after implementation commits. Keep the attempt-bound HMAC proof private from Echo. |
| D-ER3-018 | Derive changed-file context automatically. Rank and bound optional candidates before reading their source. |
| D-ER3-019 | Keep whole-project audit a separate authorized mode; do not widen the normal gate implicitly. |

## Governor and Repair Decisions

| Original decision | Preserved requirement |
| --- | --- |
| D-ER4-001 | Keep runtime exceptions under Core retry authority; a malformed completed verifier response is an integrity failure. |
| D-ER4-002 | Verify against the final expanded bundle, never the obsolete first bundle. |
| D-ER4-003 | Reuse runtime.dispatch with a fresh verifier invocation instead of adding a service or queue. |
| D-ER4-004 | Verify eligible proposals only. This verifier does not prove that Echo found every defect. |
| D-ER4-005 | Require an exact digest-bound result per proposal: confirmed, rejected, or insufficient_evidence. |
| D-ER4-006 | The verifier cannot rewrite a proposal, add a finding, or choose a pipeline outcome. |
| D-ER4-007 | Generate verifier schemas from TypeScript and strictly parse and freeze completed responses. |
| D-ER4-008 | Use bounded changed-head-line ranges from Git. A changed file alone does not prove an introduced defect. |
| D-ER4-009 | Derive scope and change relation from reviewed locations and line proof, not Echo's claims. |
| D-ER4-010 | Collapse exact proposals by canonical digest, but enforce raw proposal limits before deduplication or repository work. |
| D-ER4-011 | Use one fresh invocation on the configured review target only for eligible proposals. |
| D-ER4-012 | Bind run, stage, attempt, bundle, policy, and proposal set. Reject requests above the 24 MiB hard ceiling. |
| D-ER4-013 | A transport error is not rejection or uncertainty. Later reconciliation replaces the temporary response block. |
| D-ER4-014 | Require exact response digests, eligible ID set, and offered evidence. Keep verdict classes separate. |
| D-ER4-015 | Missing or mismatched output is integrity failure, not rejection. Clear all unbound verdicts. |
| D-ER4-016 | Only reconciled confirmed IDs create certified findings. Insufficient evidence cannot enter this path. |
| D-ER4-017 | Hash semantic finding content and repository base, excluding line hints. Normalize path/symbol sets before hashing. |
| D-ER4-018 | Require proved scope and reviewed source for repairability. Bind the entire private policy-to-finding proof chain. |
| D-ER4-019 | The configured verifier mode controls eligibility: disabled, p0-only, or all-blockers. |
| D-ER4-020 | Route uncertainty through rejection, follow-up, or orchestration. No uncertainty path can request repair. |
| D-ER4-021 | Remove intermediate blocks only when certified state feeds the complete reducer. A violation without a proposal is invalid. |
| D-ER4-022 | Gate uncertainty requires orchestration; lean and audit retain it as nonblocking follow-up. |
| D-ER4-023 | Record actual verifier execution identities and verdict counts. Do not fabricate cost or latency measurements. |

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
The hardened implementation adds a conservative SIM002 producer for forwarding-only functions.
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
the available evidence does not include an executed repair cycle.

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
Corrupt or conflicting cache records block. A missing record starts a new execution.
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
No new package-test run or complete production review execution is claimed.
The historical local HTTP fixtures replace the external model service; they cannot establish model accuracy.
Echo production promotion remains a separate [product decision](../status/acceptance.md#echo-promotion-as-a-separate-product-decision).
The old biased clean samples and incomplete paired batches must not be used to claim a promotion percentage.

- [review-policy-profiles.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-policy-profiles.ts)
- [review-governor-decision.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-governor-decision.ts)
- [review-governor-history.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-governor-history.ts)
- [review-semantic-flow.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-semantic-flow.ts)
- [review-report-flow.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-report-flow.ts)
- [repository-audit-stage.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/repository-audit-stage.ts)
- [review-semantics.ts](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/skills/nova/plugins/review/src/review-semantics.ts)
