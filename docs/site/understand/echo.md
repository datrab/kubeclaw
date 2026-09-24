# Echo: Evidence-Bound Review And Policy Reduction

Status: implemented with explicit model and repository evidence limits
Audience: pipeline operator, Echo maintainer, policy author, security reviewer
Owner: Echo maintainers
Evidence: skills/nova/plugins/review/src; skills/nova/plugins/review/schemas; skills/nova/plugins/review/tests
Evidence revision: `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`
Applies to: review, repository-audit, and repository-revalidation stages
Last verified: source, schema, manifest, and focused test inspection on 2026-09-20

## Purpose And Decision Boundary

Echo examines a fixed repository subject and proposes evidence-backed findings.
Echo does not approve a pipeline and does not change canonical run state. The
review plugin validates Echo's output, verifies evidence, applies a declared
policy, and returns a typed result. Nova applies that result to the lifecycle.

The model can find a defect, but it cannot change the reviewed commit, redefine
the policy, or certify its own output. The source proves this authority split,
but it does not record the historical reason for choosing it. The current
design assessment is an inference: deterministic verification and reduction
make a probabilistic review useful without giving the model lifecycle
authority. The cost is a larger contract, more stored evidence, and more safe
stops when evidence is incomplete. Reconsider the split only if a replacement
keeps immutable subject identity, independent policy ownership, and a
deterministic final decision.

