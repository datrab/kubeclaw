# Buster Runner quality and required execution policy

Status: 68 files integrated after exact live-baseline checks and complete after-hash
verification. The frozen [integration manifest](../../evidence/buster-runner-quality-20260921/integration-manifest.json)
and [integration result](../../evidence/buster-runner-quality-20260921/integration-result.json)
include the 65-file Runner/Execution patch and Root's three Child/protocol-test/
ESLint-boundary files. Chart aliases retain their original link targets. The first
preflight rejected an existing Chart alias before any writes; the completed runner
binds both link text and physical target identity before writing through it.

No new runtime/type/lint result is claimed. BR review has ended; the independent
combined reviewer now owns the exclusive Types/Lint/runtime slot. Live sources are
frozen for that review. The historical 31 Runner and 12 Child quality findings stay
open until actual checks establish their disposition.
## Scope and preserved behavior

All thirty Runner findings plus the original contract module's size finding from
`config-worker-local-runtime-20260921/run9/canonical-lint.txt` remain in scope. No
limit, rule, ignore, assertion or deadline may be relaxed. The existing runner is
the sole implementation; extracted modules must be called from its public API.
No alternative scheduler, completion authority or provider lifecycle is introduced.

The starting three files are independently copied and hashed in
`evidence/buster-runner-quality-20260921/baseline-identities.json`. Root's output
validation extraction is adopted only after exact before/after hash checks against
its original identities. `root-output-preservation.json` records that comparison.
The initial contract fixture extraction moves only its setup/model declarations;
all executable test cases after `let sequence = 0` were initially byte-identical and
in original order. Subsequent required-policy argument migration changes those
bytes explicitly; that initial extraction proof is not a claim of current byte equality. `test-preservation.json` binds both that suffix and the original
setup body. Neither is runtime evidence.

## Cohesive module boundaries

| Responsibility | Intended extracted owner | Invariants |
| --- | --- | --- |
| Public options/result types | runner-types.ts | Existing exports reexported; required policy stays required. |
| Constructor validation and owned stores | runner-setup.ts | Policy first, original validation/mkdir ordering, exact path/alias checks. |
| Identity, profiles and grants | runner-identity.ts | Original digests and package identity; node grant wins over registration even when empty; otherwise deny. |
| DAG scheduling | runner-scheduler.ts | Sorted admission, dependency states, same group counters, Promise.race ordering, finally fixture cleanup. |
| Node retry/result composition | runner-node.ts | Same retry/cancel/cleanup stopping conditions and receipt nonce timing. |
| Attempt invocation and Core envelope | runner-attempt-envelope.ts | Same claim/window/queue limits and exact signed payload; no new authority. |
| Provider operation and staging | runner-provider-operation.ts | Same prepare/load/execute/terminate/cleanup promises and no false settlement. |
| Selected/error evidence and logs | runner-attempt-evidence.ts | Same report/output expansion, error fallback and byte/file quotas; abort preserved. |
| Attempt result mapping | runner-attempt-result.ts | Evidence fault precedes runtime fault precedes worker summary; original digest and outputs. |
| Durable completion and recovery | runner-completion.ts | Store result before admission, unchanged completion intent/retry semantics. |
| Retained fixture lifetime | runner-fixtures.ts | Same reverse cleanup and cleanup-error attribution. |
| Contract fixture | tests/fixtures/test-gate/runner-contract-fixture.mts | Original provider source, setup and modeled loader unchanged; every case remains in maintained original script. |

Names are concrete draft boundaries, not a claim all extractions already exist.
Operation state must have a single owner; passing a typed context is preferable
to cloning state or a framework of generic callbacks. Each helper must express
one operation and preserve its ordering, rather than hide a long body in another
file. Function-size/complexity and file limits apply to every new file.

## Historical D17 inventory before this migration

The three flagged fallback chains are authority/error precedence, not configurable
operator defaults: node grant → registration grant → empty deny; evidence fault →
runtime fault → worker diagnostic. Replace chains with named explicit decisions
without changing empty-array or empty-string behavior. Do not add a config value
for protocol error strings or map initial values.

Separate actual operator defaults exist even where no lint rule flags them:

- Runner cleanupTimeoutMs defaults to 30000 in attempt execution and retained cleanup.
- maximumProviderResultBytes defaults to 16777216.
- Default durable-attempt storage constructs its seven quota values locally.
- Default admission storage constructs its five quota values locally.
- Provider child resource sampling uses a hardcoded 10ms memoryTimer interval.
  It is not established as an immutable protocol constant; the proposed owner is
  buster-engine.settings.execution, forwarded through initializePayload. Root owns
  the separate Child session refactor; this draft must not modify that child.
