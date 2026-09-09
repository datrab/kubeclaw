# WP02 state boundary implementation — PCR-STATE-001 / PCR-STATE-002

Source baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Implementation worktree: `kubeclaw-fixes`; historical component review and original
reproductions remain unchanged. This note records the bounded state component
work, not an operational deployment or a claim that all WP02 findings are closed.

## Changes

`skills/nova/core/state/json-value.ts` owns independent deeply frozen snapshots,
using iterative traversal and descriptor inspection. It rejects proxies before
traps, accessors, cycles, hooks and lossy non-JSON values. Undefined object fields
are omitted like JSON.stringify. It handles shared subobjects without treating
non-cyclic sharing as a cycle. It preserves insertion order and JSON number
normalization; the journal hash algorithm and serialized format are unchanged.

FileJournal snapshots before hashing/writing and freezes parsed records at replay.
All read/append/transaction interfaces expose immutable snapshots. Escaped append
callbacks fail with JOURNAL_TRANSACTION_CLOSED after transaction return/throw.
A callback exception does not roll back appends already persisted.
PluginStateJournal snapshots its registration and append input, including before
idempotency comparison, and returns the actual persisted entry. Omitted optional
entrySchemaVersion values are excluded from canonical comparison to comply with
the hardened SDK serializer. Projection and duplicate returns use frozen entries.

FileMutex replaces path-based PID metadata reclamation with Linux flock on one
persistent inode. A synchronous `/usr/bin/flock` invocation locks inherited fd 3;
that descriptor shares the parent's open file description, so the parent retains
the lock until its descriptor closes. No tombstone rename, unlink, PID liveness
or stale-owner check can move another owner's lock out of the way. A dedicated
exit status preserves the caller's existing timeout error. Process-spawn and
kernel lock errors retain concrete diagnostic information. The foundation's
async observability lock is a useful precedent for util-linux, but this does not
import observability or its async helper into the synchronous generic state core.

The phase7 live-lock fixture now holds the real FileMutex in a child process.
Its original wait assertion remains intact. Previously it only wrote PID metadata;
such a file is no longer evidence of a held kernel lock. No mock lock or filesystem
was introduced. Parent integration owns the explicit Nova util-linux package
prerequisite and effects-side map ownership changes outside this component.

## Reproduction and verification

All commands run from the worktree root on 2026-09-09 with Node v24.19.0, using
real local filesystem operations and processes:

- Before edits: `node docs/review/evidence/journal-mutation.mjs` reported
  `reproduced:true`, memory `rejected`, disk `approved`, readerMutation true.
- Before edits: `node docs/review/evidence/mutex-contention.mjs` reported
  12 processes, 1200 attempts, **160 overlaps**, reproduced true. That is a
  measured occurrence count, not an assumed stable rate.
- After lock replacement: the same mutex-contention command reported
  1200 attempts, **0 overlaps**, reproduced false.
- `node --test tests/verification/reliability/state-ownership.test.mjs`:
  **6 passed**. Covers caller/reader/replay/sequenced ownership, rejected JSON
  values without hooks, 10,000-level iterative snapshot and shared references,
  plugin provenance/projection/duplicate ownership including omitted optional
  payload fields, exceptions/reentrancy timeout/stable inode, SIGKILL owner and
  twelve concurrently released real contenders. Exclusive sentinel creation
  detects overlap; 600 records are subsequently replayed through full hash-chain
  verification with 600 unique process/index identities.
- `node tests/verification/contracts/check-plugin-system-v2-phase7.mjs`:
  passed after the real lock fixture migration. Existing incremental replay,
  truncation/divergence, incomplete-tail, state and effect assertions remain.
- `node --test tests/verification/reliability/lifecycle.test.mts`: **2 passed**,
  including recorder/reducer flow and SIGKILL durable continuation recovery.
- `node tests/verification/contracts/check-nova-journal-scale.mts`: passed,
  16 MiB, 16,780,648 bytes, 18 records; observed replay 57.4 ms and incremental
  append 4.1 ms. Timing is a local observation, not a production guarantee.
- `npm run typecheck --prefix skills/nova`: passed.
- `npx --no-install eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/nova/core/state/*.ts tests/verification/reliability/state-ownership.test.mjs tests/verification/reliability/fixtures/state-lock-worker.mjs tests/verification/contracts/check-plugin-system-v2-phase7.mjs`:
  passed. Initial iterative helper failed complexity/depth lint; split into
  focused helpers without relaxing lint rules and reran successfully.

## Call sites and remaining limits

Reviewed all FileMutex references (journal and effects resource-lock metadata)
and all core direct journal transactions: effects/journal, state/plugins,
telemetry/observers, observability/reconciler, execution/engine-run. These use
synchronous callbacks. Event appenders in runner, stage-executor and observer
callback creation now cross the snapshot boundary. Observer delivery reads the
frozen record; lifecycle recovery/reducer reads are covered by existing tests.
ArtifactCheckpointRecorder already copies artifacts; audit builds a redacted
projection. Effects' independent request/receipt maps require their own snapshot
adoption; the parent implements and verifies that boundary separately.

Transactions and locks remain synchronous, non-reentrant, and do not accept
AbortSignal. Same-file reentrancy times out; exceptions release ownership. A
returned Promise is outside this synchronous contract; escaped journal append
callbacks cannot write after the scope ends. The flock subprocess may retain an
inherited descriptor briefly if its parent is killed while acquiring; it has a
bounded lock wait and runs no user callback. Kernel ownership does not depend on
PID namespaces or PID reuse.

Stop old writers before upgrade: mixed PID-lock and kernel-lock clients are not
safe. Keep the lock inode stable, with protected directories and verified Linux
flock semantics. File metadata content is not authorization. Unsupported lock
paths fail rather than being automatically deleted. Network filesystem semantics,
container runtime prerequisite availability, host power loss/directory fsync,
full-file replay growth and production performance remain operational/infrastructure
checks; this work makes no deployment, capacity or host-crash claim.
