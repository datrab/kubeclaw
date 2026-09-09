# Historical CLI fixture order

The untouched remote4627/local143 baseline probe failed before recovery: source
preflight returned REVIEW_SOURCE_DIRTY. The original compiler test now executes
checkLegacyProjectImport before its final console message. That separate case
writes untracked progress.json into its disposable Git repository. The archival
probe had used the final console as an insertion hook, so it inherited that dirty
fixture. The original clean-source denial was correct.

The correction moves only the insertion hook before checkLegacyProjectImport.
It does not remove the import case or change any assertion, archived source,
runtime code, clean-source policy or original CLI. An additive diagnostic script
preserves the exact inspection method and original events (the first hook still
fails intentionally). The successful corrected probe was run against author
789c42f722f415331a48f38ef845b07477e2ad3b, including its canonical contract changes.
One concurrent invocation also timed out at the existing 30-second compile
boundary (null status); no timeout or assertion was weakened. A subsequent full
invocation completed, exit0.

Before/after raw output: run5-adapter-cli-before.txt and
run5-adapter-cli-after.txt under docs/review/evidence. All13 original stages are
compiled; original source-preflight and blueprint-sync really execute, then the
missing worker-secret boundary blocks implementation as expected. The archived
unfixed CLI still rejects graph mismatch. Current CLI recognizes the original
terminal run without mutating its persisted files. This is source/recovery
compatibility evidence, not provider execution or full PCR-SDK-001 completion.
