# Supplementary Prism retag probe: current-checkout reproducibility

The original independent probe combined a historical static Git comparison with
two genuine CAS retag rejection cases. The static prefix required local-only
commits b3d2f7ba and 60a03f8, so a fresh remote checkout could not execute the CAS
cases. This was a test reproducibility defect, not a production codec change.

The complete original program is preserved byte-for-byte as historical evidence
in `docs/review/evidence/run11-prism-baseline-independent-historical-audit.mjs.txt`.
SHA256: `ada69e8858f322b1e86d2032a156472263dd34b701a4a777b916f2ffe30265dc`.
Its static audit conclusions remain historical results in the unchanged
`run11-prism-baseline-independent-extra.txt`; they are not a portable runtime gate.

The executable `run11-prism-baseline-independent.mjs` now contains only the
current-source native CAS regression. Its entire runtime body, including both
coherent version-retag mutations, original approved digest, rejection assertion
and exact preserved-CAS-byte assertion, matches the original body byte-for-byte.
No native assertion, production source, schema, quota or model was changed.

Publisher independently ran the corrected program with PATH pointing to a
nonexistent directory and first confirmed spawning git failed with ENOENT.
Both original v1/v2 coherent-retag cases passed with exit0 and unchanged CAS.
All64 workspace links resolve within the publisher checkout; third-party cache
bytes are reused without modification. Raw output:
`docs/review/evidence/run9-prism-retag-portability.txt`.

Canonical lint of this historical evidence script is not a pass: the unchanged
runtime console statement retains one original no-console error. The exact
before script had two (historical static output plus runtime output); no rule
was weakened and the native body was deliberately preserved. Diff check passes.

The original five-test locale/semantic matrix separately uses its hash-checked
archived original Control producer and remains unchanged. Neither this correction
nor the historical static audit proves full Control HTTP/database/browser
publication, human approval or finding completion. Root must independently
inspect this test-only split and repeat the git-unavailable probe before release.
