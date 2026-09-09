# Git workspace adapter

Provides bounded Git worktree creation, scoped ref/path synchronization,
scoped commits, and merges.

Security invariants:

- Repository roots, the workspace root, and the Git executable are absolute canonical paths.
- Configured roots and executable paths may not contain symlinks.
- Workspaces must be new descendants of the configured workspace root.
- Commit paths are non-empty repository-relative paths and may not traverse symlinks.
- Synchronization reads exact `ref:path` blobs and changes only explicitly
  authorized repository-relative paths.
- Branches, refs, messages, and paths reject option, control-character, and ref-expression injection.
- Git receives argument arrays without a shell, an empty environment, disabled hooks, and disabled commit signing.
- Commit identity is explicit package configuration; it never depends on ambient user or system Git configuration.
- Execution has explicit runtime and combined-output limits.
- Cancellation, timeout, and shutdown terminate active Git processes with bounded SIGTERM-to-SIGKILL escalation.
- Commits include only the explicitly authorized paths; unrelated staged changes remain outside the commit.

The package owns no repository-discovery policy. Its explicit fetch, rebase and
push operations can contact configured remotes; the package does not add automatic
remote retries or claim recovery of an unknown remote commit.

`sync_paths` resolves the requested ref once to an immutable tree. A successful
literal `ls-tree` lookup with no matching entry is the only missing-file result.
Invalid refs, aborts, timeouts, output limits and other Git failures propagate.
Already completed earlier file updates remain if a later step fails; this API
is not a multi-file rollback transaction. Literal filenames are used for lookup
and checkout, including brackets and other pathspec characters.

Independent module work remains in separate worktrees. Shared repository mutations
require the core resource lock; this adapter does not blindly retry an uncertain
accepted mutation. Execution limits apply per Git command. Pre-dispatch lock
contention and attempt-owned workspace cleanup are separate core/stage concerns.
