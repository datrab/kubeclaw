# Independent review: admission completion compaction

Reviewed source commit: `c7023c7a657c7d5f21371025e6b9289dc17cfe01`.
Reviewer: separate admission-review agent, 2026-09-09.

Decision: approve integration of this bounded local compaction slice. Do not
close PCR-OBS-002 or any native infrastructure finding from this review.
No source changes or test weakening were needed during this review.

## Requirement and scope

The original PCR-OBS-002 requires safe run-owned capacity release after consumer
checkpoint and referenced evidence completion, preserving old-delivery
idempotence while mixing active and completed history under real small quotas.
This slice removes only an admission payload copy already retained in an
immutable attempt completion intent. It retains original logs, results, evidence,
closure, ACK and cursor. The CLI is manual and restricted to canonical Nova
run-owned stores; external Buster job stores and general history remain outside
its authority. Positive byte savings are required, so a small record whose
reference would be larger is refused rather than advertised as capacity relief.

## Independently examined implementation

- The run mutation lock encloses the attempt writer lock and then the admission
  writer lock. Original terminal journal and snapshot identity and bounded
  inventories are rechecked immediately before the admission state commit.
- The retained source binds the canonical run path, run/plan/node/attempt and
  generation, result and closure digests, original producer record and ACK.
  Raw record consumers reconstruct the original record rather than silently
  omitting a retired payload. v1 remains readable without automatic migration.
- A duplicate retired delivery resolves its source before returning its ACK.
  Corrupt or absent source therefore leaves the producer outbox unacknowledged.
- Evidence and completion reads use actual file handles, NOFOLLOW/NONBLOCK,
  regular-file and bounded-size checks before allocation, EOF checks and
  identity/digest checks. FIFO and symlink cases exercise real filesystem objects.
- Cursor coverage includes live and retired entries. Tombstone bytes remain
  charged against the total byte quota. Repeating an identical operation does
  not claim another release; different ownership cannot reuse its identity.
- This preserves a copy by reference; any future attempt-retirement operation
  must honor these references. It is not permission to delete the source.

## Independent executions

Environment: repository dependency tree and Node from
`/workspace/scratch/4e25cf57c177/toolchains/bin`. All commands exited 0.

```sh
node --test tests/verification/reliability/admission-retirement.test.mjs tests/verification/reliability/observability-replay.test.mjs tests/verification/reliability/observability-retirement-plan.test.mjs
node tests/verification/contracts/check-pipeline-observability-durable-attempts.mts
node tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts
node_modules/.bin/tsc --noEmit -p skills/common/plugin-runtime/tsconfig.json
```

The first command passed 24/24, with zero skipped, cancelled or pending tests.
It includes missing/changed-source duplicate ACK and retained outbox, original
v1 replay, actual quota exhaustion and byte release, protected waiting run,
foreign identical source rejection, real FIFO/symlink/oversize rejection,
actual writer-process SIGKILL and post-commit process restart. Both original
consumer checks passed, including 20-worker idempotent reconciliation imports.
Typecheck emitted no output and exited 0. Raw stdout/stderr is retained in:

- `docs/review/evidence/wave47-admission-independent-tests.txt`
- `docs/review/evidence/wave47-admission-independent-attempt.txt`
- `docs/review/evidence/wave47-admission-independent-reconciliation.txt`
- `docs/review/evidence/wave47-admission-independent-types.txt`

## Limits of the approval

These are real local stores, disk objects, processes and original APIs. The
terminal run fixture invokes the real Core with a purpose-built repair-budget
plugin and native Git; its completion record is a constructed contract-valid
test input, not a native Buster worker execution. No native cluster, CNI,
externally hosted Clawdeck, registry GC or full production pipeline was tested.
A SIGKILL after commit demonstrates reopening the committed state, not exhaustive
power-loss testing of every write boundary. The review does not infer those
broader claims from the passing tests. General attempt/result/log retirement and
native registry acceptance remain unresolved, so the overall finding stays partial.
