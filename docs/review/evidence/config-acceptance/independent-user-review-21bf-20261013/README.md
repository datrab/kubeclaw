# Independent user-requested review — checkpoint 21bf

Reviewed HEAD `21bf51bc2075abec1191fdc091952492b6cb484e` plus the exact 286 frozen dirty inputs in [baseline.json](baseline.json). All input SHA256 identities remained unchanged. Publication preserves this reviewed state, including known open defects; it does not approve or repair it.

## Accepted open findings

| ID | Severity | Finding |
| --- | --- | --- |
| UCORE-001 | medium | Runtime additions not integrated into canonical root; three structural errors reproduced by parent. |
| URUNTIME-001 | medium | All 17 original-row digests calculated after mutation; exact original snapshots remain preserved. |
| IR21BF-DC-001 | P2 | Persisted member deletion with count correction passes both component validators. |
| IR21BF-DC-002 | P2 | Existing but unrelated A/B profile references pass both validators. |

Full locations, reproduction evidence, rationale and required corrections: [findings.json](findings.json). Raw independent reports: [Core/checkpoint](core-checkpoint/README.md), [Runtime](runtime/README.md), [Delivery/components](delivery-components/README.md). Parent inspected the actual affected source paths and independently reproduced the root checker failure. No author fix was made; findings remain actionable/open and require independent recheck after correction.

GROOT-01's bounded conservation correction remains intact. The current candidate documents are not shown to have lost members or wrong profile links; the Delivery findings demonstrate validator false positives. Runtime original snapshots are preserved, so its finding is provenance integrity, not proven data loss.

The structured autoreview helper could not start because Codex CLI was missing; its [failed attempt](autoreview/attempt.json) and raw logs are preserved, not represented as a clean review. Three separate native reviewers completed the bounded reviews; interrupted Runtime/Delivery report delivery was recovered with raw evidence retained and isolated counterexamples independently repeated.

No global C0, native, module-binding or C1 acceptance. No productive code changes, deployment or merge. Canonical integration and original whole-C0 obligations remain open.
