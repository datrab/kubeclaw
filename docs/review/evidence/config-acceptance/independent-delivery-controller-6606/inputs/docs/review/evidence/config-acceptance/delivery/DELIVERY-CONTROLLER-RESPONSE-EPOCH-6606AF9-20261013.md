# Delivery controller response / original-epoch milestone

**C0 proposal only — NOT ACCEPTED.** Baseline commit
`6606af9e590032f328f330ecb3d953b1eef027e3`, tree
`47ce9b9c092dcd534eb55ddaebaab010e270a5af`. No productive or test edits, Go
execution/build, listener, image, host, Kubernetes API, Secret or paid actions.

## Substantive correction and exact scopes

The committed `define-controller-targets-20261013.py` had a second independent
`if/elif/else` that overwrote earlier numeric, array and shared-author domains
with generic string fallbacks. Exclusive dispatch is corrected. The original
42 fields are kept separate from the seven new same-controller policy expansion
fields during repeat collection. The committed faulty input remains available
by immutable Git identity; exact changed-input/reference preservation and both
initial/final patches are recorded in
`controller-domain-dispatch-correction-6606af9-20261013.json`.

The new primary definition is
`controller-response-epoch-contracts-6606af9-20261013.json`. Each new field has a
real source coordinate, current default or explicit absence, productive reader,
proposed same-owner authority, units/domain, A/B values and native case links.

| Proposed field | Current source behavior | Distinct proposed contract |
|---|---|---|
| `apiResponseMaximumBytes` | `kube` calls unbounded `io.ReadAll` for success, error and `out=nil` | Decoded entity limit+1, close response, bounded parsing; overlimit after mutation remains uncertain |
| `apiRequestMaximumBytes` | Unbounded `json.Marshal` before request | Check before `Do`; zero requests on limit failure; encoding allocation needs its own truthful bound |
| `apiDiagnosticMaximumBytes` | Full raw body or upstream message reaches error/log/status | Bounded redacted code/context, not truncation of possible secret text; preserve trusted complete 404/409 status semantics |
| `authorizationMaximumBytes` | Shared Ready/Product header limit 16,384 bytes | Includes seven-byte `Bearer ` prefix, distinct from body/token-file bounds |
| `namespaceDeletionTimeoutSeconds` | New 120-second local deadline per call; HTTP/Sleep can overrun | Original cleanup-attempt deadline, remaining-time cancellation, no retry/B-budget renewal |
| `readyObservationMaximumAgeSeconds` | 300 seconds before and after source verification; future timestamps rejected | Captured admission freshness, not runtime-security refresh or client observation age |
| `productDecisionMaximumValiditySeconds` | Signed interval at most 300 seconds | Original issuer/admission policy; signature verification precedes stored receipt lookup, which precedes fresh-time checks on already committed replay |

Compact findings count/array bytes, whole lease/metadata/pretty-JSON output,
combined kubectl stdout+stderr, Go HTTP response/error bytes, request body bytes,
headers and physical aggregate memory are **not interchangeable budgets**.
Overflow remains critical and accounted, not clean. Go `Unavailable` observations
currently never refresh; poll time alone does not promise an observation-age
bound. Long finding identifiers' 256/184-byte truncation and digest suffix remain
source protocol details, not falsely added operator knobs.

`CMP-buster-engine-clusterInvokers.shared.leaseApiGroup` / `leaseApiVersion` and
runtime-security output/execution/poll/age/skew fields are real source-validated
**read-only primary-author aliases**, not new Delivery writers. Equal five-second
values do not merge Go observer and component client policy ownership. Chart
TTL/prefix/access/secret/provider producers retain their actual distinct scopes.

## Complete proposals and native case recipes

`controller-response-epoch-profiles-6606af9-20261013/{A,B}.json` contains all 49
fields and complete typed bindings. The strict own definition schema rejects
missing, unknown, malformed and competing declarations and checks correlations.
Those checks are **not a Go/Kubernetes native schema substitute**. Declared buffer
budgets and named future provider/OCI/Go/grant receipts are not measured capacity
or authenticated installation/grants.

The contract freezes **34 concrete future subcases**, including bounded success,
error and no-output bodies; request rejection before `Do`; redaction; compact vs
whole-output overflow; sentinel minimum; malformed field types; cleanup deadline;
loop/freshness; shared auth; slow TLS/body/socket/context and commit uncertainty;
Ready/Product time scopes; six original-state variants; nine recovery faults;
shared authority; actual Nova-client correlations; deadline equality.

The exact future native harness is
`tests/verification/config/delivery-controller-policy.test.mts` with case
`DLV-CASE-CONTROLLER-RESPONSE-EPOCH-CONTRACT`. Proposed controller argv includes
`--config /etc/kubeclaw/buster-namespace-controller/policy.json`; **current Go main
has no config loader/flag**, and the harness/managed file/schema/mount and stored
CRD epoch are not implemented. Every future case remains `not-run`.

