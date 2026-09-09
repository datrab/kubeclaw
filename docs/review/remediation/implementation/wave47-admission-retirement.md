# OBS002: manual retirement of redundant completion admission copies

This slice extends commit `3233ad5` beyond telemetry. It releases actual admission
record capacity and bytes for a precisely owned completion copy. PCR-OBS-002
remains partial: attempt results/evidence, general producer logs, external Buster
job stores and registry capacity are not retired by this command.

## Producer, consumer and authority

Buster's original producer commits `DurableResultMetadata.completionIntent`
before admission, and `resumeCompletion` admits the same producer record and
persists its producer closure. Both the completion and closure remain immutable
for the original run/attempt/generation/plan/node under the attempt-store API.
The new operation only accepts the existing one-record completed producer
stream, its exact stored closure, and all required result-referenced evidence
with verified original bytes. It does not manufacture a Nova or Clawdeck ACK.

The CLI is deliberately restricted to a canonical Nova run's existing
`observability/attempts/attempt-store.json` and `observability/admission/admission.json`.
External/copied attempt roots are refused, even when bytes match. Persisted
references also enforce this exact path relative to the retained run authority.
Other layouts require a separate existing owner-to-job binding; an operator
supplied path alone is not such a binding.

Lock order is original run-mutation fence, original attempt-store writer fence,
then original admission writer fence. The run snapshot and hash-chained terminal
journal head are pinned and rechecked before mutation. Waiting/active runs,
uncertain external effects, pending observer deliveries and changed inventories
are blocked. Caller inputs are cloned before the first asynchronous boundary.

## Storage and replay

Unchanged v1 snapshots reopen without migration. On explicit successful
retirement, `observability-admission-store.v2` replaces one live entry with a
reference tombstone containing:

- Exact original duplicate acknowledgement, producer/run/sequence identity and
  canonical cursor.
- Original attempt source path and bound, run/plan/node/attempt/generation,
  result digest and closure digest.
- Operator/operation identity, canonical run root, terminal journal head and
  run snapshot digest.

Original `admittedRecords`, tails, `admitAndRead`, gap restoration, attempt
completeness and Clawdeck consumers obtain the complete, verified original
record from the retained completion intent. There is no payloadless record
presented as successful. Each source is read once per multi-record view. Source
reads validate the original attempt format, result/owner/completion/closure and
record identity before use. Missing or changed sources fail closed **before a
duplicate ACK**; an original producer outbox remains unacknowledged. Valid old
deliveries return the original ACK without reinsertion or cursor advancement.

The original attempt store never deletes these committed results, completion
intents or result-referenced evidence. These source records are now additionally
referenced by admission and must remain protected in any future attempt
retirement implementation. The read-only planner reports each retained source
and rejects a source omitted from its bounded inventory.

Completion and evidence reads use real file handles with `O_NOFOLLOW` and
`O_NONBLOCK`, verify regular file type and the original byte bound before
allocation, then verify EOF and digests. Canonical path checks reject symlink
sources. The existing inventory opens also use nonblocking mode so a raced FIFO
cannot turn a regular-file precheck into a blocking open.

`maximumRecords` counts live copies; `maximumBytes` still counts every reference
and its authority proof. Net byte savings must be positive and are computed
from the exact original/candidate canonical state bytes. No self-referential
decimal byte counter is stored. Repeating the same operation returns
`newlyRetired:false,releasedBytes:0`; changing operation ownership/source/authority
rejects. This is finite quota relief, not unlimited retention or a larger quota.
The attempt source itself is unchanged, so no quota is merely moved into a new
archive.

## Manual command

Run `node scripts/retire-admission.mjs --apply /absolute/scope.json` locally.
The scope requires exactly:

```text
schemaVersion: admission-retirement-scope.v1
action: compact-admission-completion
actor, operationId, runId, novaStorageRoot
attemptRoot, admissionRoot (the exact canonical run subdirectories)
attemptId, claimGeneration, recordDigest
expectedJournalHead, expectedSnapshotDigest
attemptLimits, admissionLimits (the original deployment's finite limits)
inventoryLimits: maximumFiles, maximumTotalBytes, maximumSnapshotBytes
```

This is local filesystem operator authority. `actor` is audit data, not remote
authentication. The scope file is a bounded regular file opened without symlink
following or blocking. No scheduler or automatic log-deletion hook invokes this.

## Verification

Commands from the repository root:

```sh
node --test tests/verification/reliability/admission-retirement.test.mjs tests/verification/reliability/observability-replay.test.mjs tests/verification/reliability/observability-retirement-plan.test.mjs
node tests/verification/contracts/check-pipeline-observability-durable-attempts.mts
node tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts
node_modules/.bin/tsc --noEmit -p skills/common/plugin-runtime/tsconfig.json
```

Seven new retirement tests plus three original replay tests and fourteen
original planner tests pass (24/24). Evidence is in
`docs/review/evidence/wave47-admission-*.txt`. The new tests use original stores,
outbox delivery, Clawdeck views, real native Git/run fixtures, disk files and
processes. They cover original quota exhaustion and subsequent release; mixed
active/completed data; v1 reopen; unaltered source bytes; producer replay and
completeness; source deletion/corruption with retained unacknowledged outbox;
foreign source/owner, missing closure, corrupt evidence, waiting continuation;
real FIFO, oversized evidence and symlink rejection; SIGKILL after actual commit;
and SIGKILL of an original attempt writer blocking retirement.

Root review identified the missing-source duplicate-ACK hazard and unbounded
evidence reader in the first working version; both have direct regressions and
are corrected here. Foundation typecheck and lint for new files/replay/planner
changes pass. The two pre-existing large store files retain their existing lint
debt (baseline 14 findings); no suppressions were introduced.

These are local original-API and process proofs, not cluster acceptance. No CI,
deployment, model provider, externally hosted Clawdeck, or registry GC was run.

## Remaining connected work

The next plausible result-capacity boundary is a result already durably copied
into the canonical Nova reconciliation journal: an immutable journal
sequence/hash plus exact imported plan/node/attempt/generation/result digest can
serve as a real consumer checkpoint. Attempt-v2 would need to preserve current
snapshot, completion, retry and Clawdeck contracts through validated references,
including the admission references introduced here. An absent import must never
be replaced by a fabricated ACK. This has not been implemented by this slice.

Evidence deletion is a different authority boundary: the results, closures and
acceptance sources still reference the evidence bytes. Actual deletion needs
an explicit end-of-reopening/acceptance disposition honored by every consumer,
not just a terminal lifecycle event. General admission history and external
Buster job roots need their own producer/consumer checkpoint and owner binding.
IFR-08-002 still requires protected registry digest leases, persistence and
native surviving-pull/GC/restart acceptance. None of these broader gates is
claimed closed.
