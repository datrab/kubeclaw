# Echo review Phase 1 baseline

Date: 2026-08-09  
Branch inspected: `agent/pipeline-test-gate-design`  
Source commit: `1ddf49dbe`  
Runtime changes made by this phase: none

## Scope

This baseline inventories the current canonical review plugin at
`skills/nova/plugins/review`, verifies its deterministic tests, and measures the
specific behaviors that the Echo review governance plan intends to change.

The shared worktree contained unrelated, uncommitted pipeline test-gate and role
surface work when this baseline was taken. This phase did not modify or stage any
of those files.

## Current implementation

The plugin contains:

- a `kubeclaw.decision.review` stage;
- one required capability: `runtime.dispatch`;
- deterministic task and evidence serialization;
- a closed PASS/FAIL reviewer-output contract;
- explicit PASS evidence consistency checks;
- invalid-output reduction to a blocked stage;
- FAIL reduction to a canonical `request_fix` stage result; and
- package, protocol, parser, stage, live-function, and boundary tests.

Current source size is 369 lines across:

- `src/protocol.ts`: 127 lines;
- `src/review-output.ts`: 211 lines; and
- `src/stage.ts`: 31 lines.

The package tests contain 345 lines across five test files.

## Current callers and ownership boundary

The v2 production pipeline currently invokes `kubeclaw.decision.review` for two
Echo roles:

- module review through `echo.module-review`; and
- final review through `echo.final-review`.

Both call sites configure an agent and an `agentRole`. The review plugin consumes
the agent identity directly. `agentRole` is accepted by its config schema but is
not read by the stage implementation; the surrounding runtime and evidence path
uses agent-role metadata for dispatch and lifecycle reporting. It must therefore
be treated as an ownership question, not removed as dead configuration without a
separate runtime audit.

The review plugin owns one decision stage and requires only `runtime.dispatch`.
It does not own repository reads, artifact persistence, session recovery,
remediation execution, or presentation. A FAIL becomes canonical `request_fix`.
The generic pipeline runtime then applies the graph's declared remediation target
and `maxRemediationCycles` budget. The plugin-local live test configures zero
remediation cycles, so it proves dispatch and reduction but not a real repair loop.

The package README records remaining parity boundaries: agent session management,
remediation cycles, publication, and final agent-backed E2E coverage. These are
not silently counted as Phase 1 proof.

## Adjacent pipeline-review contract

`skills/nova/plugins/pipeline-review` is a separate terminal reporting concern. It
does not control the Echo decision gate. Its current contract nevertheless
provides useful repository precedent:

- authoritative `runId` and positive `attempt` identity;
- task length capped at 32,768 characters;
- 1-128 evidence references identified by kind and SHA-256 digest;
- 5-128 bounded observations;
- bounded finding and summary text; and
- immutable artifact publication through `artifacts.write`.

Phase 2 should evaluate those shapes for reuse without merging decision review and
terminal pipeline reporting into one responsibility.

## Current input and output

Input is intentionally small but loose:

```ts
interface ReviewInput {
  task: string;
  evidence?: Record<string, unknown>;
}
```

The reviewer returns PASS or FAIL, critical and deferred issue arrays, checked
contracts, opened artifacts, failed commands, unverified requirements, and a
summary. Each issue contains only source, description, affected files, and a
recommended fix.

The reducer converts every critical issue into one pipeline finding named by array
position (`REVIEW_ISSUE_1`, `REVIEW_ISSUE_2`, and so on).

## Verification results

Commands:

```bash
cd skills/nova/plugins/review
npm test
npm run build
```

Results:

- protocol unit: passed;
- review-output unit: passed;
- stage unit: passed;
- live function: passed;
- package boundary: passed; and
- TypeScript `tsc --noEmit`: passed.

No full E2E matrix was run.

## Volume behavior

The current parser and reducer were exercised with repeated, contract-valid
critical issues:

| Input critical issues | Accepted | Pipeline findings | Root-cause clusters |
| ---: | :---: | ---: | ---: |
| 1 | yes | 1 | not implemented |
| 10 | yes | 10 | not implemented |
| 100 | yes | 100 | not implemented |

All 100 identical issues were accepted and emitted as 100 separately numbered
findings. There is no maximum finding count, stable fingerprint, deduplication, or
root-cause grouping.

The task builder also accepted a 1,000,000-byte evidence string and constructed a
1,001,133-byte dispatch task. There is no bundle or artifact byte budget.

## Recorded-run sample

Five recorded Echo module-review commits were inspected:

- `15a9c3d6c`;
- `d0b4a04c5`;
- `a9e2c9830`;
- `49485d925`; and
- `2912ec164`.

All five recorded review files returned PASS with zero critical and zero deferred
issues. Their review payloads used an older four-field PASS shape and therefore do
not provide current-contract failure-volume data. They remain useful evidence that
historical repository records are dominated by final verdicts rather than stable,
evidence-addressed finding identities.

The five commits each stored roughly ten thousand inserted lines because the run
record included large lint reports and duplicated lifecycle evidence. This supports
moving review input to content-addressed, bounded artifacts instead of embedding
arbitrary evidence directly in the dispatch task.

### Historical failing and noisy reviews

Five older recorded reviews were also inspected because the current-contract Git
sample contains no failures:

- `8f61d9b4d`: NO-GO with three critical and three deferred issues;
- `3856801ee`: NO-GO with two critical and two deferred issues;
- `66b9dd0ba`: NO-GO with two critical and three deferred issues plus additional
  top-level assessment fields;