> **Source evidence — three bounded review stages**
>
> [The package registers review, repository audit, and revalidation with read and artifact capabilities only](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/plugin.json#L1-L54).
>
> [The stage resolves policy, prepares evidence, dispatches Echo, verifies output, reduces the decision, and persists the result](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/stage.ts#L1-L28).

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
> [The stage input schema defines task, revision, scope, requirement, evidence, and context bounds](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/schemas/input.schema.json#L1-L35).
>
> [The final report validator binds report identity to revisions, manifest, policy, and bundle digests](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/review-report-contract.ts#L123-L140).

## Review, Repository Audit, And Revalidation

The three stages share policy reduction but do not share one configuration
shape.

| Path | Input and execution | Stage configuration and defaults |
| --- | --- | --- |
| Ordinary `review` | Reviews one declared base/head subject with requirements, evidence, allowed prefixes, and admitted context candidates. It can make one bounded context expansion. | `agent` is required. `profile` defaults to `gate`. `policy` is optional. The semantic and report encodings are fixed optional compatibility selectors. It does not accept repository-audit reviewer identity fields. |
| `repository-audit` | Inventories a repository revision, compiles component and boundary jobs, dispatches jobs with bounded concurrency and retries, verifies selected findings, reduces them, and stores a repository report. Input `grade` defaults to `standard`, `mode` to `execute`, and `scope` to the repository. `plan` stores a plan without model execution; `resume` uses a matching prepared plan. | `agent` and exact `reviewerModel` are required. `reviewerRuntime` defaults to `subagent`, `reviewerAgentId` to `codex`, `reviewerThinking` to `high`, and policy `profile` to `audit`. Model and runtime identity are part of cache and attestation identity. |
| `repository-revalidation` | Reads one digest-bound earlier repository report, freezes the newer revision, and rechecks its confirmed findings against current source. | Uses the repository-audit configuration shape and identity defaults. Input `grade` defaults to `standard`; the baseline report reference is required. |

Repository-audit input owns scale and cost limits. A grade supplies the complete
default profile. Explicit `overrides` then replace named values. They do not
change the runtime target's fixed 900,000-byte, 120,000-input-token,
6,000-output-token, and 128,000-context-token ceilings. Ordinary review instead
uses the limits inside `review-policy.v2`.

> **Source evidence — the paths have distinct configuration contracts**
>
> [The manifest binds ordinary review to one schema and both repository paths to another](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/plugin.json#L5-L50).
>
> [Ordinary review resolves `agent`, the `gate` default, and optional policy](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/stage.ts#L30-L49).
>
> [Repository audit resolves required reviewer identity and its `audit` default](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-audit-stage.ts#L102-L124).
>
> [Repository input resolves grade, mode, scope, and named overrides into a digest](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-review-profile.ts#L322-L357).

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
> [The Echo contract defines assessment, category, priority, scope, change, and evidence values](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/echo-review-contract.ts#L11-L62).
>
> [The same contract defines the complete finding and output records](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/echo-review-contract.ts#L81-L133).
>
> [The generated schema requires evidence for satisfied and violated requirements](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/echo-review-contract.ts#L207-L237).

## Policy And Certification

For ordinary review, the selected profile is `gate` by default. For repository
audit and revalidation it is `audit` by default. `lean` is also valid. The
stage first loads the complete built-in profile. The resolver validates a supplied
`review-policy.v2` as a complete policy. It then replaces the
built-in policy; fields are not deep-merged. There is no per-request policy
override in these stage inputs. The policy controls:

| Area | Decision |
| --- | --- |
| Blocking | Which priorities and categories can block, and whether the defect must be introduced by the diff and have direct evidence. |
| Limits | Proposal, root-cause, bundle, file, context, expansion, and advisory ceilings. |
| Scope | Treatment of outside-scope, unknown-scope, and pre-existing defects. |
| Verification | Which findings need semantic verification and what happens when evidence or a requirement remains unverified. |
| Simplification | Enabled rules, confidence, and recommendation limit. |
| Ranking and follow-up | Stable ordering and disposition of non-blocking work. |
| Governor | Change-size, ownership, and remediation-cycle limits. |

> **Source evidence — policy precedence**
>
> [The resolver validates each candidate and selects the last complete policy: built-in, then settings policy](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/review-policy-resolver.ts#L45-L87).

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

The repository and artifact adapters are the data authorities. Echo receives
only the frozen bundle or compiled job source. `runtime.dispatch` must be
granted for the configured target, `git.repository.read` must admit the subject,
and artifact grants must admit the referenced evidence and report namespace.
Echo has no Git write capability. Reports, prepared plans, cache artifacts, and
revalidation reports are immutable attempt evidence; a later run writes new
artifacts instead of editing them.

## Failure And Recovery

| Condition | Effect | Safe response |
| --- | --- | --- |
| Invalid input or policy | No Echo decision is trusted; integrity issue enters reduction. | Correct the declaration. Do not weaken validation. |
| Bundle or context exceeds a policy limit | Review blocks or requests orchestrator action according to policy. | Narrow declared scope or raise a reviewed policy limit. |
| Echo requests valid extra context | The stage expands only admitted candidates and reruns the bounded semantic flow. | Supply named paths; do not grant arbitrary repository traversal. |
| Echo output is malformed or contradicts evidence | Parsing or verification fails closed. | Preserve evidence and retry only after fixing the target or contract mismatch. |
| Repository changed during review | Subject proof fails. | Freeze a new head and start a new review. |
| Cancellation or interruption reaches an active model dispatch | The stage has no valid final review result; the OpenClaw adapter must reconcile the session effect. | Keep the fixed subject and stored evidence. Start no new attempt until session cleanup is terminal or explicitly unresolved for operator action. |
| Review needs an external decision | Attempt enters the fixed orchestrator wait. | Resume with the authorized signal; do not edit stored report state. |
| Repository job reaches a retry limit, phase budget, cost bound, or wall deadline | The audit fails closed; incomplete work cannot become a complete report. | Preserve the prepared plan and artifacts. Correct the dependency or select a reviewed grade/override, then use the declared resume path. Do not call the model outside the stage. |

## Operation And Diagnosis

For ordinary review, inspect the stage outcome, policy digest, subject digests,
unverified requirements, accepted findings, omitted counts, and any wait
request. For repository audit, also inspect the resolved profile digest,
coverage, job counts, cache hits and misses, dispatch accounting, retry counts,
verification accounting, and completeness record. Stop if the runtime
attestation differs from configured runtime, agent, model, or thinking identity.
Do not interpret a stored `plan` result as an executed review.

When a model call fails, first determine whether the dispatch effect is known.
`EFFECT_OUTCOME_UNRESOLVED` stops repository revalidation retries. Reconcile the
OpenClaw session before a new attempt. Other repository job failures can retry
only within `maxRetries`, the shared phase retry budget, cost budget, and wall
deadline.

> **Source evidence — bounded repository retry**
>
> [Revalidation retries within the configured count but stops on an unresolved external effect](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-revalidation-stage.ts#L184-L213).

## Extension And Verification

Add a category, priority, policy field, or report version only as a coordinated
contract change. Update types, schema generators, parsers, reducer, report
builder, compatibility rules, tests, and this page. Do not add an instruction
only to a prompt; unvalidated prompt behavior is not a product contract.

This coordinated boundary is the implemented design. Its historical selection
reason is not recorded. The current assessment is that one versioned contract
prevents the prompt, parser, reducer, and stored report from assigning different
meanings to the same finding. The cost is a broad change set for a new review
concept. Reconsider it only with a versioned compatibility and migration path.

The package contains focused tests for subject identity, policy profiles,
evidence authority, verification, slicing, clustering, governor decisions,
reports, revalidation, and Echo output. These tests prove deterministic logic.
They do not prove the accuracy of every model judgment. A production review
still needs the fixed repository bytes and the configured runtime target.
