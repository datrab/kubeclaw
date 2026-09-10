# Owning Prism baseline codec WIP

INCOMPLETE: production candidate, not integration approval or finding closure.
Fresh remote base a43aa256bdce35d7f9c44d5d661e59c4055e562e; isolated
run10-prism-baseline from exact local b3d2f7ba. Root authorized this bounded
cutover after independent audit683377fb874c0a59da4474e9dfce3561116b6862.

Adds separately identified baseline-v2 schema, generated validator, and owning
production assembly/checksum helper. Actual Control new-publication path passes
explicit BASELINE_V2; original approval/render/member collection, existing-row
early return, DB insert and stored approval/digests remain. Nova branches on
stored archive/manifest pair and required v2 encoding; no locale/run-version
fallback. Original v1 schema bytes and locale checksum meaning are preserved.
The helper's UTF-16 encoder accepts only a closed string checksum map with fixed
domain fields, not arbitrary JSON. Separate Engine.publish and Buster contracts
are unchanged. No SDK/Review-cache/operator source touched.

Initial contracts and Prism typechecks pass. Native locale/real CAS/importer,
historical producer-body byte vectors, and corruption/limits matrix are NEXT and
NOT yet complete. Independent source/test review is pending. Full Control DB/
browser approval publication is not claimed or simulated; it is not needed to
test this actual owning pure serializer, but original wiring must be inspected.