- Core envelope adds 60000 to claim lifetime and sets queue deadline 60000; these
  require explicit policy classification before pretending complete D17 coverage.

At inventory time, the buster-engine owner had only preparation and service
admission. Preparation cleanup 10000 governs another process; it must not replace
provider cleanup 30000 merely because the key name matches. Proposed required
execution fields belong to buster-engine.settings.execution, with typed explicit
forwarding from the already loaded snapshot to service/prepared execution/Runner.
Storage quota ownership requires its own explicit buster-engine settings block or
injected fully configured stores through every public construction path. Missing
values must fail before directory/store effects, not trigger the old limits.
Schema/Helm/raw invalid inputs, all constructor fixtures and actual two-profile
consumers are required if these new fields enter this patch. No partially migrated
settings object or unchanged defaults hidden in setup.ts counts as completion.
This was the initial design boundary. Root subsequently authorized the required
execution-policy migration below; implementation is now integrated but unaccepted.

### Shared report execution policy (same Buster owner)

The freshly inspected [Stage/report inventory](config-stage-report-plugin-inventory-20260921.md)
adds the real specialist-report-finalization.ts authors to this same execution
policy, rather than a second configuration owner:

| Proposed execution.reports field | Existing value/consumer |
| --- | --- |
| maximumAggregateResultBytes | 16777216, accumulated JSON reports and remaining adapter output budget; also Core wrapper result budget. |
| maximumSourceBytes | 67108864 cap, still bounded by the selected artifact and at least one byte. |
| maximumCases / maximumFindings / maximumCaseFindings | 5000 / 5000 / 100, actual adapter child inputs. |
| maximumTimeoutMs | 300000 cap, still min with actual provider cleanup timeout. |
| memoryBytes | 536870912, real adapter process profile. |
| minimumCpuTimeMs | 1000 floor; preserve timeout rounded down to seconds and runtime's exact-second requirement. |
| maximumOpenFiles | 64, actual sandbox descriptor profile. |

Typed BusterExecutionPolicy should contain provider, reports and observation
sections within buster-engine.settings.execution; the common snapshot is loaded
once and forwarded explicitly. No imaginary JUnit registration schema and no
separate shared-worker owner are introduced. Root-owned child sampling work must
consume the observation field through its existing initialize payload. Its change was coordinated separately and is included in the combined 68-file
integration manifest.

Report runtime security ceilings and memory feasibility remain independent
validation: source <=64MiB, output <=16MiB, timeout/CPU <=300000ms, memory <=2GiB,
FD16..256 and memory >=64MiB + 3×source + 2×output; CPU remains whole seconds.
Do not raise these ceilings when centralizing lower selected policy values.
Whether a parser resource ceiling is itself configurable remains explicit broader
D17 work, not an unexamined protocol exception. Required-source policy definitions,
negative/raw inputs, two actual adapter process profiles and accumulated-output
controls must accompany implementation; model executor argument checks alone do
not satisfy real sandbox acceptance.

The swallowed admission-resume error is also a contract boundary: the durable
result/intent must remain available for original recovery without provider replay.
Making it throw solely to satisfy lint changes behavior. Independent source review
rejected the initial unused pending-outcome object; it has been removed. Completion
returns only the already committed result. The opportunistic admission catch uses
the existing canonical `INTENTIONAL_NONCRITICAL(committed_completion_admission)`
contract: `storeResult` succeeds outside that catch; a missing admitted closure is
left for Nova's existing `resumeCompletion`/completeness recovery. No new throw,
status authority, provider retry, or lint rule was introduced. The original outage
and real recovery/provider-count assertions remain required evidence; this comment
alone is not a runtime proof.

## Required original verification after source-window release

1. Complete original check-pipeline-test-plan-runner.mts, including the real
   cooperative abort, noncooperative 20ms/<2000ms hard timeout, real loghang<1000ms,
   both unresolved model negatives, all cleanup/evidence/retry/grant/path oracles.
2. Complete original check-pipeline-remote-real-provider.mts and current LC
   two-profile/two-job real-provider replay consumer; no execute/worker substitution.
3. Original Core runtime + deadline modules and seven LC policy cases.
4. Original direct-command-output-contract.test.mts (Root output extraction).
5. Existing observability recovery/admission-outage cases in the original Runner
   script; real result and completion-intent persistence assertions unchanged.
6. Relevant maintained Buster runtime, shutdown, cancellation and original caller
   modules; explicit list expanded from actual changed dependency closure.
7. Full relevant maintained types, strict canonical lint for old/new modules and
   original contract fixture, package/artifact inclusion of every extracted module.
8. Required-policy negative/actual consumer controls for any D17 fields added;
   semantic mutants for lost grants/error precedence/retry/cleanup and output
   validation as appropriate to the final delta, independent nonauthor review.

