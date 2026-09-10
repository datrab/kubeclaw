# Delivery-manifest v3 — independent final design review

Status: DESIGN ACCEPTED FOR A COUPLED SOURCE IMPLEMENTATION. This is design
approval only: no production source, runtime test, register status, MAIN update,
PCR-SDK-001 closure or all-47 closure is claimed.

Reviewer: `run14_delivery_design_review`, run `20260910t042633`.

## Independent authority

The review started from fresh remote MAIN
`e644a79fddd4d4d686fbd351b6edaec5575caf57`, tree
`64df9214237107c027b27caf4d5f75f27a222f51`. The isolated reviewer checkout is
at that exact commit and tree. Fresh remote resume README, work-items,
package-checkpoints, root-checkpoint, active package ledger, current register
and `partial-47-scope.json` were read. A fresh extraction from register commit
`c38779c71bb92bc15c3fcb89930348e5417aa475` yields exactly 47 entries whose
status was `implementiert`; the sorted set exactly matches the scope file. All
47 remain present with unchanged `source_finding_text`; current status is eight
`verifiziert` and 39 `implementiert`.

The accepted author design is
`569454a94ef4e3d77cde1628e868a2fd15b22ba7`, tree
`eb7f5ca5b29f7b94135922c743b6f1917c95e152`, sole parent fresh MAIN e644a79.
The complete recursive tree has the 4,091 MAIN non-tree entries unchanged and
one new `100644` design document only. The earlier author candidates `86fdda4`
and `681a6a3` are superseded and confer no separate authority.

I read the complete preparatory design
`13f0aa8262a20c31aac25a62b63e3aa018155768`, preparation review
`98d8f41abf0d822d94f1d854326a252e5dfa25ac`, registered RED checkpoint
`f3ddec16b5a1c2787e956b5bc9d1556281660831`, and independent RED acceptance
`45fff05281c253dd27ffc52cca207c73104ae36d`. The f3ddec and 45fff trees are
additive over e644a79, with no production or register changes. Their complete
test sources and remote raw producer/consumer proofs were inspected. The raw
contains the registered Summary owner, original Core lifecycle, actual
ArtifactStore and disk journals, complete v2 value/bytes/refs, exact
requested/accepted/completed Summary write and original evidence-adapter reads.
English and portable-tagged English reach the honest missing-import boundary;
Czech rejects the same stored v2 value at manifest integrity. Upstream values
are contract fixtures, not provider execution. I did not rerun those tests in
this design-only review.

The current owning source was independently traced in project-summary
`summary.ts`, `stage.ts`, config/input/result schemas and package metadata;
remote-test-gate `evidence-adapter.ts`, import projection and package metadata;
project `coverage.ts`, `compiler.ts`, `recovery.ts`, `cli.ts` and
`legacy-import.ts`; SDK `verifiedArtifactJsonText`; the ArtifactStore adapter;
and demo-candidate linkage. The author design matches these actual boundaries.

## Acceptance matrix

