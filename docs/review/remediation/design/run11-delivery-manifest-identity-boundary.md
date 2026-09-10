# Delivery manifest identity — preparatory owner boundary

Status: READ-ONLY CLASSIFICATION / DESIGN PREPARATION. No implementation
authorization, production changes, new test execution or acceptance claim.
Run: run17-delivery-manifest-design, 2026-09-10.

## Current source and exact evidence limit

Fresh integration head `ef5399be16c58eb6b8cf0398e2e183c1226d27c9`, tree
`4ef964cfe95019a754c7aabcaef6f78469d47a28`, matches all 4,090 non-tree entries
in the new private standalone checkout at local
`368ad03664ec019e3b91d3ef795f87eb38877290`. Mandatory current remote resume
README/work-items/package-checkpoints/root-checkpoint/register were reread.
The original c38779c71bb92bc15c3fcb89930348e5417aa475 register was fetched
again: its exact 47 implementiert IDs match partial-47-scope.json. PCR-SDK-001
still requires controlled digest versions and real ArtifactStore/Journal gates;
all broader incomplete findings remain open.

The distinct existing Summary counterexample is remotely frozen at
`fc56f1957d042b7d057769c26c5907995c42ef90`, sole parent ef5399:

- `docs/review/evidence/run14-semantic-summary-before.txt`;
- `docs/review/remediation/implementation/run14-semantic-compiler-summary.md`;
- `tests/verification/reliability/review-semantic-summary.test.mjs` and
  `review-semantic-summary-child.mjs`.

The child runs the actual owning buildSummary with original EffectCoordinator,
disk FileEffectJournal and ArtifactStore. An explicit test context supplies
artifact-contract fixtures and attempts; it is not original PipelineRunner stage
lifecycle, remote-provider execution or fresh Review policy/governor production.
Stored matched bundle-v2/report-v3/governor-v2 inputs pass the Summary reader's
new pair/ref/coverage checks. The returned delivery-manifest.v2 digest matches
in en/en but differs when the same stored input refs are reopened in cs:

- en: `sha256:adee836993c1cd9c9ff09d496bdba1dffb285088fb4fd0caa3fe9dee0dc11830`;
- cs: `sha256:7757bf621fed180598c3cb460d3016910dbc89cacef510924dd447dc0f6dd23e`.

The digest equality assertion remains red (1/2 tests pass, zero skips). The
child's temporary saved.json and stores were deliberately removed by its test;
the durable raw includes those outcomes, not a complete returned manifest or
saved ArtifactRef payload. Do not claim those missing bytes were archived.
Registered project-summary stage persistence and remote-test-gate's downstream
manifest reader were NOT executed on this returned value. The evidence supports
a returned-digest defect plus a source-backed persisted-owner candidate, not a
complete producer/storage/consumer chain. This task performs no rerun. It is
distinct from the earlier safety-flagged helper action, which remains prohibited
and is not retried, rephrased or rerouted.

## Production owner trace

Paths below are relative to `skills/nova/` on fresh ef5399 unless marked pending.

| Owner | Current behavior and boundary |
| --- | --- |
| plugins/project-summary/src/summary.ts, buildSummary | Reads original source/implementation/gate/lint/optional Review artifacts; validates coverage, provenance and candidate; constructs delivery-manifest.v2, then hashes canonicalJson of the unsigned manifest. The digest does not include itself. |
| plugins/project-summary/src/stage.ts, execute | Persists the returned value with artifacts.write put_json, resource project-summary:<runId>, namespace kubeclaw.project-summary, application/json, with no encoding field. Returned stored artifact is placed in StageResult. This persistence call is source-traced, not reached by the new red child. |
| plugins/project-summary/plugin.json and schemas | Registered summary stage owns input/config schema; current config is closed, allows only optional agentRole. Result schema is generic stageResult, not a standalone delivery-manifest schema. Do not claim an existing canonical closed delivery schema that is absent. |
| project/coverage.ts, cumulativeStages | Appends exactly project-summary with config {}, module/final stage bindings and expected coverage. This current helper is imported by archived old compilers; omitted new options must remain historical. |
| project/compiler.ts, cli.ts, recovery.ts, legacy-import.ts | Genuine creation, existing exported APIs, authoring import, stored graph reconstruction and package pins establish immutable authority. Pending separate Review semantic work adds its own independent mode, not a manifest mode. |
| plugins/remote-test-gate/src/evidence-adapter.ts | Actual test.plan.evidence/demo adapter reads the supplied manifest ref through get_latest_json_bytes, verifies full ref/bytes/owner, then assertManifest admits only delivery-manifest.v2 and compares digest with canonicalJson(unsigned). It next binds final gate/decision/coverage and calls FileNovaGateImportStore.readVerifiedResult. No downstream execution is claimed here. |
| plugins/demo-handoff/src/candidate.ts | Selects the Summary artifact and invokes test.plan.evidence; it does not independently authorize or recalculate the manifest semantic version. Later operator/delivery actions are outside this task and remain forbidden. |

