# Independent four-finding C0 recheck — 2026-10-13

## Verdict

**All four original corrections are independently verified at bounded document-integrity scope. One supplemental P2 conservation-guard finding remains: IFOUR-ROOT-001. This is not a clean guard-completeness verdict.** Current candidate root content is correct; no historical evidence loss or production change was observed.

Reviewer was a fresh non-author native agent, given the task, repository and frozen-input locations, not author conversation context. No nested reviewers, source edits, C1 implementation, deploy or acceptance promotion occurred. Author summaries were not treated as proof. Codex CLI autoreview remains unavailable, not passed; this native review is separate.

## Original findings

| Finding | Independently verified result |
| --- | --- |
| UCORE-001 | All **1,248 Runtime rows** equal independently reconstructed normalized root rows, including every original property, corrected history and review-pending state. **6,320 native case specifications** are retained exactly. Actual structural checker and native conservation checker pass; root deletion and native specification deletion reject. |
| URUNTIME-001 | **Every one of 17** original rows matches immutable checkpoint `21bf51bc2075abec1191fdc091952492b6cb484e` and authenticates against the preserved snapshot with canonical sorted compact UTF-8 JSON SHA256. Incorrect enriched-row digests and complete original history records remain explicit correction provenance. Restoring only those provenance corrections reproduces the complete pre-repair Runtime inventory. Actual corrected integration AST prefix hashes each unmodified original before `setdefault`; no integration writer was rerun. Focused fragment verifier rejects incorrect hashes, missing correction provenance and unrelated row changes, then passes restored input. |
| IR21BF-DC-001 | Independent schema traversal and inspected frozen template loops produce exact membership at **16 template coordinates / 147 occurrences**, and **105 schema coordinates / 125 occurrences**, including named Buster admission/preparation API schema paths. Both actual validators reject inputs persisted before startup with deleted/duplicate members or deleted coordinates. |
| IR21BF-DC-002 | All **272 occurrences** bind exact setting, owner, field, case IDs and expected EFFECT record; complete A/B selected values match declared deltas. Both actual validators reject unrelated existing profile pointers, same-owner wrong-field pointers, owner/field/case drift, and an unrelated persisted mutation inside the complete profile file. Full immutable profile-file identities prevent silently changing non-selected profile content. Restored positives pass. |

## Supplemental finding: IFOUR-ROOT-001

`author/check-matrix.py` checks fragment file hashes, but full normalized body comparison exists for Core canonical-question rows, not Runtime rows. A serialized isolated **root** inventory with `RT-NOVA-REMOTE-SCHEMAVERSION.sourceDefinitionHistory[0].oldRowSHA256` changed to 64 zeroes returns **exit 0 / errorCount 0** from the real `--structural` checker. The source fragment and advertised source hash are unchanged. The focused Runtime verifier authenticates the fragment, not this altered root projection.

The exact mutant and actual outputs are [runtime-history-drift.inventory.json.gz](runtime-history-drift.inventory.json.gz), [stdout](runtime-history-drift.stdout) and [stderr](runtime-history-drift.stderr). Independent root-body comparison detects the change. Candidate bytes themselves pass that full independent comparison. This guard gap predates the candidate (checker source was not modified), but is directly relevant to recurring root Runtime conservation. It is not a production bug or proof of current evidence loss. Extend the structural root boundary to compare complete normalized Runtime rows, including historical provenance; preserve rejecting persisted-input controls and unchanged positives.

The first reviewer harness expected rejection and stopped on this actual false positive. Its raw outputs/mutant are retained under `attempt1/`; [harness-failure.txt](attempt1/harness-failure.txt) explains the failure. The recovery harness explicitly records the observed exit 0, **not a passed negative**. `checks.json` distinguishes intended rejection from observed-positive guard-gap proof.

## Inputs, evidence and recovery

- HEAD: `a996917f72e84753a94d6214f685e64ef3b1c4a7`; exact dirty binary patch equals decompressed author freeze. Every file in frozen review-input manifest was hash-verified before and after checks.
- [input-identities.json](input-identities.json): HEAD/tree, frozen manifest and reviewer-script identity.
- [all17-independent-provenance.json](all17-independent-provenance.json): independently calculated original and retained incorrect row hashes.
- [audit-components.py](audit-components.py), [audit-components.stdout](audit-components.stdout): separate reviewer audit; no candidate validator import.
- [recheck.py](recheck.py), [checks.json](checks.json): executed commands, exits and boundaries; adjacent raw stdout/stderr and compressed persisted input bytes.
- [recovery-identities.json](recovery-identities.json): **248 historical protected files** unchanged; all candidate identities unchanged; original acceptance, decisions and goal unchanged; six dirty source paths are all review evidence/documents. Unrelated untracked chart-role-topology work was excluded.
- [findings.json](findings.json): structured original-fix dispositions and supplemental finding.

To reproduce a specific guard, decompress its `.input.json.gz` (component inputs) or `.inventory.json.gz` (root mutant) into a temporary JSON file and run the corresponding actual command from `checks.json` with its recorded input argument replaced by that temporary path. Root mutants use actual repository CWD and `--inventory`/`--matrix`; keep the other root input unchanged. Component profile-content drift additionally requires an isolated tree with original git objects and the saved mutated profile file, as constructed by `recheck.py`. Runtime fragment negatives can be rerun directly with their saved `.json.gz` argument using `four-findings-fix-20261013/runtime/verify.py`. Reviewer scripts are evidence generators: repeat into a new output location rather than overwriting this historical run.

## Strict limits

This verifies the four corrections and independently challenges document/provenance conservation; it does **not** accept global C0, native behavior, module bindings, Helm rendering, F-MUT semantics, provider effects, live operation or C1. Current in-progress status and original obligations remain unchanged. No historical failures were relabelled and no real-runtime behavior is inferred from these document controls.
