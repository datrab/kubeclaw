# Proposed same-entry receiving ABI03 — RPR02-01/02

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

Whole component documents are copied byte-for-byte policy/root from C3-complete-profile-02 (identical03)
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
version plus c3RuntimeSchemaDigest/c3ReferenceContractDigest. Those are immutable projections from captured bytes/actual registry,
not editable policy fields. Provider contracts must add an explicit v2 union arm
and all current provider/worker/resolver validators must recognize it together;
passing v2 into current v1 is forbidden. Nova's current adapter.context.config ABI
can retain its object shape for the selected processing projection, but its map
must be generated by the same bound entry and carry the same closure separately.

## Deadline/default migration and ALL-profile admission — corrected03

All three provider owners retain required integer requestTimeoutMs (sole operator
DEFAULT) and maximumRequestTimeoutMs (operator CEILING), each1..300000. EVERY
DECLARED complete profile, not merely selected A, must satisfy default<=ceiling
before any selection/activation. All60 profiles and22 explicit entry fixtures
are enumerated by the narrow definition checker, with full policy/native/package
relations checked for all provider profiles. JSON schema shape success alone is
not whole-author semantic admission.

Each dedicated deadline-ceiling-A/B now keeps DEFAULT500, changes only CEILING
1000→500, and retains all other complete members. API-flow's actual task
flow-deadline800.json requests step800; explicit whole entries select these
profiles with the same native1000 resource and original invocation/remaining
absolute deadline>=1000. Proposed effective A800/B500 is causal. Actual step50
remains masking control50/50; omission/default yields500/500; equality500 accepted;
step1..300000 remains legitimate task intent, including equal-to-default requests.
The actual file schema accepts these requests. Nothing timed or invoked here.

HTTP/OpenAPI have NO per-step requested timeout. Same default500 under ceilings
1000/500 gives500/500: independent ceiling effect contrast is UNAVAILABLE under
a valid same-default current no-step caller. Their extra ceiling families are
ADMISSION/RELATION-only: default501/cap500 rejects, cap/default500 equality admits,
invalid0/noninteger rejects, and every unselected malformed profile rejects whole
owner admission. Do not invent a task timeout, weaken default<=ceiling, raise a
native budget or relabel changed ceiling metadata as timing effect. Original
requestTimeoutMs default50/500 full pairs remain meaningful and retain their
original future real timeout cases/requirements; no original case is waived.

Current API-flow provider137 formula is
min(integer(step.timeoutMs, root.requestTimeoutMs ??10000,1,300000), invocation.timeoutMs).
It does NOT enforce a separate operator ceiling. Proposed v2 formula is
min(step.timeoutMs ?? selected.default, selected.ceiling, invocation.timeoutMs,
authenticatedNativeCeiling, authenticatedRemainingDeadline). Remaining duration
comes from original clock/absolute deadline/cancellation provenance; it is not
new task input or a reset wall clock. Nonpositive remaining duration cancels before
invoke. HTTP/OpenAPI select only their default plus these admission caps.
Current native runtime REJECTS over-ceiling requests instead of clamping; authentic
native cap exposure and this proposed v2 minimum rule require real later receiving
implementation. Current productive v1 does not acquire this behavior from prose.

Standalone root0/step500 masking is still qualified: the real current resolver
first calls resolveTestProviderConfiguration, whose schema rejects root0 and
injects current defaults for omitted root fields. It is not an admitted current
pipeline bypass. Task data/step deadline stays task data, never a second CONFIG
policy author or object-spread merge.

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

## Explicit frozen C3-reference03 integration, not transitive acceptance

This current provider03 proposal explicitly integrates frozen C3-complete-profile-03
runtime schema SHA af8e9bded1aef68ebe88e0ded835b202e0a4591099eda89fa4ea99a31b1b1740
and registry-peer-reference contract SHA
d1ba44788070a8300c6081fb448184d8cba8d3a38a6d20ff11583cb64bfd38c2.
See c3-integrated-reference-generation.json for exact original02 supersession,
03 source bytes and independently CLOSED BC3-R02-01 review identity. All original
02/01 receiving schemas/contracts/reviews remain frozen history. Six whole C3
owner policy documents and root.v4 are byte-identical02↔03; provider03's explicit
provider-network-A clone/root.v5 selection is retained, not silently backfilled.

Current provider-configuration.v2 proposed binding schema REQUIRES both C3 source
schema/reference digests; all three generated receiving views carry these exact
pins. Active field and case members use only current03 schemas/physically resolved
nodes via active-concordance-index.json. Historical02 member records are stored
separately and are NOT normative current schema references. Nova processing uses
its separate closed adapter-processing projection; no Buster native cap is invented
for that adapter consumer.

The corrected generated peer/repeated scanner references permit original optional
worker registryCaFile, HTTPS paired auth ENV-name references versus anonymous
HTTP-lab auth/trust omission, all equal to the same captured producer receipt.
Node/containerd nodeCaFile is distinct and not a fake Node.js fetch trust option.
Custom-CA HTTPS health still needs authentic applicable process/image Node.js trust
and original role/grant/credential/provider/physical revision receipts; anonymous
HTTP health source shape is supported while scanner image invocation may reject
its plaintext operation. No CA/key/credential bytes were read or delivered here.

BC3-R02-01 closure is SOURCE/REFERENCE DEFINITION ONLY. It does not accept whole
C3/C4/C0, native effects, installed roster or delivery. New03 v5/v2 metadata/schema
pins are a fresh explicit generation proposal requiring independent provider
recheck and future implementation; current productive v1 cannot decode them.
