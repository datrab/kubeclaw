# Independent review — owned telemetry retirement / RecordStore v2

Reviewed 2026-09-09 against the isolated storage worktree based on `a8cf34f`,
including the final fixed-width accounting correction. Exact source/test hashes
are recorded in [`reviewed-source-sha256.txt`](../../evidence/wave47-store-independent/reviewed-source-sha256.txt).
The reviewer changed no production source and raised one independently reproduced
blocker, which the author fixed before acceptance of this bounded slice.

## Reproduced accounting blocker and causal correction

The initial retirement receipt stored `releasedBytes` as a decimal JSON number
inside the very state whose reduction that number measured. The iterative
calculation was therefore self-referential. At some decimal-width boundaries,
`x = originalSize - encodedSizeIncluding(x)` has no fixed point.

An actual FileDurableRecordStore probe scanned real stored text sizes. With
`{text: 'x'.repeat(1340)}`, stream `stream`, key `key`, owner `run:a`, operation
`retire`, actor `operator` and empty evidence, retirement failed with
`DURABLE_RETIREMENT_ACCOUNTING_INVALID` despite a positive possible reduction.
The before output preserves this failure and preceding successful sizes.

The author replaced the self-referential persisted number with exactly sixteen
hex digits (`releasedBytesHex`). Its encoded width is constant. Replay validates
its syntax and positive safe-integer value; the public retirement result and CLI
still report numeric bytes. The original write fence, atomic snapshot and
retirement/tombstone relationship remain intact. A new real-store regression
covers 1300, 1339, 1340, 1341, 1400 and 10000 text bytes and reopens the result.

The reviewer reran both that suite and a separate original 1340-byte probe. The
reported numeric reduction exactly equals the actual file-size difference,
reopen returns the same receipt without mutation, and the former failing input
succeeds. The executable final probe and before/after output are preserved.

## Shared API, ownership and replay assessment

- Unowned legacy append/read/transition remains supported. An exact legacy
  duplicate is not silently assigned a newly supplied run owner. Existing
  non-retirement consumers retain v1 store writes unless an owned append makes
  the explicit v2 transition.
- Telemetry's owner comes from the original invocation attempt, separately from
  caller payload fields. Retirement requires an owned v2 record with matching
  stream, key, payload digest and owner; legacy ownership is not inferred.
- Tombstones retain sequence, key, owner and payload digest plus retirement
  identity. An identical replay returns the prior sequence without restoring a
  payload or consuming new quota. Different owner/content conflicts and a
  transition of a retired record fails. Read replay validates the complete
  sequence across active records/tombstones, duplicate identities and retirement
  linkage. Missing/corrupt tombstone metadata fails closed.
- Active record slots are released while all tombstone/receipt bytes remain
  charged to the total serialized-store budget. The implementation does not
  promise unlimited cleanup of arbitrarily small records or unlimited lifetime
  capacity. No-saving and full-budget outcomes remain explicit.
- The CLI is an explicit local operator action on a structured exact scope. Its
  actor field is audit data, not remote authentication. It retains the original
  canonical run history, takes the actual run mutation lock and store writer
  fence, checks terminal/uncertain state and expected journal/snapshot identity,
  and rechecks the selected owner and filesystem inventory inside the store
  operation. Waiting/active or unbound scopes do not authorize deletion.
- The broader planner reports retirement evidence and continues retaining the
  shared telemetry scope. It is not changed into a blanket destructive command.
  Only the new explicit telemetry-projection operation performs this mutation.

## Independently executed original tests

Raw outputs are in [`../../evidence/wave47-store-independent/`](../../evidence/wave47-store-independent/retirement-final.txt).

```sh
node --test tests/verification/reliability/telemetry-retirement.test.mjs tests/verification/reliability/observability-retirement-plan.test.mjs
node --test tests/verification/reliability/operator-delivery.test.mts tests/verification/reliability/discord-delivery-receipt.test.mts tests/verification/reliability/sdk-json-contract.test.mts
node docs/review/evidence/wave47-store-independent/accounting-final.mjs
```

- **21/21 retirement/planner tests pass**, zero skips/cancellations. This includes
  actual original run creation, filesystem state, active/foreign/stale/legacy
  negatives, original lock contention, SIGKILL after the atomic commit and replay
  through the real CLI, SIGKILL of a competing store-lock holder, and actual
  quota reuse without resurrection.
- **10/10 shared-store consumer tests pass**, covering original operator/Discord
  HTTP delivery recovery and original ArtifactStore/FileEffectJournal JSON
  contracts. This is consumer regression evidence, not a new deployed receiver
  or a complete independent review of those unrelated components.
- The separate exact-accounting probe passes at the originally failing size.

No new blocker remains in this reviewed slice. The author's additional
package/typecheck/lint results remain author evidence, not executions attributed
to this reviewer. No production data, deployment, CI or external message was
changed by this review.

## Explicit scope limit

PCR-OBS-002 is still globally partial: this closes a bounded safe capacity-release
path for explicitly owned telemetry projections, not admission compaction,
unowned historical records or all other shared observability stores. The
original broader retention/checkpoint/evidence-completion problem must not be
marked fully solved from this narrow path. Canonical logs, effects, decisions
and continuation evidence remain retained; no automatic time-based deletion
was introduced.
