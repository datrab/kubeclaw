# Proposed same-entry receiving ABI — RPR01-01/02/04

This is a **definition proposal**, not a running loader, registry migration or
activation receipt. `config/pipeline.config.json` is the only root. Proposed
`pipeline-entry.v5` extends the frozen C3 v4 entry with `pluginSelections`; it is
not accepted simultaneously with v3/v4 for the same generation. The existing
root profile/features/tuning/overrides and component bindings remain exact.
Old generations decode with their original version and original captured bytes;
they never fill from v5 or current files. Migration produces a new authenticated
generation, never an in-place reinterpretation of an old entry.

## Sole author and binding identity

Each tuple is `{kind, packageId, registrationId, instanceId, ownerPath,
profileId, serviceInstanceId}`. `ownerPath` resolves relative to this root's
`config/` directory. The four concrete owner paths are
`plugins/kubeclaw.{api-flow,http,openapi,network-http}.config.json`; each contains
one registration instance and all its complete profiles. There is no second
editable per-profile file/index. All declared profiles validate, not just selected
ones. Instance/profile IDs use the closed nonempty128 stable-ID syntax in the
selected schemas; they are not restricted to fixture identity strings. The four
package/registration/kind domains here are this bounded source-supported cut, not
the installed roster or global plugin universe.

Whole component documents are copied byte-for-byte from C3-complete-profile-02
except the Buster owner: `provider-network-A` is an explicit complete clone of
`local-A`, changing only the full `execution.capabilityProviders.networkHttp`
object. The root selects it only for `fixture.service.buster-runtime`; preparation
still selects historical local-A. Its HTTPS fixture origin443, headers and methods
agree with the provider task definitions; the old C3 local-A localhost18080 stand
is **not** silently treated as this target. No native-source receipt or grant follows
from those values. Nova's `fixture.service.nova-runtime` is a fixture receiving
context requiring its actual authenticated boot/runtime/service receipt; it is not
a seventh component author or fabricated installed service.

Before selection: reject invalid root/owner schema, duplicate semantic tuple,
ambiguous `(serviceInstanceId, kind, registrationId)` current receiving-map key,
missing owner/profile/required field, wrong package/registration/kind/instance,
wrong path, unknown service context, disabled/uninstalled registration, package or
schema digest mismatch, nonmatching contract ID, unsafe/escaping/mutable source
capture, and absent source/tool/prompt/trust/grant/native receipt. Different
registration instances in different real service contexts remain possible; two
instances mapping to one current adapter/provider registry key are not silently
collapsed. Supporting simultaneous same-key instances would require an explicit
new receiving-map ABI and authentic routing—not renaming a fixture.

Definition checks implement only the finite schema/tuple/whole-profile relations
visible in these artifacts. They cannot prove installed/service eligibility: the
actual receipt is absent. Future C4 admission must check it before provider,
adapter, network, filesystem effect or secret resolution. Proposed new selection
errors are a receiving-ABI obligation, not claimed current productive error codes.

## Exact current receiver seams and proposed parameter delta

| Receiver | Current source facts | Proposed v5 receiving change |
|---|---|---|
| registry `foundation/registry/build.ts::canonicalTestProvider`119–157 | immutable package registration owns capabilities, ports, reports, retrySafe, matrixFields, evidence types/defaults, config schema/digest | Keep immutable manifest-derived registration unchanged. Capture separate immutable selected-instance policy and digest in generation. Never overwrite package safety/support facts with owner declarations. |
| `foundation/registry/configuration.ts::resolveTestProviderConfiguration` | registry contract lookup; `resolveReferencedValue` clones/defaults and validates current package schema; emits provider-configuration.v1 `{contractId,schemaDigest,values}` | Add authenticated selected policy argument; task-only schema and complete policy schema are separate; no root-policy default injection by task schema. Emit proposed provider-configuration.v2 `{contractId,taskSchemaDigest,values,selectedPolicy}`; `values` contains only task data; `selectedPolicy` contains schemaVersion, complete processing/declarations and immutable binding identity. |
| Nova `test-gates/resolver.ts`481–483,493,557–563 | node evidence override replaces defaults; matrix allowed by immutable registration; retry safety tested; config resolution first validates/injects schema defaults | Pass exact selected service/registration instance policy. Validate overrides against per-package/outcome mandatory baselines before replacement. Effective matrix fields are manifest intersection selected subset. Effective retry safety is manifest.retrySafe AND selected retrySafe; existing task acceptUnsafeRetry remains explicit task intent, not config support expansion or grant. Selected false changes default retry choice when no explicit request, not a fabricated immutable package change. |
| Buster runner and worker envelope | node configuration.values + immutable registration + resolved evidence/limits enter actual attempt; runner.ts123–125 uses selected lists to retain logs | Carry v2 policy/binding unchanged through claim/envelope/provider invocation, validate schema/digest before execute. Do not reconstruct policy by spreading task configuration into it. Current loaders know v1; v2 migration is required future implementation. |
| Actual API-flow/HTTP/OpenAPI `provider.js` | root configuration currently contains task and quotas; API-flow step timeout is real task deadline | Task values read only from values; operator defaults/ceilings/processing budgets read only from selectedPolicy.processing. API-flow step.timeoutMs remains task requested deadline. No merge returning a second editable quota authority. |
| Nova `AdapterRuntimeOptions.configs`, `AdapterStarter.#config/#context` | map keyed registrationId, current package config schema validates before activation, context.config captured once per run | Populate map with ONLY selected complete processing projection after root tuple/package/schema validation; preserve origin/method/header/byte/timer meaning. Carry binding identity separately through runtime/effect owner. Validate proposed complete adapter schema before existing activation; do not activate to check it here. Restart/new run required for a new generation. |

