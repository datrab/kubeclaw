# Worker Core local runtime: remaining configuration boundary

Status: [independently reviewed source inventory](independent-config-worker-local-runtime-inventory-20260921.md)
and preimplementation criteria only. No runtime test, migration or implementation
acceptance is claimed. This extends D17 beyond the separately
accepted native ownership capacity change and the pending Prism listener change.

## Current authority and actual consumers

[`LocalWorkerRuntime`](../../../../skills/worker/core/worker/local-runtime.ts)
currently accepts three optional operator settings and supplies their values in
its constructor. All three must become explicitly authored configuration.

| Setting | Current fallback | Validation retained by migration | Actual effect |
| --- | --- | --- | --- |
| `drainTimeoutMs` | 300000 ms | Safe integer, 1–2147483647 | `drain()` waits for active operations before aborting them. |
| `cancellationTimeoutMs` | 30000 ms | Safe integer, 1–2147483647 | After drain expiry, bounds the wait for aborted operations to settle; expiry marks the runtime unhealthy. |
| `replayLimit` | 65536 attempts | Safe integer, 1–1000000 | Rejects admission when retained accepted-attempt identities reach the limit. Expired inactive identities are reclaimed before this check. |

The current repository production construction is
[`TestPlanRunner`](../../../../skills/buster/engine/test-gates/runner.ts), which
omits all three. Its actual remote path is `production.ts` →
`BusterRemotePlanService` → `executeBusterPreparedJob` → `runPlan` in
[`remote-prepared-execution.ts`](../../../../skills/buster/engine/test-gates/remote-prepared-execution.ts).
Neither the remote options nor runner options currently carry these settings.
The alternate supplied `workerRuntime` interface exposes only `runAttempt`.
Replay identities live in memory per runtime instance. This production path
constructs a new runner/runtime per prepared job; `replayLimit` is not a global
or durable replay-store quota.

**Lifecycle distinction:** this Buster path calls `runAttempt`, not `drain()`.
Consequently replay capacity has an active effect here, whereas passing drain
budgets through this constructor alone cannot prove Buster shutdown uses them.
Core lifecycle tests may prove Core behavior; they must not be relabeled as a
production Buster drain proof. Any integration of a new shutdown lifecycle needs
its own explicit Buster cancellation/cleanup contract and tests.

Capacity is a separate input: this constructor receives job `maximumConcurrency`,
already checked against service admission. Native ownership scope capacity comes
from the host pool. Neither is a reason to introduce a second editable capacity
value in a Worker Core file. Claim deadlines, protocol versions, schema bounds,
and the injectable real-time clock are not replacement tuning authors for these
three settings.

## Intended migration and criteria, recorded before implementation

Use one `worker-core.config.json` owner in the existing component bundle. Its
local-runtime section explicitly authors these three fields. Preserve the common
reference entry, full-bundle validation and generation consistency; do not add a
second Worker-specific file loader. Pass the validated immutable settings through
the actual production service and runner boundary. Core accepts explicit typed
options and validates them; it must not read process-global config itself.

- LC1: All three fields are required in the file/schema/typed Core options.
  Missing, null, wrong-type, fractional, out-of-range and unsafe values fail
  before readiness or attempt execution. No default/coercion remains in any
  constructor, caller, schema, fixture helper or entrypoint.
- LC2: The actual remote production path forwards the same validated values to
  `LocalWorkerRuntime`. Preserve admission, claim fences, provider isolation,
  cancellation and cleanup behavior. Do not silently add a drain lifecycle while
  migrating configuration. Tests must exercise the default execution path;
  replacing `execute` or `workerRuntime` cannot prove production propagation.
- LC3: Two explicit profiles exercise actual replay saturation/reclamation and
  Core drain/cancellation behavior. Real production replay propagation needs a
  consumer test, not just a schema/projection assertion. Core lifecycle and
  Buster lifecycle evidence remain separately identified.
- LC4: Keep the full original `verify:worker-core:local-runtime` contract script,
  its type coverage, `worker-deadline.test.mts` and relevant full runner cases.
  Fixtures author their existing effective settings explicitly, preserving all
  original assertions and timing budgets. Each of the three restored fallback
  mutations must fail a meaningful omission test; ignored production replay
  configuration must fail the consumer test.
- LC5: Deliver the new owner through every existing bundle packaging/mount path;
  check missing file, wrong owner, rollout checksums and immutable generation
  behavior. Removing any old author must be tested, not inferred from search.
- LC-DOC: Update the operator owner table, all field meanings/ranges, migration
  instructions and the actual lifecycle distinction above. Independently review
  final implementation, removed paths, original test scope and documentation.

## Adjacent work remains open

`TestPlanRunner` also constructs default evidence/admission stores with hardcoded
quotas. Those are Buster store policy and remain separate D17 work; this inventory
does not classify or close them. `BusterRemotePlanService` still supplies readiness
fallbacks of 1000 ms and 65536 output bytes when enabled. Migrating the three Core
fields must not conceal either remaining authority.

The [bound source snapshot](../../evidence/config-worker-local-runtime-inventory-20260921/source-identities.json)
records the inspected files. It is static source evidence, not executed tests or
a complete Worker Core settings inventory.
