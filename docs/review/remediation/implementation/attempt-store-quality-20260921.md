# Attempt store responsibility extraction

Status: implementation and [fresh independent review](independent-attempt-store-quality-20260921.md) complete for SQ1–SQ6/SQ-DOC. Acceptance was recorded before
production edits on 2026-09-21. This is a
behavior-preserving quality follow-up to closure projection, not broader
retirement authority or closure of PCR-OBS-002.

## Preimplementation acceptance

- SQ1: Preserve the existing FileDurableAttemptStore constructor, methods, exports,
  signatures, errors and V1/V2/V3 persisted formats. Keep caller input snapshots
  before asynchronous work, original quota semantics, and full completion/result
  identity checks. No compatibility shim retains a second implementation.
- SQ2: Preserve the original queue and kernel writer fence, state decode/encode,
  staging cleanup, evidence expiry and orphan cleanup order. Preserve blob fsync,
  rename and directory fsync. No generic callback framework or rule relaxation.
- SQ3: Preserve result pending/committed writes and reserved timestamp size check,
  duplicate completion, stale/finalized generation and evidence corruption rules.
  Preserve closure sequence/evidence validation and completeness diagnostics,
  including error precedence, deduplication and missing/stale classifications.
- SQ4: Preserve all three manual retirement operations, exact source/CAS/intent
  checks, staged closure-reference commit and synchronous journal-fenced section.
  No new await inside the journal fence and no changed retirement eligibility.
- SQ5: Eliminate all ten canonical lint violations, checking the facade and every
  extracted module plus directly touched consumers/tests with unchanged canonical
  configuration. Nova and foundation typechecks must pass. No suppression,
  threshold change, code golf or merely relocated violations.
- SQ6: Run the exact original 43 Admission/result/closure/replay/planner cases with
  actual GNU flock. Preserve original test bodies/assertions; record their source
  identity. Independently meaningful mutations must still detect quota,
  finalization or commit/identity defects. A fresh nonauthor review is required.
- SQ-DOC: Update the retention/source documentation and this record for the new
  responsibility boundaries, evidence and limitations. Preserve prior snapshots
  and distinguish this extraction's final tested bytes from earlier acceptance.

## Proposed boundaries

`durable-attempts.ts` remains the public facade and retains the existing public
interfaces. Five internal modules own state serialization/projections, evidence
files/admission and identity helpers, result commit/completion,
closure/completeness validation, and manual retirement. A separate model module
was unnecessary.
The existing serial callback is moved intact; this is not a new transaction API.
Long routines split at domain phases such as input validation, existing-result
handling, evidence verification and per-closure completeness evaluation.

## Implementation and executed evidence

The facade delegates to the single concrete `AttemptState` owner. Its constructor,
queue/kernel lock, state read/write, quota check and expiry maintenance preserve
the original bodies after private-field renaming and formatting. No second
persistence implementation or configurable policy was introduced. The remaining
modules implement named domain phases; a generic callback/transaction framework
was not introduced. The two journal-fenced commit helpers are ordinary synchronous
functions, with original authorization/identity/CAS order and zero awaits.

All six production modules and the new ownership probe use conventional Prettier
formatting, including multiline signatures/imports/bodies. Canonical lint checks
the complete moved source and public facade; no suppression or threshold changes
were made. Existing callers keep the original public import path. Internal
functions are implementation details, not additional operational entry points.

Snapshot timing is preserved per original call site. Evidence metadata and bytes,
result/intent/owner, closure and required-closure arrays are copied before their
first asynchronous wait. As in the original implementation, optional completeness
gap/unresolved arrays are copied after `admission.observabilityIssues` resolves;
SQ1 preserves this existing timing rather than silently changing that contract.
The new ownership test holds the actual Attempt kernel writer lock in another
process, calls the public facade, mutates every owned input, then releases the
lock and proves original bytes, identity, result, closure and completeness.

Evidence: `docs/review/evidence/attempt-store-quality-20260921/`.

- Exact original five-module suite: **43/43**, zero failures/skips/cancellations,
  150.2 seconds (`tests.txt`). Assertions and test bodies were not changed. The
  actual command used Node's existing default scheduling. Subsequent test starts
  use `--test-concurrency=1`; no successful suite was repeated merely to change
  that flag.
- Real writer/caller-mutation probe: **1/1** (`input-ownership.txt`). A formatting-
  only final probe rerun will bind its final bytes.
- Original direct `check-junit-executed-required.mts` passes with real GNU flock:
  actual Node JUnit output, parser/finalizer, HTTP import and durable decision
  reconstruction (`junit.txt`). This is not a native isolated-runner claim.