`selectedPolicy` v2 binding contains root raw digest, owner raw digest, selected
whole-profile digest, kind/package/registration/instance/profile/service IDs,
original package content digest/version, task/owner schema digests and reader
version. Those are immutable projections from captured bytes/actual registry,
not editable policy fields. Provider contracts must add an explicit v2 union arm
and all current provider/worker/resolver validators must recognize it together;
passing v2 into current v1 is forbidden. Nova's current adapter.context.config ABI
can retain its object shape for the selected processing projection, but its map
must be generated by the same bound entry and carry the same closure separately.

## Deadline/default migration and relationships

All three provider owners define required integer `requestTimeoutMs` (sole
operator default) and `maximumRequestTimeoutMs` (operator ceiling), each1..300000;
default<=ceiling is a semantic admission rule. `maximumResponseBytes` remains
source-supported1..16777216. API-flow step `timeoutMs` remains optional task
requested duration1..300000, including equal-to-default values; omission selects
the sole operator default, not a task-schema default. `flow-deadline-A/B.json`
explicitly request50/500; complete `deadline-ceiling-A/B` profiles hold default1000
and ceilings1000/500. Request50 is a negative masking control (same under both),
request750 distinguishes the selected ceiling1000/500, while step300001 is rejected
at the actual task boundary. Whole root/claim/native association must retain
invocation and resource ceilings above the chosen discriminating durations.

Current API-flow formula137 is
`min(integer(step.timeoutMs, root.requestTimeoutMs ??10000,1,300000), invocation.timeoutMs)`.
That formula does NOT enforce a separate root ceiling when step supplied.
Proposed v2 formula is
`min(step.timeoutMs ?? selected.default, selected.ceiling, invocation.timeoutMs,
authenticatedNativeCeiling, authenticatedRemainingDeadline)`; remaining deadline
uses the original clock/deadline/cancellation provenance and is never a task
numeric field or new independently reset wall clock. If no positive remaining
duration exists, cancel before invoke. HTTP/OpenAPI have no step requested timeout;
their input uses the sole default with the same ceiling/invocation/native admission.
The current native runtime **rejects**, rather than clamps, over-ceiling requested
timeouts or response limits. The v2 materializer must expose authentic native
bound ceilings for the proposed clamp; current code does not already do so.

Both retained source semantics and new target behavior require real later provider
tests. The direct standalone root0/step500 probe is not a valid current resolver
pipeline: current `resolveTestProviderConfiguration` schema rejects root0 first,
then its default resolver fills absent current root values. Retain this as a
source-branch qualification, not an exploitable real resolved root0 bypass.

## Mandatory evidence, package capability versus policy

All three outcomes require log. API-flow/OpenAPI returned pass/fail additionally
require their actual produced test-report; error requires log, not a report that
a throwing provider never produced. HTTP produces no evidenceFiles/reports, only
runner log. Selected owner schemas require the exact supported produced baseline
per outcome, reject [], missing log/report, duplicates and unsupported types.
Resolver node overrides must meet the same baseline before overriding; a required
artifact/report union in `runner-attempt-evidence.ts` cannot repair omitted logs
or generally repair unproduced default artifacts. Do not silently union invalid
overrides into validity.

There is no distinct valid alternate evidence type selection for these exact
package/outcome baselines. Original ALT/F-EFFECT obligations stay OPEN/unwaived;
neither a fake error report nor empty evidence is a safe B. HTTP retry true/false
and matrix[path]/[] are source-supported conservative complete profile pairs.
API-flow/OpenAPI retry true and nonempty matrix are rejected: package retrySafe
false and matrixFields[] remain immutable safety/support ceilings, not tunable
claims. This is package-specific—not global narrowing of boolean or array domains.

## C3 dependency transition, not acceptance

This02 freezes C3-complete-profile-02. Its independent BC3-R02-01 finding on optional
registry CA and auth-absent HTTP lab receiving references remains OPEN. The sibling
C3 author is preparing additive03;02 does not silently mix in its changing files.
After a frozen03 independent bounded recheck, build a new generation preserving all
v5 plugin tuples/policies and replacing only pinned complete C3 owner/schema and
generated registry-peer/securityScan receiving-reference projections. Authentic
registryCaFile is an optional captured deployment/provider reference, not a new
plugin policy writer; auth-absent lab versus authenticated registry transport must
follow03's exact source contract. Current02 cannot claim that seam or whole C3/C0
accepted. Original schema/package/task/credential/claim receipts remain mandatory.
