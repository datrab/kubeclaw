# Independent review: Buster specialist result/report extraction

The bounded extraction is accepted as behavior-preserving at the reviewed source
state. No introduced defect was found. **The complete original runner/report
suite and whole-runner lint are not green**; the concrete failures and controlled
before/after comparison are recorded below. This acceptance does not waive those
failures, approve a later timeout fix, or close B1/W1/native integration.
The reviewer did not implement this extraction.

## Original behavior and extracted responsibilities

Source comparison against the pre-extraction HEAD runner confirms that provider
JSON byte limiting, contract validation, count consistency, provider details,
evidence declarations and report declarations retain their exact order. The
runner still clones and freezes the validated provider result before staging
selected evidence. No old inline validator body or second competing validation
path remains.

Finalization retains the direct-command exit-code shortcut, absent-report return,
retained-source requirement, resolved adapter lookup and exact adapter ID/format/
contract-version/package identity. Source byte limits, aggregate adapter result
limit, cleanup-derived timeout, CPU/memory/file/case allowances, report ordering,
AbortSignal forwarding, report cloning and direct-command normalization are
unchanged. The shared canonical encoder preserves the earlier lexical ordering;
its extraction does not introduce a new hash representation. The runner's
exported adapter-executor type remains compatible with existing callers.

The interfaces separate existing contract data from runtime dependencies. No
registry Map, mutable runner instance, private-field access or executable callback
is placed in the finalization input data. Registry, adapter executor and signal
remain explicit runtime dependencies. This is a useful small extraction, not a
serialized full specialist operation or a newly functioning native host. Provider
execution, capability dispatch, staging, persistence and fixture lifetime still
require their separate native integration work.

## Independent checks and mutation

- [Original new boundary tests](../../evidence/buster-specialist-independent-20260921/boundary-tests.txt):
  **7/7 passed**, zero skips. The deterministic adapter is explicitly a fake at
  this module boundary, not a real native worker.
- [Independent differential probe](../../evidence/buster-specialist-independent-20260921/differential.mjs):
  **24 validator cases, 28 finalization cases and 7 canonical-value cases passed**.
  It obtains the original helper bodies and finalization closure from HEAD,
  adapts only their explicit dependency bindings, and compares result/error,
  adapter calls, limits, signal and unchanged input data against the extraction.
  Cases include simultaneous size/schema faults, count/outcome conflicts,
  evidence/report identity errors, changed package/ID/version, shortcuts,
  non-command results, source-size/deadline extremes and adapter rejection.
  [Raw output](../../evidence/buster-specialist-independent-20260921/differential.txt).
- Independent private-copy mutation removes adapter package equality. The
  wrong-package case then invokes an adapter, whereas the original rejects it
  before invocation. The differential oracle detects that semantic bypass.
  This does not claim sandbox or native execution coverage.
- Engine TypeScript exits 0. Canonical lint for the three extracted modules and
  boundary test exits 0: [typecheck](../../evidence/buster-specialist-independent-20260921/typecheck.txt),
  [lint](../../evidence/buster-specialist-independent-20260921/lint-new.txt).
- Whole-runner lint remains **30 errors before and after** under the same current
  canonical policy. The reviewer independently linted HEAD and current source:
  [complete comparison](../../evidence/buster-specialist-independent-20260921/lint-runner-comparison.json).
  No rules or exclusions were weakened to hide these violations.

## Original adapter checks: matched before/after instead of an environment guess

The author's earlier three-failure baseline and later five-failure run cover
*different test sets*. Their counts alone cannot show that the two additional
adapter failures were pre-existing. The reviewer therefore ran the **same two
original tests** in private repository copies, switching only `runner.ts` between
its pre-extraction HEAD bytes and current extracted bytes. All other engine/test
bytes and actual tools were the same within each pair; test hashes are retained.

| Environment | Before extraction | After extraction |
|---|---|---|
| Plain Node, actual built sandbox | JUnit adapter passes; general adapter-runtime test fails at its unchanged line 185: expected `REPORT_ADAPTER_TIMEOUT`, received `REPORT_ADAPTER_CANCELLED` with timeout cause | Same JUnit pass and same timeout/cancellation assertion failure |
| Proot with actual GNU flock/tar bindings | Both original adapter tests fail with child `SIGSEGV` / incomplete adapter protocol | Both fail with the same child/protocol failure |

The plain JUnit pass uses the actual isolated adapter and reports two parsed cases.
The timeout/cancellation mismatch is a **real pre-existing semantic defect**, not
labelled an unavailable-host skip. The Proot failures also remain failures; their
underlying crash cause is not established by this review. The matched comparison
shows that neither additional failure was introduced by this extraction. It does
not certify the broader execution environment.

[Comparison harness](../../evidence/buster-specialist-independent-20260921/compare-adapters.py),
[run manifest and test/source identities](../../evidence/buster-specialist-independent-20260921/adapter-comparison.json),
[plain before](../../evidence/buster-specialist-independent-20260921/adapters-plain-before.txt),
[plain after](../../evidence/buster-specialist-independent-20260921/adapters-plain-after.txt),
[Proot before](../../evidence/buster-specialist-independent-20260921/adapters-proot-before.txt),
[Proot after](../../evidence/buster-specialist-independent-20260921/adapters-proot-after.txt).
The pre-fix adapter/runtime bytes and actual sandbox digest are retained in
[additional runtime identities](../../evidence/buster-specialist-independent-20260921/adapter-runtime-identities.json).
After the root began the separate timeout correction, the replay harness was
pinned to these retained pre-fix runtime bytes so subsequent replay cannot silently
substitute that correction. The recorded comparison itself ran before the fix.

The reviewer also ran the three original runner/provider/JUnit-execution checks
with plain Node. **All three failed**, including missing provider output and
original result assertions; [raw output](../../evidence/buster-specialist-independent-20260921/original-runner-plain.txt)
is retained. These are not counted as passing runner integration, and no test
was weakened to get a green result. A separate fix and its own review are needed
for the demonstrated timeout defect and remaining original-suite failures.

## Documentation and limits

The architecture and implementation notes identify the actual production
callsites, separate serializable data from execution dependencies, retain failed
original runs and explicitly leave full-operation/native work open. BS-DOC is
satisfied for this extraction. The author's initial native-prerequisite wording
alone did not explain every failure; the controlled results above provide the
more precise distinction between the existing timeout defect and the unclassified
Proot crash. No provider/report adapter, ownership scope or cancellation deadline
was replaced with a fake to claim a successful original integration run.

[Reviewed extraction source snapshots](../../evidence/buster-specialist-independent-20260921/source-identities.json)
bind this verdict. The subsequent root timeout correction is outside those
extraction bytes and requires its own validation/review. No built image, kernel
resource attribution, per-attempt native host or complete native cutover was
executed or inferred here.

The historical timeout finding is subsequently addressed in the separate
[report-adapter deadline correction](report-adapter-deadline-20260921.md).
Its results and independent acceptance are separate from this extraction review;
the original before/after evidence above remains unchanged.
