# ProcessInput quality corrections — 2026-09-21

Status: source-reviewed corrections integrated; runtime acceptance pending. This record does not close CONFIG, REGISTER, a whole original finding, or native/live gates.

The latest 44-field baseline passed three type checks but failed canonical lint with 35 errors. Independent comparison identified 34 existing failures and one newly oversized function. The failed run remains evidence; earlier passing generations do not certify this revision.

The integrated correction extracts command-policy validation without changing validation order. Process cleanup now records unexpected TERM, timed KILL, final KILL and group-observation failures instead of swallowing signal failures. It continues waiting for actual child close within the same selected cleanup deadline. Group failures are recorded immediately, so a close timeout cannot erase an already observed group error. ESRCH remains expected. Pipe destruction is never termination evidence.

Four additional regressions inject narrow signal/observation faults around genuine owned child processes and require exact error identity, actual close and the unchanged cleanup bound. All seven existing test bodies remain byte-identical. These injected faults do not prove real kernel permission behavior. The rejected V1 implementation and its independent rejection remain preserved.

The canonical ESLint configuration declares exactly the Kubernetes and Tailscale infrastructure command adapters as environment boundaries. No thresholds or fallback rules are relaxed. These declarations describe transport-environment access, not completion of all configuration migration.

Source decisions and frozen identities:

- [Production V2 review](../../evidence/independent-buster-process-input-quality-20260921/source-review-v2.json)
- [Four-regression review](../../evidence/independent-buster-process-input-quality-20260921/regressions-source-review-v1.json)
- [Actual integration identities](../../evidence/buster-process-input-quality-20260921/integration-result.json)

Outstanding: actual positive regressions, original runtime suites, all three type checks and complete canonical lint after integration, lifecycle/forwarding and error-retention negative controls, both-chart report addendum, exact revision binding and independent final review. The Kubernetes simplicity refactor V3 and additional ESLint boundary tests are now independently source-reviewed and integrated. The refactor replaces the monolithic implementation with nine directly connected modules; original runtime test bodies are unchanged. V1 invalid local exports and V2 stale source assertion were rejected and corrected before integration. Earlier rejected drafts remain evidence. This structural change preserves existing operator defaults and best-effort release-error suppression; those remaining configuration and cleanup diagnostics issues are not claimed resolved. No genuine cluster-writing test is authorized by this local record.

## Executed checkpoint and remaining failures

The preceding outstanding list records the integration checkpoint. Subsequently,
the [third fast run](../../evidence/independent-buster-runner-execution-child-20260921/process44-fast3/results.json)
passed all three type projects and the canonical lint over the maintained affected
source/test targets. Its final correction only renamed a boolean predicate to
`isInvalidArrayEntry`; validation logic and lint rules were unchanged.

The [first full local runtime batch](../../evidence/independent-buster-runner-execution-child-20260921/process44-runtime1/results.json)
failed. The maintained execution suite passed 189/190 cases, including the new
ProcessInput error-retention cases and both-chart report policy cases. Components
passed 649/649. Original ProcessInput/lifecycle, Kubernetes implementation,
Report/JUnit, Runner, real-provider and capability checks passed. The CPU report
profile's expected-success branch failed with a null child exit code. The
Tailscale implementation test stopped at a missing native chart binding, and
both new environment-boundary cases stopped at a TypeScript parser error for
their nonexistent sibling paths. No unexpected source drift occurred. This is
not a passing full revision and no negative controls were run against it.

The [bounded diagnostic findings](../../evidence/independent-buster-runner-execution-child-20260921/process44-diagnostics1/review-findings.json)
confirm the nonexistent-path parser failure. They also record an isolated CPU
pass with unchanged workload and limits: the low profile was killed and the
high profile completed approximately 1.2 seconds of measured CPU work. That
isolated pass does not explain or invalidate the earlier failure. Independently
reviewed test corrections now supply the real sibling path and the generated
native render prerequisites without removing original assertions. The corrected
revision still needs its complete positive run, negative controls and independent
final acceptance. Actual Kubernetes/Tailnet operations remain outside these
local proofs.

## Independent bounded acceptance

The subsequent corrected revision is accepted in the
[independent implementation review](independent-buster-process-input-implementation-20260921.md):
all three type checks and maintained affected-source lint passed, the full
maintained execution suite passed 190/190, components 649/649, register 26/26
plus the real checker, and the affected original local runtime modules passed.
All eight restored-literal, disconnected-forwarding and error-retention controls
were applied and detected at their intended behavioral or contract boundaries.
The earlier CPU failure remains documented and unexplained; the later full pass
does not retrospectively change it. This accepts the bounded ProcessInput change,
not all of CONFIG, native isolation, historical cleanup or the original findings.
Later changes require their own relevant verification and cannot inherit this
revision's full-tree evidence without a reviewed dependency comparison.
