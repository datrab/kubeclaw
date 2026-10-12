# Buster Runner quality: private decomposition draft

Status: private source work only. No live source change, runtime/type/lint execution,
or acceptance. LC/PC independent review retains its frozen production sources.
Provider-child's separate twelve findings belong to Root and are outside this patch.

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
all executable test cases after `let sequence = 0` remain byte-identical and in
original order. `test-preservation.json` binds both that suffix and the original
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

## D17 authorities that cannot be disguised as refactoring

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

The existing buster-engine owner currently has only preparation and service
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
This broader delivery/constructor migration is an explicit pending design boundary,
not an accepted larger policy change.

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
consume the observation field through its existing initialize payload. Its change
is coordinated separately and is not included in this private Runner draft.

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
Making it throw solely to satisfy lint changes behavior. The extracted completion
owner must record/return an explicit pending-admission outcome and handle that
outcome at its caller while preserving the successful durable-result return.

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
and after binding remain required. No runtime is authorized during the current
independent LC/PC review window.

## Required execution-policy migration: pre-test contract

Root explicitly authorized implementation of the full private policy slice, rather
than stopping at design. The same Buster owner now has a private draft of required
`execution.provider`, `execution.reports`, `execution.observation` and
`execution.stores.{attempts,admission}`: 27 authored numeric leaves. Its shared
sources were captured again after the BR integration; later BR fixes must be
rebased before any live integration. The earlier design-only statements above
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

No runtime checks have executed for this draft. The 31 historical findings cannot
be marked resolved from private file sizes or method extraction alone.
