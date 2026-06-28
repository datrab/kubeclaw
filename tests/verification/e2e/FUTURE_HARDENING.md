# Real E2E Future Hardening

## Retry Git Lineage

The current retry/fix-cycle evidence proves attempt ordering, failed attempt history, retry prompts, Buster task attempts, and final winning attempt summary. It does not yet prove commit/diff lineage across fix attempts.

Production currently exposes per-attempt `commit_hash` in lifecycle events and latest `forge_diff_stat` on module status. That is enough to assert commits exist, but not enough to prove a stable typed chain such as:

- `base_commit`
- `failed_attempt_commit`
- `fix_commit`
- `diff_sha`
- structured `changed_files`
- parent/child attempt lineage

Keep this open until production emits a typed attempt-lineage contract. Once available, the E2E harness should assert each retry fix is based on the previous failed attempt and produces a fresh diff, rather than accepting stale or reused artifacts.

## Git Remote Lineage Fixtures

The current Git edge matrix covers production Git sync failures for auth, remote push transport, non-fast-forward rejection, commit/index failure, cleanup failure, and dirty out-of-scope worktree preservation.

Two Git cases remain intentionally deferred because they should not be faked:

- `branch already exists`: the disposable branch is created by the E2E workspace manager before `skills/nova/pipeline.ts` starts, so this is a harness setup collision rather than a production pipeline behavior.
- true merge conflict ancestry: robust coverage needs a run-scoped bare remote fixture with two divergent commits so production `git pull`/`git push` observes a real conflict without mutating the repository's shared `origin`.

Add that fixture when the harness needs deeper Git ancestry coverage. It should create a temporary bare remote under `.swarm/real-e2e/<run>/`, point only the run-scoped worktree at it, and assert typed production Git sync failure evidence from real Git commands.
