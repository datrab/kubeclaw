# Delivery-manifest v3 — final implementation design

Status: IMPLEMENTATION-READY DESIGN CANDIDATE; production source remains
unauthorized until this document is independently reviewed and explicitly
accepted. This checkpoint contains one design document only. It is not a fix,
runtime acceptance, PCR-SDK-001 closure or all-47 closure.

Run: `20260910t042633`, design author `run14_delivery_design`.

## Authority and evidence boundary

The design was prepared from fresh remote MAIN
`e644a79fddd4d4d686fbd351b6edaec5575caf57`, tree
`64df9214237107c027b27caf4d5f75f27a222f51`, in a new isolated checkout. The
remote resume README, work-items, package-checkpoints, root-checkpoint, current
register and `partial-47-scope.json` were reread before design work. A fresh
extraction from register commit
`c38779c71bb92bc15c3fcb89930348e5417aa475` yields exactly 47 entries whose
status was `implementiert`; the sorted set exactly equals the scope file. All 47
remain present and their `source_finding_text` is unchanged.

The complete preparatory design
`13f0aa8262a20c31aac25a62b63e3aa018155768`, independent preparation review
`98d8f41abf0d822d94f1d854326a252e5dfa25ac`, registered RED checkpoint
`f3ddec16b5a1c2787e956b5bc9d1556281660831`, and independent RED acceptance
`45fff05281c253dd27ffc52cca207c73104ae36d` were read. The last pair establishes
the actual boundary: the original registered Summary stage, PipelineRunner,
AdapterRuntime, EffectCoordinator, disk FileEffectJournal and ArtifactStore
produce and persist a `delivery-manifest.v2`; the original registered evidence
adapter accepts it in the producer locale and rejects the exact stored ref and
bytes in Czech because the inner `canonicalJson` digest changes. A valid v2 with
portable outer bytes is also accepted in the producer locale. The run stops at
the real missing-import boundary and proves neither provider E2E nor delivery.

The design is separate from Review semantic encoding and the previously
prohibited helper action. It does not retry, rephrase or reroute that action.
No test, source, register, MAIN, CI, deployment, provider, paid resource or
third-party action is part of this checkpoint.

## Decisions frozen by this design

1. `delivery-manifest.v2` remains the historical contract: its semantic digest
   is `sha256(canonicalJson(unsigned))`; its outer ArtifactRef encoding may be
   absent or `kubeclaw-json.utf16.v1`, exactly as the current reader admits.
2. A new finite Summary-owned selector
   `delivery-manifest.utf16-v1` creates `delivery-manifest.v3`. Its semantic
   digest is `sha256(portableJson(unsigned))` and its stored ArtifactRef MUST
   carry `encoding: kubeclaw-json.utf16.v1`.
3. Semantic version and outer byte encoding are separately checked. Neither is
   inferred from the other, from locale, report encoding, Review semantics,
   source identity, cache/transport profile or current compiler defaults.
4. The selector is stage configuration owned by the product compiler. It is
   not admitted from arbitrary authored `nova-project.v2` input and is not a
   field in Summary input or the manifest body.
5. A new public workspace contract package is the sole v3 shape/digest owner.
   Producer and consumer import that public API; neither imports private source
   from the other plugin and neither carries a second handwritten v3 validator.
6. Historical APIs, graphs, requests, receipts and v2 reader acceptance remain
   exact. Only genuinely new compiler creation explicitly selects v3.

## Public contract owner and API

Implementation adds workspace `contracts/delivery-manifest/v3`, package
`@kubeclaw/delivery-manifest-contract`, and lists it explicitly in the root
workspace set. The package exports only public files from `src/index.ts` and its
closed JSON schema. Both `@kubeclaw/plugin-project-summary` and
`@kubeclaw/plugin-remote-test-gate` declare the workspace dependency. The root
lockfile, package discovery, runtime closure, plugin sandbox/build inventory,
package-boundary checks and pinned graph/package checks must all be updated and
verified together. The package may depend on the public plugin SDK and test-gate
contract; it may not depend on either plugin or Nova product source.

The finite public surface is:

