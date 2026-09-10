# PCR-SDK-001: remaining consumer audit, no production changes

Fresh remote `a43aa256bdce35d7f9c44d5d661e59c4055e562e` matches all 3,838
blobs/modes/types of own isolated checkout baseline `b3d2f7ba3ee35d121f26f67f737a400b3d034fb4`.
Current original finding and resume/register requirements inspected. Frozen 47-ID
set remains unchanged; this package closes no finding. Scope excludes the active
Review/cache audit and separately authored run-frozen runtime transport cutover.

## Confirmed original-domain failure: Prism baseline archive v1

The original `designDocument` validator accepts asset IDs `aa` and `az` under
`contracts/prism/v1/schemas/prism-v1.schema.json` (`id` is lowercase ASCII, not
arbitrary Unicode). Original Control publication creates `assets/aa.png` and
`assets/az.png` at `skills/prism/server/control-server.ts:749`. Its private
`stableRecord` helper at line 94, used for `bundleDigest` at line 832, sorts keys
using default `localeCompare`. Nova imports the persisted original checksum
map at `skills/nova/plugins/prism-design/src/archive.ts:51` and repeats that sort.
Native Danish collation treats `aa` as a digraph: unlike en-US, `az` sorts first.
Therefore lowercase ASCII alone is not a locale-stability proof.

Executed `node docs/review/evidence/run9-sdk-prism-locale-probe.mjs`, exit 0:

- Original Prism document and manifest validators accept both assets.
- Real original file-backed `ContentAddressedArtifactStore.put/get`, actual PNG
  bytes and full archive persist in a temporary owned directory, reopened by
  separate native-locale Node processes (LANG/LC_ALL; no comparator monkeypatch).
- en-US original Nova `verifyBaselineArchive` accepts the archived bytes.
- da-DK original Nova importer rejects **the identical digest-verified archive**
  with `PRISM_ARCHIVE_BUNDLE_DIGEST_MISMATCH`; both original document and manifest
  validators still accept its contents, and the actual CAS verifies its digest.
- Raw: `docs/review/evidence/run9-sdk-prism-locale-raw.txt`.

Producer boundary is deliberately precise: Control has no exported checksum
helper. Its complete HTTP publication path requires DB approval and worker
rendering. The probe executes the **verbatim extracted original private helper**
with only TypeScript annotations removed by Node, records its source/hash/line,
and builds the archive fixture analogous to the original archive-integrity test.
It does NOT execute the complete Control publisher, browser or renderer. The
validator/CAS/Nova importer are actual original production entrypoints. This is
a real persisted-consumer failure, not end-to-end design-generation acceptance.

Next action: independently review this admitted-domain probe, then define the
owning producer/importer version migration. New bundles need explicit stable
encoding/version authority; historical v1 bundle authority must not be silently
rehashed using a different comparator or guessed locale. Investigate whether
retained original checksum-document bytes provide sufficient exact historical
authority, and prove it with real CAS/import, corruption, unsupported-version,
same/cross-locale and historical readback cases. No production fix is included.

## Rechecked graph/compiler/plan rationale

`node docs/review/evidence/run9-sdk-graph-locale-audit.mjs` admits original
`pipelineDefinition` IDs `aa`/`az`, uses the actual graph and snapshot writer,
then reopens/verifies actual persisted files in en-US and da-DK. Current
`execution-graph-snapshot.v3` / `run-snapshot.v2` digests remain identical.
Explicit legacy graph v2 changes node order and digest. Raw:
`docs/review/evidence/run9-sdk-graph-locale-raw.txt` (exit 0). The existing
controlled v3 cutover already handles this dynamic-ID domain; no new graph
version or silent historical reordering is justified. This structural/snapshot
probe does not pretend its empty plugin inputs execute registered providers.

- `project/compiler.ts:89-96` closes each requirement to `id`/`statement`; module
  IDs remain values in arrays. Ordering at line 137 uses code-unit `.sort()`.
  `project/source.ts:42-48` constructs a fixed-shape policy from those arrays;
  existing explicit Source/Subject encoding is retained for the genuinely open
  generic preflight `policy` schema. Do not revert that versioning based on ASCII.
- Provider plans can contain dynamic maps. Their owner `remotePlanDigest` in
  `contracts/pipeline-test-gate/v1/src/digest.ts` imports the observability
  contract's code-unit serializer, not SDK's legacy locale serializer.
- CLI compile output hashes complete definitions with legacy `canonicalJson`;
  dynamic provider configuration/grant maps therefore are not globally proved
  locale-invariant. The actual persisted resume authority is independently
  versioned graph/snapshot, as checked above. No new duplicate-execution failure
  is inferred merely from a CLI display/compiled-file byte difference.
- Legacy importer reports hash admitted dynamic `legacy.modules`, `moduleIds`
  and `gateDecisions` maps (`project/legacy-import.ts:68-72`); lowercase or ASCII
  is not a sufficient proof there either. Those report digests have no discovered
  production reader/replay authority: only the explicit authoring importer/CLI
  writes them. No execution/approval migration is claimed by that original code.

## Other bounded classifications

- Foundation observability, Worker Core and test-gate digest owners already use
  code-unit ordering; the many identically named `canonicalJson` imports must not
  be mistaken for SDK's locale-sensitive function.
- RuntimeWorkspace owner/generation, Exposure identity, Demo authentication
  protocol/credentials and Product intent all select fixed field sets; dynamic
  identifiers/pointers/paths are values, not property names. Demo assertions are
  fixed `{pointer,equals}` with scalar equals; credential keys are exactly
  username/password. No admitted dynamic-key persistence counterexample found.
- `prism/directions/index.ts` accepts open theme maps and its signature can be
  locale-dependent, but `directionSignature` has no found production caller:
  only tests invoke it. The production distance comparison compares feature maps
  by keys/values and does not persist this signature. Not an established durable
  identity defect from the current scan.
- Separate source candidate: `prism-design/src/stage.ts:16-17` still requests
  `get_json` and rehashes parsed architecture content with legacy `canonicalJson`.
  The actual Prism `architectureContent` schema admits an object and generic
  artifact values admit open JSON; this reader does not use the existing
  `get_json_bytes`/`verifiedArtifactJsonText` authority already used by Summary,
  Human Approval and Repair Evidence. No complete registered-stage failure probe
  was run here; do not call this candidate independently verified or fixed.
- Review graphs/maps/profile/cache and the eleven runtime.dispatch producers
  remain owned by the concurrent SDK reviewer/transport author, not duplicated.

Only docs/probe/raw files changed. No CI, deployment, operator message or MAIN
mutation; no broad SDK or frozen-47 closure. Next durable action is independent
Prism archive probe review and an explicitly bounded owning codec proposal.
