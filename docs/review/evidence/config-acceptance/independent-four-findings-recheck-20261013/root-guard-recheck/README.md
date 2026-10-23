# Independent IFOUR-ROOT-001 correction recheck

This is an additive recovery review. The initial report, finding, failed-control observation and raw evidence remain unchanged in the parent directory.

## Bounded verdict

**IFOUR-ROOT-001 correction verified; clean at this bounded Runtime root conservation scope. No actionable findings remain in this correction.** This does not establish global C0, native/runtime behavior, module binding or C1 acceptance.

The same non-author reviewer independently inspected the actual `author/check-matrix.py` correction and generated new persisted-input controls without using author control summaries or outputs. No nested reviewers or candidate edits occurred.

The correction registers the Runtime fragment, requires exact normalized Runtime row IDs, and compares every normalized root row against its complete source row. Only defined root-normalization aliases and pending review state are normalized; all history, correction provenance and unrelated source properties remain covered. Existing global duplicate-ID detection handles multiplicity. Full independent reconstruction confirms all **1,248 Runtime rows** match their source.

## Decisive controls

The actual full `check-matrix.py --structural` boundary rejects all 16 persisted-input negatives for the intended diagnostic:

- Original-row history hash corruption; missing correction provenance; altered retained incorrect hash.
- Unrelated current precedence or normalized class mutation.
- Required-obligation or case-link removal.
- Reviewer confirmation and `c0Closed` acceptance promotion.
- Injected unrelated Runtime policy property.
- Runtime row deletion, duplication, extra row or escape into a different fragment.
- Runtime source-fragment registration deletion.
- **The exact saved mutant from the initial report**, without reconstructing it.

Unchanged complete-root positives pass before and after. These are documentation integrity controls, not semantic F-MUT or runtime behavior checks.

## Proof and reproducibility

[checks.json](checks.json) records all 18 commands, exits, expected diagnostic boundaries, errors and persisted-input digests. Every control has adjacent `.stdout`, `.stderr` and `.inventory.json.gz` files. [recheck.py](recheck.py) is the independent evidence generator. For an individual reproduction, decompress that control's inventory into a temporary JSON file and execute `python3 docs/review/evidence/config-acceptance/author/check-matrix.py --structural --inventory TEMP.json --matrix docs/review/remediation/config-acceptance-matrix.json` from repository root. Preserve this historical directory; rerun generators into a new output location.

[input-identities.json](input-identities.json) and [review-input.patch.gz](review-input.patch.gz) bind HEAD, actual corrected checker bytes, original frozen manifest, initial review manifest and exact dirty patch. [recovery-identities.json](recovery-identities.json) verifies original candidate files and initial review artifacts remain unchanged, including original decisions/acceptance/goal. Only the new checker correction was added to the prior six-path dirty review scope; all seven changed tracked files are review documentation/evidence, not production code.

Scope remains explicitly `in-progress-not-C0-accepted`. No prior failures were relabelled, no raw logs were replaced, and no production, live, C1 or global acceptance was inferred.
