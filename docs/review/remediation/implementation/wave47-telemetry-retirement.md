# Wave 47: manual telemetry projection retirement

PCR-OBS-002 gains a working producer/consumer retirement path. This is **not**
closure of all admission, attempt, artifact and Buster quotas. IFR-08-002 remains
open for registry lifetime/reference protection and native proof. No deployment,
CI, production cleanup or external message was performed.

## Ownership and consumer boundary

The telemetry adapter now records the original invocation's `attempt.runId` in
a `pipeline-durable-record.v2` owner header. Projected payload bytes, redaction,
payload digest, payload-size limit and response remain unchanged. Payload fields
cannot supply the owner. New owned records use an explicit
`pipeline-durable-record-store.v2` snapshot; ordinary unowned stores keep v1.

Existing v1 records remain readable and are never assigned guessed ownership.
An exact legacy duplicate returns that original v1 record unchanged and remains
ineligible for cleanup. Owned duplicates additionally require the same owner.
Unknown record/store versions fail. Older foundation versions cannot read the
new formats: writer/readers and any rollback must use compatible pinned package
versions. No content-based version fallback or retrospective owner migration
is introduced.

The telemetry adapter is the only production writer opting into owner headers;
the new local CLI is the only retirement consumer. Source search found no
production read consumer of `telemetry/plugin-events` except adapter readiness.
Other record consumers still receive complete live records. The existing
read-only retirement planner explicitly displays retained cleanup facts.

## Manual authority and atomic transition

`node scripts/retire-telemetry.mjs --apply /absolute/operator-scope.json` holds
the original Nova run-mutation fence and original record-store writer lock.
Inside those fences it verifies the actual run root, complete original
hash-chained journals, pinned run-snapshot digest and expected journal head.
Only succeeded, failed or cancelled runs qualify. Waiting/active/blocked runs,
unfinished observer deliveries and uncertain external effects reject. Selected
keys, original payload digests and trustworthy run owners must match exactly.
Retained files and directory identities are checked again. No journal constructor
repairs an incomplete tail during inspection.

Only selected telemetry **projection payloads** are removed. Canonical logs,
journal chains, effects, final reports, decisions, acceptance history, artifact
references, blobs, Buster results and source files remain untouched. A later
authorized reopening retains its canonical continuation material. This is
explicit manual diagnostic-projection deletion under D07, not automatic expiry
or run retirement. No Clawdeck consumer checkpoint is inferred.

One original fsync/rename snapshot replacement publishes the reduced live set,
tombstones and retirement receipt together. Tombstones preserve stream, sequence,
key, owner, timestamp, original payload digest and retirement identity. The
receipt binds the full operator intent and retained canonical run proof. Inputs
are captured before the first await; authorization receives copies of records.

`append` checks live records and tombstones before admission limits. An exact
late duplicate returns `appended: false` and its original sequence without
restoring the deleted projection. Its complete returned record uses the caller's
digest-verified original input, not a payload-less placeholder. Changed payload
or owner rejects. `transition` rejects a retired target with
`DURABLE_RECORD_RETIRED`. `read` returns complete live records; `retirements`
exposes cleanup history separately. All surviving sequence positions remain
monotone across live records and tombstones.

The active-record quota can be freed; the unchanged total-byte quota still
includes every tombstone and retirement fact. They are never automatically
deleted. Cleanup requires positive net saving after its own receipt overhead,
and records exact canonical snapshot bytes reclaimed. The persisted count is
fixed-width `releasedBytesHex` (16 hex digits); API/CLI expose a numeric count.
This avoids the independent review's reproduced decimal-boundary fixed-point
failure. Tiny records without a
net saving reject. Tombstone capacity is explicitly finite: eventual exhaustion
is still an error, not a claim of unlimited history in finite space.

An identical operation returns its retained receipt with `newlyRetired: false`;
CLI output reports zero additional bytes/records. Changed intent under the same
operation ID rejects. Replay rechecks the retained-run proof.

## Operator scope

The local filesystem operator is the authorization boundary; `actor` is audit
data, not remote authentication. There is no timer, network route or automatic
cleanup. Supply exactly:

