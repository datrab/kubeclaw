# PCR-OBS-002 — manual completed-job archive compaction

This slice releases **Buster job metadata bytes**, by removing only the embedded
base64 repository archive from an already completed job. It preserves the plan,
source attestation, original request digest, completed status, result reference,
result blobs, all referenced evidence, logs and final project source. Record
count and result-store capacity reservations do not decrease. PCR-OBS-002 remains
partial: this does not provide general log cleanup, run retirement, or recovery
from an exhausted record-count quota.

The operator action implements the bounded source-copy cleanup approved for this
slice. D07 still requires logs to remain until manual operator cleanup, and code,
final reports, decisions and acceptance history until project deletion. There is
no TTL, scheduler, Clawdeck acknowledgement, archive service, or Nova run fence.
A waiting Nova consumer retains its completed Buster result and exact duplicate
submission behavior; the command does not retire that run.

## Persisted contract and mutation

`buster-plan-job-compacted-record.v1` is a distinct persisted variant. Its
`buster-plan-job-header.v1` contains a `repository-archive-summary.v1`; neither
claims to be a full executable job/archive. The header retains the original full
request digest, which includes the removed bytes. It cannot recompute or replace
that digest. Every incoming submission still validates the complete archive,
original source signature, full job contract and request digest before checking
for an existing job. An exact terminal duplicate returns the original completed
status; a changed request rejects. Recovery never schedules a compacted record,
and the store refuses to move a completed job back into execution.

`compactCompletedArchive` snapshots the complete caller intent synchronously,
before validation or asynchronous work, and holds the existing job-admission
lock. It checks the operator-selected record digest, completed state, original signed full job,
original result blob and every referenced artifact's actual path, hash and byte
count. Incomplete execution or cleanup rejects. Evidence reads have an explicit
aggregate byte budget. The retained source must pass the checks below before the
constructed compact variant is validated, then the original durable-record
transition replaces one payload using its expected payload digest. The record's stream, sequence and idempotency key remain.

The receipt binds operation ID, actor, job, expected original payload digest,
evidence budget, retained-source selection and retention obligation. It records
the exact net canonical metadata bytes released, including the receipt overhead.
An archive too small to save bytes rejects. Concurrent identical requests have
one writer; retry returns the same receipt and zero additional bytes. A changed
intent rejects. Failure before the atomic replacement leaves the original full
record; failure after it leaves the compacted record and its receipt. There is
no separate deletion or receipt write to reconcile.

The artifact read routine is shared with the original HTTP evidence consumer.
Compaction validates all referenced locations, including duplicate references,
and never deletes or rewrites those files. Evidence opens use `O_NONBLOCK` with
`O_NOFOLLOW`, then validate the opened object is a regular file before reading;
a FIFO without a writer cannot hang the admission lock or HTTP evidence route. The read-only retirement planner
recognizes the compact variant and continues to report it as retained.

## Retained source authority

The manual scope supplies the operator's configured mapping from the original
repository ID to an existing canonical Git repository root, an **existing named
tag under `refs/tags/`**, and `retention: "until-project-deletion"`. HEAD and
branch selections are rejected. This first version supports non-bare canonical
Git roots; it does not claim an artifact-store retention integration.

The repository ID must equal the signed source identity. The selected tag must
resolve to the exact signed commit and tree. A bounded, in-memory invocation of
the original Git archive format must reproduce the original archive hash and
byte count. The tag is checked again after the archive read. Changed local Git
export attributes therefore reject even when commit and tree names still match.
Later unrelated commits are allowed when the selected retained candidate remains
unchanged. No tag, source copy or on-disk archive is created merely to manufacture
proof or a storage saving.

The operator must retain that repository and tag, without moving or deleting the
ref or discarding its reachable source objects, until project deletion. The
command verifies the authority currently present; it does not install Git ref
protection or claim an atomic transaction with independent repository
administration. The retained-source identity and obligation remain in the
receipt. This is an explicit prerequisite for removing the redundant embedded
copy, not a claim that an arbitrary branch will survive forever.

## Manual invocation

Run `node scripts/compact-buster-job.mjs --apply /absolute/operator-scope.json`
with the original Node/workspace installation and local operator filesystem
access. The command has no network mutation route. The scope must contain exactly:

| Field | Required value |
| --- | --- |
| `schemaVersion` | `buster-job-compaction-scope.v1` |
| `storeRoot`, `runtimeRoot` | Actual absolute Buster metadata and runtime roots |
| `sourcePublicKeyFile` | Actual source attestation public key file |
| `maximumSourcePublicKeyBytes` | Explicit positive read budget for that actual key file |
| `storeOptions` | Actual record limits, archive/result byte limits, result-store byte limit, trusted source authority |
| `intent` | Operator ID, operation ID, job ID, current full record payload digest, positive `maximumEvidenceBytes`, and retained-source selection above |

