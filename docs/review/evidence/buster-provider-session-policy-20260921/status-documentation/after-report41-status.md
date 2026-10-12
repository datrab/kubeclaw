# Buster provider session policy

Status: bounded independent runtime verification of the integrated
37-field execution-policy generation, including nine required provider-session
settings. It is not completion of the whole CONFIG work or any outstanding
native-budget, recovery, readiness or live-deployment gate.

The maintained operator reference is
[Buster execution configuration](../../../architecture/buster-execution-configuration.md).
The original private proposal is preserved in
[the first manifest](../../evidence/buster-provider-session-policy-20260921/manifest.json).
The integrated expansion is bound in
[the integration record](../../evidence/buster-provider-session-policy-20260921/integration-result.json).
Subsequent constructor extraction, additional consumer tests and the protocol
correction have their own before/after records. Do not treat the initial
11-file proposal as the current implementation identity.

## Implementation

The same immutable `{provider, observation}` snapshot reaches normal provider
sessions and cleanup recovery. Loader and direct Session constructors require
all fields before package or process effects. The canonical Buster engine file
is the value author; schemas validate and never supply missing values.

The nine fields cover cumulative protocol bytes, parent termination grace,
termination wait, capability drain, Node heap floor/fraction, pending capability
count, descriptor floor and artifact descriptor reserve. Units and exact
operator semantics are documented in the reference above.

The stdout budget is checked before readline dispatch. An over-budget chunk
cannot log, invoke capabilities or complete a result. Its terminal protocol
failure remains available to later initialize, execute and cleanup calls,
including an overflow between operations. This preserves the specific failure
instead of reporting only a subsequent closed process. Other execution failures
are not made permanently sticky.

The parent escalation timer applies only while the child remains open. The
existing native sandbox supervisor independently attempts descendant cleanup
with twenty 5-ms reap waits before forcing termination. It can close the process
before the parent reaches its selected 500-ms grace. This native policy is still
a separate configuration-migration item; the parent setting does not override it.

## Verification and limits

The independent stable run is
[session37-runtime4](../../evidence/independent-buster-runner-execution-child-20260921/session37-runtime4/results.json).
It passed the actual maintained execution-config command (142 tests), original
Runner and real-provider checks, capability checks, lint/Helm delivery and
649 component checks. Three TypeScript projects and canonical source lint passed
before the runtime run. Source identity, dependencies and the actual sandbox
build output are bound separately; there was no unexpected source drift.

The consumer coverage includes actual heap capacity and descriptor exhaustion,
protocol low/high profiles, real capability IPC admission and settlement,
DefaultRunner cleanup and wrapper budgets, and report limits. The idle-overflow
regression uses real child bytes after initialization, with a higher-limit
positive control. The termination-bound test delays delivery of an already
observed OS close; it does not simulate an unkillable kernel process.

The initial failing protocol and escalation assertions remain archived. The
protocol correction fixes a real dispatch-order defect. The escalation oracle
was corrected to account for the actual native supervisor: the 50-ms profile
requires parent TERM/KILL; the 500-ms profile requires TERM and actual closure
without a parent KILL. Both retain cancelled results and absence of the child.

All four independent negative controls were detected at their intended
behavioral assertions: the old listener order dispatched an over-budget log;
removing idle failure retention returned PROCESS_CLOSED instead of PROTOCOL_LIMIT;
forcing 500-ms grace lost the required parent KILL in the 50-ms profile; forcing
50-ms grace sent a forbidden parent KILL in the 500-ms profile. The
[control results](../../evidence/independent-buster-runner-execution-child-20260921/session37-controls1/results.json)
retain all failing mutant runs. Their expected failures are countercheck evidence,
not passing executions of the mutated product.

The earlier mixed-revision run is retained as failed/non-final evidence. Its
three additional test-file changes and command registration overlapped the run;
it does not substitute for the stable repetition. Original failures were not
converted into passes or removed.

This checkpoint does not prove complete physical attempt accounting, historical
import/compaction, native isolation, all plugin configuration migrations or live
operation. The subsequent 41-field report-runtime expansion has its own
[independent report](independent-buster-report-runtime-implementation-20260921.md).
It records successful runtime and negative-control checks and the still-open
Kubeclaw raw-value rejection cases. These 37-field results do not certify that
later source revision.
All original finding statuses and remaining acceptance gates stay open unless
closed by their own complete evidence.
