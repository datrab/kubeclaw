# Echo review Phase 9 evaluation

Date: 2026-08-13  
Repository: KubeClaw  
Mode: shadow evaluation; results did not control production

## Decision

Keep the review stage non-blocking outside controlled tests.

The hardening work fixes the known evidence, governor, context, slicing, and
simplification-input gaps. The post-change KubeClaw sample shows that real
source findings can now enter the normal report and verifier paths. It does not
yet provide enough stable, complete runs for production promotion.

## 1. Trusted reviewed source

Selected source now has the evidence kind `reviewed-source`. Its digest is the
SHA-256 digest of the exact frozen UTF-8 content given to Echo. A finding must
cite that digest. The finding location must also name a selected file.

This keeps the trust boundary closed. Echo cannot cite a path or text that was
not in the frozen bundle.

Finding during audit: merged slices could cite more evidence than the output
contract permits. The merge now stops with an explicit error. It does not drop
cited evidence.

Recommendation: keep this design. Do not make arbitrary repository files or
model-requested text trusted evidence.

## 2. Governor artifact-read failure

An artifact provider or transport failure while reading the prior baseline is
now converted to `invalid_state`. The stage then stores the terminal report and
returns a safe blocked result.

Finding during audit: the old path could throw before report persistence.

Recommendation: fixed. Keep the provider error as diagnostic data, but do not
let it bypass the certified terminal result.

## 3. Production context candidates

The repository adapter now supplies deterministic facts for:

- direct relative imports;
- direct callers;
- nearby tests;
- contracts and schemas;
- package and plugin configuration;
- ownership files;
- public export files.

Finding during audit: an early caller search matched only a source filename.
Common names such as `index` or `service` could add unrelated files. The final
implementation uses the filename only as a search prefilter. It then parses the
candidate import, export, `require`, or dynamic import and resolves the path to
the exact frozen source file.

Recommendation: keep the producer conservative. Add new relationship types
only when the repository adapter can prove them.

## 4. Large-diff slicing

Large reviews are split by changed-file roots. Each slice has the same frozen
revision, scope, policy, and formal evidence. A small integration slice joins
shared contracts, schemas, configuration, ownership, and public exports when
it fits the same limits.

All slices run. Their structured results are merged and deduplicated before the
single verifier and report flow.

Audit findings and decisions:

- A file larger than one slice cannot be safely cut in the middle. The stage
  now requests orchestration instead of truncating it.
- More than 128 merged findings now stops with an explicit error. Findings are
  not silently dropped.
- More than 128 cited evidence items also stops explicitly.
- Optional inspected evidence may be bounded only after every cited item is
  retained.

Recommendation: keep one reviewer per slice. Do not use a default reviewer
panel or one multi-megabyte request.

## 5. Simplification facts

Production now emits a small deterministic fact set. The first rule recognizes
an exported forwarding wrapper whose body only returns another call with the
same arguments.

The fact creates only an advisory candidate. Echo must still reject removal
when the wrapper owns policy, security, compatibility, logging, or another real
boundary.

Finding during audit: broad automatic abstraction rules would create style
noise and unsafe deletion advice.

Recommendation: keep the initial producer narrow. Add one fact type at a time
and measure usefulness before enabling another.

## 6. Bug-focused review policy

The protocol asks Echo to focus on:

- correctness;
- security and authority;
- contracts;
- lifecycle and retry state;
- concurrency and lock ownership;
- persistence and recovery;
- data loss.

Every bug claim needs a causal path from the changed code to a concrete impact.
P0 is reserved for a clear release, security, authority, integrity, or data-loss
failure.

Recommendation: keep P0 rare. A serious-sounding statement is not enough.

## 7. Excluded review topics

Formatting, naming preferences, subjective style, and broad cleanup requests
are not review findings. Lint and format tools own code form.

Architecture and maintainability advice may be a follow-up only when it is
specific, evidenced, and useful. It must not start Nova repair.

Recommendation: no change.

## 8. Real KubeClaw fix-pair evaluation

The post-change batch used 12 real KubeClaw fixes. Each pair contains a
reverse-applied bug and the corresponding historical fix candidate. The truth
label was outside the model prompt.

The real path included Git revisions, plugin discovery, capability grants,
repository and artifact adapters, runtime dispatch, Echo with
`gpt-5.6-terra` and high reasoning, pipeline core, reports, and journals.

Transport instability left four pairs incomplete. Incomplete cases are not
counted as passes or misses.

### Pair 1: Buster repository path

`buster-path-bug`

- Finding: default suite path resolution can use the ambient repository instead
  of the extracted worker repository.
- Verdict: real P1.
- Quality: good causal proof and useful fix.

`buster-path-fix`

- Finding: the historical candidate discovers the extracted archive with Git,
  but the archive has no `.git` directory.
- Verdict: real P1. The control was labelled clean too early.
- Tuning: corpus labels must use the final working fix, not an intermediate
  candidate.

### Pair 2: report producer identity

`report-attempt-bug`

- Finding: stored report identity was not bound to run ID, stage ID, attempt ID,
  and attempt number.
- Verdict: real P0 contract defect.
- End-to-end result: the independent verifier rejected it, so the report kept
  it as ignored and the stage passed.
- Tuning: inspect why verifier reasoning disagreed with the direct identity
  mismatch. This is a verifier false negative.

