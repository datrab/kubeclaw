# Source-specific provider contracts — corrected02

All67 original row bodies/408 canonical and native case bodies remain exact in
field-definitions.json and case-definitions.json. These contracts supplement those
IDs, never replace obligations or promote states. 405 implementation-proposal and
3 C0 cases remain not-run. See receiving-abi.md for proposed/current separation.

## Request versus response boundary (RPR01-03)

OpenAPI spec file containment,4MiB after-read check, JSON/spec dialect, catalogue
uniqueness, selections count, endpoint/origin resolution, required parameters,
parameter schema/type serialization, request body schema and documented operation
admission precede that operation's invoke. Request-schema external/cyclic refs,
unsafe visited string patterns and unsupported keywords therefore can deny before
that operation's request. Earlier selected operations may already have executed.
At231–234, top-level response objects are resolved to determine header/media
requests BEFORE invoke; top-level bad refs deny before that request.

At235 the actual native invoke occurs. Response rule237, payload decode/schema247,
header schema252 follow it. Unsafe/external/cyclic response-BODY schema and visited
response patterns therefore generally fail AFTER the first operation request;
they are not zero-effect request preflight. `assertSupportedSchema` at the root
of schemaFailures inspects all supported graph children—even unvisited payload
children—but safePattern itself is only visited for actual string values. Header
schema enforcement requires the response header actually present; absent headers
and boolean shortcuts are controls, not evidence that the numeric guard fired.

Native URL/grant/method/header/request-body/timeout/response-limit admission precedes
fetch. A requested response ceiling above the native maximum raises exactly
`HTTP_REQUEST_RESPONSE_LIMIT_INVALID`, not a misspelled generic bytes code.
Timeout above the native maximum raises `HTTP_REQUEST_TIMEOUT_INVALID`. Transport
response-byte overflow is separately measured over decoded/decompressed chunks;
HTTP provider catches only HTTP_REQUEST_FAILED/TIMEOUT as returned findings, not
every security/size exception. Non2xx is still a real response/native charge.

Native and Nova redirect denial is detected AFTER the initial request's response;
it prevents following the redirected request. Future observer requires initial
endpoint count1, redirect-target count0, exact denial and charge—not total count0.
The endpoint counters are real future instrumented fixture observers, not created
or accessed here. URLs/ports/public fixture identities are unsigned definitions,
not availability, installed package, grant or authentication proof.

## Original future case families (RPR01-01..05)

Use each field/case exact original IDs already joined in case-definitions.json,
the whole profile in profile-index.json, and task-pair-index.json. API-flow step
deadlines use complete deadline pairs and actual flow-deadline-A/B files; setup,
main and cleanup remain included in the source count. Complete maximumSteps1/3
with flow-a3 produces selected count distinction; flow-one1 is equality control.
API-flow failure retains the first transport error, skips subsequent noncleanup
steps, still attempts cleanup and rethrows the original; do not report all steps
as requested. WebSocket uses capability `network.http`, operation websocket—not
invented network.websocket. Runtime outgoing/received frame and aggregate quotas
are distinct and require actual native WebSocket observers later.

HTTP/OpenAPI50/500 timeout profiles use the same authenticated deterministic
delayed endpoint, invocation/native ceiling>=500 and real elapsed/cancellation
observer; delay is fixed in the source-supported future fixture, not an executed
timer here.32/2048 response-byte profiles use response-256.json with identical
parsed business content and exact wire256 bytes; source/native decoded UTF8 bytes
are counted, not JSON object count or generic quota arithmetic. HTTP GET/HEAD,
path/status/text/content-type alternatives remain actual task intent. HEAD with
text assertion is invalid at HTTP configuration, not a native bytes experiment.

Nova remains a DISTINCT adapter consumer: once-per-run captured complete origins,
methods, headers, maxRequestBytes/maxResponseBytes/timeoutMs; it JSON.stringify's
body and counts decoded response bytes before JSON parse. Retain the actual524289
request/response definitions against1048576/524288 profiles. GET body is not a
request-byte witness; use supported POST. Nova native response may throw non2xx,
unlike Buster's response result. Method schema GET/POST/PUT/PATCH/DELETE is not
widened to HEAD merely because a parser can accept it. Header/origin alternative
requires same actual registered adapter plus authentic endpoint/grant/receipt;
alternate.fixture.invalid is not installed or reachable proof.

## Coordinate-bound source processing fixtures (RPR01-05)

source-processing-adjudication.json defines EIGHT separate exact source members,
original ledger records **only at the exact coordinate if any**, associated original
file/operation/schema case IDs, complete owner A/B, domain, errors and controls.
Six of these literal coordinates have no exact candidate ledger record. This is
an explicit pre-existing candidate-coverage gap; no neighboring SRC identifier is
misrepresented as its identity and no new canonical setting/case ID is invented.
Associated original task/schema ID is a requirement join, NOT relabeling a task
field as a quota. This bounded author locally adjudicates the actual source
behavior while preserving the global ledger gap for its owner to resolve.

