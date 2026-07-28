# Repository adapter

Provides bounded UTF-8 repository reads through `git.repository.read`.
Canonical-path checks reject absolute paths, traversal, directories, and
symlink escape. Missing files, oversized files, cancellation, and unsupported
operations have typed failures. `maxFileBytes` defaults to 4 MiB.

`npm test` exercises real files and symlinks in a disposable repository.
Delivery-lint and preflight-contract additionally exercise this adapter through
the real v2 runner.
