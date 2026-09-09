# Independent review: artifact checkpoint encoding

Reviewed author commit `4baa56945abafc608303cf919a365921f2b7a18a` on
2026-09-09 in a separate checkout. Its only production source change is
`skills/nova/core/execution/artifact-checkpoints.ts`, SHA256
`77272b94fa7a2c5c4968753fff902ff3ac88deb5f3ef2da4c87580fae5bc78f7`.
Reviewer changed no production source or author tests.

## Acceptance and scope

The narrow correction is accepted for integration. It dispatches exclusively on
the existing explicit artifact encoding, preserves the legacy serializer when
the tag is absent, rejects unknown tags, binds request/response encoding, and
includes the tag in duplicate/conflict identity. It does not introduce a new
serializer version, rewrite historical bytes, try alternative serializers, or
change the shared Worker Core / role engine architecture.

The initial contemplated delivery-manifest migration was not justified by a
real accepted dynamic-key input: the actual schemas are closed and their
variable Unicode data are values rather than object keys. That migration was
discarded. In contrast, the corrected checkpoint boundary receives arbitrary
strict JSON from the actual ArtifactStore. The author's unchanged before/after
test demonstrates real portable writes rejected by the original consumer and
same-byte encoding identities incorrectly collapsed. The final production diff
contains only the demonstrated checkpoint correction.

## Independently executed tests

All logs are in `docs/review/evidence/run2-sdk-checkpoint-review/`.

- `original-consumers.txt`: **12 passed, 0 failed, 0 skipped**, exit 0.
  Includes the author's four genuine ArtifactStore / checkpoint / FileJournal
  tests, actual English/Swedish subprocess reopen checks, original SDK JSON
  contract and portable artifact/effect tests, original durable effect identity
  tests, and the four reviewer-authored tests below.
- `original-cli-recovery.txt`: original
  `check-plugin-system-v2-checkpoint-recovery.mjs` passed, exit 0. It performs
  actual process SIGKILL and original CLI recovery with checkpoint handoff to a
  dependent stage. This existing CLI case is not claimed to be a new portable
  Unicode CLI scenario; portable validation/reopen is separately exercised by
  the actual-store tests.
- `lint-final.txt`: repository's canonical ESLint configuration accepts the
  new reviewer test, exit 0. `lint.txt` retains the initial invocation error
  caused by omitting the non-default configuration path; it was not a code
  failure and no lint rule was weakened.

The additional reviewer test uses a real disk ArtifactStore response and actual
FileJournal/ArtifactCheckpointRecorder implementations. It verifies:

1. Forged artifact ID, namespace, media type, digest, size, each of four producer
   fields and encoding all fail the original write-response boundary.
2. A durable completion recorded before its derived artifact projection is
   reconstructed with its exact portable reference. Reopening again adds or
   rewrites no journal bytes.
3. An otherwise hash-chain-valid artifact row with an unknown encoding blocks
   recorder construction without changing the journal file.
4. Unknown/null encoding on a new checkpoint is rejected before append, leaving
   both durable records and the in-memory projection empty.

These negative cases deliberately alter real returned metadata or store an
invalid journal record. They do not replace capability implementations with
mocks. They establish the checkpoint/replay boundary, not native provider,
browser, cgroup, Kubernetes, or full-product execution.

Reproduce from the repository root with its Node toolchain/dependencies:

```sh
node --test tests/verification/reliability/artifact-checkpoint-review.test.mjs tests/verification/reliability/artifact-checkpoint-encoding.test.mjs tests/verification/reliability/sdk-json-contract.test.mts tests/verification/reliability/sdk-json-portable.test.mts tests/verification/reliability/effect-identity-version.test.mts
node tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs tests/verification/reliability/artifact-checkpoint-review.test.mjs
```

PCR-SDK-001 remains **incomplete**. The bounded integration has no outstanding
review blocker, but the remaining genuinely dynamic persisted semantic digest
domains still require their own original-consumer compatibility and replay
evidence. No deployment, CI, remote publication, or external message was run by
this review.
