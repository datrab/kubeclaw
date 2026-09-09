# Independent review — portable artifact JSON cutover

Reviewed 2026-09-09 against SDK worktree based on `a8cf34f`, after the author's
reference-binding and diagnostic corrections. Exact reviewed code hashes:
[`reviewed-source-sha256.txt`](../../evidence/wave47-sdk-independent/reviewed-source-sha256.txt).
This independent review changed no SDK, artifact adapter or consumer source.

## Finding raised and fixed before integration

The initial byte verifier bound the returned reference only by digest and size.
Several source/approval/repair/summary consumers did not compare the actual
returned ArtifactRef with the trusted expected reference. Using the original
artifact adapter and real durable filesystem store, the reviewer wrote identical
bytes under the same artifact ID first for run A and then for run B. The initial
`get_json_bytes` selected B's newest matching record while `readBoundArtifact`
accepted it against A's expected reference. The preserved before output identifies
both different runs. Same bytes are not proof of producer ownership.

The author corrected the existing boundary. `verifiedArtifactJsonText` now
requires the expected ArtifactRef and compares its full structure, including ID,
namespace, media type, encoding and producer run/stage/attempt identity. All eight
migrated readers pass that expected reference. The new exact-byte read selects
the stored complete reference rather than the newest digest-only match; this
also preserves legitimate older references after later equal-byte writes.
A known ID/digest with mismatching reference reports corruption; a genuinely
absent artifact/blob remains absent. Missing expected reference fails explicitly.

The independent after probe confirms older exact-reference reads succeed,
latest reads remain run-scoped, a newer same-run reference fails verification
against the old expected reference even when bytes match, and forged ID,
namespace, producer and encoding are rejected. The final same probe passed again
after the author's diagnostic refinements. No outstanding blocker was found in
this bounded artifact encoding/reader cutover.

## Compatibility and authority review

- `canonicalJson` retains its original locale comparator and strict scalar rules.
  The new portable UTF-16 key ordering is named `kubeclaw-json.utf16.v1`; it is an
  explicit optional ArtifactRef encoding and writer input, not a silent change
  to every existing digest.
- Five representative nested/Unicode/numeric vectors in each of three actual
  native-locale Node processes produce identical legacy bytes with the preserved
  base serializer and current serializer. The independently executed portable
  regression runs three differing writer/reader locale pairs against actual
  artifact files, original SDK readers and a reopened FileEffectJournal.
- Default legacy `put_json` still uses the legacy serializer; existing
  `get_json`/`get_latest_json` retain their response shape and selection rules.
  The independent real-store probe also checks that legacy get_json still uses
  its existing newest ID/digest match. The extra strict reference selection is
  confined to the new operation.
- The real Implementation-Agent completion writer explicitly requests the new
  encoding. No blanket rewrite of other writers or historical artifact bytes
  was introduced. Historical untagged bytes are verified as stored, not
  recanonicalized under the reader's locale.
- New reads remain `artifacts.read` with `artifact.object` and the same
  `allowedNamespaces` constraint. Source review traces them through the original
  capability vocabulary/authorization handler. A direct invocation of that
  original authorization function confirms all four read operations admit the
  allowed namespace and reject a foreign namespace or wrong resource type.
  This predicate check is not mislabeled as a complete hostile-plugin sandbox
  execution. The independently rerun project-source suite exercises the actual
  registered original source/approval/Git flow with the new reads.

## Independently executed evidence

Evidence is under [`../../evidence/wave47-sdk-independent/`](../../evidence/wave47-sdk-independent/foreign-ref-after-final.txt).

- `project-source-final.txt`: **9/9** original project-source graph tests pass
  after the reference fix, including enabled/disabled architecture agent, failed
  admission, source changes, missing producer and bound operator approval.
- `portable-final.txt`: **1/1** test passes; internally exercises three actual
  native-locale writer/reader process pairs, disk reopen, exact replay and
  changed bytes/value/reference/encoding negatives.
- `sdk-contract.txt`: original ArtifactStore and FileEffectJournal JSON contract
  regression passes (**1/1** test file).
- `foreign-ref-before.txt` and `foreign-ref-after-final.txt`: independent actual
  store reproduction before and after the correction. These direct adapter
  calls intentionally do not claim runtime grant enforcement; authorization
  was reviewed/tested separately as described above.
- `legacy-identity.txt`: 3 actual locale processes × 5 original/current vectors
  have identical legacy bytes; `read-authorization.txt`: four original operation
  authorization checks pass.

Reproduction from the SDK repository root:

```sh
node docs/review/evidence/wave47-sdk-independent/ref-proof.mjs
# For the legacy comparison, write the original serializer beside the script:
git show a8cf34f:skills/common/plugin-runtime/sdk/src/values.ts > docs/review/evidence/wave47-sdk-independent/legacy-values.ts
node docs/review/evidence/wave47-sdk-independent/legacy-identity.mjs
node --test tests/verification/reliability/sdk-json-portable.test.mts
node --test tests/verification/reliability/sdk-json-contract.test.mts
node --test tests/verification/reliability/project-source.test.mjs
```

The author's broader package/graph/typecheck results remain author evidence,
not additional executions attributed to this reviewer. No deployment, external
message, CI or model call was performed by this review.

## PCR-SDK-001 remains globally partial

This versioned artifact-byte path is a safe bounded cutover, not completion of
all canonical authority semantics. Existing inner source subject/input/report/
repair/ownership and other semantic digest producers remain on their existing
unversioned comparator. This patch neither silently changes those digests nor
proves their cross-locale portability. Their explicitly versioned migration and
corresponding genuine producer/consumer/replay acceptance still remain open.
