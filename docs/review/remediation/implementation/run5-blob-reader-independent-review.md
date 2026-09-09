# Independent review: original bounded BlobStore reader

Verdict: approved for the narrow reader repair, source
`96236ba725bc4d57f0543f1fc0e76afa97f25de7` over original fix `071dd71`.
This is not completion of PCR-OBS-002 or the separate dispatch projection.

The reviewer created a new isolated checkout after freshly reading remote
`e028aadbb80ae87aa602c5380eca42acb10a1d77`. Its complete Git tree
`da787f9b4b2f065e2b808b5875ec4cb506bc2ad7` matched local base `7e3dc76`.
Only the author's frozen reader/test commits were applied; dirty projection
Store APIs and author checkout state were excluded. Existing dependencies were
copied as a cache; workspace sources resolved inside the new checkout.

Before the change the reviewer independently wrote an actual 33-byte
content-addressed disk blob and observed the original get return all 33 bytes
under a 16-byte configured maximum. After the change, that same real boundary
is rejected while valid zero/exact-maximum bytes and original duplicate put
behavior remain available. No storage mock, quota increase, fabricated receipt,
assertion removal or native-gate substitution was used.

The original FileDurableBlobStore.get still owns digest/path construction and
configured bounds. It delegates exactly once to its factored owning reader.
That reader opens O_RDONLY/O_NOFOLLOW/O_NONBLOCK, verifies a regular descriptor
and observed identity, rejects oversize before allocating, reads no more than
opened size plus one sentinel byte, checks read length and descriptor/path/
observed parent identities, verifies the content digest and closes in finally.
The extraction corrected canonical complexity/max-lines failures found by this
review; original ESLint rules were not weakened. Initial failures remain in
`docs/review/evidence/run5-blob-reader-independent-initial.txt`.

Final independent result: **55/55 tests, zero skipped/cancelled/todo**, exit 0.
This includes the author's five reader cases and original aggregate blob quota
case, actual concurrent directory replacement, original disk ArtifactStore and
EffectJournal consumers, real Git archives/HTTP evidence imports, original
admission and telemetry retirement, real competing processes and SIGKILL
recovery. An additive independent process with descriptor limit 64 performs
160 oversized-read rejections and then 160 successful exact-boundary reads;
this exercises descriptor cleanup without substituting filesystem calls.
Full shared-runtime and Nova typechecks and original focused lint pass.
Exact author/reviewer production-file comparison is empty. Commands and raw
output: `docs/review/evidence/run5-blob-reader-independent-final.txt`.

Scope limits: observed parent identity checks are not race-proof path confinement
against an adversarial host. Existing put's separate link/EEXIST collision branch
is unchanged; this package does not establish that all BlobStore paths are
race-confined. No logs/archive bytes are deleted and no record count is released.
The shared Worker Core / role-engine architecture is unchanged.

Root must still reconcile against the current repair head, inspect this review,
and rerun affected integration checks before fast-forward-only integration.
The later remote `5a437c7` continuation changed only eight evidence/fixture/docs
files, not this reader runtime; it is not silently included in this review base.
