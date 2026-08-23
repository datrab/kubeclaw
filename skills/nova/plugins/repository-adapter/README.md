# Repository adapter

Provides bounded UTF-8 repository reads through `git.repository.read`.
Canonical-path checks reject absolute paths, traversal, directories, and
symlink escape. Missing files, oversized files, cancellation, and unsupported
operations have typed failures. `maxFileBytes` defaults to 4 MiB.

For immutable review, `changed_manifest` accepts full base/head commit IDs and
requires the base to be an ancestor of the adapter's activation-time head.
`inventory_revision` returns the bounded blob identity and byte size for each
tracked path. `read_revision_text` reads one explicit UTF-8 blob from that
authorized head. A caller may require the inventory object ID and byte size;
the adapter rejects a mismatch and returns the proven identity with the text.
The adapter does not expose symbolic revision resolution or arbitrary Git
commands. `expectedHead` can pin activation to an operator-selected commit, and
`maxChangedPaths` bounds one manifest.

`npm test` exercises real files and symlinks in a disposable repository.
Delivery-lint and preflight-contract additionally exercise this adapter through
the real v2 runner.