```ts
export const DELIVERY_MANIFEST_V3 = 'delivery-manifest.v3' as const;
export const DELIVERY_MANIFEST_ENCODING = 'delivery-manifest.utf16-v1' as const;
export const DELIVERY_MANIFEST_ARTIFACT_ENCODING = 'kubeclaw-json.utf16.v1' as const;
export type DeliveryManifestEncoding = typeof DELIVERY_MANIFEST_ENCODING;
export type DeliveryManifestV3;
export type DeliveryManifestV3Unsigned = Omit<DeliveryManifestV3, 'digest'>;
export function createDeliveryManifestV3(value: DeliveryManifestV3Unsigned): DeliveryManifestV3;
export function parseDeliveryManifestV3(value: unknown): DeliveryManifestV3;
export function deliveryManifestV3Digest(value: DeliveryManifestV3Unsigned): `sha256:${string}`;
export function assertDeliveryManifestForRead(
  value: unknown,
  owner: { runId: string; manifestStageId: string; ref: ArtifactRef; bytes: string },
): Readonly<Record<string, unknown>>;
```

`createDeliveryManifestV3` and `parseDeliveryManifestV3` first call
`portableJson(value)` before `Object.hasOwn`, `Object.keys`, spreading or any
property reflection. Accessors, Proxy traps, cycles, unsupported JSON values,
non-finite numbers and non-plain objects fail before digesting or artifact
effects. Both validate the closed schema and semantic relations below.
`createDeliveryManifestV3` accepts no caller digest, calculates it from the
validated unsigned value and returns a deep immutable clone. The parser removes
`digest`, recomputes it with `portableJson`, compares exact lowercase SHA-256,
and returns a clone. There is no permissive mode.

`assertDeliveryManifestForRead` owns the only semantic version map:

| schema | inner algorithm | admitted outer encoding | shape policy |
| --- | --- | --- | --- |
| `delivery-manifest.v2` | existing `canonicalJson(unsigned)` | absent or exact portable tag | current legacy reader predicates only; do not retroactively close or narrow v2 |
| `delivery-manifest.v3` | `portableJson(unsigned)` | exact portable tag required | complete v3 schema and semantic checks below |

Unknown versions reject. This API also validates the complete manifest ref and
stored bytes against `owner`; callers cannot bypass it with a parsed value. The
project-summary producer uses `createDeliveryManifestV3`; the evidence adapter
uses `assertDeliveryManifestForRead`. The producer's v2 branch stays byte-for-
byte source-equivalent to the existing builder. A parity test pins the legacy
v2 branch of the shared reader API to every currently accepted/rejected reader
fixture before replacing the private `assertManifest` call.

## Exact closed v3 value contract

All listed objects use `additionalProperties: false`. Every string is genuine
JSON text with no control characters. `Digest` means exact
`^sha256:[a-f0-9]{64}$`. `StageId` is the plugin-system `localId` domain
(1–96 characters); `OpaqueId` and `NamespacedId` use the existing plugin-system
definitions. `projectId` is 1–128 characters and must equal every nested
coverage `projectId`. `sourceRevision` is exactly 40 lowercase hex characters,
matching the current product compiler/source contract. The complete portable
serialized v3 artifact must be between 1 byte and 8 MiB.

Top-level required keys, and no optional keys, are:

```text
schemaVersion  exact "delivery-manifest.v3"
projectId      ProjectId
runId          OpaqueId
sourceRevision Git40
modules        ModuleBinding[1..128]
final          FinalBinding
evidence       ArtifactRef[7..390]
digest         Digest
```

The unsigned body is exactly those seven fields other than `digest`, including
`schemaVersion` and every complete nested value. `digest` is exactly
`sha256Text(portableJson(unsignedBody))`. No field is normalized, sorted or
discarded solely for hashing. The producer's deterministic read order therefore
remains manifest order: each module in compiled order contributes implementation,
decision and quality refs; final contributes implementation, decision and
quality; lint follows; an enabled final Review contributes report then bundle.
For 128 modules this is 388 refs without Review and 390 with Review. Duplicate
full refs are permitted only where the same final source is also a module source;
array order and duplicates are digest-bound.

Each `ModuleBinding` has exactly these eight required keys:

```text
moduleId         ProjectId (unique across modules)
sourceStageId    StageId (unique across modules)
testStageId      StageId (unique across modules)
expectedCoverage GateCoverageV1
sourceRevision   Git40
decisionDigest   Digest
resultDigest     Digest
coverage         GateCoverageResultV1
```

