# Proposed bounded Prism baseline codec cutover (not implemented)

Read-only proposal following the actual admitted en-US → da-DK CAS/import failure
in `implementation/run9-sdk-remaining-consumer-audit.md` (relative to remediation).
Root review and independent acceptance required before any production change.

## Owning contracts and boundaries

1. `contracts/prism/v1/schemas/prism-v1.schema.json` owns `baselineManifest`;
   today it accepts only `prism.baseline-bundle.v1`. Its owning generated validator
   and `src/index.ts` dispatch must preserve that exact historical contract while
   admitting a separately defined new manifest version. Architecture docs at
   `docs/architecture/prism-baseline-bundle-v1.md` define checksum-map identity.
2. `skills/prism/server/control-server.ts:636-882` is the full authoritative
   `/v1/baselines` producer: authenticated approval and exact current revision,
   DB ownership, actual worker preview capture, asset CAS reads, member digests,
   checksum-map digest, manifest, CAS archive put, immutable baseline DB row.
   Its private helper at line 94 currently defines locale-dependent ordering.
3. Same producer's existing-baseline branch at lines 643-655 returns the recorded
   digest/artifact, not a regenerated bundle. `/v1/dispatch` at lines 299-309 uses
   `approvedRoundBaseline` in `control/design-generations.ts` and original CAS to
   serve that exact saved archive. These paths must never retag/rebuild old rows.
4. `skills/nova/plugins/prism-design/src/archive.ts` owns archive transport/import
   checks: approved digest, outer CAS hash, schema/manifest/project, member set,
   safe paths/base64, limits, original per-file digests, document/revision/assets
   and required preview bindings. All existing checks remain for both versions.
   `src/stage.ts` carries the explicit operator/architecture/bundle approval and
   stores imported output as a separate generic ArtifactStore JSON object. That
   outer artifact codec is distinct from the approved inner Prism bundle codec.
5. `skills/prism/studio/app.tsx:383-406` initiates approval then baseline creation
   and displays the returned digest. It does not recompute manifest identity.
   SQL `prism.baseline.bundle_digest` and `bundle_artifact_id` are opaque stored
   values; no mass rewrite or DB migration inferred merely for new schema tags.
6. `skills/prism/engine/index.ts:266-279` has a separate `publish` operation that
   produces a small `{schema,projectId,revision,designDigest}` object and hashes
   `JSON.stringify(manifest)`. This is NOT the full archive, does not satisfy the
   canonical complete baseline manifest, and does not include checksum files.
   `engine/worker-binding.ts` / `engine-results.v1.json` validate this generic
   engine result. Do not relabel it as a verified v2 baseline or use it to bypass
   the real Control publisher. Its overloaded v1 label requires a separate owning
   caller/contract decision if migration touches that operation; leave unchanged
   in the minimal full-archive cutover until root decides that scope.
7. Buster visual provider's similarly named `baselineBundleDigest` is a different
   contract (`kubeclaw.visual-manifest`): hash of sorted PNG digest strings, not
   this Prism archive manifest. Do not silently migrate that unrelated identity.

## Recommended new identity, not an in-place comparator replacement

- Keep existing v1 writer/reader algorithm as an explicit legacy branch, with
  exact old bytes, schema and digest meaning. No locale guessing, trying multiple
  collators, silent code-unit substitution, retagging, or regeneration of saved
  approvals/baseline rows. The demonstrated unverifiable cross-locale v1 import
  remains a clear fail-closed historical compatibility boundary, not a new v2
  success claim. Any future recovery from original checksum-document bytes needs
  its own exact historical-authority proof before changing this boundary.
- Define `prism.baseline-archive.v2` paired with `prism.baseline-bundle.v2` and
  an explicit required `checksumEncoding: "kubeclaw-json.utf16.v1"`. Reject mixed,
  absent or unknown versions/encodings in the v2 branch; do not infer them from
  the global run version, caller locale or latest installed package.
- Domain-bind the new digest preimage, for example the portable serialization of
  `{schema:"prism.baseline-checksums.v2", algorithm:"sha256",
  encoding:"kubeclaw-json.utf16.v1", files:<validated complete checksum map>}`.
  This prevents simply relabeling an old sorted v1 map as v2 while preserving an
  old approval digest. Final exact shape requires owner/root approval.
- Produce that new checksums document and manifest/archive from the current
  approved immutable source and genuine captured members only. Keep the original
  exclusion of manifest/checksums from member checksums to avoid self-reference.
  Outer CAS hashes exact emitted archive bytes; explicit operator approval still
  binds exact final bundle digest. No invented capture, automatic approval, or
  copying an old approval to a differently versioned digest.
- Extract a pure owning checksum/archive assembly function as an ordinary future
  refactor shared by the real Control producer and importer. An exported helper
  would permit actual production-helper tests without pretending those tests
  traversed DB approval/rendering. Do not create a parallel test-only producer or
  shim. The current audit deliberately extracts the old private helper and labels
  this limit because there is no currently exported equivalent.

## Genuine verification plan and present capability boundary

First preserve the current negative from real native locales and accepted aa/az
assets. Then test original validators + real CAS and original importer for:

- unchanged v1 same-locale archived bytes and approval identity;
- explicit v1 unverifiable cross-locale behavior (no fallback/rewrite);
- v2 en-US↔da-DK plus en-US↔tr-TR and sv-SE with actually admitted IDs/maps;
- malformed/unknown/mixed tags, reordered/altered checksums, different member
  bytes, missing/extra members, cross-project/revision/approval, unsafe paths,
  base64/size limits, manifest/assets/previews corruption;
- identical original archived CAS bytes on disk before and after denied import;
- real production assembly helper after refactor, plus independently inspected
  wiring into the unchanged authoritative Control publication path.

The existing exported `createControlServer(pool, environment)` is callable, but
its genuine publishing path requires the original DB ownership/approval state and
actual worker captures (`runWorker('render', capture:true)`). No pure existing
archive producer entrypoint bypasses them. A successful engine `publish` stub-like
manifest is not an alternative. This audit did not launch native Postgres or a
browser and cannot claim complete HTTP publication/approved capture. If those
prerequisites remain absent or outside authority, retain that exact gate open;
do not supply fake DB rows, fake worker render responses, or weaken captures.

## Graph/compiler classification remains bounded

Dynamic lowercase IDs are **not** inherently locale-stable. Actual graph v2
aa/az digests differ; current graph v3 plus run-snapshot v2 genuinely reopen
unchanged across native en/da, so that owner is already explicitly fixed.
Compiler's module requirements/source policy use closed fields and arrays of ID
values; generic preflight policy remains open and its existing Source/Subject
version must remain. Provider-plan digests use their own code-unit serializer.
CLI compiled-file/display and legacy authoring-report hashes can include dynamic
maps: no global stability proof exists, but no discovered runtime reader uses
those report/display hashes as resume/approval authority. Record them as audited
non-runtime authority, not silently fixed or evidence of duplicate execution.

PCR-SDK-001 and the frozen 47 remain incomplete. This proposal authorizes no code
change; next action is root scope/contract approval and independent review.
