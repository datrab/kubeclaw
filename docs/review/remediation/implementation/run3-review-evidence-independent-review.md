# Independent review: explicit review-evidence JSON encoding

Verdict: **approved for the bounded review-evidence codec package**, production
source `d58ee5a889b8b5d588c679b2b01435dc8204120b`, including strict schema
declarations from `b33873e16caa4923d6f09e9b2d6ab8461d419ac8`; final test wrapper
registration `1d0cd9e567c9afae34ad18f42211586a50c1b684`. This is not completion
of all PCR-SDK-001 consumers or the frozen 47 findings.

## Independently established baseline and scope

The reviewer created a separate checkout from local `8734df5`, after matching
its complete tree `cda01987c1112063875cbfefb9ea1723ccbbea47` to freshly read
remote `9628872976da8d43c3a17faa89962f9e32d88979`. The remote recursive tree
was untruncated. Relevant historical serializer/parser/snapshot/compiler
blob hashes were separately checked against the original source used for
the archived fixtures. No changes were made in the author's checkout.

The actual review-stage schema accepts open JSON evidence content. The
original serializer/parser reject en-US-produced Unicode-key evidence when
read in sv-SE. The repair adds an explicit per-evidence
`encoding: kubeclaw-json.utf16.v1`, retaining that marker through the original
stage parser, closed schemas, bundle parser, bounds, snapshot, storage,
dispatch, and report binding. Unknown encodings and contradictory bytes are
rejected. Mixed correctly encoded legacy and tagged items remain valid.

Outer bundles and production cache result shapes have closed ASCII property
names; evidence is already a string inside a bundle. No global serializer
flip, blanket cache migration, or new Worker Core/engine arrangement was
introduced. The original snapshot/report digest binds the added marker.

## Review issues resolved before approval

1. A newly applied strict Ajv check exposed pre-existing generated bundle
   schema declaration errors: conditional required fields lacked declarations
   in their branch, and the repository-path type was only declared in an
   `allOf` sibling. Root authorized explicit, semantically redundant property
   and string-domain declarations. All original closed fields, path limits,
   rename/copied requirements, and previous-path prohibitions remain intact.
   No strict option was relaxed for current acceptance.

2. The initial compiler tag addition changed already persisted module-review
   graph identities under their existing source version. This was genuinely
   reproduced with the archived original compiler, original graph snapshots,
   and the current `compileProjectRecovery`: `RECOVERY_GRAPH_DIGEST_MISMATCH`.
   Existing source regressions did not exercise `module.review`.
   Because the compiler's actual evidence content has closed ASCII keys and
   did not suffer this locale defect, its unnecessary migration was removed.
   The final compiler exactly matches the original baseline bytes. The same
   original module-review graph now recovers unchanged; no shim or inferred
   source-version migration was added.

Before evidence remains under
`docs/review/evidence/run3-review-encoding-independent/` in `schema-before.txt`
and `compiler-before.txt`. Historical fixture replay requires no old local
Git objects: the old compiler source is archived with its checked Git blob
hash and uses current-checkout dependencies.

## Executed final verification

- `npm-final.txt`: the full original review-plugin `npm test` chain exits 0,
  including generated-schema checks, original parity, cache, review,
  repository/Git/HTTP/storage/report, and coverage checks, plus the newly
  registered encoding, strict-schema, and locale cases.
- `final-five-cases.txt`: the final test-only wrapper registration is rerun:
  5/5 outer Node tests, no failures, cancellations, skips, or todos. It
  includes the original module-review graph recovery test as a successful
  nested 1/1 run.
- `recovery-types-lint-final.txt`: 9/9 original source/recovery and added
  historical module-review tests; full Nova and review-plugin typechecks;
  unchanged canonical focused lint; exact author/reviewer production-source
  comparison and unchanged compiler comparison.

The independent storage test exercises original stage and bundle parsers,
strictly compiled generated schemas, snapshots, `storeReviewBundle`, and
disk ArtifactStore put/read across en-US and sv-SE. The bundle digest and
bytes remain identical across processes. A stripped marker either fails
the declared legacy canonical check or yields a different outer bundle
digest, so it cannot retain the persisted identity. Unknown tags, wrong
bytes for a declared codec, and noncanonical legacy strings fail.

The schema test compares 384 explicit changed-path domain vectors against
the archived original schema and additionally rejects 384 extra-field
variants. The current schema is compiled with `strict: true`. The historical
oracle alone uses its original permissive compilation setting; its known
strict-compilation failure is retained, not represented as a passing gate.

The original live-function path is also executed under both en-US and sv-SE:
real Core, Git, HTTP transport, adapters, stored bundle, and report. It
checks actual dispatched content against persisted content and report digest
binding while preserving the original repair/advisory scenarios. Its local
HTTP peer supplies deterministic protocol responses: this proves the local
consumer chain, **not a native Gateway, LLM judgment, or production E2E gate**.

## Preserved limits and next action

An untagged legacy open-JSON input whose original producer bytes are absent
cannot be safely reinterpreted across locales. Its exact historical checks
remain: the archived original Unicode case succeeds in en-US and is rejected
in sv-SE. There is no locale guessing, arbitrary-JSON legacy acceptance, or
invented historical approval. Existing package/source pinning and explicit
upgrade authority are unchanged.

The orchestrator should integrate only this reviewed package against the
fresh repair-branch head and rerun affected integrated tests. PCR-SDK-001
remains incomplete for its separately recorded remaining consumers. No CI,
deployment, paid resource, native Gateway completion, or overall finding
closure is claimed.
