# Owned source cleanup reconciliation

Status: the bounded Core mechanism is implemented and
[independently accepted](independent-native-source-cleanup-reconciliation-20260921.md).
Actual Buster source deletion, publication authority and complete RC acceptance
remain open. It supports the assigned
[Buster preparation integration](buster-native-preparation-20260921.md); it does
not weaken generic cleanup failure or close Buster/IFR-16 acceptance.

## Existing boundary

`recoverNativeWorkerAttempts` recovers/seals each original journal result, then
fences admission whenever `cleanup.state` is `failed`. Native ownership recovery
can prove a disposed process tree while the original specialist cleanup remains
unknown. This distinction is correct. Buster preparation can sometimes prove a
much narrower remaining effect: one unpublished source directory owned by its
fixed preparation identity. A separate owned cleanup may reconcile that effect;
it cannot change the original result or falsely label its cleanup successful.
The public Core API exposes whole-journal recovery, not the private
`recoverNativeAttempt`. Copying that implementation into Buster is rejected.

## Proposed single recovery hook

Extend `recoverNativeWorkerAttempts(journal, owner, reconciliation?)` with one
optional typed capability. Existing callers omit it and keep current behavior.
Approved narrow capability shape:

```ts
interface NativeCleanupReconciliation {
  readonly journal: NativeAttemptJournal;
  readonly cleanupProfileDigest: string;
  reconcile(input: Readonly<{
    envelope: WorkerAttemptEnvelopeV3;
    result: WorkerAttemptResultV3;
    ownership: WorkerOwnershipRecord;
  }>): Promise<WorkerAttemptEnvelopeV3 | null>;
}
```

The supplied journal is the separate cleanup-attempt journal. The callback may
launch the fixed role cleanup operation and return its accepted envelope. It
cannot supply an arbitrary result, return `true`, un-fence an owner, replace the
original result, or ask Core to skip a record. `null` keeps the failure fenced.
Core reads the sealed cleanup result itself and validates both native identities
using the same fixed owner passed to recovery. The callback cannot select an owner.

The cleanup envelope contains a strict `operation.values.reconciles` reference:
original attempt ID, attempt-spec digest, profile digest, claim ID/generation,
worker ID, result digest and complete receipt ID/digest. It additionally binds a
role-owned `effectsDigest`. Core validates the immutable identity relationship;
Buster validates the actual source lease, publication state and filesystem effect.
A cleanup envelope cannot reconcile itself or another cleanup operation. A
successful cleanup must have independently accepted budgets, completed result,
successful cleanup and disposed, unpopulated ownership with final observations.
Missing/abandoned ownership without positive quiescence is not enough.

## Durable proof and capacity requirement

Independent design review selected the smaller composition: the original sealed
result, separately sealed cleanup result and pre-reserved root-owned Buster ledger
association are the proof. **No new generic Core reconciliation stream or journal
schema is proposed.** Before launching cleanup, Buster atomically records the
exact original identity/effects digest and complete cleanup envelope under its
publication/compaction fence. The same ledger's accepted slot reserves the bytes
for that terminal association; cleanup-journal metadata and total-byte capacity
must also admit the exact request and terminal projection before deletion.

The callback returns the same recorded cleanup envelope on replay. Core reads
both sealed results and verifies their ownership and binding on every recovery;
the role ledger cannot substitute a success flag for missing evidence. It rejects
a foreign cleanup profile using the capability's exact `cleanupProfileDigest`.
The cleanup contract/input schema and result schema are fixed reconciliation
identities, and the result must bind the digest of the full reconciliation input.
Core requires an archived cleanup process with no fault, matching final owner
counters, and completed cleanup; merely returning a business `completed` state
is insufficient. Callback inputs are detached snapshots; callback mutation cannot
change the original Core envelope, result or expected ownership identity.

Buster retains the full source reservation until Core has validated the proof.
Only after successful recovery may the parent commit released source capacity.
A crash between these steps keeps capacity charged and is idempotently replayable.
A crash after physical deletion but before cleanup sealing stays fenced unless
the same accepted cleanup can be positively recovered. ENOENT alone never creates
a completed result. Failure cannot recursively authorize cleanup of cleanup.

## Buster authority is narrower than Core mechanism

Only unpublished preparation allocations are eligible. Root's source ledger must
still show the original reserved, unpublished admission. UID1000-writable service
metadata is not authority for this check. The publication/compaction fence spans
the eligibility check through deletion; a published root-ledger reference is
ineligible even if the service's private index is empty. The preparation directory is beneath root-controlled ancestors, writable only
by the dedicated preparation UID, and contains an owner marker binding admission,
original attempt spec, claim and generation. The cleanup command and roots are
fixed by the parent; the child cannot choose an executable, UID, path or scope.
Unknown/preexisting directory identity, a missing owner marker, a published source,
foreign reference or unproven old service activity remains fenced. The directory
must not be deleted merely because the original host exited.

Cleanup runs only after actual original ownership quiescence and within a new
native ownership lifetime. Its accepted input binds original directory identity,
marker digest, unpublished ledger CAS digest and original receipt. It rechecks
these conditions before deletion. A crash after physical cleanup but before its
receipt is sealed does not make absence sufficient proof. Retry/recovery must
prove the original cleanup ownership and its durable input; if its outcome cannot
be established, preserve the unresolved intent and fence rather than fabricate a
successful cleanup result.

