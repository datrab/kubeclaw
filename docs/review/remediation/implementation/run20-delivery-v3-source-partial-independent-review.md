# Delivery-manifest v3 source partial independent review

Status: **REJECTED AS INCOMPLETE; THREE SOURCE BLOCKERS CONFIRMED.** This is a
review-only checkpoint. It is not implementation acceptance, not native
acceptance, not a register update, not PCR-SDK-001 closure and not all-47
completion.

I reviewed exact remote candidate
`122cd5a4c518c07a778a985ca86e6f82397cfa49`, tree
`48ae13293c137c9acde46def3a0cc4f5db284661`, whose sole parent is semantic
source `15f6a808ed1666c3b7a2a3909749e3d4ee377904`. The full 26-path candidate
delta and corrected lockfile were compared to that parent. Tests ran from a
separate frozen checkout; no production source was edited.

## Blocking findings

1. The public JSON schema admits evidence ArtifactRef media types that the
   runtime rejects. It has only nonempty `mediaType`, whereas every v3 evidence
   ref is runtime-owned as `application/json` and runtime's generic helper also
   caps the string at 2048. The public TypeScript manifest exposes generic
   `ArtifactRef[]`, so its type domain has the same non-JSON mismatch. A direct
   schema/runtime vector fails.
2. Existing compiler arities are not byte-identical to semantic source 15f6.
   With final Review and portable report encoding, legacy delivery now adds
   `final.reviewArtifactEncoding` to the Summary input and resulting v2 body.
   The approved design requires the historical Summary input and v2 builder
   branch to remain exact; Review expectation fields belong only to the new v3
   input/body.
3. The creator checks the unsigned body's byte size, then adds `digest` without
   checking the complete serialized value. A schema-valid, semantically valid
   coverage vector whose unsigned body is at most 8 MiB but whose complete v3
   value exceeds 8 MiB is accepted. The approved limit applies to the complete
   portable artifact.

The earlier corrupted lockfile and permissive nested coverage placeholders are
fixed in this candidate. Caller-supplied digest rejection, validation before
hashing, finite public exports, deep freeze, Proxy/accessor no-trap behavior,
external coverage schema resolution, four-dimensional compilation/recovery and
bounded pre-existing regressions passed. The corrected lock diff is minimal.

Raw commands and exits are in
`docs/review/evidence/run20-delivery-v3-source-independent-contract.txt` and
`docs/review/evidence/run20-delivery-v3-source-independent-compiler.txt`; the
two independent test sources are committed with this report.

## Acceptance held

After the three blockers are corrected, freeze a new exact source and rerun
both independent matrices. Still separately required are the full closed
contract/bounds/conditionals matrix, complete v2 corpus, registered v3 Summary
producer and original evidence adapter across en/cs/da/tr/sv, a genuine
FileNovaGateImportStore result, disk requested/accepted/completed and OS
SIGKILL histories, consumer negatives, repository/package/discovery/pin/schema/
lint gates and fresh-head full regressions. An unavailable Go prerequisite or
missing import remains open and may not be called success.