The established narrow actual GNUflock/GNUtar harness and full source/tool before
and after binding remain required. The independent combined reviewer owns the
current execution slot; the author does not run concurrent checks.

## Required execution-policy migration: pre-test contract

Root explicitly authorized implementation of the full private policy slice, rather
than stopping at design. The same Buster owner now has integrated required
`execution.provider`, `execution.reports`, `execution.observation` and
`execution.stores.{attempts,admission}`: 28 authored numeric leaves. Its shared
sources were captured after the BR integration, and all current live baselines
were checked again before the combined integration. The earlier design-only statements above
remain history, not a claim that the implementation is finished.

- EX1: every required leaf and envelope rejects omission, null, boolean, string,
  fraction, nonfinite and out-of-range values. Both Helm consumers match the
  component decoder, including CPU whole seconds and safe combined result bound.
  Loaded settings are independent immutable copies from one bundle snapshot.
- EX2: factory, Service and Runner validate before their own directory/store
  creation. Removed Runner cleanup/result option fields reject even equal values;
  raw legacy runtime/config authors remain rejected by their actual decoders.
- EX3: default provider execution under two centrally authored result budgets
  must actually differ: the small budget persists TEST_PROVIDER_RESULT_LIMIT;
  the larger budget runs the real isolated provider successfully. No execute or
  workerRuntime substitute establishes this consumer claim.
- EX4: actual report processes under two authored profiles retain source/package
  binding, execute with selected limits, and enforce accumulated-result limits.
  CPU derivation remains whole seconds with selected floor; timeout remains min
  of selected report cap and provider cleanup. Existing detail/security bounds
  and real artifact identity checks remain unchanged.
- EX5: claim grace and queue deadline both use selected explicit policy, while
  worker identity/digest and original receipt authority remain intact. Actual
  stored evidence/result/closure/admission quotas use the selected store policies;
  quota exhaustion must be demonstrated at real store writes, not only constructor
  argument observation. Existing custom injected stores remain explicit caller
  dependencies; no default quota is silently reconstructed by a fixture.
- EX6: Parent process sampling and child RSS sampling have separate fields owned
  by the same execution.observation policy. Child initialize carries only required
  `{resourceSampleIntervalMs}`; Root owns that implementation and its exact schema.
  Original cleanup/recovery sessions reuse the same observation profile. Two real
  sampling profiles need observed effects; constructor argument checks are partial.
- EX7: all original assertions/deadlines remain; moving the original invalid
  cleanup input into the new provider policy changes only its decoder error prefix.
  Omission/forwarding mutants must fail through actual consumers for provider,
  report, timing and store authorities. Complete strict lint/types and independent
  source/runtime review are required before any quality or CONFIG closure claim.

No runtime checks have yet been claimed for this integrated snapshot. The 31
historical findings cannot be marked resolved from file sizes or extraction alone.
The 28-field consumer matrix, actual Helm parity, sampling profiles and recovery
controls remain distinct required work; representative budget tests and all-field
schema negatives do not establish complete consumer acceptance.

## First independent integrated check and bounded corrections

The independent `fast1` check (session 67712) ended with all three TypeScript
checks failing and 13 lint findings; its before/after source comparison had no
drift. This is a real red integration result, not an accepted quality gate.
The author corrected the execution/observation schema-name type union and copied
readonly grants into the mutable protocol-envelope array. Result mapping was
separated into provider fields, Worker execution state and cleanup state; Scheduler
now delegates the same complete sorted admission pass. No short-circuit scheduler
iteration or retry decision was added. These four exact deltas are preserved in
`evidence/buster-runner-quality-20260921/fast1-author-fixes/identities.json`.
Root owns the two original-test type corrections and ESLint configuration findings;
Release owns the seven provider-loader findings. No rerun is claimed here.

The additional private tests under `next-consumers/` are not integrated or run.
They distinguish actual parent `/proc` sampling frequency from resource-limit
coverage, and capture default Runner-owned store receivers while delegating all
original methods unchanged. Direct subsequent malformed-input/orphan operations
exercise real persistence; they do not claim valid production completions produce
quarantine or replace original recovery tests. The short sampling profile must
observe actual scans; a fixed-50ms mutation must invalidate the long-profile
oracle. All remaining store quotas and the broader 28-field matrix remain open.

An additional D17 resource author remains explicit: provider-loader's
`MAX_PROTOCOL_BYTES=16MiB` bounds cumulative child stdout (logs, RPC and results).
It is separate from the selected maximum provider-result size, so a schema-valid
large result budget is not a guarantee that this aggregate channel can carry it.
This patch neither widens that limit nor classifies it as an immutable protocol
constant. Its ownership and real boundary coverage remain broader D17 work.