## Preimplementation criteria

| ID | Required evidence |
| --- | --- |
| RC1 | Original envelope, result and receipt bytes remain unchanged. Exact spec/profile/worker/attempt/claim/generation/result/receipt binding is required. Unknown keys/versions and each foreign binding fail closed. |
| RC2 | Core requires positive terminal quiescent ownership for both operations. A missing, live, reused or foreign scope cannot be reconciled. The no-hook path behaves exactly as before. |
| RC3 | Cleanup comes from its independently accepted envelope and sealed journal result, not callback-supplied success. Missing, failed, cancelled, self-referential and replayed foreign cleanup are rejected. |
| RC4 | Durable intent/proof uses bounded reserved record/byte capacity; concurrent duplicates are idempotent and conflicts fail. Crashes before intent, after deletion, after cleanup seal and around proof rename retain recoverable exact identities. No quota escape. |
| RC5 | Actual Buster unpublished-source checks reject published references, unknown owner markers, changed CAS, preexisting directory sentinels and service UID tampering. No recursive deletion before original tree quiescence. |
| RC6 | Existing original recovery/journal/ownership tests and meaningful negative controls remain. Distinguish real kernel proof from storage/protocol fixtures; no native pass from faked ownership. Fresh nonauthor review is mandatory. |
| RC-DOC | Document the limited source-only authority, immutable original failure, separate cleanup budgets, recovery procedure and every retained uncertainty. Generic external effects remain fenced. |

Approved Core touch list: `native-attempt-recovery.ts`,
a small `native-cleanup-reconciliation.ts` binding validator/type module, and
`src/index.ts` type exports, plus original recovery/journal tests. No journal
storage schema change is requested. If terminal metadata reservation requires
a journal change, report that dependency separately before editing. Buster owns the source
eligibility callback, fixed cleanup host operation and ledger binding tests.

Implementation assignment was approved by the parent within the existing user goal;
no new user approval is pending. The separately reviewed journal terminal-capacity
prerequisite remains required before any destructive Buster cleanup admission.


## Core implementation checkpoint

The optional capability is now implemented in Core. Existing callers omit it and
keep fencing admission on failed cleanup. A supplied capability fixes the cleanup
journal and profile before invoking the callback with detached inputs. Core
independently reads the original and cleanup ownership records, the cleanup
journal's sealed result and its archived output. Both owners must be disposed
with positive final unpopulated observations. Missing, live, foreign or abandoned
ownership cannot authorize recovery. The callback runs outside the original
attempt stripe and cannot replace the original failed result.

The fixed operation contract is `kubeclaw.native-source-cleanup@1`, with
`native-source-cleanup-input.v1` and `native-source-cleanup-result.v1` identities.
The exact input contains `reconciles` and `effectsDigest`; the reference binds the
full envelope digest, attempt/spec/profile/worker/claim/generation, result digest
and complete receipt. The result binds the digest of that complete input. No
extra keys or alternate operation identities are accepted. The existing journal
schema is unchanged.

A draft review found that checking a sealed success and a quiescent process
separately would allow them to disagree. The implementation therefore uses the
original executor finalizer to reconstruct the result from archived stdout,
measured counters, durable acceptance time and archived completion time. Its
result digest must match the sealed result. This rejects invalid process output
and independently fabricated accounting despite a superficially valid success.
The original receipt remains byte-for-byte unchanged.

The maintained tests use real durable journals, GNU flock, output spools and
sealed bytes, with explicitly modeled ownership records. They are protocol and
filesystem evidence, not cgroup or deletion proof. Coverage includes original
no-hook behavior, successful repeated recovery, callback input detachment,
original stripe release, missing results/owners, live owners, foreign profiles,
unknown keys, invalid stdout, different accounting and every reference field.
The initial fixture accidentally shared a mutable profile between its two inputs;
that failed run remains preserved. Independent input clones fixed the fixture.
An initial TypeScript failure from mutating readonly fixture fields is likewise
retained; replacement records preserve the production type contract.

This checkpoint does not implement Buster's eligibility, publication fence,
source marker/inode checks, retained-capacity release or crash reconciliation.
Those RC4/RC5 responsibilities remain with the role and require their own actual
integration tests. No existing failure is declared reconciled from Core-only
checks, and no B1/IFR16 or complete RC acceptance is claimed.

Author verification passes all 30 cases (24 reconciliation cases and six
unchanged original journal cases), native TypeScript and canonical scoped lint.
A private loader removes only the archive/result equality check: both invalid
stdout and different-accounting cases then fail with missing expected rejection.
The exact runner, exit statuses, initial failures, final logs and frozen source
snapshots are in `../../evidence/native-source-cleanup-reconciliation-20260921/`.
Fresh nonauthor review accepts this bounded Core change after repeating all 30
maintained tests, six independent probes, types/lint and two semantic negative
controls. RC4/RC5 and full Buster acceptance remain open.

Fresh review also identified that the initial modeled owners shared a scope name
and binding, an impossible state in the validated real store. The fixture now
uses distinct valid scope names and inodes; the complete 30-case run, types, lint
and negative control were repeated successfully. Prior logs remain preserved.
