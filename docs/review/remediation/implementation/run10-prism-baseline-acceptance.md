# Prism baseline versioned checksum candidate

Author source/test freeze: 60a03f8cb86b45f397aa144b2dc058a58cce5f3e.
Fresh remote parent: a43aa256bdce35d7f9c44d5d661e59c4055e562e (local b3d2f7ba).
INCOMPLETE pending independent review and root integration. No finding closure.
This supersedes the initial run10-prism-baseline-wip.md test status, not its
record of what was known at the earlier checkpoint.

## Owning implementation and compatibility

Actual Control new-publication assembly now calls the production contracts
baseline-archive subpath with explicit archive-v2. The generated validator
dispatches only on the manifest's stored v2 schema. Nova requires paired v2
archive/manifest tags and the exact checksum encoding. The checksums document
is the UTF-16 closed string-map encoding of schema, algorithm, encoding and
files; its complete bytes are the inner digest preimage. No locale guess,
retagging, normalization or cache-miss fallback exists.

The original v1 schema is unchanged. The old native locale-sorted checksum
algorithm remains v1 only. Historical Control assembly is archived verbatim
with SHA256 c1890ec51f6825726d26f0b6614574254f69923ba28f746700f15c294fa1cd85.
The test checks that archive before executing it with the current original
validators and real CAS; no old Git objects are needed to reproduce this gate.
The genuine new production assembler is used for all current v2 probes.

Source diff inspection: Control's existing-baseline early return, approval and
revision checks, rendering/capture loops, member collection, DB insert and
stored approval/source references are unchanged. Only the private checksum
serializer and final archive assembly moved to the owner. Separate Engine
publish small-v1 manifest, Buster visual contract and SDK source are unchanged.
The new server-only subpath does not pull node:crypto into the browser index.

## Actual completed tests

- `npm test -w @kubeclaw/prism-contracts-v1`: both original test programs plus
  five new tests passed, zero skips. Four genuine native locale producers
  en/da/tr/sv crossed with all four original Nova consumers give 16 successful
  real CAS imports with identical inner and outer identities. Both legacy
  locales reproduce exact original producer bytes; same-locale succeeds and
  cross-locale rejects without changing saved bytes.
- The matrix also checks 23 corrupt archive cases, eight self-consistently
  rehashed document/preview semantic counterexamples, original approval and
  project binding, outer CAS integrity, size/member/path gates, and checksum
  map reordering. Invalid shapes/accessors and domain separation are explicit.
- `npm run typecheck -w @kubeclaw/prism-contracts-v1` and Prism typecheck pass.
- Original control, storage, engine, renderer, renderer-remediation and pipeline
  adapter tests run sequentially: 25 passed, zero skips. These retain their
  original scope and fixtures; not every original engine/provider test is a
  native external service test. Storage includes genuine local PGlite.
- Configured ESLint passes for the new owner, importer, index, generator and
  new tests. The owning importer was split into focused functions preserving
  original checks. Generator's preexisting mutable binding became const.
  Full Control monolith lint still reports the same 25 preexisting findings;
  complexity falls 204 to 202 and line count falls. Both raw outputs retained;
  no lint rule or threshold was weakened, and full Control lint is NOT a pass.

Successful v2 inner digest: sha256:4b4dbc9b57f7052243a0be4d38b5396a0be9e2d21388cbfad9b9ca102db08389.
Outer CAS: artifact:sha256:4b4fb74d9d5b2f9a3b0dcc13662e3be7a6b484d9c1668c79c6942e17a3c5633a.

Raw evidence: run10-prism-baseline-author-raw.json and
run10-prism-baseline-original-tests.json under docs/review/evidence. Failed
initial relative fixture import, fixture TypeScript errors and the too-broad
preview-path counterexample are retained; their inputs/types were corrected,
not the original rejection assertions. Final source has no skips.

## Boundary and next action

No full Control HTTP/database/browser publication, human approval, deployment
or end-to-end delivery is claimed. PNG/CAS fixture bytes are real; their renderer
metadata explicitly states not-browser. These establish the owning pure
serialization contract and original import semantics, not unrelated native
gates. Independent reviewer must reproduce tests, inspect source/legacy
bindings, then root must reconcile fresh remote head and integrate only the
approved exact delta. Until then this remains an unintegrated candidate.
