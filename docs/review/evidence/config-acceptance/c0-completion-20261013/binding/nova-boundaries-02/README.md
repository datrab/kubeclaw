# Exact Nova boundary supplement (author proposal)

The frozen prior [four field definitions](../nova-new-field-definitions.json)
are preserved. This supplement tightens their current/target distinctions; neither
document constitutes whole C0 acceptance or implementation permission.

## Current facts and required target transitions

| Field | Actual current reader and behavior | Target action and stability |
|---|---|---|
| `C0-NOVA-COMPILER-MAXIMUM-MODULES` | `project/compiler.ts::projectModules` rejects non-array/empty/>128 before module structure validation; `compileProject` is called by project CLI and recovery compiler. | Required R compiler policy; complete task modules still own identity/dependencies/requirements/blueprints. Do not allow a project field or CLI value to override the selected cap. Old captured graph is not recompiled under B on recovery. Proposed 1–128 range preserves current safety envelope; larger supported ranges require independent algorithm/resource evidence. |
| `C0-NOVA-AUDIT-RESULT-INLINE-BYTES` | `engine-runtime.ts::auditResult` uses **Buffer UTF-8 bytes**, not JS string length; exactly16384 is inline,16385 summarized. `createAdapterRuntime` completion hook places the result in the lifecycle journal. Full receipt is separately retained by `core/effects/journal.ts::FileEffectJournal`. | Required R observation policy. Summary digest/bytes join the original full receipt; `artifactRef` alone is not a stored artifact API. Missing full receipt remains evidence unavailable, never Latest. Threshold controls representation, not effect result truncation or business outcomes. |
| `C0-NOVA-LEGACY-RECORD-BYTES` | `run-root.ts::journalContainsRunId` silently skips an oversized line and can return a new v2 path despite a valid matching identity in that line. Record bytes exclude newline; read buffer64KiB is an implementation chunk, not a substitute record limit. | Required S bootstrap policy; explicit `LEGACY_RECORD_BYTE_LIMIT` before treating legacy identity as absent. Preserve old hash/codecs. Revalidate scanner policy on actual original-bootstrap resolver, not module B. |
| `C0-NOVA-LEGACY-SCAN-BYTES` | Optional exported resolver argument currently validates safe positive integers; bounded branch rejects nonregular or larger files with `LEGACY_SCAN_BYTE_LIMIT`. Engine callers currently omit it. `project/recovery.ts` directly calls `runRoot(storageRoot,runId)` too. | Required S bound injected into every productive root/recovery/report locator through the same bootstrap authority. Require scan cap≥record cap+1 for a newline-terminated record and safe-integer relation (reject overflow). Initial finite deployed scan cap needs authentic retained-journal inventory; no fabricated preservation value. |

**Correction to the earlier short case wording:** an existing ordinary legacy
journal with no matching run ID currently returns the hashed v2 path. That is
not automatically a recovery error for a genuinely new run: colon→underscore
legacy paths can collide. Preserve this distinction. A requested recovery with
no authenticated original snapshot/history must reject at its recovery boundary;
an oversized matching line must not masquerade as the ordinary nonmatch case.
The scanner is a locator, not proof that arbitrary JSON is an authenticated run
history. Original hash-chain/snapshot validation remains mandatory afterward.

## Exact proposed execution cases

All cases below are **implementation-not-run**. Command names are proposed harness
entry points under the existing verification organization, not present code.
Use `node --test tests/verification/reliability/config-nova-boundaries.test.mjs`
after approved C2/C5 implementation, with the target production loaders and real
`runRoot`/recovery or actual AdapterRuntime/FileEffectJournal completion paths.
Do not substitute the extracted audit control below for the productive hook.

* `NOVA2-COMPILER-CAP`: extend `projectSourceFixture` using real `resolveTestPlan`
  for each module and final coverage; produce65 valid unique/nonoverlapping modules
  with independent requirements, scope.moduleId and gateCoverage/plan digests.
  Keep same64/128 complete R profiles except cap. Under64, expect
  `PROJECT_MODULES_INVALID` before snapshots; under128 compile65 and observe all
  declared module membership exactly once. Positive64 at64 must compile. Recover
  accepted65 graph after publishing64: original graph/cap retained. Missing,
  fraction,0,129 cap rejects profile before task compiler. Restore literal128
  mutant:65-under64 must fail its intended rejection oracle, not fixture validation.
* `NOVA2-AUDIT-CAP`: complete original R profiles4096/16384; genuine adapter
  completion receipt carries `{text,padding}` with JSON UTF8 size4096/4097.
  Compute ASCII padding as N−Buffer.byteLength(JSON.stringify({text,padding:''}));
  repeat with text `é` to distinguish byte count from UTF16 length. At4096 expect
  original inline result;4097 under4096 summary exactly matches full retained
  receipt digest and4097 bytes, under16384 inline. Lifecycle and full receipt
  identities/claim/budget stay identical. Recover after B and observe original
  representation. Missing/wrongtype/0/16385 rejects before adapter activation.
  Literal16384 and string.length mutants must fail distinct boundary/Unicode cases.
* `NOVA2-LEGACY-RECORD-CAP`: create old-root authenticated real FileJournal and
  valid legacy snapshot for run `run:byte-boundary`; tune payload padding so the
  **complete serialized hash-record** is65536 then65537 UTF8 bytes, excluding
  newline. Use `FileJournal` framing/digest, not the simplified current-control
  locator record. Under65536 exact accepted;65537 rejects
  `LEGACY_RECORD_BYTE_LIMIT` before new-run writes/activation. Under262144 same
  authentic65537 journal resolves/replays original. Also exact262144 and262145.
  No changes to record codecs/hashes. Literal262144 mutant must fail65537-at65536.
* `NOVA2-LEGACY-SCAN-CAP`: same authentic legacy root, complete fileN bytes including
  final newline; N allowed andN−1 `LEGACY_SCAN_BYTE_LIMIT`, no target path created.
  Nonregular/FIFO/symlink cannot hang/follow under bounded loader. Concurrent
  append exceeding cap rejects during read. Missing/wrongtype/nonpositive/record
  cap≥scan cap/unsafe relation rejects profile. Cover project compiler recovery,
  engine recovery/resume and existing report locator independently: none may
  omit the bound. A remove-option mutant must fail at each distinct caller.
* `NOVA2-LEGACY-NONMATCH`: colliding legacy root belongs to another run and has a
  valid original chain. New requested run may use its distinct hashed v2 path;
  requested recovery of absent original must fail without activation/new writes.
  Empty/unparseable/partial/oversized history is never proof of a started original.
  Preserve original run collision safety and verify original nonmatching file
  bytes unchanged. Do not indiscriminately reject all genuine new-run collisions.

These IDs supplement, not replace, original field cases/requirements. Actual
future harness/source/tool/config hashes and raw logs must be recorded at the
approved stand; no test digest can honestly describe an unwritten harness today.

## Actual definition/source controls

`node .../nova-boundaries-02/check-current.mjs` ran10 observed controls against
unchanged source. Seven invoke the **real exported runRoot** using isolated
temporary regular files. Three execute the exact extracted non-exported pure
auditResult body (not its productive caller). Identity/result/log are in
`current-controls.stdout`; stderr preserved separately. The simple locator JSON
is deliberately not claimed to authenticate a full FileJournal/snapshot chain.
These checks expose current silent record skipping and UTF8 behavior; they are
neither configurable target acceptance nor whole-C0 review.
