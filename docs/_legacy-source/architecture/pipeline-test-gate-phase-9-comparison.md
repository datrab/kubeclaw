# Pipeline Test Gate Phase 9 Comparison

Status: complete; legacy remains authoritative

## Comparison rule

The legacy unit result controls the comparison gate. The provider-based result
is shadow evidence only. `runLegacyAuthoritativeShadowComparison()` returns the
legacy object as `gateResult` before any shadow work starts. The caller must
then call `collectShadow()` to start the comparison run. This separate step is
lazy, idempotent, cancellable, and time-bounded. A shadow crash or timeout is
stored as comparison evidence. It cannot reject, delay, or change the legacy
gate result.

The executable proof is
`tests/verification/contracts/check-pipeline-phase9-comparison.mts`.

## Real shared fixture

Both paths run the same committed Node test files:

- `tests/fixtures/pipeline-test-gate/unit-parity/passing.test.mjs`;
- `tests/fixtures/pipeline-test-gate/unit-parity/failing.test.mjs`.

The legacy suite starts Node's real test runner with its TAP reporter and then
uses the old console parser. The replacement starts the same Node test runner
with its built-in JUnit reporter and sends the original XML through the
registered adapter.

## Observed comparison

| Case | Legacy authority | Replacement shadow | Decision |
| --- | --- | --- | --- |
| One pass and one skip | Pass, but the TAP parser records total 2, passed 1, skipped 0 | Pass with total 2, passed 1, skipped 1 | Replacement is better because the structured report preserves the skipped case. |
| One failure | Fail with one failed check | Fail with one failed case and retained structured finding | Equal gate meaning; replacement has better evidence. |
| Jest-shaped counts | Regex-derived counts | Equivalent JUnit cases and counts | Structured result is the accepted improvement. |
| Vitest-shaped counts | Regex-derived counts | Equivalent JUnit cases and counts | Structured result is the accepted improvement. |
| Mocha-shaped counts | Regex-derived counts | Equivalent JUnit cases and counts | Structured result is the accepted improvement. |
| pytest-shaped counts | Regex-derived counts | Equivalent JUnit cases and counts | Structured result is the accepted improvement. |
| Unknown output | Exit-code fallback | Explicit `exit-code` mode | Equal simple gate meaning without pretending to know framework case details. |
| Zero tests | Legacy parsing can invent or lose counts depending on text | Required JUnit with zero cases is an execution error | Replacement removes false-pass ambiguity. |
| Invalid or missing report | Legacy can fall back to console or exit | Required report is an execution error | Replacement fails closed. |
| Timeout and cancellation | Both become one timeout-style error | Separate `timed_out` and `cancelled` states | Replacement preserves the real cause. |
| Fail once, then pass | Retry behavior is outside the old unit result | Both attempts retained; final node is unstable | Replacement makes retry history explicit. |
| Independent tools | One old unit command | Several ordinary nodes run within declared concurrency | Replacement adds required multi-tool support. |
| Large logs | Old `execFile` buffering is implicit | Explicit bounded output with complete group termination | Replacement has an operator-controlled limit. |
| Advisory unit failure | Not expressible per old unit instance | Visible advisory failure cannot block the gate | Replacement adds accepted policy control. |
| Coverage failure | Mixed into old suite configuration or absent | Separate linked coverage result | Coverage cannot rewrite the source unit result. |

The non-real dialect rows do not claim that Phase 9 installed every framework.
They compare the old parsers with equivalent standard JUnit facts. The real
portable tool proof uses Node's built-in runner. Later report adapters are added
only for a real format requirement that JUnit or exit-code mode cannot meet.

## Supporting proof

- Phase 8 vertical proof covers missing, malformed, zero-case, exit/report
  conflict, advisory coverage, several nodes, and real remote evidence.
- The plan-runner proof covers retries, unstable success, dependencies,
  cancellation, concurrency, and durable attempts.
- The direct-command proof covers literal arguments, output limits, timeout,
  cancellation, network denial, filesystem denial, and complete child cleanup.
- Phase 7 proof covers authenticated transport, restart, duplicates, committed
  source, evidence import, and Nova's authority.
- The Phase 9 parity proof covers explicit selection and configuration,
  protected environment denial, path denial, required reports, stable identity,
  and unit dual-authority rejection.

## Result

No useful legacy behavior is lost. Differences are either richer structured
evidence, clearer terminal states, explicit project configuration, separate
policy, or negative proof that an accepted old defect cannot return.

Phase 10 remains the only phase allowed to switch authority and delete the old
unit path.
