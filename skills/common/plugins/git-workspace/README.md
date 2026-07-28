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

The package owns no repository-discovery policy and does not fetch, push, or contact remotes.
