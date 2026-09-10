# Independent Prism baseline codec review

Approved at this bounded package scope, not a finding or overall completion.
Reviewed author source/test commit: `60a03f8cb86b45f397aa144b2dc058a58cce5f3e`.
Final author checkpoint: `1ca9a7236bc8bec40ce403b21b6f5b53dad275f3`, parent
`a43aa256bdce35d7f9c44d5d661e59c4055e562e`, tree
`d1b3ffec19e8f750615892c66dfb1e50f00068ff`.
Own isolated reviewer checkout: run11-prism-baseline-review. All 2,106 non-doc
blobs/modes/types exactly match the fresh authoritative author remote tree.
Current MAIN was freshly read at a43; required remote resume documents, current
register and original SDK requirement reread. Frozen47 recomputed from c38779c
and exactly matched current partial-47-scope.json. No production edits by reviewer.

## Source decisions

Paired archive/manifest v2 and checksum document schema/encoding provide explicit
new identity. The closed string-map codec matches existing portable UTF-16 bytes,
including integer-like member names, without a global serializer replacement.
No locale guessing, old approval retagging, or codec fallback is present.

The original v1 schema is byte-identical. Native legacy assembly remains exact;
old unknown-tag/mixed-version handling remains fail-closed. The original Control
new-publication prefix through prior-row reuse, owner/approval/revision checks,
worker capture and collection of assembly inputs was independently byte-compared
against the base. Existing stored publication returns original IDs/digests; new
publication calls the actual owning assembler and puts its bytes into real CAS.
Remaining Control DB insert and dispatch return paths were inspected unchanged.
Engine.publish, Buster and the separate registered architecture reader stage are
unchanged. The new server-only crypto subpath does not enter the browser index.

## Independently completed checks

- Five author tests passed, zero skips: genuine original CAS/Nova importer across
  all 16 en/da/tr/sv combinations, equal inner/outer identities, exact historical
  v1 bytes, same-locale acceptance and cross-locale rejection preserving CAS;
  23 corruption cases and eight self-consistently hashed semantic failures.
- Reviewer-added actual CAS probes coherently retag both archive and manifest,
  update embedded metadata/checksum tags in both v1-to-v2 and v2-to-v1 directions,
  but preserve the approved digest. Both reject at bundle-digest mismatch and
  leave original CAS bytes unchanged. This is more than mixed-tag rejection.
- Original contracts, remediation and Nova archive-integrity programs passed.
- Original Control/storage/engine/renderer/renderer-remediation/pipeline programs:
  25 tests passed, zero skips, including genuine local PGlite storage. Original
  fixture/provider scopes are retained; not every test is a native service test.
- Contract, Prism and prism-design plugin typechecks: each exit 0. Generator
  regeneration leaves tracked validator bytes unchanged.
- Configured lint for changed owner/index/importer/generator/tests: exit 0.
  Initial unconfigured invocation could not locate repository policy; corrected
  invocation uses unchanged canonical config. Full Control monolith lint is NOT
  a pass: independent before/after stdin comparison retains 25 existing errors,
  with main complexity falling 204 to 202 and no rule weakening.

Raw outputs and the independent probe are in docs/review/evidence under the
run11-prism-baseline-independent prefix (matrix, gates, original, extra,
control-lint). No full Control HTTP + database + browser publication, live
operator approval, deployment, native screenshot capture or complete handoff
is claimed. Genuine PNG/CAS fixtures explicitly identify their non-browser role.
Historical extraction proves exact serializer compatibility, not full endpoint
execution. Size/member rejection tests are not an exact-limit acceptance claim.

## Next action

Root may reconcile this exact reviewed source onto a freshly read MAIN, preserve
other SDK/Control changes, rerun affected gates, and integrate fast-forward only.
Import final author report/raw alongside this independent evidence. PCR-SDK-001
and other native/reader blockers remain open until their own required gates pass.
