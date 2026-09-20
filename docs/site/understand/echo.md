# Echo: Evidence-Bound Review And Policy Reduction

Status: implemented with explicit model and repository evidence limits
Audience: pipeline operator, Echo maintainer, policy author, security reviewer
Owner: Echo maintainers
Evidence: skills/nova/plugins/review/src; skills/nova/plugins/review/schemas; skills/nova/plugins/review/tests
Evidence revision: `5b6e1b97415ffefa4bb42bf2ae331f27597170b5`
Applies to: review, repository-audit, and repository-revalidation stages
Last verified: source, schema, manifest, and focused test inspection on 2026-09-20

## Purpose And Decision Boundary

Echo examines a fixed repository subject and proposes evidence-backed findings.
Echo does not approve a pipeline and does not change canonical run state. The
review plugin validates Echo's output, verifies evidence, applies a declared
policy, and returns a typed result. Nova applies that result to the lifecycle.

This design separates judgment from authority. A model can find a defect, but
it cannot change the reviewed commit, redefine the policy, or certify its own
untrusted output.

> **Source evidence — three bounded review stages**
>
> [The package registers review, repository audit, and revalidation with read and artifact capabilities only](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/plugin.json#L1-L54).
>
> [The stage resolves policy, prepares evidence, dispatches Echo, verifies output, reduces the decision, and persists the result](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/src/stage.ts#L1-L28).

## Fixed Review Subject

The input contains a task, revisions, allowed scope, requirements, evidence,
and context candidates. A revision is either a fixed base or the result of a
named implementation stage. The preparation path resolves the base and head,
builds a changed-file manifest, binds its digest, and freezes the review bundle.

The review subject is therefore not “the current checkout.” It is the tuple of
base revision, head revision, changed-manifest digest, policy digest, bundle
digest, and attempt identity. Later report validation repeats these bindings.
This prevents a report for one diff from being reused for another diff.

The schema allows at most 128 evidence records, 256 requirements, and 4,096
context candidates. Each evidence item has a SHA-256 digest. Context candidates
carry a path, reasons, and dependency depth from 1 through 8.

> **Source evidence — subject admission**
>
> [The stage input schema defines task, revision, scope, requirement, evidence, and context bounds](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/input.schema.json#L1-L35).
>
> [The final report validator binds report identity to revisions, manifest, policy, and bundle digests](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/src/review-report-contract.ts#L123-L140).

## Echo Output

Echo returns `echo-review-output.v1` with:

- a bounded summary;
- the evidence records it inspected;
- one assessment for every required condition;
- proposed findings;
- an optional request for more context.

An assessment is `satisfied`, `violated`, or `unverified`. A satisfied or
violated assessment needs evidence. Findings use categories `correctness`,
`security`, `contract`, `architecture`, or `simplification`, and priorities
`P0` through `P3`. Each finding states claim, impact, location, evidence,
recommended fix, relation to the change, relation to scope, and evidence
strength. Echo must label inferred or insufficient evidence; it cannot present
both as direct evidence.

> **Source evidence — review language is a contract**
>
> [The Echo contract defines all assessment, category, priority, scope, change, and evidence values](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/src/echo-review-contract.ts#L1-L133).
>
> [The generated schema requires evidence for satisfied and violated requirements](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/src/echo-review-contract.ts#L207-L237).

## Policy And Certification

The selected profile is `gate` by default; `lean` and `audit` are also valid.
A supplied `review-policy.v2` can replace profile defaults only after strict
validation. The policy controls:

| Area | Decision |
| --- | --- |
| Blocking | Which priorities and categories can block, and whether the defect must be introduced by the diff and have direct evidence. |
| Limits | Proposal, root-cause, bundle, file, context, expansion, and advisory ceilings. |
| Scope | Treatment of outside-scope, unknown-scope, and pre-existing defects. |
| Verification | Which findings need semantic verification and what happens when evidence or a requirement remains unverified. |
| Simplification | Enabled rules, confidence, and recommendation limit. |
| Ranking and follow-up | Stable ordering and disposition of non-blocking work. |
| Governor | Change-size, ownership, and remediation-cycle limits. |

The plugin creates a certified reduction input under the fixed orchestrator
issuer. Echo cannot create this certificate. The reducer uses only certified
input to produce `passed`, `request_fix`, `blocked`, or
`orchestrator_required`. If human or orchestrator action is required, the stage
can emit an attempt-bound `kubeclaw.review.resolve` wait request.

## Findings, Reports, And Repair

The report keeps accepted items by stable digest key. Each item records its
disposition, origin, priority, category, message, recommended fix, and reason.
Provenance separates verified findings from Echo proposals. Omitted counts are
retained, so a size limit cannot silently look like an empty report.

A blocking finding causes `request_fix` when the resolved policy gives it the
blocking disposition. Nova can start a separate
repair attempt and later run repository revalidation. Revalidation must use the
new fixed revision and the earlier review evidence. It does not mutate the old
report. `orchestrator_required` is a safe stop when policy cannot derive a
decision, evidence is insufficient, ownership is unclear, or a configured
governor limit is reached.

## Failure And Recovery

| Condition | Effect | Safe response |
| --- | --- | --- |
| Invalid input or policy | No Echo decision is trusted; integrity issue enters reduction. | Correct the declaration. Do not weaken validation. |
| Bundle or context exceeds a policy limit | Review blocks or requests orchestrator action according to policy. | Narrow declared scope or raise a reviewed policy limit. |
| Echo requests valid extra context | The stage expands only admitted candidates and reruns the bounded semantic flow. | Supply named paths; do not grant arbitrary repository traversal. |
| Echo output is malformed or contradicts evidence | Parsing or verification fails closed. | Preserve evidence and retry only after fixing the target or contract mismatch. |
| Repository changed during review | Subject proof fails. | Freeze a new head and start a new review. |
| Review needs an external decision | Attempt enters the fixed orchestrator wait. | Resume with the authorized signal; do not edit stored report state. |

## Extension And Verification

Add a category, priority, policy field, or report version only as a coordinated
contract change. Update types, schema generators, parsers, reducer, report
builder, compatibility rules, tests, and this page. Do not add an instruction
only to a prompt; unvalidated prompt behavior is not a product contract.

The package contains focused tests for subject identity, policy profiles,
evidence authority, verification, slicing, clustering, governor decisions,
reports, revalidation, and Echo output. These tests prove deterministic logic.
They do not prove the accuracy of every model judgment. A production review
still needs the fixed repository bytes and the configured runtime target.