| Selected member | Concrete fixture and distinguishing target02 pair |
|---|---|
| API-flow maximumFlowFileBytes | api-flow-513.json: valid compact flow JSON + whitespace EXACT513; A1048576 accepts, B512 rejects API_FLOW_FILE_TOO_LARGE after complete file read and before parse. Equality512 must be admitted; no claim streaming read prevented. |
| OpenAPI maximumSpecFileBytes | openapi-513.json: valid spec + whitespace EXACT513; A4194304 accepts, B512 rejects OPENAPI_FILE_TOO_LARGE before parse. |
| maximumSelections | openapi-selections2.task.json uses actual spec-typed two distinct valid operation IDs checkOk and cleanCheck, cleanup:true on latter; A128 accepts, B1 rejects combined explicit+tagged count before first invoke. Tests mixing explicit/tagged selections retain source duplicate/ordering semantics; task operations max128 remains task schema independent of combined quota. |
| maximumSchemaGraphDepth | spec-graph-depth9.json, response-payload-depth9.json: nine typed array children+string leaf; A64 allows, B8 fails graph preflight. For response-body schema this is POST invoke, not request prevention. Boolean/undefined children shortcut before depth check; typed leaf deliberately avoids it. |
| maximumRefChainDepth | spec-ref-chain10.json: ten actual local refs ending string; A64 allows, B8 rejects at depth9 still-ref node. Depth starts0; source returns nonref BEFORE limit. Current64 allows65 refs ending at depth65,66 refs rejects; chain length is NOT same as graph or payload depth. External/cycle/missing remain invariant failures under both profiles. |
| maximumPayloadDepth | Same nine-array typed response fixture; complete A64/B8 vary only payload limit, graph/ref remain64 so preflight does not mask it. Visited string leaf atdepth9 triggers B8; graph rejection controls kept separate. Boolean/null/undefined shortcuts are explicitly not witness shapes. |
| maximumPatternCodeUnits | spec-pattern-length9.json pattern ^abcdefg$ is nine UTF16 units, actual string abcdefg. A256 accepts, B8 rejects safePattern; quantifier/graph/ref limits remain unchanged. |
| maximumPatternQuantifier | spec-pattern-quantifier9.json pattern a{9}, actual string aaaaaaaaa; A1024 accepts, B8 rejects parsed bound9. Pattern length4<256 and graph/ref/payload guards cannot mask this. |

These lower operator budgets are proposed within unchanged existing safety
ceilings, never expansion beyond current1048576/4194304/128/64/256/1024. Current
productive code still reads literal caps: local replay proves source fixture
validity/current branches, NOT injected B behavior. Real implementation must pass
the selected budget separately into exactly readFlow/select/assertSupportedSchema/
resolveSchema/schemaFailures/safePattern consumers. Three64 usages are three knobs;
the retired proposed maximumSchemaDepth has no active meaning. Fixed supported
keyword/dialect/type/local-reference shape, cycle denial, regex no grouping/
alternation/backrefs, one unbounded token maximum and RegExp(u) validity stay
noneditable invariants. A selected tighter quantifier limit does not make infinite
{1,} safe or disable other guards. No regex with harmful workload is executed.

## Timer/domain adjudication

Nova current JSON schema has positive integer minimum1 with no maximum; adapter
positiveInteger narrows to safe integer and then calls AbortSignal.timeout at57.
The pinned Node24.21.0 builtin source accepts uint32 AbortSignal delay, but its
setWeakAbortSignalTimeout delegates to timers, whose TIMEOUT_MAX is2147483647;
greater values are assigned1ms rather than the requested duration. Target complete
Nova owner therefore proposes operational1..2147483647, explicitly different from
current schema/parse acceptance1..9007199254740991. This is a source-derived
nonoverflow intended timer domain, not arbitrary120000, and no timeout is scheduled
by the source-reading probe. Byte maxima retain actual safe-integer limits.

Buster native constructor already enforces1..2147483647. Earlier batch18
maximumExecutionMs<=120000 was not its actual support ceiling. Copied C3-complete02
owner uses the justified native timer schema; the local provider-network-A chooses
1000 only for this whole fixture, not as a global domain restriction. C3 dependency
review/receiving changes remain open, including its newly identified registry CA
reference seam; no full C3 domain/activation acceptance follows from this cut.

## Mutation, immutable binding, recovery and Eval

Original MUT cases must detect literal/default/ignored-policy fallback, wrong
instance/profile, losing task deadline, omitted required logs, unsupported package
matrix/retry expansion, pre/post-invoke observer confusion, wrong byte encoding and
resource cap mismatch. Tests require actual provider→runtime/adapter, not this
pure schema predicate standing in for effect. Original BIND/RECOVERY/EVAL cases
retain whole captured A source/root/owner/profile/package/schema/reader/prompt/
role/image/task/fixture/grant/resource/credential-provider revision/clock/claim
identity and authentic old generation lifetime; B cannot fill missing A. A failed
new selection cannot mutate or relabel original A effects/outputs. Actual fixed
Eval and native/endpoint recovery observers remain NOT-RUN, unauthorized here.
