# Local Review membership reference joins — not original authorization

`inspectReviewMembershipRecordCandidate` separately strengthens the existing
binding integrity inspector. It reads the approved strict `config-membership.v1`
from the supplied binding descriptor, verifies canonical bytes, physical size,
full object SHA and its separate unsigned internal digest. It checks run equality,
unique group/stage IDs, selected group presence, and every consumer projection’s
stage/owner/registration/instance/taskInput equality against that group. All declared
stage taskInput/partition, graph and standaloneIntent references must exist with
valid bytes/schema links. Repair endpoints must remain within their declared group.
The existing binding/projection/author/effective policy checks still run.

These are LOCAL supplied-reference equalities, not original source or execution
proof. `membershipReferencesCoherent` does NOT assert generated graph coverage,
original stage type/instance provenance, partition applicability, standalone intent
semantics, task permission, or original graph version. Task graph/partition contents
remain opaque except any explicitly supplied schema. All existing authorization
and activation fields remain false; explicit originalTaskGraphVerified,
partitionSemanticsVerified and stageInstanceAuthorizationVerified are false.

## Exact unsupported producer bridge

Original compileProject/sourceStages/moduleStages/cumulativeStages/demoStages can
produce actual ordered IDs/types/task inputs and local candidate groups. Current
RegistrySnapshot/StageRegistryEntry provenance identifies package/surface/local
registration, NOT authenticated per-stage instance/partition/task/R/caller binding.
The approved corrected membership record requires each stage owner, registration,
instance, taskInput and partition descriptor. No installed closed producer schema
or issuer assigns these missing original references to the current graphv3/runv4.
The copied target schema is a local approved inspection definition, not a newly
installed SDK taskgraphv4, snapshotv5 or durable receipt. Public map/context values
cannot close that gap; no inferred IDs, stage prefix groups, current-B repair or
Buster archive coercion was introduced.

Next boundary: inspect exact approved partition definitions, original source field
partitions and Review task/effectiveExecution schemas for a supported local schema
join. Do not interpret generic object refs as model/tool/role permissions; record
missing partition producer/schema/issuer/instance/task/R/caller ABI precisely.

No production entrypoint, graph/compiler output, SDK schema/type, closure roster,
receipt codec, materializer gate, runtime or history writer changes. Both actual
source/output denies remain, 448/2409/6845/50 and 16MiB unchanged. Native gates not
rerun; full independent C0 correction/C1–C6 acceptance remains open.

## Local original task-schema seam — 2026-10-15

The separate `inspectReviewTaskInputShapeCandidate` first runs all membership and
binding reference checks, then requires the selected portable task descriptor to
link the exact canonical original registered Review `schemas/input.schema.json`.
The captured schema bytes must match and validate the actual task payload. The
reference-only inspector is unchanged: opaque graph/partition/task references do
not become productive authorization. SourceStageId is NOT resolved here; original
revision, evidence content/digests, coverage and task permissions remain unverified.
`taskInputShapeVerified` is schema shape only; `taskInputSemanticsVerified` and
`originalRevisionsVerified` are false, as are all existing authorization flags.
No original runtime/parser/schema/producer, materializer or acceptance gate changed.

## Literal-base original-parser seam — 2026-10-15

`inspectReviewLiteralTaskParserCandidate` runs the complete shape/reference seam
then invokes unchanged `parseReviewInput` only for literal-base tasks. This checks
original evidence canonicalization/digests, reserved kinds, uniqueness, text and
scope containment using the actual original reader, not a copied validator.
`localTaskParserVerified` is local content consistency only. All task semantics,
original revision provenance and authorization/activation flags remain false.
SourceStageId tasks explicitly reject, even with an authored base: original
`stage.execute` calls SDK `resolveImplementationRevisions(sourceStageId, context)`
before parsing. No authenticated original invocation/store is available here;
no fabricated head/base or public-map runtime resolution is substituted.
No runtime schema/parser/entrypoint was changed. Independent acceptance stays OPEN.


## Execution ABI gap and original preflight — 2026-10-15

OWNER-BRIDGE requires effectiveExecution to capture actual role/backend/target/model/
prompt/output/tokenizer/tool/limits. The corrected parent descriptor does not define
this complete value schema or authenticated original selector/instance provenance.
review-execution-settings.ts only validates concurrency/maxRetries/deadlineEpochMs
for scalable helpers; it is NOT that full projection and also has runtime callbacks.
Do not apply it as the effectiveExecution schema or invent missing selections.
Exact full value schema, projection producer, original selected target/role/prompt/
tool/native references and issuer/task/R/caller compatibility remain OPEN.

Continued supported seam: literal task inspection now calls unchanged
preflightReviewInput(task, candidate.policy.limits.maxBundleBytes), as stage.execute
does before source resolution/parser. This enforces original canonicalJson UTF8
size, nesting and array-domain controls, separately from portable closure bytes.
localTaskPreflightVerified denotes supplied-content validation ONLY; all existing
authority/activation/revision semantics remain false. No dispatch, runtime, SDK
schema, historical codec, roster, source-kind or materializer gate changed.


## Original context reason grammar — 2026-10-15

Separate inspectReviewTaskContextReasonsCandidate invokes unchanged
parseReviewContextReason after all literal-task checks. Schema-opaque reason
objects now get the original closed kind/sourcePath/reserved-expansion grammar.
This is NOT full descriptor/provenance verification: original descriptors() needs
readChangedScope's real changed/deleted paths and frozen repository revision;
hydration and selection need original invocation and trusted resolved policy.
No synthetic changed scope, map-derived provenance, runtime selection or grants.
localContextReasonsVerified is grammar only; contextDescriptorProvenanceVerified
and repositoryScopeVerified stay false, as do every existing authority flag.
