# Echo: Evidence-Bound Review And Policy Reduction

Status: implemented with explicit model and repository evidence limits
Audience: pipeline operator, Echo maintainer, policy author, security reviewer
Owner: Echo maintainers
Evidence: skills/nova/plugins/review/src; skills/nova/plugins/review/schemas; skills/nova/plugins/review/tests; skills/nova/plugins/architecture-validator; skills/nova/plugins/repository-adapter
Evidence revision: `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`
Applies to: review, repository-audit, and repository-revalidation stages; separate `kubeclaw.validate.architecture` package section; repository adapter `kubeclaw.repository-adapter:repository`
Last verified: source, schema, manifest, and focused test inspection on 2026-09-20; added package sections source/test checked 2026-10-21 only; original other-scope verification date unchanged; no new live dependency claim

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
> **Claim:** Review, repository audit and revalidation request read/dispatch/artifact capabilities; Echo does not own lifecycle decisions.
>
> **Implementation:** The registration and ordinary review stage below connect declared authority to the verification/reduction flow.
>
> [The package registers review, repository audit, and revalidation with read and artifact capabilities only](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/plugin.json#L1-L54).
>
> [The stage resolves policy, prepares evidence, dispatches Echo, verifies output, reduces the decision, and persists the result](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/stage.ts#L1-L28).
>
> **Contract or setting:** The manifest separates the three stage registrations and their required capabilities.
>
> **Test evidence:** [Review dispatch protocol checks](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/tests/protocol.unit.test.mjs#L27-L39) contains bundle, policy and closed-output-contract assertions. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** A valid request contract neither grants Git writes nor proves that model findings are correct.

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
> **Claim:** Review reports bind their identity to fixed revisions and manifest, policy and bundle digests.
>
> **Implementation:** The schema and report validator below define subject admission and report identity.
>
> [The stage input schema defines task, revision, scope, requirement, evidence, and context bounds](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/schemas/input.schema.json#L1-L35).
>
> [The final report validator binds report identity to revisions, manifest, policy, and bundle digests](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/review-report-contract.ts#L123-L140).
>
> **Contract or setting:** The input schema bounds declared evidence/context; the report validator requires matching subject digests.
>
> **Test evidence:** [Report identity assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/tests/review-report-contract.unit.test.mjs#L15-L34) contains invalid digest, identity and governor/revision rejection assertions. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** These deterministic checks do not show that the selected repository bytes or every reported finding are semantically correct.

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
> **Claim:** Ordinary review and repository review paths resolve different configuration and profile inputs.
>
> **Implementation:** The manifest, stage configuration readers and repository profile resolver below establish those paths.
>
> [The manifest binds ordinary review to one schema and both repository paths to another](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/plugin.json#L5-L50).
>
> [Ordinary review resolves `agent`, the `gate` default, and optional policy](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/stage.ts#L30-L49).
>
> [Repository audit resolves required reviewer identity and its `audit` default](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-audit-stage.ts#L102-L124).
>
> [Repository input resolves grade, mode, scope, and named overrides into a digest](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-review-profile.ts#L322-L357).
>
> **Contract or setting:** The linked ordinary and repository configuration consumers select their stated defaults; runtime prompt ceilings remain a separate target constraint.
>
> **Test evidence:** [Review policy resolution assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/tests/review-policy-resolver.unit.test.mjs#L7-L34) contains complete-source precedence and stable policy-digest assertions. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** The resolver unit admits an explicitly authorized run override; these stage inputs do not expose that override. No model execution follows from configuration parsing.

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
> **Claim:** Echo assessments and findings use the versioned, evidence-bound output vocabulary.
>
> **Implementation:** The output types and generated schema below define finding and assessment shapes.
>
> [The Echo contract defines assessment, category, priority, scope, change, and evidence values](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/echo-review-contract.ts#L11-L62).
>
> [The same contract defines the complete finding and output records](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/echo-review-contract.ts#L81-L133).
>
> [The generated schema requires evidence for satisfied and violated requirements](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/echo-review-contract.ts#L207-L237).
>
> **Contract or setting:** The linked schema requires evidence for satisfied or violated requirements; a model cannot substitute an unvalidated verdict.
>
> **Test evidence:** [Echo output parser assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/tests/echo-review-output.unit.test.mjs#L69-L109) contains unknown-field, unsafe-path, unsupported-enum, missing-evidence and context-request rejection cases. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** Parsing proves admitted representation, not truth of evidence or correctness of model judgment.

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
> **Claim:** A supplied settings policy replaces the complete built-in policy rather than deep-merging it.
>
> **Implementation:** The resolver below validates candidates and selects the last admitted complete policy.
>
> [The resolver validates each candidate and selects the last complete policy: built-in, then settings policy](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/review-policy-resolver.ts#L45-L87).
>
> **Contract or setting:** The selected review-policy.v2 must satisfy the parser and hard cross-field constraints; stage inputs provide no per-request override.
>
> **Test evidence:** [Policy parser and precedence checks](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/tests/review-policy-resolver.unit.test.mjs#L14-L57) contains selection order, unauthorized-override rejection and hard-ceiling cases. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** The authorized run-override case belongs to the general resolver test, not these stage inputs; policy validity does not certify any review result.

The plugin creates a certified reduction input under the fixed orchestrator
issuer. Echo cannot create this certificate. The reducer uses only certified
input to produce `passed`, `request_fix`, `blocked`, or
`orchestrator_required`. If human or orchestrator action is required, the stage
can emit an attempt-bound `kubeclaw.review.resolve` wait request.

### Bounded Simplification Evidence

The optional fact producer recognizes a narrow lexical pattern in JS/TS files:
a named function, optionally exported or async, that returns a simple or dotted
callee's result, optionally awaited, with the same ordered parameter identifiers.
It masks comments, strings, templates and regular-expression contents first.
Source offsets distinguish same-name wrappers. This is not a general parser or a
proof that removing the wrapper preserves a policy or compatibility boundary.
Default/rest-argument wrappers are not certified as pure forwarding; JSX/TSX is
omitted rather than interpreted as ordinary JavaScript text.

Read omission diagnostics as incomplete evidence, not evidence of no candidates.
`omittedSourceCount` records the omitted JSX/TSX context documents and
`omittedFactCount` records producer truncation. Mining exposes these as
`unsupported_source` and `candidate_limit`; it also reports malformed, wrong-
revision, or out-of-scope evidence. Candidates must match the frozen revision,
reviewed paths, enabled rule and minimum confidence. Even an admitted candidate
is advisory syntax evidence, not whole-program semantic equivalence or permission
to refactor automatically.

> **Source evidence — bounded simplification facts**
>
> **Claim:** Forwarding candidates have explicit lexical, scope and omission limits; they do not certify a safe automatic replacement.
>
> **Implementation:** [Forwarding recognition and omission accounting](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/simplification-fact-producer.ts#L15-L61) and [evidence, revision, scope and omission diagnostics](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/simplification-miner.ts#L87-L116).
>
> **Contract or setting:** [Fact identity, omission fields and diagnostic vocabulary](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/simplification-contract.ts#L12-L74). Resolved simplification policy selects enabled rules and confidence; an existing documented boundary can justify keeping a wrapper.
>
> **Test evidence:** [Positive bounded forwarding-producer assertion](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/tests/simplification-fact-producer.unit.test.mjs#L1-L13) was read as Source, not run for this correction. It is not exhaustive proof of unsupported syntax or semantic equivalence.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; each linked whole file matches current Source.
>
> **Limit:** Source-only explanation; no model run, complete language coverage, automatic repair or live result is asserted.

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
> **Claim:** Repository revalidation stops retrying an unresolved dispatch effect rather than treating it as an ordinary transient failure.
>
> **Implementation:** The revalidation retry loop below distinguishes unresolved outcomes from bounded retries.
>
> [Revalidation retries within the configured count but stops on an unresolved external effect](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-revalidation-stage.ts#L184-L213).
>
> **Contract or setting:** Configured retry count and shared phase, cost and wall budgets constrain any admitted retry.
>
> **Test evidence:** [Revalidation source-binding fixture](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/tests/repository-revalidation.unit.test.mjs#L128-L166) contains fixed-current-source dispatch and returned-backlog assertions. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** That fixture uses controlled capability responses and does not prove terminal OpenClaw cleanup or exercise every retry-stop branch.

### Follow-up Selection And Coverage

During repository-audit execution, inspect the separate
`repository-review-follow-up-status.v1` checkpoint artifacts before interpreting
a final report. The `context-expansion` artifact records its requested, selected,
deferred and `reservedInputTokens` counts. The later `verification` artifact
retains those context counts and adds the same accounting for verification.
Requested jobs are the assembled follow-up candidates; selected jobs fit the
remaining phase/total capacity. Deferred jobs were not selected. Reserved input
tokens are budget reservations, not measured provider usage or completed work.

Each status is stored as a digest-bound `kubeclaw.review` checkpoint artifact
before that phase dispatches. The final report carries `followUp`,
`dispatchAccounting`, `usage` and `completeness`, plus references to those status
artifacts in the stage result. A status checkpoint alone does not prove that its
selected jobs completed. Selected review or verification failures block final
report production; deliberate deferral is accounted for separately.

Read `repository-review-completeness.v1` literally: `policy-complete` can mean
that selected work finished while requested context or verification was deferred.
Inspect `allRequestedContextReviewed`, `allRequestedWorkCompleted` and each
phase's `policyDeferred` before claiming full requested coverage. Reduction's
`incompleteJobs` identifies incomplete review work; `unverifiedProposals`
identifies valid proposals left without verification. Neither a plan nor a
successful stage outcome proves that every requested proposal was verified.

> **Source evidence — follow-up checkpoints and coverage**
>
> **Claim:** Follow-up status separates selection/reservation from execution and verification coverage; deliberate deferral is not silently counted as completion.
>
> **Implementation:** [Phase checkpoints and completion guards](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-audit-stage.ts#L388-L461), [digest-bound checkpoint storage](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-audit-stage.ts#L668-L686) and [Report, artifact references and coverage facts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-audit-stage.ts#L709-L759).
>
> **Contract or setting:** [Completeness states and separate deferred counts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/src/repository-audit-results.ts#L64-L90). The admitted profile and remaining budgets bound selection, not an external promise of complete review.
>
> **Test evidence:** [Policy-complete, verification-deferred and incomplete-execution assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/review/tests/repository-audit-stage.unit.test.mjs#L142-L164) were read as Source, not executed for this documentation correction.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; each linked whole file matches current Source.
>
> **Limit:** No model execution, complete requested coverage, terminal external cleanup or successful deployment is asserted.

## Supervised Repository-review Operator Path

Use the root package's `review:supervise`, `review:status`,
`review:status:format` and optional `runtime:preflight` commands for long reviews.
They are operator tools around the existing pipeline, not new review stages or
approval authority. These procedures are Source-reviewed, not newly executed.

### Prepare one owned run and its control files

Start from the supported [locked dependency installation](../use/quickstart.md#locked-dependency-installation).
Use the repository's supported Node runtime with direct TypeScript support,
installed npm dependencies and the root package scripts. Supervision additionally
needs Linux `/proc` and `/usr/bin/flock`. Resource samples use cgroup-v2 files;
unavailable readings are observation errors, not zero resource use. Put `npm`
on the supervisor's `PATH`; its child runs from `--workdir`. The child inherits
the operator environment, including runtime, credential and service selections;
the supervisor does not sanitize or provision it.

Supply a valid explicit platform and pipeline graph. The platform must expose
its `storageRoot` and artifact-store adapter's `artifactRoot` to the status
reader, as well as the actual installed providers, grants and review target
needed by the pipeline. A readable status snapshot does not validate the whole
platform or authorize dispatch. Prepare the frozen repository subject, review
profile, permitted artifact namespaces and configured model/controller identity
before starting. Keep these inputs and the same run ID through recovery.

Choose absolute, operator-owned paths for the platform, graph and control
files. The run ID permits 1–256 characters, starting with a letter or digit;
the remainder can contain letters, digits, `.`, `_`, `:`, or `-`. The run-root
reader uses the same ID's SHA-256-based `runs/v2-<digest>` location. The run-root reader accepts a legacy
colon-to-underscore location only with matching journal identity;
do not rename or guess a run directory.

The following placeholders must be replaced with real paths and an admitted
run ID. Create the control directory before opening its append-only pipeline log:

```sh
cd /absolute/path/to/kubeclaw
CONTROL=/absolute/path/to/review-control
PLATFORM=/absolute/path/to/platform.json
GRAPH=/absolute/path/to/repository-review-pipeline.json
RUN_ID=repository-review-001
mkdir -p "$CONTROL"
npm run review:supervise -- \
  --workdir "$PWD" --platform "$PLATFORM" --graph "$GRAPH" \
  --run-id "$RUN_ID" --heartbeat "$CONTROL/heartbeat.json" \
  --resource-log "$CONTROL/resources.jsonl" \
  --diagnostic-dir "$CONTROL/diagnostics" --log "$CONTROL/pipeline.log" \
  --lease "$CONTROL/supervisor.lease" --initial-mode auto --max-recoveries 5
```

All eight path/run options shown before `--lease` are required. The lease
otherwise defaults to `<heartbeat>.lease`; `--max-recoveries` accepts 0–100,
default 5. `auto` starts when no run journal exists and otherwise recovers;
explicit `start` and `recover` are also supported. This tool accepts an explicit
graph, not a project-compilation or human-signal command. Use the separate
[wait/resume workflow](../use/workflows/wait-resume.md) for authorized signals.

Before launching, the supervisor acquires its lease and reads current status.
An already terminal run returns that status without another child. A confirmed
live heartbeat PID is adopted only when its procfs command contains `pipeline`
and the run ID; unreadable or mismatched live ownership stops admission. This
is a process-ownership check, not proof of the repository/model semantics.

The lease uses a stable `<lease>.lock` inode with an exclusive flock transaction
and a one-second lock-acquisition timeout. A live supervisor owner refuses a
contender. Malformed lease JSON or a semantically invalid lease is an error.
Malformed heartbeat JSON also errors, but its reader does not validate a closed
heartbeat schema; none of these errors permits replacing a live owner. A dead lease owner
can be replaced under that lock. A late release cannot remove a successor's
lease because release checks its instance ID. Never unlink the permanent lock
inode to bypass contention.

### Observe, stop and recover without inventing completion

Each new attempt launches detached `npm run pipeline` with the supplied
platform/graph and either `--run-id` or `--recover` for the **same** ID. Its
stdout/stderr append to the log. Initial and 15-second serialized heartbeat
work appends resource samples then atomically replaces the heartbeat. Samples
contain cgroup CPU/memory/OOM counters, pipeline RSS/liveness and a two-second
Gateway `/healthz` probe. The default probe is `http://127.0.0.1:18789`;
`--gateway-url` changes this observation, not the pipeline's transport target.

After actual child exit and queued heartbeat I/O settle, the supervisor writes
a final stopped heartbeat and `diagnostics/attempt-<n>-exit.json` containing the
exit code/signal, stop state, sample and any launch/process/heartbeat error.
Heartbeat or diagnostic failures are visible errors, not successful monitoring.
The diagnostic's child exit is not itself the canonical run outcome.

| Observation or stop | Meaning and safe next action |
| --- | --- |
| Status is `succeeded` | Supervisor prints the status and exits 0. Inspect final report, completeness and subject bindings before claiming review coverage. |
| Status is `failed`, `blocked` or `cancelled` | Prints terminal status and exits 1; it does not automatically reopen that terminal run. Follow its owning error/wait/reconciliation procedure. |
| Child exited but status remains `running` | After a five-second delay it can invoke `--recover` for the same ID, within the declared maximum. Exhaustion exits 75, not success. Preserve log/diagnostic and inspect before another authorized recovery. |
| SIGINT/SIGTERM during a child owned by this supervisor | Requests process-group SIGTERM with child fallback, then waits for actual exit and heartbeat I/O; returns 130. There is no kill-after-grace escalation here. An unresponsive child can keep the supervisor waiting. |
| Stop while observing an adopted live pipeline | Stops supervision; it does not signal that adopted pipeline. Confirm its actual state separately before replacing or recovering it. |
| Lease, status/artifact read, procfs ownership, heartbeat or diagnostic error | Stop; retain the original error and inputs. Correct access/data/path dependencies without deleting locks or rewriting retained evidence to force admission. |

Use read-only observations independently of a supervisor:

```sh
npm run review:status -- --platform "$PLATFORM" --run-id "$RUN_ID" \
  --heartbeat "$CONTROL/heartbeat.json" --resource-log "$CONTROL/resources.jsonl" \
  --stale-after-seconds 120
npm run review:status:format -- --workdir "$PWD" \
  --platform "$PLATFORM" --run-id "$RUN_ID" \
  --heartbeat "$CONTROL/heartbeat.json" --resource-log "$CONTROL/resources.jsonl" \
  --controller-session-key agent:main:nova-review-controller \
  --configured-concurrency 10
```

The status command reads the compact artifact index and referenced prepared,
cache and report blobs. Its event tail is bounded to 1 MiB; resource history is
bounded to 8 MiB. It is not full journal replay or an audit/proof-repair command.
Inspect `status`, stage states, last durable event, `liveness`, heartbeat age,
`health`, active runtime locks, requested dispatches, recent lock expiry/failure,
and primary/expansion/verification checkpoint counts. Heartbeat freshness
(default 120 seconds) and a live-process flag distinguish active from stale;
terminal events override liveness. Tail-derived counts or missing old events
cannot certify full run history. `planReport` is not executed review;
`finalReport` presence does not replace its coverage/completeness checks.

The formatter also invokes the installed `openclaw` CLI against Gateway's
`subagents` list for the specified controller session. Configure that CLI's
actual Gateway connection/authentication and select the controller used by the
review target. `--openclaw-bin` selects another executable; the tool does not
create credentials. Its displayed configured concurrency (default 10) is a
label, not a control change. Active tasks/locks are observations, not completed
batches. Actual reviewer token usage remains explicitly unavailable; estimated
input tokens and budget reservations are not billed usage.

Current CPU is calculated from adjacent cgroup samples; peak CPU/RAM reflects
the retained resource tail, while cgroup lifetime peak RAM is a distinct field.
Stale current CPU/RAM/Gateway readings remain stale or unavailable, not current
healthy capacity. A healthy probe is connectivity, not model admission. Formatter
cadence/next-check text does not install a scheduler. Optional `--reopen-status`
only reads another controller's JSON; it does not authorize or perform reopen.

### Optional live capacity preflight

`runtime:preflight` is **effectful**: it requests real OpenClaw model children.
It needs an authenticated, authorized installed `openclaw` CLI/Gateway, a valid
agent/model/thinking selection and sufficient controller capacity. It can incur
model work and retain child sessions. Use it only when this live check is
intended; it is not free static parsing or a prerequisite for reading status.

```sh
npm run runtime:preflight -- --concurrency 2 --model '<admitted-model>' \
  --thinking high --session-key agent:main:nova-review-controller \
  --collector-mode true --spawn-interval-ms 1500 --timeout-ms 180000
```

Standalone defaults are concurrency 1 (maximum 100), timeout 120000 ms
(maximum 3600000), agent `main`, thinking `high`, collector false and interval
1500 ms (range 0–60000). A model is required. Requests use subagent/run,
`cleanup: keep` and no thread; collector mode additionally selects collect and
waits through `agents_wait`. Otherwise it polls `subagents` lists. Interval 0
submits concurrently; a positive interval spaces spawn requests. The prompt
asks children to return `PREFLIGHT_OK`, but the script counts successful terminal
status rather than validating the returned text.

Passed JSON `openclaw-concurrency-preflight.v1` records requested/accepted/
completed counts and selected identity. It exits without error only after admission and successful terminal observation
of every requested child. Admission
rejection, failed child, transport error or completion deadline rejects the
check. The error path attempts cancellation of accepted tasks, resolving missing
task IDs from a list and using settled cancellation requests. Cancellation is
not terminal cleanup proof; list/transport failure can also obstruct cleanup.
Retain available session/run/task identities and reconcile actual remaining
children through the owning OpenClaw procedure before another preflight.

The supervisor can opt into preflight with **both** `--preflight-concurrency`
and `--preflight-model`; only its start path runs it. Its defaults differ:
timeout 180000 ms, thinking high, collector false, interval 1500 ms and the same
dedicated controller key. It calls this preflight synchronously before the
pipeline child, with a 240-second wrapper timeout. Timeout or supervisor
SIGINT/SIGTERM handling is not a cancellation protocol
for these model sessions. Omit both flags to avoid that extra live operation.
Passing capacity now is not a guarantee of later review/model quality or cleanup.

### Retain evidence and change the mechanism coherently

After a run, keep the append-only pipeline/resource logs, final heartbeat,
attempt diagnostics, platform/graph identity, run journal and referenced
artifact blobs while recovery or review consumers need them. Normal release
removes only this supervisor's lease, not the stable lock inode or run data.
A crash can leave lease, heartbeat temporary files or partial logs; neither a
stale timestamp nor a dead supervisor proves the pipeline or model tasks ended.
Do not delete shared artifact/journal storage to clear monitoring errors.
Apply the [shared plugin lifecycle](../use/plugins.md) and
[OpenClaw reconciliation](openclaw.md) before disposal or redispatch.

Changes to supervision/status/preflight must coordinate CLI flags, pipeline
receiver, run-root identity, FileMutex/lease, heartbeat/resource schema, status
reader and formatter, Gateway tool protocol and owning tests. Do not add a
retry or cleanup promise only to the monitor's prose.

> **Source evidence — supervisor ownership and recovery**
>
> **Claim:** The supervisor launches or adopts one run, retains attempt observations and only recovers nonterminal work under an exclusive lease.
>
> **Implementation:** [Launch, signal and serialized final observation](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/supervise-repository-review.mjs#L97-L149), [same-run bounded recovery](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/supervise-repository-review.mjs#L188-L215) and [lease/adoption/initial status](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/supervise-repository-review.mjs#L216-L256).
>
> **Contract or setting:** [Lease ownership and stable lock](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/lib/repository-review-supervisor-state.mjs#L23-L63); [original kernel-lock receiver](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/core/state/file-mutex.ts#L1-L24). Required paths, initial mode and maximum recoveries select this wrapper; Core retains run-state authority.
>
> **Test evidence:** [Actual lease ownership and stale-release assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/tests/repository-review-supervisor-state.test.mjs#L12-L58); [terminal/error status assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/tests/repository-review-supervisor-status.test.mjs#L9-L46); [stop-during-recovery assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/tests/integration/repository-review-supervisor-stop.test.mjs#L38-L75). Assertions were read as Source, not run for this addition. They do not prove a deployed model review.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; every linked whole file matches current Source.
>
> **Limit:** No new supervisor, native fixture, model, Gateway or production execution is asserted; stopping this monitor is not proof all external work ended.

> **Source evidence — status and resources are observations**
>
> **Claim:** Status and formatter expose bounded checkpoint/liveness/resource observations without granting lifecycle, full-history or token-usage authority.
>
> **Implementation:** [Artifact/checkpoint and bounded-tail status](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/repository-review-status.mjs#L86-L145), [freshness, locks and returned counters](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/repository-review-status.mjs#L146-L184) and [formatter freshness and unavailable usage](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/format-repository-review-status.mjs#L53-L105).
>
> **Contract or setting:** [Resource sampling and heartbeat commit order](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/lib/repository-review-supervisor-heartbeat.mjs#L38-L71); [bounded run-root identity](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/lib/repository-review-run-root.mjs#L53-L65). Status uses the platform's storage/artifact roots; formatter queries its selected OpenClaw controller, not a new approval issuer.
>
> **Test evidence:** [Unreadable status/artifact and terminal-status assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/tests/repository-review-supervisor-status.test.mjs#L9-L46). These assertions were read, not run; no new full-history, formatter/model or resource-capacity execution proof is claimed.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; every linked whole file matches current Source.
>
> **Limit:** Bounded tails and current Gateway observations cannot certify full run history, requested coverage or actual provider usage.

> **Source evidence — capacity preflight starts real children**
>
> **Claim:** Optional preflight checks actual child admission/completion and attempts cancellation after failure; it is not static configuration validation.
>
> **Implementation:** [Actual model spawn and admission checks](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/openclaw-concurrency-preflight.mjs#L110-L149) and [terminal observation and failed-check cancellation](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/openclaw-concurrency-preflight.mjs#L150-L192).
>
> **Contract or setting:** [Cancellation receiver and standalone settings](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/openclaw-concurrency-preflight.mjs#L95-L122); [supervisor opt-in and distinct defaults](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/scripts/supervise-repository-review.mjs#L79-L96). Model/controller identity, concurrency, collector selection, spacing and timeouts govern this separate live operation.
>
> **Test evidence:** The linked original implementation was read, not executed. No capacity-preflight test run or terminal cancellation receipt is claimed for this documentation addition.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; every linked whole file matches current Source.
>
> **Limit:** Capacity now does not prove review accuracy, future admission, billed usage or terminal cleanup; retained child sessions require owner reconciliation.

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

## Architecture Validator Is A Different Review Protocol

`kubeclaw.architecture-validator` registers `kubeclaw.validate.architecture`.
It does not execute the Echo policy reducer, repository audit, or repair loop
above. Configuration requires a non-empty `agent`; optional `agentRole` is
metadata, not target selection. Grants separately admit that `runtime.dispatch`
target, repository reads, artifact reads and artifact writes. Secrets and
network authentication belong to the selected dispatch adapter, not this stage.

Admitted input carries `task`, optional architecture data, `source`, or
`sourceBinding`; its closed schema does not admit a caller-supplied `subject`.
The internal subject is derived by the stage. A binding resolves a
source-preflight subject and contract;
otherwise a supplied source is captured with task/architecture as the contract.
The stage verifies the fixed subject before dispatch and again afterward.
It requests `kubeclaw.architecture-validation.v2`, with optional helper guidance
and the compiled runtime-dispatch profile. It asks about domain models and
integration boundaries, not generic graph validity or deterministic preflight.

The response's `result` must contain only `verdict`, `summary`, `findings`, and
`checkedFiles`. Each finding contains only ID, severity
(`blocking/error/warn/info`), scope (`domain_model/integration_boundary`), paths,
explanation, and remediation. Finding count is bounded to 128; IDs to 256
characters, explanations/remediations to 8,192. A passed verdict needs checked
files and cannot contain a blocking finding. A blocked verdict requires a
blocking finding. When a subject is bound, every subject path must occur in
checkedFiles; a model's success assertion cannot excuse missing coverage.

Success writes the parsed output plus bound subject, when present, to namespace
`kubeclaw.architecture-validator`, resource `architecture-validation`.
`passed` with no findings emits fact `architecture.review: clean`; passed
with *any* finding emits `approval_required`, including error severity. This
fact is not an approval or a wait request: Nova's compiled graph owns the next
authority boundary. A model cannot return `request_fix` through this protocol.

| Trigger/example | Outcome and safe response |
| --- | --- |
| Complete checked-file coverage, passed verdict, no findings | Store report, return passed/clean. This is bounded architecture evidence, not deployment proof. |
| Passed verdict with advisory/error findings but none blocking | Store report, return passed/approval_required. Inspect findings through the owning approval route; do not call the fact approval. |
| Blocked verdict with a blocking finding | Store report, return `blocked`, `architecture.blocked`, retaining findings and checked files in reason details. Resolve the architectural constraint before a new attempt. |
| Passed verdict with blocking finding, unknown field, omitted subject file, changed subject, or dispatch failure | `blocked`, `architecture.invalid_output`, no report. Preserve source/session/effect identity; correct the contract, source, or dependency, then start a new authorized attempt. An unchanged malformed response will fail again. |
| Missing agent configuration; report write fails after valid output | Exception propagates to Core, not a synthetic architecture approval. Correct configuration/store; reconcile prior dispatch effects before retry. |

There is no private mutable state, automatic model retry, resume cursor, or
stage-owned temporary file. Dispatch owns sessions and cancellation. The stage
catches errors in capture/dispatch/verification as invalid output, including
cancellation there; a report-write error outside that catch propagates. Neither
branch proves the remote session stopped. Follow [OpenClaw reconciliation](openclaw.md)
and [effect recovery](../extend/effectful-plugin.md) before redispatch. Retain
immutable reports and subjects while any pinned run refers to them; use the
[shared plugin lifecycle](../use/plugins.md) for drain, replacement and removal.

To change finding semantics, coordinate `protocol.ts`, `output.ts`, stage facts,
input/config/result schemas, compiler approval consumers, and tests; changing
only the prompt is insufficient. Run
`npm test --prefix skills/nova/plugins/architecture-validator` for positive,
blocking, malformed, coverage, and source-binding paths, then compile/run a
controlled graph with the actual configured dispatch provider. Local contract
tests alone are not a live architecture-model quality claim.

Source: [registration and grants](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/architecture-validator/plugin.json#L1-L24),
[request protocol](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/architecture-validator/src/protocol.ts#L1-L52),
[closed parser and contradiction rules](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/architecture-validator/src/output.ts#L1-L60); [closed parser and contradiction rules (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/architecture-validator/src/output.ts#L61-L83),
and [source verification, outcomes and artifact](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/architecture-validator/src/stage.ts#L1-L60).

## Repository Adapter: Mutable Reads And Attempt-Bound Git Evidence

`kubeclaw.repository-adapter:repository` provides `git.repository.read`; it
registers no stage or observer and requires no delegated capability. It is the
repository reader used by Echo and deterministic stages, not a Git writer,
repository sandbox, or arbitrary command interface. The host needs Git for
revision operations, Linux `/proc/self/fd` for descriptor-protected mutable
reads, and OS read access to the protected checkout and its ancestors.

### Configuration, activation and authority

The closed configuration requires `repositoryRoot`. The root must resolve to
its canonical absolute identity without a symlink substitution; activation
rejects a symlink root or a path whose real identity differs from its resolved
path. Optional `maxFileBytes` defaults to 4 MiB and `maxChangedPaths` to 2,048;
both must be positive safe integers. Optional `expectedHead` is a full lowercase
40- or 64-hex Git object ID. It constrains **freeze**, not mutable `read_text`,
and does not automatically freeze HEAD at activation. `ready()` checks that the
root is a directory; it does not prove a valid Git repository, clean checkout,
readable requested file, or functioning remote service. There is no network or
secret configuration in this adapter.

Core must authorize the caller and the `git.repository.path` resource under
its `allowedPrefixes` grant. A payload's `allowedPrefixes` is an additional
operation scope, not a replacement capability grant. The adapter dispatches
only the operations below. All enter through a pre-call cancellation check;
non-confidential invocations also assert the current execution fence. The
adapter itself checks the capability/operation, while Core owns resource/grant
admission. Supplying a pathname or revision proof never grants Git mutation.

### Supported operations and returned evidence

| Operation | Required selection and result |
| --- | --- |
| `read_text` | Resource canonical ID is one repository-relative path. Reads the **current working tree**, returning requested path, decoded content and UTF-8 content byte count; no commit, object ID or frozen proof is returned. |
| `freeze_head` | Payload optionally names `ref` (default `HEAD`), exact canonical `repositoryRoot`, and `requireClean`. Resolves the ref to a commit, checks configured expectedHead, and returns head plus an attempt-bound proof; echoes canonical repository identity only when requested. |
| `verify_ancestry` | Full `base`, proven `head` and `proof`; returns base/head and `ancestryVerified: true` only if base is an ancestor. |
| `changed_manifest` | Base, proven head and one to 128 unique allowed prefixes; returns sorted changed paths with added/modified/deleted/renamed/copied/type_changed status and a canonical manifest digest. Scoped rename/copy edges become an addition or deletion when only the relevant side is in scope. Count is bounded by maxChangedPaths. |
| `read_revision_text` | Resource path, proven head, allowed prefixes; optional maxBytes cannot exceed configured maxFileBytes. Returns path/head/object ID/content/byte size/content SHA-256, with optional regular-file mode. Expected object ID and size, when supplied, must match before reading. |
| `changed_line_ranges` | Resource path, base and proven head; returns added-side inclusive line ranges from zero-context deterministic text diff plus digest. Deleted-only ranges add no new-side range. Requires ancestry; no payload allowed-prefix filter is applied by this method, so resource grant admission remains essential. |
| `list_revision_paths` | Proven head, allowed prefixes, optional maxPaths; returns sorted tracked paths and digest. Default maxPaths is maxChangedPaths × 8, valid range 1–65,536. |
| `inventory_revision` | Proven head, allowed prefixes, optional maxPaths; returns sorted path/object ID/Git mode/byte-size records and digest. Default maxPaths is maxChangedPaths × 8, valid range 1–1,000,000. Gitlinks retain commit identity/mode and size zero; inventory is not proof that an entry is readable regular text. |
| `find_revision_references` | Proven head, allowed prefixes, one to 256 unique sourcePaths, optional maxPaths (default 256, range 1–4,096). Returns sorted unique caller/source pairs and digest. Candidate scan ceiling is 32,768. It checks relative JS/TS import/export/require/dynamic-import forms, including supported extension/index alternatives; this is not a complete cross-language, alias-aware dependency graph. |

Allowed prefix `.` means the whole repository for these payload scopes; other
prefixes match the exact path or descendants. Paths reject absolute names,
colon, backslash, controls, and empty/dot/traversal segments. Revision operations
use fixed Git argv, not a caller-supplied command. Full object IDs are required
for base/head; only freeze resolves a declared symbolic ref.

### Mutable bytes are not a frozen review subject

Mutable `read_text` first checks existing components and canonicalizes allowed
internal symlinks. An external or dangling link is forbidden even when a leaf
beyond it is missing; an ordinary missing internal leaf is instead not found.
It then opens the canonical path through Linux directory descriptors with
`O_DIRECTORY|O_NOFOLLOW` and `/proc/self/fd`, and the final file with no-follow,
nonblocking flags. It requires a regular file and checks size before and after
one descriptor read. The descriptor chain prevents a later directory-to-link
swap redirecting that read. It is **not** a complete sandbox against moving
the authorized root/ancestor itself, nor a content snapshot against same-size
concurrent writes. Protect those locations and stop writers when consistency
requires it. Mutable decoding uses Node's UTF-8 replacement behavior, unlike
revision reads' fatal UTF-8 decoding; use the frozen byte/digest contract for
immutable review evidence, not a mutable read as a substitute.

Freeze happens when called, including commits made after adapter activation.
`requireClean: true` rejects tracked or untracked working-tree changes; omission
does not request cleanliness. Its optional repository identity must equal the
configured canonical root. The returned proof is HMAC-bound to the current
adapter instance's private random key, exact head and Core attempt ID. Another
attempt, another instance after restart, forged proof, or substituted head
cannot reuse it. It is not a persisted repository approval or a transferable
Git credential. Subsequent reads keep that proven commit even if live HEAD
moves. Preserve the original subject identity rather than refreezing a newer
commit and calling it the same evidence.

For source approval, `read_revision_text` with `requireRegularFile: true`
requires Git mode 100644 or 100755 and returns it. Without that selector a Git
symlink blob is text containing its target, not a followed working-tree path.
An inventory object ID/size followed by matching `expectedObjectId` and
`expectedSizeBytes` binds the selected blob; malformed UTF-8, non-blob objects,
oversized files or mismatched identities stop the read. Consumer checks still
bind these bytes to its review subject; inventory/digest alone is not approval.

### Failure, recovery and change procedure

| Trigger | Effect and safe action |
| --- | --- |
| Missing/symlink/replaced root, path traversal or escaped/dangling parent | Activation/read rejects, commonly `REPOSITORY_PATH_FORBIDDEN`. Restore the protected authorized root/path; never widen it to read the rejected target. |
| Missing leaf, directory/non-regular mutable file, oversize or changing size | `REPOSITORY_FILE_NOT_FOUND`, `REPOSITORY_NOT_A_FILE`, `REPOSITORY_FILE_TOO_LARGE`, or `REPOSITORY_FILE_CHANGED_DURING_READ`. Correct the path/input or quiesce its owner before a new read; no partial successful result exists. |
| Expected head differs, dirty source, wrong repository identity | `REPOSITORY_HEAD_MISMATCH`, `REVIEW_SOURCE_DIRTY`, or `REVIEW_REPOSITORY_IDENTITY_INVALID`. Stop subject admission; select the intended clean commit through its owner, not by deleting proof checks. |
| Invalid/other-attempt proof, non-ancestor base, wrong blob identity/size/mode | `REPOSITORY_REVISION_PROOF_INVALID`, `REPOSITORY_BASE_NOT_ANCESTOR`, `REPOSITORY_OBJECT_ID_MISMATCH`, `REPOSITORY_FILE_SIZE_MISMATCH`, or `REVIEW_SOURCE_NOT_REGULAR`. Preserve the original subject; correct producer/consumer binding. An unchanged retry is not a repair. |
| Invalid scope/limit, too many paths/references, malformed inventory/diff or invalid UTF-8 | Reject instead of truncating into apparent complete evidence. Narrow the declared scope or review a compatible bound; preserve the error. Do not treat incomplete coverage as empty success. |
| Cancelled before invocation | `ADAPTER_CANCELLED`; mutable reads also recheck after reading. Revision operations execute synchronous Git calls and have no adapter-specific abortable child/deadline loop; entry cancellation is not proof that an active Git subprocess was interrupted. |

These errors propagate to Core or the calling stage; this adapter returns no
`StageResult` and does not choose retry, wait, approval, or lifecycle completion.
It has no private durable store, automatic retry, resume cursor, writer or
retained subprocess. In-memory proof keys disappear with the instance. Git
objects/checkout are the source authority; Core effects and consumer artifacts
are the retained execution evidence. Shutdown is empty and does not delete
repository data. Drain dependent pinned runs before changing root/expectedHead
or replacing this package; retain Git revisions and review artifacts until
no recovery/consumer still needs them. Use the [plugin lifecycle](../use/plugins.md)
and [effect recovery rules](../extend/effectful-plugin.md); removal is not
repository cleanup or revocation of an already-created review artifact.

A successful maintained path is freeze → scoped manifest/inventory → exact
object-ID/size revision read. Moving HEAD after freeze still reads the captured
commit. A negative path changes the proof/head or attempt and must reject;
an outside/dangling symlink must reject before misclassifying its leaf as absent.
Run `npm test --prefix skills/nova/plugins/repository-adapter` for package
boundary, real Git/file operation and path-safety fixtures. These controlled
local checks do not prove a deployed caller, remote repository or live approval.

To change an operation, update its dispatch entry, RevisionReader/parser or
mutable descriptor code, capability vocabulary/authorization if authority
changes, schemas where configuration changes, SDK/consumer contracts and
fixtures together. Preserve deterministic sorting, exact identity/digests,
source-approval mode and fail-closed budgets. Compile with the actual provider
and minimum caller grant, then exercise positive and negative controlled reads
before activation. Do not replace descriptor safety with a string-prefix
check or turn a reference-search heuristic into a completeness guarantee.

> [Registration and capability](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/plugin.json#L1-L19)

> [Closed configuration](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/schemas/config.schema.json#L1-L12)

> [Activation and operation dispatch](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/adapter.ts#L1-L60)

> [Activation and operation dispatch (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/adapter.ts#L61-L91)

> [Descriptor-protected mutable reads](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/repository-file.ts#L1-L60)

> [Descriptor-protected mutable reads (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/repository-file.ts#L61-L63)

> [Frozen identity and supported revision operations](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/revision-reader.ts#L1-L60)

> [Frozen identity and supported revision operations (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/revision-reader.ts#L61-L120)

> [Frozen identity and supported revision operations (continued 3)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/revision-reader.ts#L121-L180)

> [Frozen identity and supported revision operations (continued 4)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/revision-reader.ts#L181-L240)

> [Frozen identity and supported revision operations (continued 5)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/revision-reader.ts#L241-L300)

> [Frozen identity and supported revision operations (continued 6)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/revision-reader.ts#L301-L331)

> [Inventory, object modes and reference matching](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/revision-parsers.ts#L1-L60)

> [Inventory, object modes and reference matching (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/repository-adapter/src/revision-parsers.ts#L61-L71)
