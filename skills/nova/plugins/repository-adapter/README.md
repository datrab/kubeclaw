# Repository adapter

Provides bounded UTF-8 repository reads through `git.repository.read`.
Canonical-path checks reject absolute paths, traversal, directories, and
symlink escape. Missing files, oversized files, cancellation, and unsupported
operations have typed failures. `maxFileBytes` defaults to 4 MiB.

For immutable review, `changed_manifest` accepts full base/head commit IDs and
requires the base to be an ancestor of the head captured by `freeze_head` for this attempt.
`inventory_revision` returns the bounded blob identity and byte size for each
tracked path. `read_revision_text` reads one explicit UTF-8 blob from that
authorized head. A caller may require the inventory object ID and byte size;
the adapter rejects a mismatch and returns the proven identity with the text.
The adapter does not expose symbolic revision resolution or arbitrary Git
commands. `expectedHead` checks `freeze_head` against an operator-selected commit, and
`maxChangedPaths` bounds one manifest.

`npm test` exercises real files and symlinks in a disposable repository.
Delivery-lint and preflight-contract additionally exercise this adapter through
the real v2 runner.

Mutable reads check existing parents before classifying an absent leaf. External
or dangling parent symlinks are forbidden, including when the requested leaf does
not exist. Internal symlink reads remain supported after canonical resolution.
The resolved file is opened through Linux no-follow directory descriptors and
read from that descriptor, preventing later symlink substitution from redirecting
the read. Configured or subsequently substituted symlink roots are forbidden.
This requires Linux `/proc/self/fd` and protected authorized root/ancestor paths.
It is not a complete filesystem sandbox against moving the authorized root.
