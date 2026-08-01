# Real E2E Future Hardening

## OpenClaw Completion Events

Runtime dispatch currently uses confidential, exponentially backed-off status
checks because the OpenClaw gateway does not expose a correlated await-completion
operation. Polling is not recorded as durable pipeline effects, but it still
consumes gateway compute.

Add a host capability that emits or awaits one terminal event keyed by child
session ID. Once available, runtime dispatch should replace status polling with
that event and retain the extension-owned atomic result file as the canonical
output across transcript compaction.

## Gateway Credential Operations

Gateway and webhook credentials are now resolved and transported only through
confidential capability invocations. A prior development run wrote the gateway
bearer value to disposable effect journals before that boundary existed; those
journals were removed.

Operational follow-up remains:

- rotate the historically exposed development gateway credential;
- prefer short-lived or externally managed credentials for deployed instances;
- automate credential-rotation evidence without exposing credential material.

These operational tasks do not justify a legacy transport fallback and must not
weaken the confidential invocation boundary.

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

The current Git edge matrix covers production Git sync failures for auth, remote push transport, non-fast-forward rejection, true divergent merge-conflict ancestry, commit/index failure, cleanup failure, and dirty out-of-scope worktree preservation.

One Git case remains intentionally deferred because it should not be faked:

- `branch already exists`: the disposable branch is created by the E2E workspace manager before the v2 production driver starts, so this is a harness setup collision rather than a production pipeline behavior.
