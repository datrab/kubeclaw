# PCR-OBS-002 — independent imported-result projection review

Decision: **approve the corrected narrow package for integration; the finding remains incomplete**.
Reviewed author checkpoint `30e6a4d` (production source `6ee3f37`, tests `0d8fb58`).
Reviewer used a separate checkout and workspace dependencies, not the author's
checkout. Fresh remote register `5c20fedaa8c679206eaad75af4bd0744038c557e` supplied
the original finding requirement. Fresh remote WIP
`8862643bd0def10004a0f43b743bbfc2d8d19be9` supplied the saved implementation;
all twelve changed blob SHAs were compared with the isolated starting source
`768fde8`. This is independent package approval, not a claim about a later merged
repair-branch head. Root must rerun affected tests after integration.

## Review outcome and actual evidence

The new persisted v2 format keeps the full original CompletionIntent, ProducerRecord,
closure and evidence metadata. It replaces only an already-imported redundant
WorkerResult with a bounded reference to the canonical reconciliation journal.
The reference binds run, plan/node, attempt/generation, original result and record,
journal sequence/hash and exact prefix length. Replay validates the chain and
original schemas before rebuilding the unchanged logical result. No synthetic
ACK, new worker implementation, remote deployment or new retention policy was
introduced. Generic foundation code remains below the Nova role-specific engine.

The v2 path remains centralized in read/write handling, including subsequent
evidence reclamation. Resident results use the existing result-count quota;
references, retained CompletionIntent and metadata still consume the unchanged
metadata-byte quota. This frees one resident result slot and 19,668 bytes in the
actual bounded store scenario; it is not unbounded history compaction.

`docs/review/evidence/run3-attempt-independent-tests.txt` records **19/19 passed,
zero skips**, from `node --test tests/verification/reliability/attempt-projection-review.test.mjs`.
That file imports the unchanged shared author fixture, which also registers its
14 original tests; the remaining five tests are independently authored. The count
does not double-count the nine parameter variations inside one test.

The 14 original cases include real Core/Git completed and waiting lifecycles,
the actual Nova reconciler import, Admission, Attempt, Clawdeck and inventory
consumers, unchanged duplicate replay, quota reuse, process lock exclusion and
SIGKILL before the transition or after its durable completion. WorkerResult
objects are valid explicit store inputs, not a live Buster/model execution proof.
No instruction-level power-loss coverage between every fsync/rename step is claimed.

Independent additions verify:

- A genuine later Nova reconnect decision appends to the original journal without
  invalidating the retained prefix. Deleting or corrupting the referenced history
  rejects logical reads and duplicate admission; the original outbox retains its
  delivery. Restoring the exact journal permits the original duplicate ACK, without
  another journal append or action.
- Nine validly rehashed negative checkpoint variants (foreign run, plan, node,
  attempt or generation; non-import action; next-generation claim; missing required
  or admitted closure) cannot authorize retirement and leave original store bytes
  unchanged. These are deliberate corruption tests, not counterfeit success proofs.
- Real expired orphan evidence reclamation preserves the compact representation
  and original logical result. A tightened genuine metadata-byte limit still
  rejects an oversized new resident result before changing store bytes.
- The existing run fence rejects the concurrent caller, then accepts unchanged
  replay after the first owner releases. No new queuing semantics are invented.
- An original synchronous FileJournal reader repeatedly acquires its real journal
  mutex during actual retirement's asynchronous filesystem preparation without
  starving the lock owner or timing out.

## Root-cause correction required during review

The saved WIP was **not approved**. Two original-kernel-lock probes reproduced
event-loop starvation: an asynchronous lock owner awaited IO while a second
synchronous flock acquisition prevented that IO from completing. Both another
asynchronous user and the original synchronous FileJournal appender timed out.
The exact failed probes and raw output remain in
`run3-attempt-mutex-before.mjs` and `run3-attempt-mutex-before.txt` under the evidence
directory. They target the historical WIP API, which no longer exists in approved
source; reproduce against the named remote WIP, not by restoring obsolete code
into the current branch.

The corrected source removes that new asynchronous mutex API completely.
Run/Attempt locks cover asynchronous source preparation. The original synchronous
journal lock then protects final inventory/CAS checks and the synchronous temporary
write, file fsync, rename and directory fsync. No await remains within that critical
section. The post-fix original synchronous reader exercises the same shared journal
lock as the historical failing appender. The approved test does not claim a new
asynchronous journal API.

An initial reviewer expectation that two concurrent retire calls would both queue
was incorrect: original `withRunMutationLock` intentionally rejects the second
same-process caller. `run3-attempt-review-initial.txt` retains that 17/18 run; the
corrected assertion requires the original rejection plus safe retry. No production
code or concurrency gate was weakened to accommodate it.

`run3-attempt-independent-static.txt` records the original phase7 journal program,
plugin-runtime typecheck and canonical focused ESLint commands, all exit zero.
The original phase7 test covers incremental append, same-size tampering, rewind
rejection and crash-torn tail repair, so parser extraction retains those tested
semantics. The existing durable-attempts monolith's ten baseline lint violations
remain disclosed in the author report; this is not a whole-repository lint pass.

## Remaining finding scope

PCR-OBS-002 asks for connected consumer-checkpoint retention under small real quotas
without replaying external actions. This package proves safe release of an already
imported result copy; global RecordStore counts, closure/evidence metadata growth
and general run/log retention are not solved. Keep the frozen finding open and
retain those next actions. No automatic deletion, broader retention authority,
cluster acceptance or full 47-finding completion follows from this approval.