- `7f39e6cb5`: NO-GO with one critical and three deferred issues; and
- `4bf21c430`: GO with zero critical and three deferred issues.

These records use legacy GO/NO-GO contracts and cannot be replayed through the
current parser. They are still valuable model-behavior evidence:

1. The same logical review gate appears across multiple review/fix attempts, so
   convergence and repair-cycle governance are real requirements.
2. A GO review deferred a concrete shell-injection risk and an error-state-to-PASS
   mapping. Free-form critical/deferred classification was therefore not reliable
   enough to determine pipeline disposition.
3. Some outputs added fields such as reviewer, gate, wave assessments, severity,
   and follow-up lists. Closed canonical schemas are necessary to prevent format
   growth between reviewer prompts.
4. One finding represented 14 remaining files as a single critical issue, while
   other reviews emitted several symptoms separately. The old format has no stable
   rule for instance versus root-cause identity.
5. A review can contain a large and useful explanation but still lack evidence
   identities that prove which artifacts or code revisions were inspected.

The historical review search used:

```bash
git log --all --oneline -S'critical_issues' -- \
  'Projects/**/.swarm/logs/echo-review/*.json'
git show <commit>:<recorded-review-path>
```

No current-contract failing review was found in the inspected Git records. Current
failure behavior is therefore baselined by deterministic fixtures and reducer
probes rather than being inferred from incompatible legacy output.

## Representative deterministic cases

The completed baseline now covers:

- valid PASS with inspected contracts and artifacts;
- valid FAIL with a critical issue;
- invalid JSON;
- missing dispatch result;
- unknown root and issue fields;
- contradictory PASS with critical issues;
- unexplained FAIL;
- PASS without required evidence;
- 1, 10, and 100 repeated critical issues; and
- a one-megabyte embedded evidence value.

Large-diff and scope-break behavior cannot be represented by the current contract:
it contains no Git range, changed-file set, owner boundary, or scope result. That
absence is itself the Phase 1 baseline rather than a missing test that can be added
without first changing the contract.

## Contract authority and drift risk

The reviewer shape currently exists in five places:

1. the human-readable JSON example embedded in `buildReviewTask`;
2. the `outputContract` object sent to `runtime.dispatch`;
3. `schemas/reviewer-output.schema.json`;
4. TypeScript interfaces in `review-output.ts`; and
5. the manual parser and semantic checks in `review-output.ts`.

Tests cover important agreement points, but no single source mechanically proves
that all five representations remain identical. There is already a small semantic
difference: the JSON Schema's `nonEmptyStrings` definition constrains each item but
does not set `minItems`, while parser-level PASS rules separately require non-empty
checked-contract and opened-artifact arrays. Phase 2 must establish one canonical
contract authority and explicit semantic invariants.

## Strengths to preserve

1. The plugin owns the deterministic protocol while reviewer judgment stays behind
   `runtime.dispatch`.
2. Agent output never passes directly into pipeline control flow.
3. Unknown output fields and contradictory PASS/FAIL states are rejected.
4. PASS requires at least one checked contract and opened artifact.
5. Invalid output fails closed.
6. The capability boundary is minimal and tested.
7. Task construction is deterministic for key-order variations.

## Missing governance

The current implementation has no canonical representation for:

- base and head Git commits;
- changed files, owners, or non-test LOC;
- allowed repair scope;
- evidence identities tied to individual findings;
- source symbol or stable location identity;
- finding category, P0-P3 priority, or confidence;
- introduced-by-current-diff status;
- blocker, follow-up, or scope-break classification;
- stable fingerprints;
- deduplication or root-cause clustering;
- finding or byte budgets;
- simplification candidate evidence;
- semantic blocker verification;
- scope-growth limits; or
- repair-cycle convergence limits within the review policy.

## Baseline comparison metrics

Later phases should report these values against the current baseline:

- maximum accepted raw findings: unbounded;
- 100 duplicate findings emitted to repair: 100;
- root-cause reduction: none;
- maximum embedded evidence size: unbounded by the plugin;
- findings with stable identity: 0%;
- findings with direct evidence references: 0%;
- findings with introduced-by-diff proof: 0%;
- findings with explicit scope classification: 0%;
- automatic simplification candidates: none;
- semantic P0 verification: none; and
- plugin-level normal-run repair-cycle limit: none.

## Explicitly deferred evaluation metrics

Model latency, token use, runtime cost, reviewer precision, false-positive rate,
and reviewer/verifier disagreement are intentionally not treated as completed
Phase 1 measurements. Historical records use different prompts and output
contracts, and the current Git sample is too biased toward repeated PASS fixtures
to produce trustworthy values.

These measurements move to shadow calibration once ClawDeck provides a stable
evaluation surface. The implementation plan may optimize them later, but no Phase
2 contract decision should claim performance or quality gains without that data.

## Phase 1 conclusion

The current review plugin is a sound closed PASS/FAIL adapter, but it is not yet a
governed review system. Its strongest properties are deterministic construction,
closed output validation, and fail-closed reduction. The next implementation slice
should preserve those properties while adding the canonical finding contract
(Phase 2) before changing the prompt or agent behavior.

Phase 1 acceptance is satisfied: the current path, callers, adjacent ownership,
remediation boundary, and contract authorities are inventoried; deterministic tests
pass; high-volume and oversized-input behavior is measured; PASS, FAIL, noisy, and
repeated-repair records are sampled; incompatible historical evidence is clearly
separated from current-contract proof; and evaluation metrics that require
ClawDeck are explicitly deferred.
