# PCR-OBS-002 — imported Attempt result projection

Status: **independently approved narrow package; root integration pending; overall
finding incomplete**. Independent review `ab18293` reran 19/19 cases with zero
skips against author checkpoint `30e6a4d`, including five independent cases.
See `run3-attempt-result-independent-review.md`; the historical failing mutex
probe is retained separately in reviewer checkpoint `e809c74`.
Run `20260909t2146`, source/test checkpoint `0d8fb58` (production
source `6ee3f37`). The starting WIP was read from remote checkpoint
`8862643bd0def10004a0f43b743bbfc2d8d19be9`; all twelve affected Git blob identities
matched the isolated local cache at `768fde8`. No prior checkout or uncommitted
work was modified or copied.

## Scope and retained authority

An explicit persisted `durable-attempt-store.v2` replaces only a redundant
WorkerResult payload with an exact, bounded reference to the original Nova
reconciliation journal's already imported result. Full completion intent,
ProducerRecord, ProducerClosure, evidence references and their original bytes
remain. Logical snapshots reconstruct the same complete result for original
Store, Admission-v2, Clawdeck, reconciliation and read-only inventory consumers.
No sidecar archive, invented acknowledgement, new retention period or log
deletion is involved.

References bind the canonical run root, result and record digests, run/snapshot
checkpoint, attempt/generation, journal sequence/hash and exact immutable prefix
length. The entire required prefix is hash-chain validated with bounded regular
file/no-follow reads. Foreign owner, non-imported decision, incomplete closure or
changed payload cannot supply a result. All retained metadata remains charged
against the unchanged metadata-byte limit; only resident result payloads count
against the resident-result-count limit. Every subsequent store write preserves
the compact representation, including evidence reclamation.

## Fencing correction found by independent review

The saved WIP held a journal flock across awaited filesystem work. The reviewer
reproduced a same-process timeout: the original synchronous FileJournal appender
blocked the event loop while the async lock owner needed it to release its lock.
Merely changing asynchronous lock acquisition would not fix that original
appender interaction.

The correction removes the new async mutex API. Existing Run and Attempt locks
cover async completion/evidence validation. Only then does the original
synchronous journal flock cover final inventory/CAS/checkpoint verification and
the fully synchronous atomic replacement: exclusive temporary file, file fsync,
rename, directory fsync. There is no await inside that journal critical section.
Failure before rename preserves the original file; after a durable transition,
reopening reconstructs the original result and the same operation is idempotent.
The independent concurrent original-appender regression now passes; competing
retirements preserve the original run-lock refusal and retry semantics.

## Actual author evidence

`docs/review/evidence/run3-attempt-author-tests.txt`: **32/32 pass, zero skips**,
using these exact files from the current checkout and its workspace dependencies:

```sh
node --test tests/verification/reliability/admission-retirement.test.mjs tests/verification/reliability/observability-replay.test.mjs tests/verification/reliability/observability-retirement-plan.test.mjs
```

The projection fixture mixes a completed original Core/Git lifecycle with an
actual waiting Core/Git lifecycle and a two-resident-result quota. Its WorkerResult
inputs are explicitly constructed valid store inputs, not a live Buster/model
claim. Original NovaObservabilityReconciler supplies the actual complete import;
no fabricated import checkpoint substitutes for that call. Projection releases
**19,668 metadata bytes and one resident result slot**. A subsequent write admits
the third logical result; the fourth is again refused by the unchanged count
quota. The waiting run journal remains byte-for-byte unchanged.

The original result, duplicate Admission acknowledgement, complete Clawdeck view,
retained evidence and original `already-imported` decision survive reopen and
replay without reinsertion. Tests include stale store/run/snapshot CAS, conflicting
operation identity, missing/truncated/corrupt journal, FIFO/symlink authority,
actual waiting owner rejection, a real competing process holding the original
Attempt writer lock, SIGKILL of a pre-transition waiting operator, and SIGKILL
after the original operator's durable transition. The crash tests exercise real
processes and locks; they do not claim every instruction-level power-loss window.

`run3-attempt-original-consumers.txt`: original durable Attempt, Nova reconciliation
(20 workers), Clawdeck and 16 MiB journal-scale contract programs all exit zero.
`run3-attempt-static-checks.txt`: new/changed bounded modules and tests pass the
canonical repository ESLint config; both plugin-runtime and Nova typechecks pass.
These static checks are additional checks, not substitutes for the real tests.

`run3-attempt-existing-lint.txt` retains an explicit exception: the existing
`durable-attempts.ts` monolith has the same ten canonical lint violations at base
`147a9e0` and this package. Its existing file-size debt increases with the bounded
new method. No suppression, increased threshold or weakened test was introduced.
An initial lint invocation without the repository's explicit config failed;
the recorded checks use `charts/kubeclaw/files/config/eslint.config.mjs`.

## Remaining action

Integrate only the independently approved source against the freshly reread
repair-branch parent and rerun
affected tests there. Keep PCR-OBS-002 open: this package frees a redundant result
payload, not general RecordStore count, closure/evidence metadata, or logs. Those
finite stores still need their connected consumer-authorized retention contract.
Do not reinterpret this slice as automatic/global capacity recovery or permission
to delete retained evidence. No CI, deployment, production mutation, paid resource
or third-party message was used.
