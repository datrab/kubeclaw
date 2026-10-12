# Independent Attempt store extraction review

Accepted for SQ1–SQ6 and SQ-DOC on 2026-09-21. This reviewer did not author or
modify the production extraction, original tests, new ownership probe or
acceptance criteria. No actionable extraction defect was found. This accepts
only the Store quality extraction; PCR-OBS-002 remains open for other store
classes, and this supplies no broader deletion or D07 authority.

Read the [preimplementation criteria and author record](attempt-store-quality-20260921.md)
before inspecting the six production files and their pre-extraction implementation.
Independent evidence is in
[`attempt-store-quality-independent-20260921`](../../evidence/attempt-store-quality-independent-20260921/).

## Independently executed checks

- Exact five original test modules: **43/43 passed**, zero failures, skips or
  cancellations, 108.1 seconds (`original43.txt`). This rerun includes original
  consumer/replay/planner behavior, CLI execution, actual writer fencing and
  SIGKILL recovery cases.
- Final formatted real-writer input-ownership probe: **1/1 passed**, zero skips
  (`ownership.txt`). The process holding the actual Attempt writer lock is killed
  only after caller mutation and unchanged-disk verification. Original evidence,
  result, intent, owner, closure and required completeness identities survive.
- Direct original JUnit consumer: **passed** (`junit.txt`), including actual Node
  JUnit files, parser/finalizer, HTTP import and durable decision reconstruction.
  This is not a native isolated-runner or deployment claim.
- Foundation and Nova TypeScript checks: **both passed** (`foundation.txt`,
  `nova.txt`). Canonical ESLint passed for all six production modules plus the
  ownership probe (`lint.txt`), with no rule suppression or threshold change.
- Static preservation checker independently rerun: all **43 error-code
  occurrences**, the constructor and five state method bodies agree with the
  old implementation under its documented normalization (`preservation.txt`).
  This bounded comparison is supplemented by business-logic review below; it
  does not pretend the entire extraction is text-identical.

Runtime commands used the existing cached proot binding of actual GNU flock to
`/usr/bin/flock`, with its library directories in `LD_LIBRARY_PATH`. Heavy runs
were serialized with the Core reviewer. Exact commands, durations and exit codes
are recorded in `runtime-results.json` and `final-checks.json`.

All three prepared runtime-loader semantic mutations were executed privately
against unchanged production files and original tests. Removing the completed
attempt guard triggers `ERR_ASSERTION: Missing expected rejection` for
`ATTEMPT_ALREADY_COMPLETED` at original test line 65. Removing the positive byte
saving guard triggers the same assertion failure for `NOT_SMALLER` at line 85.
Removing projected-closure quota subtraction makes the original positive consumer
case reject with `OBSERVABILITY_CLOSURE_STORE_FULL` after real projection. That
last failure is an unexpected domain rejection, not an `ERR_ASSERTION` object;
it still detects the actual quota regression. None of these failures is an
import, loader, fixture-setup or environment failure. Raw outputs and the exact
classification are retained in `mutant-*.txt` and `semantic-controls.json`.

## Preservation and maintainability review

SQ1/SQ2: The public facade retains constructor and method signatures, defaults,
interfaces and exported closure helpers. There is exactly one production
`FileDurableAttemptStore` and one concrete `AttemptState`; there is no old
parallel implementation or compatibility dispatch path. The state owner retains
queue rejection recovery, kernel writer lock, staging cleanup, decode/encode,
quota checking, evidence expiry and orphan cleanup in original order. The
unchanged persistence codec continues to provide V1/V2/V3 semantics. Evidence
validation precedes capacity and storage; blob write, file fsync, rename and
directory fsync remain in order.

Input ownership preserves the actual original call sites. Evidence metadata and
bytes, result/intent/owner, closure, retirement intents and required-closure
arrays are copied before their first asynchronous wait. Optional completeness
missing-range and unresolved-item arrays were and remain copied after
`admission.observabilityIssues` resolves. SQ1's preservation wording is therefore
not evidence of a universal pre-await snapshot guarantee. This explicit
qualification matches the old implementation and the author documentation; no
original guard or assertion was weakened to obtain acceptance.

SQ3: Result lookup preserves stale-generation precedence, existing-result
identity comparisons, pending commit recovery, finalized-generation rejection,
full evidence identity/digest validation and quota subtraction. Reserved commit
timestamp sizing precedes the pending write; committed state is size-checked and
written afterward. Closure validation retains duplicate identity handling,
sequence/evidence checks and resident quota accounting. Completeness retains
required-ID duplicate rejection, evidence issue classification, first-occurrence
deduplication and missing versus stale diagnostics.

SQ4: All three retirement operations preserve their source, intent, authorization
and CAS checks. The two extracted journal commit functions are synchronous and
contain no await; asynchronous source validation completes before the fence.
Closure references are staged in a separate map and installed only after durable
replacement. Result projection behavior and error ordering agree with the old
implementation. Retirement eligibility and lock order are unchanged.

SQ5: Responsibilities are visible in ordinary named functions rather than a
configurable callback framework. The facade is small; the five modules have
coherent state, evidence, result, completeness and retirement responsibilities.
The existing serial callback is retained, and the small helpers express domain
phases rather than hiding policy. Conventional formatting and complete canonical
lint coverage address the former ten violations across the whole moved source.

SQ6/SQ-DOC: `identity-checks.json` independently proves the three prior
Admission/result/closure test modules byte-identical to their earlier accepted
snapshots. Replay and planner modules are byte-identical to HEAD. Thus the exact
43 original cases, including assertions and bodies, remain intact. All 15 author
manifest entries matched both live files and author snapshots. The same 15 inputs
remained unchanged throughout this review, including every production file,
original/new test and reviewed document. Independent frozen source copies and
SHA-256 identities are recorded in `source-identities.json`; additional copies
bind the mutation hook, original implementation, shared fixture and canonical
lint/type configurations.

The retention documentation names the actual responsibility boundaries and
synchronous commits and preserves the limits on operational authority. Earlier
snapshots and interrupted runs remain historical evidence, not fresh pass claims.
The author record's pending-review status is superseded by this independent
completion record; production and author evidence were not edited by this reviewer.
