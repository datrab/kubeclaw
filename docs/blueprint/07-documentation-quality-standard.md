# Documentation quality standard

Status: Required by the project owner on 2026-09-15.
Scope: New and revised documentation, from one module to the complete system.
Language review: Apply ASD-STE100 Issue 9 principles through the project review rules below. Formal certification is not required.

## Purpose and reader

A reader must understand the system and complete supported tasks without chat history.
Assume practical IT knowledge. Do not assume academic knowledge or knowledge of this project.
Explain the reason for each design choice that affects behaviour, operation, or extension.

Simple language must preserve technical depth.
Explain a difficult mechanism through small, connected explanations.
Do not remove conditions, failure cases, or consequences to make a page shorter.
Make the text interesting through a concrete problem, a working example, and clear cause and effect.
Do not use promotional claims or unexplained abstractions.

This standard adds acceptance requirements to the [work plan](documentation-work-plan.md).
It does not prove that existing pages meet those requirements.

## English and ASD-STE100

Use English for product documentation and reusable documentation-agent specifications.
The existing migration plan and progress reports can remain in German.
Use [ASD-STE100](https://www.asd-ste100.org/) as the required language standard.
The official site identifies Issue 9, dated 2025-01-15.

Use the full writing rules and dictionary when they are available to the reviewer.
Formal or licensed ASD-STE100 certification is not an acceptance requirement.
Do not claim formal compliance from a short style checklist or a readability
score. Record the review method, technical vocabulary, unresolved findings,
and review scope. Describe the result as project controlled-language review,
not as certified ASD-STE100 compliance.

Apply these project writing requirements during drafting:

- Use direct sentences. Name the component that performs an action.
- Use one term for one meaning. Define technical terms at first use.
- Keep exact API names, identifiers, commands, and configuration keys.
- Explain an identifier in ordinary words before you depend on its meaning.
- Maintain a shared list of technical nouns and verbs with definitions and usage.
- Do not classify every difficult word as a technical term to avoid language review.
- Separate instructions from explanations. Put required conditions before the relevant action.
- Give one clear action per procedural step where the task permits it.
- Use explicit conditions instead of words such as “normally” without a stated limit.
- Replace “simply”, “obviously”, and “as needed” with the information the reader requires.

These project rules supplement the official standard. They do not replace it.
If a sentence loses information during revision, split the explanation and preserve the information.

## Explain the system at two connected levels

Start with the complete request path and the purpose of its components.
Then explain each module at the point where the reader needs more detail.
Link the module explanation back to the complete flow.

For each module, cover the applicable questions below.
Mark a question as not applicable only with a reason.

| Topic | Required explanation |
| --- | --- |
| Problem | What reader or system problem does this module solve? |
| Responsibility | What does it own, and which component owns the adjacent work? |
| Inputs and outputs | What enters and leaves, who sends it, and which contract applies? |
| Internal sequence | Which operations run, in what order, and under which conditions? |
| State and data | What persists, who can change it, and when is it removed? |
| Concurrency | What prevents conflicting updates or duplicate work? |
| Failure | What happens on timeout, partial success, interruption, or dependency failure? |
| Recovery | What can repeat, what must be checked first, and who resumes the work? |
| Access | Which identity and permissions apply at each boundary? |
| Configuration | Which source sets a value, what is its default, and which override wins? |
| Operation | Which observations show progress, failure, or an uncertain result? |
| Extension | Which supported contract can change behaviour without a core change? |
| Limits | What is implemented, locally checked, incomplete, planned, or pending live acceptance? |
| Reasons and evidence | Why was this design selected, and which sources support the explanation? |

At system level, also explain deployment boundaries, dependency order, shared resources, and failures that affect several modules.
A list of modules is not a system architecture.
Trace at least one complete successful request and the relevant failed or interrupted variants.
Show how state, responsibility, and evidence change at each handoff.
State retry limits and stop conditions from current sources; do not infer them from an old example.

## Explain decisions without inventing history

For each significant decision, record:

1. The problem and the constraints at the time.
2. The selected approach and the scope where it applies.
3. The alternatives that were considered, if the evidence records them.
4. The reason for the choice.
5. The benefit and the cost, including operational and maintenance consequences.
6. The conditions under which the choice should be reconsidered.
7. Its status: proposed, accepted, or replaced.
8. Its implementation status, separately from the decision status.
9. Links to the decision evidence and the current implementation.
10. The decision that replaces it, if applicable.

An accepted design can still be partly implemented.
Source code can prove behaviour. It does not prove the author's original reason.
Label an inferred explanation as an inference.
Record a missing historical reason as unknown and assign the gap.
Useful new alternatives can be assessed, but must not be presented as historical discussion.
Do not require a separate decision file for every local implementation detail.
Explain local choices beside the mechanism; link shared choices to one canonical decision.

## Source evidence and code display

Place evidence beside the claim it supports.
Link to the relevant function, type, schema, configuration, and test as applicable.
A root directory link is not sufficient evidence for a precise behaviour claim.
Read the linked content. File existence alone is not verification.

Use the documented commit for source links.
Include a stable symbol name and a narrow line range where available.
Record the source revision used to check the page.
When code changes, review the affected explanation and refresh its links together.
A permanent link preserves old evidence; it does not prove that the explanation remains current.

Use a source callout with these fields:

| Field | Content |
| --- | --- |
| Claim | The specific behaviour that the source supports |
| Implementation | A link to the relevant source location |
| Contract or setting | A link when it determines the behaviour |
| Test evidence | A test link and the actual check status |
| Revision | The commit against which the explanation was checked |
| Limit | What this evidence does not establish |

Do not paste production source into authored prose.
Small commands and complete runnable examples are allowed: they teach a task.
Keep those examples checked against the real contract.

The preferred published callout can show the referenced code.
Implement that display in the existing publication pipeline only if the renderer supports it reliably.
Read the excerpt from the pinned source during the build.
Do not maintain a second manual copy.
Make the source link work without the preview, JavaScript, or network access during reading.
Check that the displayed lines and the link use the same revision.
Do not assume that GitHub snippet expansion works on another site.
AP09 must verify the actual renderer before it promises this presentation.

## Operate: order procedures by the reader's task

Use the existing order: plan and install; configure and operate; observe and diagnose; back up and recover; maintain and retire.
Provide a symptom index that leads to the relevant diagnosis.
Keep required actions visible in the procedure.
Use architecture links to explain the reason without hiding a required step.

Each procedure must give:

- Purpose, starting condition, supported versions, and execution location.
- Required access, tools, configuration, data, and dependency checks.
- Expected impact and conditions that require the operator to stop.
- Exact ordered actions with explained placeholders.
- Expected observations after each meaningful state change.
- A final check that proves the intended result.
- Failure diagnosis that distinguishes likely causes through observable checks.
- Recovery or rollback, including the point where rollback is no longer possible.
- Cleanup and the evidence to retain.

Never invent a command, success output, restore path, or recovery time.
Explain an uncertain result before suggesting a retry of an operation with external effects.
Recovery from loss of access must not require the failed access service.
If implementation prevents completion, identify the exact blocked step and its issue.
A live procedure that has not run remains unverified.

## Extend: require a reproducible result

For every supported extension type, provide a complete path from a clean checkout to a checked result.
Use the [extension coverage](02-three-track-site-map.md#mandatory-extension-coverage) to keep pipeline plugins, host plugins, adapters, providers, and engines distinct.

Explain prerequisites, package layout, dependencies, manifest, registration, configuration, permissions, build, tests, activation, and observation.
Also cover update, compatibility, disablement, removal, and remaining data.
Explain why each required part exists.

Keep one minimal runnable example and one practical example with state or an external effect.
Cover errors, duplicate input, interruption, retry, cancellation, resume, and cleanup where the contract supports them.
Show expected results and how to diagnose a failed result.

Acceptance requires a reader or agent without the original chat to follow the required pages in a clean environment.
Record every missing assumption or necessary undocumented step as a documentation failure.
Correct the guide and repeat the affected task.
A compiling example alone does not prove registration, activation, or end-to-end behaviour.
Do not promise error-free use in all environments; prove the declared supported scenario.

## Links, navigation, and content ownership

Give each topic one canonical explanation.
Link from architecture to its decision, code, operational task, extension contract, and known limitation where relevant.
Link task pages back to the explanation that helps the reader understand their actions.

Check local paths, headings, images, source revisions, line ranges, public routes, and publication inclusion.
Check links after moves and deletions, including references in scripts and tests.
A working repository link can still fail in the published site.
Inspect both views.

Generate mechanical facts from existing schemas and manifests.
Keep authored explanations outside generated output.
A source change must identify affected pages through recorded dependencies.
Unknown reasons and documentation gaps must remain visible until resolved.

## Acceptance gates

| Gate | Required proof |
| --- | --- |
| Correctness | Claims agree with implementation, contracts, configuration, and bounded test evidence |
| Depth | Applicable mechanism, failure, recovery, and consequence questions are answered |
| Reasons | Significant decisions have evidence, or their missing reasons are explicit |
| Readability | A new reader explains the flow and terms without chat history |
| Controlled language | Project review applies the declared ASD-STE100 principles; findings are resolved and no formal certification is claimed |
| Operations | Required tasks have complete steps, observable results, and recovery paths |
| Extensions | A clean-environment reader exercise produces the declared result |
| References | Links and source callouts resolve at the documented revision and in published output |
| Maintenance | Each topic has an owner role and source dependencies; no duplicate manual authority |
| Truthful status | Failed, skipped, local, and live checks are reported separately |

All applicable gates must pass for final documentation acceptance.
A high average score must not hide a failed gate.
Page count, word count, a green build, and filled headings are not completeness evidence.

## Contract for a future documentation agent

This is a reusable behaviour specification, not an installed agent.

Inputs:
The requested scope, repository revision, applicable repository instructions, reader tasks, source files, configuration, tests, decision records, and this standard.
Existing conversations can identify leads. Durable evidence must support the resulting documentation.

Workflow:

1. Determine scope and read existing instructions and documentation.
2. Inspect implementation, callers, contracts, configuration, tests, and failure paths.
3. Map reader tasks to modules and complete system flows.
4. Record supported claims, source locations, decision evidence, and unknowns.
5. Update canonical pages and runnable examples.
6. Check commands, examples, links, source callouts, and publication output.
7. Review language and run the applicable reader exercises.
8. Correct failures and record checks that could not run.
9. Save a focused diff and an exact continuation point.

Outputs:
Updated canonical pages, source dependencies, verified examples, unresolved gaps, and a check report tied to the source revision.
The report must distinguish work performed from work proposed.

Constraints:
Do not invent rationale, interfaces, commands, or successful checks.
Do not close implementation issues through prose changes.
Do not alter product behaviour, deploy, or install a new agent as part of documentation work unless separately requested.
Do not overwrite unrelated work.
If a missing fact blocks one section, record it and continue sections with sufficient evidence.
Use the repository's existing tools and records before adding new machinery.

Before adoption, assess this agent on a module change and a change across modules.
Include a changed default, removed symbol, stale link, absent decision reason, and an incomplete extension path.
The agent must update affected content or report the precise gap without a false success claim.