## Original stored lease epoch

`controller-original-epoch-fixture-identities-6606af9-20261013.json` links six
complete serialized synthetic ordinary-default, ordinary-explicit, Ready-v1,
Ready-v2, Product-extended and deleting A fixtures plus the strict own epoch
serialization schema. These are concrete **unauthenticated definition inputs**,
not actual original receipts. The proposed physical seam is
`BusterNamespaceLease.status.deliveryPolicyEpoch`, absent today.

Capture the authenticated original A policy/config/build/OCI/API/provider/grant
references, UID/generation/spec/CreationTimestamp/TTL/max/deadline, principal,
namespace/Role/finalizer/Secret selectors, Ready/Product issuer and lifecycle
receipts with CAS and exact readback **before business mutation**. Retained A
cleanup/replay/admission must resolve that epoch rather than process B.
Observer budgets may make a read unavailable but cannot reauthorize A or move
its deadline. Revocation/unknown authority fails closed.

Legacy migration requires authentic archived original A receipts. Missing or
unrecoverable originals return `POLICY_EPOCH_UNRECOVERABLE`; no inference from
current B, equal defaults, filename, unverified expiry, latest image, or now.
Historical Ready-v1 absent retention means fixed **604,800 seconds**, separate
from adjustable default B; preserve original request digest/readyAt/expiry and
Product expiry links. Corrupt committed Ready state must not fall back to current
TTL. CAS conflict, crash, missing readback, changed UID and revoked grants remain
explicit uncertain/fail-closed cases. The 2030 sample timestamps are synthetic;
future native fixtures capture real trusted Go time once and shift relative
fixtures consistently, preserving original deadlines and actual generated-byte
identities. No host clock changes are implied.

Parent universal originalModule/M/carrier/task-operator/grant/cleanup definitions
remain **OPEN**. Local serialized epoch samples do not invent universal IDs or
close `AUTH-PRISM-INPUT-SPOOL-QUOTA-DEFINITION` or physical storage grants.

## Actual producer / role / CI trace

The contract records source-coordinate traces for versions → generated Docker
ARGs → fixed Linux/amd64 Go build → workflow image receipt → selected immutable
release → `my-values` materialization → generated release values → deploy legacy
precedence → Chart Pod ENV/SA/RBAC/TLS → controller constructor/callers.

The controller Dockerfile runs `go build`, not tests. Its current
`check-built-runtime-image.sh` branch only inspects the image despite the comment
claiming build acceptance gates. Workflow `KUBECLAW_BUILD_REVISION` has no
controller Docker ARG/ENV consumer. Version tags, source selection, inspection
and source `go 1.22` do not establish the actual compiler/stdlib, native binary
provenance, multiarch or protocol behavior.

The Ready client Chart helper permits **actual Nova release SA only**, projects
600-second audience token + CA Secret and emits `KUBECLAW_DEMO_READY_*` ENV.
An exact skills source literal-name search finds no matches. That does not prove
absence of dynamic or outside-scope wiring. The actual
Nova adapter reads strict `context.config` endpoint/tokenPath/caPath; the missing
registry/config compiler bridge is explicit, not activation inferred from a
mount. The client rereads CA/token per post; Go loads CA once and rereads its API
token per request. The client's token-file bound 16,384 can produce an oversized
Authorization header: A supports at most 16,377 token bytes, B's 8,192-byte header
at most 8,185. Real issuer/provider compatibility must be resolved, not presumed.
Other Nova client limits remain existing-owner policies, not Delivery knobs.

## Actual safe controls and remaining scope

93 current own definition/domain/source regressions and 18 epoch serialization /
synthetic arithmetic controls pass. The original committed overwrite is detected
as a definition defect, not a native negative kill. The earlier 638 pure
observations retain their original 636-pass/two-diagnostic-failure scope; 84
historical controller coordinate records now reference the exact committed old
input bytes and do not certify the corrected domain. Historical acquisitions,
raw failures and source identities remain preserved.

Current static consistency is zero issues, **832 unaccepted rows**, 330 sources,
203 future cases all `not-run`; 553 target-domain proposals and 279 missing exact
domains. Exact per-field obligations remain in `open-row-backlog.json` and
`delivery-specification-obligations-20261013.json`. Existing proposals still need
material independent review and full correlated native prerequisites. Full input
list/findings accumulation and concurrent memory, actual native output/capacity,
authentic original-A receipt recovery, physical CRD/CAS migration, selectors /
sourceStage / profile compiler / materializer / role / CI / script contracts,
and parent universal binding/grant/cleanup remain unresolved as specified.

Parent DLS002's 20-source/701-coordinate ledger is separate. This milestone is
not global PASS, acceptance, implementation approval, or reduction of authorized
remaining DLS004 work.
