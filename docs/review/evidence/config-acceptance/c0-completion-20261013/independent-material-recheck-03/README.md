# Independent material recheck 03 — bounded definition verdict

## Verdict

**IC02-ENCODING-001 is corrected and independently verified at the frozen codec-correction-04 definition scope. No new material error was found in the separately bounded project-membership-03 and nova-boundaries-02 checks below.** This is not global C0 acceptance, runtime binding acceptance, or C1–C6 implementation authorization.

Fresh independent reviewer, with no author conversation inherited, read GOAL-START, OPENCLAW-CONFIG-GOAL, original D17–D22 and original acceptance A1–A8/F1–F6/F-DOC plus component-author amendments before evaluating correction claims. Original challenge02 README/finding and its actual frozen schema/SDK reproduction were inspected, not accepted by summary. All historical finding/report/schema/generator/checker bytes remain intact.

Reviewed branch `codex/config-c0-semantic-inventory-20261012`, HEAD `0bcaf85d192d031814554c590b1bfca5b3ba81dd`. `input-identities.json` binds58 retained input files, tool/commit/tree/branch; `inputs/` retains their exact bytes. `initial-tracked.patch` and `initial-status.txt` identify preexisting dirty author work. No production, existing tests, authored correction, canonical inventory/matrix, authorization or old report was edited. All reviewer writes are within this new directory. `source-conservation.json` confirms all58 inputs unchanged after controls. `original-conservation.json` separately confirms original schema/generator/checker and three SDK sources match challenge02 retained bytes.

## Decisive codec result

Independent `codec-recheck.mjs` imports actual frozen SDK `portableJson`, `sha256Bytes`, `sha256Text`, `verifiedArtifactJsonText`, compiles both strict object schemas with Ajv2020, and reproduces the original material mismatch before checking correction:

| Marker | Original strict object schema | Corrected strict object schema | Real SDK tagged byte verification |
|---|---|---|---|
| `json-utf16-v1` | accepts | rejects | rejects `ARTIFACT_JSON_ENCODING_INVALID` |
| `kubeclaw-json.utf16.v1` | rejects | accepts | accepts canonical bytes |

Independent deep equality restores only the corrected `$id` and enum to prove every other schema property, required field and strict shape guard is conserved. Actual SDK/generated ArtifactRef confirms the portable marker; RuntimeDispatchProfile/ReviewCacheProfile keep the distinct historical `json-utf16-v1` marker. `raw-bytes-v1` remains a declared **proposed raw descriptor**, not installed SDK JSON support.

Seventeen executed controls pass (`codec.stdout`, empty `codec.stderr`): marker concordance twice; UTF16-key ordering and UTF8-byte separation (77 physical bytes,70 code units); tagged noncanonical bytes rejected even with correct digest; historical untagged pretty/whitespace bytes returned byte-for-byte without recanonicalization; distinct digest/size/value/reference mismatch failures; six strict-shape negatives; unsigned internal digest versus complete published external digest distinction; author payload independently reserialized and checked against retained reported byte count/digest. No target assertion or SDK code was changed. The Unicode payload includes astral/private-use keys, not just ASCII ordering.

Repository search finds no function literally named `validateArtifactJsonEncoding`. The actual exported verifier is `verifiedArtifactJsonText` (`sdk/src/artifact-json.ts`); productive artifact-store `encodeArtifactJson` rejects unsupported markers, uses `portableJson` only when tagged, and writes UTF8 Buffer bytes/digests; its reader invokes that SDK verifier. This source trace is not an executed productive store/grant transaction. Author correction's six reported controls were examined; they alone did not test the SDK reader rejection, so the independent controls above supply that missing decisive check.

The correction's promise that both internal and external identities are checked **on future binding load** is a target definition, not installed behavior. Current shape validation does not authenticate bytes, schema contents, grants, namespaces or secret classification. The `extra secretBytes` negative proves strict field shape only, not exhaustive confidentiality. Secret exclusion/content checks, target schema compatibility, materialization and productive immutable closure verification remain implementation/spec obligations. No legacy hash/profile/schema codec was renamed or rewritten.

## Separate membership challenge

`membership-recheck.mjs` independently invokes real current `projectSourceFixture` (which uses real `resolveTestPlan`) and real `compileProject`. It reverses declared modules and runs16 combinations of architecture/module-api/module-ui/final review presence. Expected dependency-ordered stage list and explicit stage-to-group map are independent of author harness output. Exact ordered stage coverage, uniqueness, original request_fix target within its module, `implement-ui` dependency on `test-api`, and `project-summary` dependency on `final-test` all pass. Both architecture-review variants reject129 null module entries with `PROJECT_MODULES_INVALID`, before module object validation.

Source `sourceStages`, `moduleStages`, `cumulativeStages`, `demoStages` supports the supplied foundation/module/integration/delivery assignments; `project-summary` is delivery, final-test is integration, dependency edges do not merge groups. Actual optional review stages exist only for valid present declarations. The valid demo branch's three stages are **source-traced only**, not executed with a valid full plan. Standalone Prism/Buster, explicit/custom graphs, durable target membership records, dispatch/recovery policy and the full field partition are unreviewed here. Existing partial-definition disclaimers are necessary and preserved;16 compiler fixture controls do not close C0-D.

## Separate Nova boundary challenge

`nova-recheck.mjs` adds eight real exported locator controls against frozen unchanged `runRoot`: Unicode262144-byte matching record accepted;262145-byte matching record skipped; valid record after an oversized record found;65536-byte final record without newline accepted; file-over-scan-cap rejected; ordinary legacy nonmatch selects uncreated hashed root with unchanged original file; bounded symlink rejected; bounded directory rejected. These independently corroborate current scanning units/options and the supplement's new-run/nonmatch versus authenticated-recovery distinction. They do not authenticate simplified locator JSON or prove real recovery.

Two additional controls execute the verbatim extracted nonexported audit body with astral Unicode at16384/16385 UTF8 bytes. Exact boundary inline versus summarized behavior and summary digest/byte count pass. This is an explicitly narrow extracted pure-function check, **not** actual AdapterRuntime completion/FileEffectJournal storage acceptance. Source confirms actual completion journaling and full result receipt storage responsibilities; an artifactRef string is not a stored artifact API write. Current project recovery omits the optional locator bound; proposed S injection and stable original R/compiler cap on recovery are not implemented. Concurrent append/FIFO hangs, authenticated old journal/snapshot replay, real hooks, target configured64/65/128 compiler cases and original-generation recovery remain not-run.

## Boundaries and open work

Canonical frozen inventory still has30 gaps; matrix implementationAuthorization remains null. Broad-field coverage, native/future case joins, exact provider widths/reservations, complete operator profiles and all C0-A–E semantic obligations remain open. No old gap or future case was promoted from these results. New `binding/journal-bound-05` was communicated during review and is **not reviewed or accepted by this report**; it is outside the initial58-input freeze. No claim about its finite envelope, provider metadata/live capabilities, all-writer enforcement or complete case linkage is implied.

Only IC02-ENCODING-001's material codec definition correction is accepted at this bounded stand. No full C0, package readiness, grant/physical capacity/authentication, process-kill mutation, paid Eval, live deployment or production-finding closure is asserted.

## Reproduction

Run the three exact Node argv entries in `commands.json` from the recorded repo cwd; their stdout/stderr files retain all decisive results. Setup read-path mistakes are listed separately and not counted as controls. `source-observations.txt` preserves line-numbered source observations. Harness/artifact byte digests are in `review-artifact-identities.json`.