The current manifest nests coverage, source/gate bindings and full artifact refs;
the returned digest depends on the whole admitted value. The exact divergent
bytes/field path are not preserved in the existing raw, so this preparation does
not claim to have isolated a particular key pair or proven all parsed manifest
fields identical. A later authorized producer proof must retain the actual
unsigned value/bytes/refs and compare them before attributing the whole mismatch
solely to serializer ordering. No arbitrary unknown-value example substitutes
for that admitted-domain proof.

## Separate version-owner options

### Preferred option for subsequent independent review

Introduce one finite Summary-owned immutable stage configuration selector,
provisionally `deliveryManifestEncoding: 'delivery-manifest.utf16-v1'`. Absence
keeps exact historical behavior. This option is separate from Review semantics,
source identity, report outer encoding, transport/cache profile, locale, latest
compiler and ArtifactRef encoding. It applies even when the project has no
Review stage. Present undefined/null/unknown/non-JSON values reject before
incidental property reflection or artifact effects, not silently become legacy.

The selected new owner would create `delivery-manifest.v3` with a precisely
defined portableJson digest of its unsigned body (including schemaVersion,
excluding digest), and persist its full value with the existing explicit
Artifact codec `kubeclaw-json.utf16.v1`. Schema version owns the semantic digest;
Artifact encoding owns the stored bytes. Both must agree but neither is inferred
from the other. Historical delivery-manifest.v2 remains original canonicalJson
and original untagged storage. No silent normalization, fallback or reinterpretation.

Preserve buildSummary(input, context) omitted behavior; an explicit owning option
can select new production without changing old callers. Define the supported
v3 fields/limits at the actual contract owner and mirror or share them through a
legitimate package API at the remote-test-gate reader. Do not import private
project-summary src across plugin boundaries or relax package pins. Whether a
shared contract package is warranted must be decided before implementation;
simple finite version-to-codec mapping plus parity tests may suffice, but it must
not evolve into two inconsistent handwritten manifest validators. Existing
accepted v2 behavior must not be retroactively narrowed by a new v3 contract.

The new compiler choice must be independently frozen on the exact expected
project-summary node. Only a genuine fresh-creation entrypoint explicitly opts
in. Preserve existing exported compileProject arities and cumulativeStages
omissions, authoring import definitions and pending Review semantic changes.
Recovery obtains this independent choice from the original persisted Summary
node, validates expected ID/type/config and exact whole graph, then recompiles
under the same explicit choice. Reject missing/extra/type-swapped/unknown modes;
never derive manifest mode from a final Review node or report. Preserve package
pin verification and complete graph comparison, including no-Review cases.

The remote-test-gate reader would admit an explicit v2/v3 map only after reading
and authenticating the expected complete artifact reference and bytes. v2 uses
the original algorithm; v3 uses the declared portable algorithm and requires its
declared outer encoding. Preserve current namespace/run/stage/media/size gates,
decision reference uniqueness, final gate/coverage/candidate checks, actual
import-store verification, cancellation and error semantics. Do not convert
unsupported versions into missing evidence or use a newest successful artifact.
The original get_latest_json_bytes request shape stays unchanged for historical
calls; any new exact-ref read operation would require its own pending-effect
compatibility design, not be smuggled into a serializer repair.

### Alternatives and why they are not preferred

Keeping semantic v2 while adding a digest-profile field is possible only as a
new explicitly versioned contract: the old reader hashes all unsigned fields and
does not know the new algorithm. It therefore still needs the same compiler,
writer and paired reader migration, creates ambiguous v2 meaning, and saves no
compatibility work. Do not implement it as a bare optional default.

