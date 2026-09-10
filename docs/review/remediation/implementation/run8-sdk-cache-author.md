# Run-owned Review cache cutover: author handoff

Package implemented and locally verified; independent final approval and fresh-head
integration remain required. PCR-SDK-001 remains open because final Review reports
and other separately identified consumers are not repaired by this cache profile.

## Source and ownership

Approved design: d4c376777659da05855cc2bcd3b367eaba553f51. Original accepted
component/contextRequest I/i counterexample: 05faa821ad473135654d64702170d7835f5fa661.
Initial incomplete implementation: 3872c37f3f239bea40f643e03dcfdc43abf0a4b0.
Corrected source/archive checkpoint: 75aca9244fdf72ba3c90bf250ec9573d2dbffbef.

Current reconciled local source a3f67667869a66b36f416b82be6c1f2fedcbdec7 is based on
fresh remote main 28909f62da68f70d94e0672ce7ae12ced8d7b3d9, equivalent local
69253f29c9f215c8d9895a4a9ea5e7214cb3fde9, tree 7b242b835cc5f06e25a0c8ab707998e80ede3133.
All mandatory resume files/current register were reread. Fresh historical baseline
derivation still gives exactly 47 IDs, identical to partial-47-scope.json.
Only the six cache commits were applied; no transport reimplementation or foreign
package takeover. Shared Core and existing role-specific engines are preserved.

The canonical generated immutable ReviewCacheProfile is separately owned from
RuntimeDispatchProfile. New original run-snapshot.v4 requires both. Existing
v1/v2/v3 runs retain their old cache operations/payloads for the entire run.
v2 cache records validate strict JSON and both portable inner digests; exact
ArtifactStore bytes/ref/encoding verify the outer proof. Both original repository
review and verification cache paths explicitly pass the frozen context profile.
All trusted retained candidates are checked before selection. Same keys remain;
mixed versions/encodings, sizes, corrupt proofs or ambiguous content are errors.

Two independent review findings were corrected without weakening tests: parser
and direct writer originally read schemaVersion before no-trap validation.
Both now validate JSON before selecting their owning version. The profile is a
private immutable selection with a read-only getter. Independent red evidence
is owned by the reviewer; author getter/Proxy regression is permanent too.

## Actual acceptance and boundaries

- Reconciled combined suite: 59/59, zero skips, raw run8-sdk-cache-reconciled-59.txt.
- Native cache matrix: 29/29, including 24 actual requested/accepted/completed
  SIGKILL cases across original snapshot v1/v2/v3/v4 and artifact write/read.
  Archived producer bytes are verified against three fresh approved Git blobs;
  execution resolves sources/dependencies from the current checkout, not old Git.
- Genuine runPipelineV2 -> StageExecutor -> ArtifactCheckpointRecorder recovers
  en-US -> tr-TR -> sv-SE through three attempts and two checkpoint deaths. Both
  original refs are retained with one digest and one initial cache execution.
  A registered test stage supplies an originally admitted seeded contextRequest;
  this is not native model/Gateway execution, and is not described as such.
- Real Core/FileJournal/ArtifactStore races and same-byte foreign producer rows
  verify exact full-ref selection; honestly rehashed outer artifacts cannot hide
  invalid inner digests, unknown record versions, or undeclared v2 fields. No
  read error becomes a miss or a new model dispatch.
- Extended original transport/snapshot/retirement suite: 39/39 before reconciliation;
  v3 producer is now archived exactly, rather than removed from the tests.
- Full original Review npm test passes on frozen corrected production; raw
  run8-sdk-cache-full-review-frozen.txt. New-writer-only source snapshot expectation
  advanced to v4; original v1/v2 and graph-v3/Unicode assertions are unchanged.
- Original archived CLI probe passes on corrected production with the original
  thirteen-stage graph, expected original negative graph mismatch and current
  terminal-run rejection without mutation; raw run8-sdk-cache-followup-cli.txt.
- Nova and Foundation full noEmit typechecks and canonical SDK generation check
  pass. One initial Foundation command used the nonexistent package-local config;
  it was corrected to the original skills/common/plugin-runtime/tsconfig.json.

Historical wrong-locale v1 authority still rejects visibly, with unchanged completed
journal bytes. No locale guess, retagging, new key, or newest-candidate preference
is introduced. Accepted uncertain effects remain blocked. A wholly rewritten valid
older snapshot is not cryptographically prevented by an unkeyed digest; this
package claims profile/version consistency and existing effect/cache authority,
not a new signed downgrade guarantee. Report/prepared-plan identities are separate.

Next action: independent reviewer final approval against the reconciled source,
then root must reread main, apply only approved cache changes with exact fresh
parent/fast-forward, rerun changed interactions, and update register/evidence while
leaving the broader SDK finding open. No CI/deployment/provider resources were run.