`report-attempt-fix`

- Finding: none.
- Verdict: correct clean result.

### Pair 3: expanded bundle identity

`expansion-bundle-bug` and `expansion-bundle-fix`

- Finding: no completed post-change model result.
- Cause: runtime transport failure.
- Verdict: unjudged. Do not count either case.
- Known truth: the bug stores a terminal result against the stale initial
  bundle; the fix retains the latest expanded bundle.

### Pair 4: Bash prompt output

`secret-prompt-bug`

- Finding: helper-local `value` shadows the caller output variable under Bash
  dynamic scope.
- Verdict: real P1.
- End-to-end result: correctly retained as a non-blocking follow-up.

`secret-prompt-fix`

- Finding: none.
- Verdict: correct clean result.

### Pair 5: rate-limit authority

`rate-limit-bug`

- Finding: generic text can grant rate-limit authority before a terminal error
  state is proved.
- Verdict: real P1.
- End-to-end result: incomplete because runtime dispatch failed.

`rate-limit-fix`

- Finding: the historical candidate still accepts free-form terminal error text
  instead of machine-readable authority.
- Verdict: real P1 under the stated contract. The control label was too broad.
- End-to-end result: correctly retained as a follow-up.
- Tuning: separate “terminal error proved” from “rate-limit reason authorized.”

### Pair 6: repeated terminal failure

`repeated-terminal-bug` and `repeated-terminal-fix`

- Finding: no completed post-change model result.
- Cause: runtime transport failure.
- Verdict: unjudged.
- Known truth: the bug requires optional metadata and fails to store the blocked
  terminal completion.

### Pair 7: lock heartbeat ownership

`lock-heartbeat-bug` and `lock-heartbeat-fix`

- Finding: no completed post-change model result.
- Cause: runtime transport failure.
- Verdict: unjudged.
- Known truth: the bug omits configuration required by serialized lock mutation
  authority.

### Pair 8: confirmed proposal retention

`confirmation-retention-bug`

- Finding: a confirmed proposal can disappear if finding normalization fails.
- Verdict: real P1.
- End-to-end result: correctly retained as a follow-up.

`confirmation-retention-fix`

- Finding: the historical candidate checks the global findings count, so one
  successful normalization can hide another failed confirmed proposal.
- Verdict: real P1. The control was an intermediate fix, not a clean fix.
- End-to-end result: correctly retained as a follow-up.
- Tuning: labels must track per-proposal behavior.

### Pair 9: dispatch failure report

`dispatch-report-bug` and `dispatch-report-fix`

- Finding: no completed post-change model result.
- Cause: runtime transport failure.
- Verdict: unjudged.
- Known truth: the bug returns after bundle creation without storing the required
  immutable report.

### Pair 10: certified verdict state

`verdict-state-bug`

- Finding: a later finding-construction failure drops already certified verifier
  state.
- Verdict: real P0.
- End-to-end result: confirmed by the independent verifier and returned as
  `request_fix`. This proves the repaired source-evidence path can reach Nova
  repair authority.

`verdict-state-fix`

- Finding: none.
- Verdict: correct clean model result. The outer test harness lacked remediation
  wiring, so a later transport retry is not a plugin-quality result.

### Pair 11: verifier request limit

`preflight-limit-bug`

- Finding: a verifier request-size failure can lose the certified preflight.
- Verdict: the claim is real, but the model cited the case specification rather
  than reviewed source.
- End-to-end result: independently rejected and stored as ignored.
- Tuning: requirement text may explain intent, but a code defect needs direct
  source evidence.

`preflight-limit-fix`

- Finding: none.
- Verdict: correct clean result.

### Pair 12: changed-manifest binding

`manifest-binding-bug`

- Finding: the bundle parser accepts a manifest digest without recomputing it
  from the declared changed paths.
- Verdict: real P1.
- End-to-end result: correctly retained as a follow-up.

`manifest-binding-fix`

- Finding: none.
- Verdict: correct clean result.

## 9. Final evaluation audit

### What works

- Reviewed source citations are accepted only when they match frozen content.
- A real P0 reached the independent verifier and `request_fix`.
- P1 defects remain visible without starting repair.
- Clean controls produced no style noise.
- The model found Bash scope, identity, lifecycle, report, and manifest defects.
- Context, slicing, and simplification inputs now exist in production code.

### What still needs work

- Four of 12 pairs were incomplete because of transport failures.
- Three historical “clean” controls were intermediate fixes with real residual
  bugs. The corpus truth set must be corrected before computing precision.
- One real P0 was rejected by the independent verifier.
- One real claim relied on requirement evidence instead of source proof.
- The current sample is too small and incomplete for a promotion percentage.

### Tuning recommendations

1. Require direct reviewed-source evidence for every code defect.
2. Require the verifier to explain any rejection of a direct P0 identity or
   authority mismatch.
3. Inspect the full enclosing guard before assigning P0.
4. Keep P1 non-blocking during shadow runs.
5. Replace intermediate fix controls with final proven fixes.
6. Resume the remaining real fix pairs only after transport runs are stable.
7. Promote only after two complete batches show no new failure class, no false
   P0 on clean code, and no missed seeded P0.

## Promotion status

Continue shadow evaluation.

The implementation is safer and materially more useful. The evidence path is
now proven end to end. The evaluation data is not yet complete or clean enough
to make Echo a production blocker.