| Field | Required value |
| --- | --- |
| `schemaVersion` | `telemetry-retirement-scope.v1` |
| `action` | `delete-telemetry-projections` |
| `actor`, `operationId` | Explicit operator and unique operation identity |
| `runId`, `novaStorageRoot`, `telemetryRoot` | Actual run and canonical absolute configured roots |
| `expectedJournalHead` | Original `events.jsonl` final record hash |
| `expectedSnapshotDigest` | Original `run-snapshot.json` digest |
| `records` | Selected `{idempotencyKey,payloadDigest}` pairs |
| `storeLimits` | Actual `maximumRecords`, `maximumBytes`, `maximumRecordBytes` |
| `inventoryLimits` | Positive `maximumFiles`, `maximumTotalBytes`, `maximumSnapshotBytes` inspection budgets |

The scope file is opened nonblocking without following its final symlink,
checked as regular, and bounded to 1 MiB. Invalid fields and overlapping
telemetry/run roots reject. A misspelled absent store is not created. Inspection
limits block incomplete proof instead of certifying a partial scan. Diagnostics
do not print source payloads or credentials.

## Verification

The initial 23-test run passed; independent review additionally reproduced a
byte-accounting decimal-boundary defect, corrected with fixed-width accounting
and a seventh original-store regression. Final results are recorded separately
after that correction. The new
tests use the original native Git pipeline fixture (including succeeded and
waiting runs), original telemetry adapter with actual file-resource fencing,
original disk stores and original CLI. No mock store or substitute adapter is
used. These are local integrations, not deployed/model pipeline E2E.

Covered: actual byte/record quota recovery, foreign/legacy owners, v1 reopen and
ordinary append/read/transition, stale source heads, changed/reused intentions,
late duplicate replay, finite byte limits, incomplete/corrupt tombstone history,
immutable caller inputs and visible planner cleanup records. A native competing
writer prevents cleanup; killing that process before mutation leaves original
bytes intact until cleanup obtains the lock. A separate cleanup process is
killed after durable commit; CLI reopen releases zero additional bytes. These
are targeted SIGKILL boundaries, not exhaustive filesystem power-loss testing.

Executed commands and logs:

- `node --test tests/verification/reliability/telemetry-retirement.test.mjs tests/verification/reliability/observability-replay.test.mjs tests/verification/reliability/observability-retirement-plan.test.mjs`: [initial](../../evidence/wave47-telemetry-retirement-tests.txt), [final](../../evidence/wave47-telemetry-retirement-tests-final.txt).
- `npm test --prefix skills/common/plugins/artifact-store`: [original artifact consumer](../../evidence/wave47-telemetry-artifact-consumer.txt).
- `npm test --prefix skills/common/plugins/telemetry-store`: [original telemetry consumer](../../evidence/wave47-telemetry-consumer.txt).
- `node --test --test-name-pattern='exact retirement byte accounting' tests/verification/reliability/telemetry-retirement.test.mjs`: [fixed accounting](../../evidence/wave47-telemetry-accounting-fixed.txt); six boundary lengths including the reviewer's 1340-byte counterexample.
- `node_modules/.bin/tsc --noEmit -p skills/common/plugin-runtime/tsconfig.json`: [initial](../../evidence/wave47-telemetry-types.txt), [after accounting correction](../../evidence/wave47-telemetry-types-final.txt).
- Canonical ESLint on both changed foundation files, telemetry adapter, CLI, both planner files and the new test: [initial](../../evidence/wave47-telemetry-lint.txt), [after correction](../../evidence/wave47-telemetry-lint-final.txt). Added validator complexity was removed through decomposition, without suppressions or changed limits.

## Remaining scope, not completed by this slice

| Finding/store | Required follow-on boundary |
| --- | --- |
| PCR-OBS-002 admission | Per-producer sequence/cursor tombstones and real observation consumer checkpoints. Admission drives reconciliation and is not disposable telemetry. |
| PCR-OBS-002 attempts/results | Evidence/result/closure reference closure and final consumer acknowledgement; retain claims and replay authority. |
| PCR-OBS-002 artifacts/Buster | Authoritative cross-run references and permanent job/run replay guards before metadata/blob release. |
| PCR-OBS-002 old telemetry | Trustworthy historical ownership is absent; operator labels cannot reconstruct it. v1 stays retained. |
| IFR-08-002 registry | Actual persistence/capacity configuration and retained-image ownership across build, lease, demo, waiting/reopenable runs and acceptance. |

The registry lacks the complete reference registration/transfer protocol.
Namespace deletion or a caller-supplied keep-list is not authority for GC.
No registry manifest, deletion API or GC routine changed here. Follow-on work
must register ownership before push/use, transfer it with demo handoff, retain
it through waits/acceptance, and fence new pushes/references during GC. Actual
registry replacement, native lease cycles and surviving digest pulls remain
required operating proofs; local schema checks cannot replace them.
