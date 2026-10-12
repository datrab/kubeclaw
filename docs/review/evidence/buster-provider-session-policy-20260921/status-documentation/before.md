# Buster provider session policy: private implementation candidate

Status: private, unreviewed and unexecuted. Current Runner/Execution Runtime2
sources remain unchanged. This extends the same `buster-engine.config.json`
`settings.execution.provider` owner; no new configuration author or default is
introduced. The previous 28 leaves are not overall CONFIG acceptance.

The private 11-file candidate and exact baselines are in
[the manifest](../../evidence/buster-provider-session-policy-20260921/manifest.json).

| Required provider field | Preserved initial value | Real consumer |
| --- | ---: | --- |
| maximumProtocolBytes | 16777216 | Cumulative actual child stdout bytes, including RPC/log/results |
| terminationGraceMs | 500 | SIGKILL escalation after actual termination request |
| terminationTimeoutMs | 1000 | Termination promise bound, actual close still required |
| capabilityDrainTimeoutMs | 1000 | Outstanding real capability-operation settlement |
| minimumHeapMiB | 16 | Node max-old-space-size floor |
| heapFraction | 0.7 | Node heap fraction of actual invocation memory |
| maximumPendingCapabilities | 32 | Actual pending capability map admission |
| minimumOpenFiles | 64 | Sandbox process descriptor floor |
| artifactFileDescriptorReserve | 32 | Additional descriptors above artifact allowance |

A single immutable runtime policy contains `{provider, observation}`. Loader and
public low-level Session validate that exact object before package snapshot or
process creation. The same frozen settings reach normal and cleanup-recovery
sessions. Child initialization still receives only its existing observation
resource-sample field. No child protocol change is required for these parent
settings. Capability maximum and drain arguments become required; original direct
capability fixture explicitly supplies its former 1000ms drain limit.

The canonical schema defines required integer fields, safe bounds, and the one
fractional number `0 < heapFraction <= 1`. Shared JSON decoding and both Helm
consumers must enforce the same domains; grace must precede termination timeout.
Milliseconds/seconds and bytes/MiB conversions remain fixed unit conversions.
Descriptor addition must remain exactly representable before any process starts.
Heap feasibility against the invocation memory profile still needs explicit
source review: the original floor could exceed an unrealistically small invocation
budget; this candidate must not silently expand memory or change original timeout
oracles. The private current candidate has the original floor/fraction arithmetic
and safe floor-conversion bound, not a claimed process feasibility proof.

## Required proof before acceptance

1. All nine fields reject missing/null/boolean/string/nonfinite/out-of-range input;
   heapFraction accepts fractional profiles and rejects zero and values above one.
   Validate before any package snapshot/process effect, including direct Session
   and Loader constructors. Exact old observation-only constructor rejects.
2. Full original Runner, real-provider, LC/PC, readiness, Core deadline, capability
   native-HTTP and cleanup-recovery tests retain their original assertions and
   deadlines. No modeled completion replaces process closure.
3. Actual child protocol output below/above two configured aggregate caps must
   distinguish success from TEST_PROVIDER_PROTOCOL_LIMIT; preserve result/log
   sublimits so they cannot mask the selected aggregate boundary.
4. Real cooperative and uncooperative provider processes establish TERM, selected
   escalation, actual exit and selected final bound; tests observe signals/closure,
   not only setTimeout arguments. Existing <1000ms/<2000ms oracles remain intact.
5. Real outstanding capability calls distinguish two drain profiles and two
   pending-count profiles, with actual settled/remaining ownership and invocation
   counts. Timeout is not proof of quiescence and must not trigger provider replay.
6. Actual provider observes its Node heap limit and actual descriptor allocation
   under two profiles, including floor-dominant and derived-dominant cases. A mere
   spawn-argument spy is partial. Keep sandbox authority and grants unchanged.
7. Both chart renders reject identical malformed/raw boundaries and accept both
   valid profiles; component checksum, physical aliases and image bundle delivery
   retain this existing owner. Exact source/tool binding and per-consumer lost-
   forwarding/default mutants are required. No current execution claim is made.

The generic all-leaf test must become schema-aware for heapFraction: rejecting
1.5 is still correct, but accepting 0.5/0.7 must be explicit. Existing integer
fields remain integer-only. Direct original loader callers must supply the exact
runtime projection from the canonical snapshot; tests cannot fill missing values.