- Canonical lint passes for the facade, all five extracted modules and the new
  probe (`lint-final.txt`). The ten former violations are eliminated across the
  complete new source set, not moved to unchecked files.
- Foundation typecheck passes (`typecheck-resumed.txt`); final Nova/Foundation
  results and mutation controls are recorded below when complete.
- `check-preservation.mjs` compares the exact 43 error-code occurrences and proves
  the constructor plus five state-method bodies unchanged after private-field
  renaming and insignificant trailing-comma normalization. This is bounded static
  evidence, not a claim that every extracted business function is text-identical.

Intermediate failures remain visible: mechanical extraction initially omitted
captured `key`/`closureDigest` bindings from commit helper parameters; typecheck
caught this and the helpers now derive them explicitly from the frozen intent.
Initial helper splitting also exposed a readonly-array annotation and an empty
callback draft, corrected before successful runtime tests. The first static
comparison rejected Prettier's optional trailing commas; only that checker
normalization was adjusted. Formatting revealed oversized functions, which were
split at evidence-capacity, existing-result, evidence-validation, diagnostic-
deduplication and synchronous retirement-commit responsibilities.

An environment restart interrupted the first suite run. Its partial output is
preserved as `tests-interrupted-environment-restart.txt` and is not acceptance
evidence. Restart/OOM cause is not established. Test concurrency is serialized
for future runs to reduce shared-container pressure without changing cases,
deadlines or assertions.

Source snapshots use `.md.snapshot` for frozen Markdown so they are not active
documentation pages. Earlier closure-projection snapshots remain historical.
This work resolves only the Store quality debt; PCR-OBS-002 remains open for the
other release classes and does not gain automatic D07 deletion authority.


## Frozen handoff for independent completion

Production and original test files are frozen. `source-identities.json` and
`source/` record the six production modules, all original/new test modules,
JUnit consumer and docs. `stability.json` confirms no production changes across
the successful 43-case run and byte equality of the three prior closure/result
modules against their earlier accepted snapshots. The other two original suites
were not edited by this extraction.

The author completed 43/43 originals, the pre-format ownership probe 1/1,
original direct JUnit, foundation typecheck and full seven-file canonical lint.
To free a fresh nonauthor review slot, these remaining acceptance checks are
explicitly delegated to that reviewer, without an author pass claim:

1. Run `python3 docs/review/evidence/attempt-store-quality-20260921/run-mutants.py`.
   It applies private runtime-loader substitutions to the exact extracted
   completeness/result/retirement files; the unchanged original behavioral tests
   must reject quota regression, removed finalization and removed positive saving.
   Check raw assertion failures, not just nonzero exits.
2. Rerun `attempt-store-input-ownership.test.mjs` with real GNU flock and
   `--test-concurrency=1` to bind its final conventionally formatted bytes.
3. Run the final Nova typecheck (`tsc --noEmit -p skills/nova/tsconfig.json`)
   and repeat foundation/type/lint checks as needed to bind the reviewed source.
4. Independently inspect API/lock/clone/commit/completeness preservation and
   documentation; record acceptance or concrete findings. No overall
   PCR-OBS-002 closure is implied.

All test commands use the established actual GNU flock binding:

```sh
LD_LIBRARY_PATH="$PWD/node_modules/.cache/native-host-tools/root/usr/lib:$PWD/node_modules/.cache/native-host-tools/root/lib" \
node_modules/.cache/native-host-tools/root/usr/bin/proot \
-b "$PWD/node_modules/.cache/native-host-tools/root/usr/bin/flock:/usr/bin/flock!" \
/usr/local/bin/node --test --test-concurrency=1 \
tests/verification/reliability/attempt-store-input-ownership.test.mjs
```

For the exact original 43-case rerun, replace the final file with the five
unchanged files: `admission-retirement.test.mjs`, `attempt-projection-review.test.mjs`,
`attempt-closure-projection.test.mjs`, `observability-replay.test.mjs` and
`observability-retirement-plan.test.mjs` in the same reliability directory.
The original JUnit consumer runs directly (without `--test`) from
`tests/verification/contracts/check-junit-executed-required.mts` under the same
flock binding. Serialize heavy suites with the other agents.

## Independent completion

The [fresh reviewer](independent-attempt-store-quality-20260921.md) completed every
handoff item: original 43/43, final ownership probe 1/1, direct JUnit, three
semantically detected mutations, Foundation/Nova typechecks and full canonical
lint. All selected source identities stayed unchanged. The preceding handoff
records which checks the author delegated; it is no longer a pending checklist.
Broader PCR-OBS-002 and native execution remain outside this acceptance.