Within `storeOptions`, the exact keys are `recordLimits`, `maximumArchiveBytes`,
`maximumResultBytes`, `maximumResultStoreBytes` and `trustedSourceAuthority`.
Within `intent`, they are `actor`, `operationId`, `jobId`,
`expectedPayloadDigest`, `maximumEvidenceBytes` and `source`. Within `source`,
they are `repositoryId`, `repositoryRoot`, `retainedRef` and `retention`.
The scope file retains its 64 KiB cap. Both scope and key files are opened with
`O_NONBLOCK | O_NOFOLLOW` and checked as regular files before bounded reads.
The existing Ed25519 `crypto.createPublicKey` parser is unchanged: it has no
inherited file-byte limit. The operator therefore supplies the key read budget
explicitly; this command introduces no silent fixed key-size or encoding restriction.
Use the configured live limits and actual selected identities; the command does
not infer source ownership, invent a receipt or increase a quota. An absent
existing store, malformed scope, missing source, stale record or missing evidence
fails before the compaction transition. Errors expose fixed codes, not parser
excerpts or source/result payloads. Local operator access is the authorization
boundary; an actor string does not authenticate a remote caller.

## Verification and limits

- Twelve new tests pass, using the actual source signer, Git, Nova dispatch/import,
  authenticated local HTTP Buster service, native file stores and original
  runner's genuine skipped-node completion. They prove metadata quota release,
  unchanged record-count quota, exact terminal replay after reopening,
  changed/full-invalid request rejection, source/ref/byte mismatch rejection,
  missing result and evidence rejection, active/uncertain rejection, concurrent
  idempotency, stale CAS, caller mutation after submission and manual CLI replay.
  The mutable-intent regression reproduces the independent reviewer’s blocker:
  changing both top-level and nested source fields immediately after calling the
  compactor cannot change its receipt or make the reopened store unreadable.
- Evidence transport tests use actual native Node output carried by the existing
  failed-result contract fixture. This verifies artifact storage/read semantics;
  it does not claim a passed Buster provider execution.
- A real FIFO regression runs both the original compactor and authenticated HTTP
  evidence route in bounded child processes. Both reject the opened non-regular
  object without a writer, and the original metadata bytes remain unchanged.
  The process timeout bounds a failing regression; no production timeout masks
  the open-time defect. Actual CLI writerless scope/key FIFO cases and a key
  exceeding its explicit budget also reject without changing store bytes.
- Real SIGKILL probes cover a holder of the original admission lock before
  mutation and the original compactor after durable commit but before reply.
  The original fsync/rename writer supplies the atomic replacement. These probes
  do not claim exhaustive power-loss testing at every filesystem instruction.
- The original remote runtime/deadline consumer suite passes. The original
  read-only retirement planner's fourteen tests pass.
- Buster engine typecheck and strict compilation of the new original-consumer
  test pass. Canonical ESLint passes the new helper, command, planner change and
  test. The existing service still has file-length, recovery nesting, and
  execution-method length/complexity findings; comparison against HEAD showed
  those same four findings before this slice (plus the old evidence-method
  complexity finding, eliminated by the shared reader). No suppression or
  checker exemption was added.

Raw evidence: [compaction tests](../../evidence/buster-job-compaction-tests.txt),
[original runtime consumer](../../evidence/buster-job-compaction-runtime.txt),
[original planner](../../evidence/buster-job-compaction-planner.txt).
Commands:

```sh
node --test tests/verification/reliability/buster-job-compaction.test.mts
node tests/verification/contracts/check-pipeline-remote-plan-runtime.mts
node --test tests/verification/reliability/observability-retirement-plan.test.mjs
npx tsc --noEmit -p skills/buster/engine/tsconfig.json
npx tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ESNext --strict --skipLibCheck --allowImportingTsExtensions --erasableSyntaxOnly tests/verification/reliability/buster-job-compaction.test.mts
```

No deployment, live cluster, production operator cleanup, native isolated
provider pass or Clawdeck acknowledgement was performed or inferred. All
compaction mutations in verification target freshly created temporary stores.

Exact scope (9 paths):

- `skills/buster/engine/test-gates/remote-plan-service.ts`
- `skills/buster/engine/test-gates/remote-plan-compaction.ts`
- `scripts/compact-buster-job.mjs`
- `scripts/observability-retirement/stores.mjs`
- `tests/verification/reliability/buster-job-compaction.test.mts`
- `docs/review/remediation/implementation/buster-job-compaction.md`
- `docs/review/evidence/buster-job-compaction-tests.txt`
- `docs/review/evidence/buster-job-compaction-runtime.txt`
- `docs/review/evidence/buster-job-compaction-planner.txt`