Each module's expected coverage passes the existing public
`validatePipelineTestGateContract('gateCoverage', ...)`, has kind `module`, the
top-level projectId, exactly one module whose moduleId equals this binding, and
its `policyDigest` is internally valid. `coverage` passes
`gateCoverageResult`, its policy is exactly the expected coverage, its
`sourceRevision` equals `git:${binding.sourceRevision}`, its
`pipelineStageId` equals `testStageId`, and its coverage digest remains valid.
The decision/result digests are non-null because Summary admits only a passed
decision. The binding source revision equals top-level `sourceRevision`.

`FinalBinding` has exactly these eight required keys:

```text
sourceStageId    StageId
lintStageId      StageId
testStageId      StageId
expectedCoverage GateCoverageV1
sourceRevision   Git40
decisionDigest   Digest
resultDigest     Digest
coverage         GateCoverageResultV1
```

It admits only these three independently controlled optional keys:

```text
reviewStageId           StageId
reviewArtifactEncoding  exact "kubeclaw-json.utf16.v1"
reviewSemanticEncoding  exact "review-semantics.utf16-v1"
```

The final expected coverage passes the existing validator, has kind
`cumulative`, the top-level projectId, and a module set exactly equal to the
sorted set projected from all module expected coverages. Final coverage/policy,
stage and source relations are the same as module relations. Final
`sourceRevision` equals top-level `sourceRevision`, and `sourceStageId` equals
exactly one module sourceStageId (the compiler's final integrated module).

Review conditionals are exact:

- no final Review: all three optional keys are absent and there are zero
  `kubeclaw.review` refs produced by a final Review stage;
- legacy outer plus legacy Review semantics: only `reviewStageId` is present;
- portable outer plus legacy Review semantics: `reviewStageId` and
  `reviewArtifactEncoding` are present;
- portable outer plus portable Review semantics: all three are present;
- `reviewSemanticEncoding` without `reviewArtifactEncoding`, either expectation
  without `reviewStageId`, or any present `undefined`, `null` or unknown value
  rejects.

These expectations describe Review evidence; they do not select delivery
manifest semantics. With Review enabled, evidence contains exactly one complete
report ref and one complete bundle ref from `reviewStageId`, its latest selected
attempt and namespace `kubeclaw.review`, with the existing artifact-id prefixes.
`reviewArtifactEncoding` requires both refs to carry the portable tag; absence
preserves the existing reader domain and does not require refs to be untagged.
`reviewSemanticEncoding` retains the independently owned v2/v3 Review report,
bundle and governor pairing checks. Module Review stages are intentionally not
new manifest fields: their authority remains transitively bound by each passed
quality-gate decision and coverage. This repair does not duplicate Review stage
ownership or widen Summary's evidence reads.

Every `ArtifactRef` in `evidence`, and the stored manifest ref passed to the
reader, is the complete plugin-system value with exactly required
`artifactId`, `namespace`, `mediaType`, `digest`, `sizeBytes`, `producer`, and
optional exact `encoding`. Producer has exactly `runId`, `stageId`, `attemptId`,
`attemptNumber`; existing OpaqueId/NamespacedId/StageId/digest patterns apply;
attemptNumber is an integer >=1. Evidence refs require `application/json`,
size 1..8 MiB individually, producer runId equal top-level runId, and the
namespace/stage/artifact-prefix relationships already enforced by each owning
Summary read. Their total source bytes remain <=8 MiB as today.

The stored v3 manifest ref additionally requires namespace
`kubeclaw.project-summary`, media type `application/json`, exact portable
encoding, owner runId equal manifest runId, owner stageId equal the independently
configured Summary stage ID, size 1..8 MiB, `sha256(bytes) == ref.digest`,
`Buffer.byteLength(bytes) == ref.sizeBytes`, and exact equality between the ref
requested by the caller, ArtifactStore response ref, and StageResult ref. The
parsed bytes must equal the value being validated. A latest artifact with the
same resource cannot replace a mismatching requested complete ref.

## Summary producer and configuration

The project-summary config schema remains closed and keeps optional `agentRole`.
It gains one optional enum field:

```json
"deliveryManifestEncoding": {"const":"delivery-manifest.utf16-v1"}
```

Absence is legacy v2. Presence with any other value, including explicit null or
undefined at a direct-call boundary, rejects after `portableJson(config)` and
before evidence reads. `execute` derives the mode only from `context.config` and
passes it as an explicit third parameter to
`buildSummary(input, context, deliveryManifestEncoding?)`. The existing two-
argument call is preserved and produces v2 exactly. There is no default based
on current compiler freshness.

The existing evidence selection, coverage, gate, lint and final Review checks
run unchanged. After those checks the legacy branch constructs and hashes the
existing v2 exactly. The explicit branch constructs the same logical binding
data with schema v3, includes the exact independent Review expectation fields,
and calls the public v3 creator. The registered writer changes only by branch:

- legacy: exact current `put_json`, resource, namespace, media type, value,
  invocation ordinal and absent `payload.encoding`;
- v3: same operation/resource convention/namespace/media type and ordinal,
  v3 value, plus `payload.encoding: 'kubeclaw-json.utf16.v1'`.

No new key, retry, migration write or fallback is introduced. The returned
StageResult remains the actual ArtifactStore receipt ref. Core, runtime, role
engines, lifecycle journaling and cancellation semantics are untouched.

## Compiler and recovery authority

The source change must rebase on the independently accepted Review semantic
bundle. On that API, preserve the existing positional arities and append exactly
one optional product-owned argument:

```ts
compileProject(
  project,
  sourceIdentity = PORTABLE_JSON_ENCODING,
  reportArtifactEncoding = PORTABLE_JSON_ENCODING,
  reviewSemanticMode = 'legacy',
  deliveryManifestEncoding = 'legacy',
)

cumulativeStages(
  project,
  modules,
  sourceStageId,
  reportArtifactEncoding = 'legacy',
  reviewSemanticMode = 'legacy',
  deliveryManifestEncoding = 'legacy',
)
```

Only exact `'legacy'` or `delivery-manifest.utf16-v1` is admitted for the fifth
or sixth argument respectively. Existing one/two/three/four-argument
`compileProject` calls and three/four/five-argument `cumulativeStages` calls
therefore remain legacy for delivery manifests. Archived compilers resolving
the current helper remain byte-identical. `legacy-import.ts` remains explicit
legacy. No authored project field is added.

The genuine fresh CLI/new-run creation path passes all finite choices explicitly,
including `delivery-manifest.utf16-v1`; it may not rely on a default. For the
Summary node, legacy compilation emits the original `config: {}` and input.
New compilation emits exactly
`config: { deliveryManifestEncoding: 'delivery-manifest.utf16-v1' }`. Its final
input independently carries `reviewArtifactEncoding` when the selected report
outer mode is portable and `reviewSemanticEncoding` when the selected Review
semantic mode is portable; neither follows from delivery mode.

Recovery authority is the stored graph, not an artifact:

1. Compile a validated all-legacy delivery skeleton only to obtain the exact
   generated node set and IDs. It does not authorize defaults.
2. Derive source, report and Review semantic modes through their existing
   independent owners.
3. Require exactly one expected node with ID `project-summary` and type
   `kubeclaw.report.project-summary`. First `portableJson(stage.config)`, then
   admit only `{}` or the exact one-key delivery selector config generated above.
   Missing/extra/duplicate/type-swapped nodes, `agentRole` or other extra keys,
   invalid present values and stray selector fields on other nodes reject.
4. Recompile with every independently derived explicit choice and run the
   existing complete pinned-graph verification. Comparison includes every node,
   dependency, config, input, execution policy, package pin and no-Review/module-
   only/final-only/both-Review topology. No mode is inferred from stored
   manifest version/tag, Review nodes, report, locale or newest code.

The product compiler's Summary config is stricter than the plugin's general
optional `agentRole` schema by design: recovery verifies the graph the compiler
actually owns, while direct registered plugin use may still use its public
schema. This does not broaden author input.

## Historical effects and replay invariants

The existing Summary read sequence and every old `get_json_bytes` request keep
operation, resource, payload, full-reference check and ordinal. The downstream
evidence adapter keeps its historical `get_latest_json_bytes` request shape for
both versions; v3 does not smuggle in a new exact-ref operation. Complete ref
equality and requested canonical ID remain checked after the read.

An old durable `put_json` request is never rewritten with v3 or an encoding:

- completed replay returns the recorded original receipt and issues zero new
  adapter calls;
- accepted without receipt remains uncertain and issues zero replacement write;
- a genuine requested-only prefix follows the existing Core retry rule with the
  exact recorded old request; it cannot become a new request;
- cancellation and process recovery do not create another resource or ordinal.

The same rules apply to genuinely new v3 requests, whose first durable request
already contains v3 plus the portable encoding. New and old requested,
accepted, completed and uncertain prefixes are separate histories. Semantic
repair changes neither EffectCoordinator nor FileEffectJournal decisions.

## Mandatory implementation and acceptance matrix

Production work may start only after an independent reviewer accepts this exact
design. Implementation is one coupled producer/public-contract/compiler/
recovery/consumer package; publishing a v3 producer without its reader or vice
versa is forbidden. Review semantic source and this package must be rebased and
tested together, but their selectors remain orthogonal.

Required tests use original production owners—no mock ArtifactStore, journal,
Core, import store, copied parser, shadow registration, precomputed digest,
forged receipt or weakened assertion:

1. **Contract and no-trap.** Exhaust every required/optional field, bounds,
   conditional Review cross-product, 1/128/129 modules, 7/388/390 evidence
   ordering, duplicate constraints, total/output byte limits, unknown keys,
   malformed digest/ref/producer/coverage, getter/Proxy/cycle/non-JSON and
   version/tag mismatch. Schema, types and runtime parser must have parity.
2. **Legacy parity.** Run all original project-summary, remote-test-gate and
   demo-candidate tests unchanged. Replay the complete accepted v2 corpus,
   including untagged and portable-tagged outer refs. Same-locale remains
   accepted; the original cross-locale v2 counterexample remains fail-closed,
   not silently upgraded. Old compiler/API/import definitions and archived CLI
   source resolve solely from the current checkout and remain exact.
3. **Registered v3 producer/consumer.** Through genuine PipelineRunner,
   AdapterRuntime, EffectCoordinator, disk FileEffectJournal and ArtifactStore,
   run the original registered Summary and original registered evidence adapter.
   Preserve full upstream contract fixtures as fixtures. Retain the full unsigned
   manifest, portable digest, stored bytes, complete refs, request/receipt and
   ordered effect/lifecycle JSONL. Reopen the exact stored v3 ref in en/cs and
   the existing da/tr/sv vectors; parsed unsigned values and digest remain equal.
   Exercise the actual FileNovaGateImportStore with a genuinely validated
   imported result before claiming downstream success; missing import remains an
   honest separate block, not a fabricated green result.
4. **Independent dimensions.** Compile and recover every meaningful combination
   of source identity, report outer encoding, Review semantic encoding and
   delivery encoding across projects with no Review, module Review only, final
   Review only and both. Whole graph and package pins must match. Missing/extra/
   duplicate/type-swapped Summary, selector on a foreign node, config junk and
   every version/encoding mismatch reject before artifacts.
5. **Native durability.** In child processes using real disk CAS/journal, cover
   old and new Summary write and downstream read at requested, accepted and
   completed durable prefixes. Use actual OS `SIGKILL`, record the signal and
   preserve the exact prefix. Assert completed replay has no duplicate adapter
   invocation; accepted-without-receipt stays uncertain; requested-only follows
   the unchanged Core rule with the identical request; v2 never gains encoding
   and v3 never loses it. Include cancellation at the original boundaries.
6. **Consumer negatives.** Wrong/missing digest, malformed closed v3 body,
   >8 MiB body/ref, bytes/size/ref disagreement, absent/wrong v3 tag, wrong
   namespace/run/stage/artifact ID, competing latest ref, ambiguous decision,
   changed final coverage/gate/source, Review expectation/ref mismatch and real
   import-store failure all reject at the documented boundary. An early manifest
   rejection is not evidence of later import execution.
7. **Repository gates.** Run package contract tests, project-summary and remote-
   test-gate package suites, registered integration/reliability tests, project
   compiler/recovery and archived CLI probes, workspace/plugin discovery,
   sandbox/build/inventory, generated SDK/schema checks, dependency/pin closure,
   relevant TypeScript/lint gates and the full fresh-head bounded regression.
   Preserve every raw command, exit status, zero skips and source hash.

If Go, a genuine import result, delegated cgroup, provider, cluster or another
native prerequisite is absent, retain that exact blocker and leave acceptance
open. Contract fixtures never become native provider evidence. No deployment,
CI, production mutation, paid resource or third-party message is authorized.

## Publication and next action

This document is published alone on a new `fix/resume-47-*` branch with a sole
fresh-MAIN parent and `[skip ci]`. It authorizes nothing by itself. An independent
design reviewer must compare the entire document with the four frozen inputs,
current source and exact 47 scope, and either accept it without qualification or
return concrete changes. Only root may then authorize a separate source author.
Implementation must be independently reviewed from a remotely frozen candidate
and must satisfy every real gate above before any integration or register change.