| Boundary | Independent conclusion |
| --- | --- |
| Historical v2 | Accepted. v2 keeps `canonicalJson(unsigned)`, the current loose shape predicates, and both currently valid untagged and correctly portable-tagged outer refs. Cross-locale v2 remains fail-closed; it is never reinterpreted as v3. |
| New identity | Accepted. Only explicit `delivery-manifest.utf16-v1` selects v3; v3 binds `portableJson(unsigned)` and requires the portable Artifact encoding. Version and outer encoding are separately checked. |
| Public owner | Accepted. A dedicated public workspace contract is the sole v3 schema/type/create/parse/read authority. Both plugins depend on that API; private cross-plugin imports and duplicate validators are forbidden. Digest calculation is private and occurs only after no-trap, closed-shape, semantic and size admission. |
| Exact v3 shape | Accepted. Top-level, module, final, Review conditional, coverage and complete ArtifactRef fields and bounds are finite. Nested coverage contracts retain their existing valid string domain. The digest includes the complete unsigned body, with no normalization or discarded fields. |
| Reader authority | Accepted. The reader requires independent run, Summary-stage and gate-stage authority. It preserves `final.testStageId == gateStageId`, validates the supplied expected ref and bytes, and retains the existing response-to-expected-ref check in `verifiedArtifactJsonText`. StageResult/receipt/lifecycle equality stays a registered-chain invariant, not a claim of the pure API. |
| Evidence ownership | Accepted. Reader cardinality is exactly `3*n+4` without final Review and `3*n+6` with it. Module implementation/decision/quality, final implementation/decision/quality, lint and optional report/bundle positions, owners and current selectors are fixed. The final implementation ref must be the sole permitted duplicate and equal exactly one module implementation ref. |
| Stored manifest ref | Accepted. v3 alone requires `project-summary:<manifest.runId>`, Summary namespace, JSON media type, portable tag, exact run/stage owner, byte size and digest. Existing request canonical-ID equality remains. This new artifact-ID strictness does not narrow v2. |
| Summary producer | Accepted. The closed config adds one finite optional selector. Omission and the historical two-argument builder remain v2. Invalid present config rejects before evidence effects. Legacy and v3 writes preserve operation, resource convention, namespace, ordinal and Core ownership; only the genuinely new request carries the v3 value and encoding. |
| Compiler/defaults | Accepted. Delivery mode is appended after the independently owned source/report/Review dimensions. Existing positional arities and archived helpers remain delivery-legacy. Only the genuine fresh CLI passes v3 explicitly; authored `nova-project.v2` cannot select it. |
| Recovery | Accepted. The stored exact Summary node/config owns delivery mode. Recovery validates config before reflection, derives all dimensions independently, recompiles explicitly, and verifies the whole pinned graph. Artifacts, locale, Review mode and newest code are not default authority. |
| Effects and crash history | Accepted. Old durable requests are never rewritten. Completed replay, accepted uncertainty and requested-only retry retain their actual existing meanings and exact requests. New v3 histories start with v3 already selected. Core, journal and role-engine ownership stay unchanged. |
| Review separation | Accepted. Delivery semantics do not infer or select report outer encoding or Review semantic encoding. The source package must rebase on the independently accepted Review semantic bundle and publish the combined first cutover atomically while keeping the selectors orthogonal. |
| Evidence claims | Accepted. Contract fixtures stay labelled fixtures. Missing import, provider execution, Go/cgroup/cluster prerequisites and later delivery remain separate; no early parser pass is promoted to downstream or provider success. |

## Corrections resolved by the accepted revision

The first review withheld approval because the proposed shared reader omitted
the configured gate-stage authority, did not freeze independent reader-side
evidence ordering, imposed an unsupported blanket control-character rule on
nested coverage contracts, and claimed response/StageResult equality beyond its
API inputs. Revision 681a6a3 resolved those four points.

Approval remained withheld because the valid v3 manifest ArtifactRef ID was not
defined even though wrong IDs were a required negative, and the exported digest
helper had no explicit admission contract. Accepted revision 569454a resolves
both: v3 requires `project-summary:<runId>` without narrowing v2, and no
unchecked public digest helper is exported. I found no residual design
contradiction against the inspected source or registered RED evidence.

## Implementation authorization boundary

This approval makes the R3 design implementation-ready; it does not accept code
that has not been written and independently tested. The implementation must be
one coupled public-contract/producer/compiler/recovery/consumer package rebased
on the accepted Review semantic source. A producer-only, reader-only or
same-version partial publication is not authorized.

Acceptance still requires every matrix in the R3 design with original production
owners and unchanged assertions: closed contract/no-trap parity; the full v2
reader corpus and archived compiler/CLI compatibility; registered v3 Summary
production and original evidence-adapter consumption in en/cs/da/tr/sv; the real
FileNovaGateImportStore boundary; independent source/report/Review/delivery graph
and recovery combinations; actual disk requested/accepted/completed histories
and OS `SIGKILL`; malformed body/version/tag/ref/owner/coverage/import negatives;
and package, discovery, sandbox, pin, schema, type, lint and fresh-head regression
gates. Raw commands, sources, exits and zero skips must be preserved.

An unavailable genuine prerequisite remains an explicit blocker. No mock Core,
ArtifactStore, journal, import store, parser, provider, receipt or precomputed
digest may substitute for it. This review ran no production test, CI, deployment,
provider, paid resource or third-party action, did not touch MAIN or the register,
and does not close PCR-SDK-001 or any remaining frozen finding.
