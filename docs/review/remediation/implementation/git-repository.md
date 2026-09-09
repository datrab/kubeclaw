# WP05 bounded Git/repository implementation

Findings implemented: PCR-GIT-001 and PCR-REPOSITORY-001. Source findings read in
`kubeclaw.git-workspace.md`, `kubeclaw.repository-adapter.md`, and the register's
preserved source_finding_text. No register, commits or staging changed by this
implementation agent. Tests use temporary repositories/directories and local Git;
no external Git remote, CI, deployment or notification is involved.

## PCR-GIT-001

The former catch-all around `git show` converted invalid refs, output limits,
timeouts and cancellation into `missing`. `sync_paths` now resolves and validates
the requested ref once to a tree object ID. Each requested filename is queried
through successful `git --literal-pathspecs ls-tree -z --full-tree`; only empty
output means absent. Unexpected non-blob/multiple entries fail explicitly.
Actual blob reading and literal checkout use the same immutable tree, so a ref
move cannot separate existence lookup from materialization. No runner error is
caught as absence. Bracket/glob/pathspec characters retain literal-file semantics.

The real-Git `tests/sync-disposition.test.ts` initially failed on the old code with
“Missing expected rejection” for a nonexistent ref. After repair it passes missing
blob, invalid ref, 1024-byte blob against 128-byte output limit, pre-aborted signal,
partial multi-file update followed by output failure, and a literal bracket filename.
Earlier successful updates remain when a later command fails; the API does not
claim transactional rollback. Timeouts also propagate through the same uncaught
runner path; no substitute Git executable was introduced for this regression.
The historical combined capability-adapter probe could not reach its Git section:
its preceding NETWORK-001 defect assertion now fails because that defect is fixed.
This is recorded as a blocked historical combined repro, not a new Git failure.

## PCR-REPOSITORY-001

Before changes, `node docs/review/evidence/nova-batch-repository-symlink-probe.mjs`
reported both `missingSymlinkTargetReportedAsMissing:true` and
`originalCollectorWroteOutsideRepository:true`, using the real repository adapter
and real exported collector.

Repository mutable reads now inspect existing parents before returning missing;
external/dangling parent symlinks are forbidden. Allowed internal symlinks are
resolved, then actual file reading uses opened no-follow directory/file descriptors.
File size/type is checked on the descriptor, growth/truncation during the bounded
read is rejected, and configured/replaced symlink roots are forbidden. Immutable
revision/proof operations are unchanged.

The collector writer is secured independently in runtime-dispatch/result-persistence.ts.
Root and parent components are opened with Linux O_DIRECTORY|O_NOFOLLOW; missing
parents are created relative to pinned descriptors and fsynced. Creation and atomic
hardlink publication use `/proc/self/fd/<directory>` anchors. Final existing targets
are opened O_NOFOLLOW and must be identical regular files for idempotent success.
Different content is never overwritten. Temporary-file, data-file and directory
fsync/cleanup retain the previous durable publication intent. Failure preserves
its underlying cause under OPENCLAW_RESULT_PATH_INVALID.

`../../../../tests/verification/reliability/repository-result-paths.test.mjs` exercises the real collector+repository adapter and
the actual writer directly. It covers existing and missing leaves under external
symlinks, symlink final targets, symlink roots, regular nested creation, repeated
identical publication, and conflicts. A real child process repeatedly atomically
exchanges a real directory and external symlink using the Linux renameat2 syscall
(Python ctypes calls libc; no syscall/filesystem mock or production shim). During
300 concurrent publications, the observed run allowed 40 and rejected 260, with
**zero external writes or temporary artifacts**. Counts are observations, not
fixed assertions. Both paths use bounded loops; the attacker process exits and
all temporary data is removed.

The repository package also runs `tests/path-safety.test.ts`: internal-link reads
remain allowed, legitimate missing descendants remain missing, external/dangling
parent symlinks are forbidden, directories rejected, and replacing an activated
repository root with an external symlink remains forbidden even for absent leaves.

## Verification commands

From `kubeclaw-fixes`, or the stated package working directory:

- `node skills/common/plugins/git-workspace/tests/sync-disposition.test.ts`: passed.
- `node skills/nova/plugins/repository-adapter/tests/path-safety.test.ts`: passed.
- `node tests/verification/reliability/repository-result-paths.test.mjs`: passed.
- `npm test && npm run build` in each of git-workspace, repository-adapter and
  runtime-dispatch: all original suites, newly hooked regressions and TypeScript
  builds passed. Final runtime race observation: 35 allowed, 265 rejected, zero
  external writes. Counts vary with scheduling.
- `npx --no-install eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/common/plugins/git-workspace/src/operations.ts skills/common/plugins/git-workspace/tests/sync-disposition.test.ts skills/nova/plugins/repository-adapter/src/{adapter,repository-file}.ts skills/nova/plugins/repository-adapter/tests/path-safety.test.ts skills/common/plugins/runtime-dispatch/src/{openclaw-result,result-persistence}.ts tests/verification/reliability/repository-result-paths.test.mjs`:
  passed with unchanged canonical rules.

## Deliberately separate trace work and limitations

PATH-T07-001 requires compiler/stage changes to attempt-owned workspace/branch
generations plus durable cleanup status. T06-F01 arises in the core
FileResourceLockManager before the Git adapter is invoked; it requires bounded,
cancellable pre-effect serialization/retry. Both preserved source findings were
read in register.json. They cannot be fixed safely by adapter-only Git retries or
by adopting/deleting arbitrary existing worktrees. Per root scope instruction,
both remain for the implementation/core owner; this patch does not claim their
closure. Separate worktrees and the core's serial shared-repository integration
boundary remain intact (D05). No accepted uncertain mutation is blindly retried.

Linux `/proc/self/fd`, O_NOFOLLOW and ordinary directory/fsync/hardlink semantics
are runtime prerequisites. Descriptor pinning addresses symlink substitution,
not an all-powerful same-UID adversary relocating the authorized root itself or
its trusted ancestors; those locations must remain protected. Existing per-command
Git resource/process-tree limits, binary-vs-text synchronization semantics and
complete host power-loss proof remain separate. No log retention or automatic
result deletion policy was added (D01/D07).