Changing only outer Artifact encoding preserves the defective inner digest and
the downstream canonicalJson rehash. Changing the global SDK serializer or
using reviewSemanticEncoding would silently change unrelated old effects and
ownership. Neither is an acceptable repair option. Merely comparing same-locale
manifest objects does not establish portable persisted identity.

## Exact historical effect boundaries

Old Summary paths retain original read calls and final put_json operation,
resource, namespace, media type, value fields, absent encoding and invocation
ordinal. Adding an encoding/schema/digest to an old pending put_json at the same
ordinal conflicts with its original idempotency request; completed replay must
return its original receipt, and accepted-without-receipt remains uncertain.
Do not create a new key to retry an uncertain old write. Historical callers do
not gain new manifest semantics because they happen to read a new Review pair.

Explicitly new graphs may write the versioned new value and tagged bytes, but
the original resource convention alone is not migration authority. Real reader
full-ref checks must reject same-byte foreign owners and newer competing refs.
Original legacy cross-locale failures remain fail-closed until separately owned
history policy says otherwise; no locale guessing or tag-old-artifacts fallback.

## Required evidence before source authorization or acceptance

1. Preserve fc56f195 red/source unchanged. A separately authorized next probe
   must reach the registered original Summary stage and actual persisted manifest
   through genuine Core lifecycle/ArtifactStore, retain full raw unsigned value,
   semantic digest, stored bytes/ArtifactRef and Journal request/receipt. Distinguish
   artifact-contract fixtures from real upstream provider evidence. Execute the
   original downstream evidence adapter on that stored generated manifest in
   the other locale; a trace or direct copy of assertManifest is not that gate.
2. Keep native upstream input refs/values identical and compare the actual
   constructed unsigned manifest before inferring serializer causality. Prove
   historical same-locale controls and new independently produced/reopened
   cross-locale values, at least en/cs plus relevant existing locale vectors.
   No precomputed manifest hashes, forged registrations, shadow parser or mock
   provider/import store may manufacture consumer success.
3. Exercise original FileNovaGateImportStore authority with genuine validated
   gate result/decision records for any downstream success claim. An earlier
   manifest-integrity rejection proves only that rejection boundary; it does
   not prove remote gate/provider success. Do not send demo/operator messages,
   deploy, invoke CI or create costly infrastructure to claim the full chain.
4. After a design and source are independently authorized, exercise old/new
   requested, accepted and completed Summary-write/downstream-read recovery,
   real SIGKILL and disk journal/CAS evidence. Preserve exact old requests and
   no duplicate calls; label genuine-prefix replay separately from process crash.
   Actual archived source/compiler inputs and dependencies must resolve from
   current checkout archives, not missing historic Git objects.
5. Negative cases cover version/codec disagreement, unknown/present-invalid
   configuration, getter/Proxy/non-JSON admission before reflection, wrong or
   absent digest, malformed required v3 fields, bytes/size/full-ref mismatch,
   wrong producer/run/stage, changed/ambiguous final gate evidence and actual
   import-store failure. Preserve all original coverage/cancellation assertions.
6. Independently vary source, outer report, Review semantic and new manifest
   choices in actual persisted graph recovery; include no-Review, module-only
   and final-Review projects. Retain full original CLI/API/import definition and
   package-pin comparisons. Run original Summary/evidence-adapter/demo-candidate
   contracts plus actual registered acceptance, relevant type/schema/lint and
   fresh-head combined gates. No full model, delivery or SDK closure follows
   from this bounded package alone.

## Next action and durability

Keep the delivery owner candidate separate from the currently authorized Review
semantic/inner-identity implementation. Root first reviews this preparation and
decides whether to authorize the missing original producer/reader proof. Only
after that evidence and an independently reviewed final design may production
implementation begin. No source/test execution is authorized by this document.
All referenced red raw remains red; no blocked/denied action is rerouted.

This checkpoint changes this document only on a new fix/resume-47 branch with
[skip ci]. Current workflow push triggers target main, not this branch. MAIN,
register, evidence source, code, deploy/CI state and third-party communications
are untouched. Completion is explicitly false.
