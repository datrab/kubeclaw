# Pipeline Test Gate Phase 9 Plan

Status: complete; Phase 10 cutover and deletion remain

Suite: unit tests

Predecessor: Phase 8 replacement implementation

Successor: Phase 10 single-authority cutover and legacy deletion

## Purpose

Phase 9 proves that the provider-based unit path is equal to or better than the
legacy unit suite. It does not give the replacement authority. The legacy path
remains authoritative; the replacement can run only as a shadow comparison.

All acceptance work runs inside the contained Nova pod with real committed
source, HTTP, Nova and Buster runtimes, worker and provider processes, commands,
reports, evidence, restart state, and gate policy. Only unavailable host
facilities use an explicit tracked fallback. Writable cgroup delegation remains
for the final single-path production proof.

## Parity rule

Parity means equal or better observable behavior. It does not mean copying an
old implementation defect or reproducing internal JSON formatting.

Each baseline ID has exactly one disposition:

- `preserved`: the replacement retains the useful behavior;
- `improved`: the replacement supplies a safer or clearer equivalent;
- `removed-defect`: a negative proof prevents the old defect from returning;
- `deferred`: an accepted decision explicitly moves the item; or
- `blocked`: proof is incomplete and Phase 9 cannot close.

Every closed item names its implementation, executable proof, evidence, and a
plain-language rationale. Missing, duplicate, unknown, or unproved items fail
the traceability test.

## 9-A — Establish the parity authority

Status: complete

1. Correct baseline parsing so `UNIT-EXEC-003A` is included.
2. Load all 93 unique `UNIT-*` IDs into the JSON parity ledger.
3. Validate exact baseline equality, allowed dispositions, proof paths, and
   non-empty rationales.
4. Generate a human-readable report from the same ledger.
5. Map proof groups to applicable architecture decisions.

Exit: all 93 IDs exist exactly once and every item has a planned proof.

## 9-B — Selection, input, configuration, and isolation

Status: complete

Prove declaration selection, operator denial, committed source, archive and
path bounds, stable identities, removal of BuildKit/Kubernetes privileges,
secret isolation, literal arguments, contained working directories, valid
timeouts, and fail-closed invalid configuration.

Prove intentional improvements: no npm assumption, hidden discovery, shell
command string, or ambiguous failure threshold. Several explicit instances
replace one discovered command.

Exit: all ACT, IN, ID, ISO, CFG, and DISC items are closed.

## 9-C — Execution, results, evidence, and recovery

Status: complete

Use real processes to prove success, failure, start error, timeout,
cancellation, output bounds, available resource limits, child cleanup, ordered
logs, JUnit states, exit/report conflicts, retry and unstable success,
concurrency, blocking/advisory policy, restart, duplicate delivery, receipts,
durable evidence, and graph identity.

Exit: all EXEC, RES, LOG, EVI, EVT, RCP, ERR, and SCHED items are closed.

## 9-D — Structured-report improvements and defect removal

Status: complete

Use real test tools where available. Node's built-in test runner is the
portable required fixture. Additional pinned tools may be installed in the
contained pod and recorded. Prove passing, failing, skipped, zero-test, and
malformed-report cases.

Replace old Jest, Vitest, Mocha, TAP, and pytest console-regex authority with
JUnit facts or explicit exit-only facts. Preserve original reports and logs.
Add negative proof for every `UNIT-DEF-*` item and real proof for every
`UNIT-NEW-*` item.

Exit: every PARSE item is improved, every DEF item is prevented, and every NEW
item is proved.

## 9-E — Controlled comparison

Status: complete

Run legacy and replacement paths against the same committed fixtures. Record:

- case and fixture;
- authoritative legacy result;
- shadow replacement result;
- expected difference;
- decision and proof; and
- confirmation that the shadow result did not change the gate.

Cover pass, failure, missing and zero tests, missing executable, timeout,
cancellation, retry, independent tools, large logs, invalid report, advisory
failure, and coverage failure.

Exit: every difference is explained and dual authority is impossible.

## 9-F — Contained vertical proof and closeout

Status: complete

Repeat the complete real path:

```text
committed project → Nova plan and graph → signed source → authenticated HTTP
→ Buster recovery → worker → isolated provider → real test tool → report
→ evidence import → Nova shadow decision
```

Run focused Phase 9, Phase 8, Phase 7, full contracts, plugin tests,
traceability, documentation, dependency, Git, and Terra/high review. Accept and
fix valid findings, rerun affected proof, and repeat review until clean.

Exit: every parity item is proved, no old defect returns, the replacement is
still shadow-only, all verification passes except recorded unrelated failures,
and review has no actionable finding.

## Phase 9 documents

- This plan.
- `pipeline-test-gate-unit-parity-ledger.json`.
- `pipeline-test-gate-phase-9-parity-report.md`.
- `pipeline-test-gate-phase-9-comparison.md`.
- `pipeline-test-gate-phase-9-final-audit.md`.

## Explicit non-goals

Phase 9 does not switch authority, delete the legacy suite, add speculative
report formats, require an external production deployment, or migrate another
suite.
