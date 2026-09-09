# Original BlobStore reader: bounded source checkpoint

Final source commit: `96236ba725bc4d57f0543f1fc0e76afa97f25de7`.
Initial source: `071dd712b9518cfb3f6e3d0994cdd474b9e05a72`.
The original `FileDurableBlobStore.get` read a correctly content-addressed
33-byte file despite a configured 16-byte maximum. It also reopened via
`readFile` after a path-only lstat without a no-follow descriptor.

The original reader now opens no-follow/nonblocking, checks the opened regular
file's identity and configured size before allocation, reads at most that size
plus one sentinel byte, rechecks descriptor/path/observed parent identities,
validates the digest and closes the descriptor on every path. Existing original
empty/exact-size and duplicate-put semantics are retained. Parent observations
are not a claim of race-proof confinement against an adversarial host.

A clean checkout of the exact source commit passes the original Nova typecheck
and six tests, zero skips: original aggregate quota/process test and five new
reader regressions, including an actual concurrent parent-directory replacement
process. Raw: `docs/review/evidence/run5-blob-reader-frozen.txt`.

The earlier `run5-blob-reader-author.txt` includes the same six passing tests but
an unrelated dirty-working-tree typecheck failure: in-progress projection callers
temporarily referenced their intentionally unstaged Store API. That log is kept,
not relabelled a clean compile. The separate frozen checkout proves the committed
reader change itself typechecks. No projection is in this source commit.

Independent review exposed two genuine introduced canonical lint failures in
the initial method: complexity 25 versus 15, and 321 file lines versus 300.
The correction factors only this original reader into small helpers in
`durable-blob-read.ts`; `FileDurableBlobStore.get` delegates exactly once.
No rule or boundary assertion changed. Canonical lint, Nova typecheck and the
same six actual tests pass on the corrected exact source, zero skips. Raw:
`docs/review/evidence/run5-blob-reader-corrected.txt`.

Final independent approval and root integration remain pending. PCR-OBS-002 stays open.
Next action: independently review and test this narrow shared reader; separately
finish the uncommitted Nova projection and its full original authority/fence tests.
