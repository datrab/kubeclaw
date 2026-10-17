# Component validator corrections (C0 document integrity only)

Both historical batch entry points now delegate to `validate-bindings.py`.
Expected coordinate sets derive from the frozen source-marker backlog and JSON
coordinates at `21bf51bc2075abec1191fdc091952492b6cb484e`; required members derive
from the immutable semantic rows and resolved schema/template relations, never
from candidate records. Exact member IDs, order and multiplicity are checked.
The expected EFFECT profile pointer, row/owner/field/case binding and selected
A/B delta values are checked against frozen complete profiles. Source identities
are checked against both the checkpoint and current bytes, including symlinks.

The old scripts are retained in `originals/`. Original candidate artifacts and
historical reports are unchanged. New checks print their result; explicit
`--output` refuses to overwrite an existing report.

Run from repository root:

```sh
python3 docs/review/evidence/config-acceptance/four-findings-fix-20261013/components/check-persisted-controls.py
```

`verification.json` and per-control logs record four restored positives and
eight persisted-input negatives (member loss, duplicate member, unrelated
profile and coordinate loss in each batch). Negative candidate JSONs are saved
separately; validators start in fresh processes. Canonical candidate bytes are
unchanged. Passing is document-integrity evidence, not native behavior,
Helm/F-MUT proof, semantic field closure or global C0 acceptance.
