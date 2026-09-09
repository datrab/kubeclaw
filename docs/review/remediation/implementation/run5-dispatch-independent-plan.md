# Independent review plan: Nova dispatch metadata projection

Status: design inspected, implementation not yet frozen or approved.
Reviewer base is fresh remote `5a437c726646d75d5500c23504ee3a3540547c3f`,
exact local tree `40dc8749ff19eaf136ddfb1fa3ae18d9ed416289`.
Mandatory current remote resume documents, register PCR-OBS-002 and archived
design `1cd953bd689c08ada97b5cbf359bc92abb9ed4ae` were read again.
No uncommitted author code or dispatch projection has been adopted.

## Original contracts that constrain review

- Dispatch v1 stores the entire original job before its immutable archive blob;
  its original load can repair a missing blob from full recorded bytes. A new
  projected record must never use that repair behavior to invent lost authority.
- Import complete means its original record CAS happened after actual evidence
  writes. The record does not persist the transient status envelope. The owning
  completed-result and decision checks must be reused without manufacturing a
  historical status. Full result/node/attempt/receipt/source/decision bindings
  and every referenced artifact byte must be verified, not a passed-only subset.
- Production dispatch/import roots are configured siblings and can lie outside
  the canonical Core run. Run mutation fencing alone therefore cannot authorize
  import/dispatch store transitions. Required order is run → import → dispatch,
  with immutable owned inputs and final synchronous checks under the actual CAS.
- Equal, nested, nonregular and symlink-aliased store roots must reject before
  locks; no reentrant same-store read inside its writer fence. External store
  reads must remain bounded before allocation, not only during later inventory.
- Reference and manual receipt bytes remain charged. Release only the duplicate
  embedded archive bytes: retain original job semantics, count, unique blobs,
  import/evidence history, original request digest and all replay authority.

## Genuine acceptance matrix to run after a source freeze

1. Small real metadata quotas with terminal and active runs: release a positive
   measured number of bytes only for confirmed terminal work; active/waiting/
   uncertain owners and changed run heads/snapshots reject without mutation.
2. Original Git archive, Buster HTTP/service result, Nova import and Core terminal
   checkpoint. A genuinely completed errored result is valid confirmed history
   only if the original producer emits the non-null complete result/evidence,
   the importer accepts its exact error decision, and replay preserves it.
   A null result remains rejected. No synthetic successful provider or claim of
   native provider acceptance from an execution failure is allowed.
3. Original dispatcher/import consumers after restart: identical full job and
   archive, exact original result/decision, no repeated external action or
   reinserted metadata, duplicate projection unchanged, conflicting intent/CAS
   rejected. Legacy metadata-before-blob interruption still recovers normally.
4. Actual missing/corrupt/nonregular/oversize/foreign archive or evidence, changed
   job/request/source/result/decision, pending/missing import and duplicate
   references reject. Explicit fixture vectors are only contract negatives,
   not native execution evidence.
5. Original run/import/dispatch writers in separate processes, overlapping
   stores/aliases, actual process death before/after durable transition, stale
   CAS and restart; no lock stealing or mocked filesystem/transport acceptance.
6. Original consumer regression suites, current shared-runtime/Nova typechecks,
   unchanged canonical lint and independent source comparison before approval.

This plan establishes no passing implementation test and closes no finding.
The separate original BlobStore reader repair has its own independent 55-case
review; that is a prerequisite, not proof of the dispatch projection.
Next: receive a coherent frozen author source/test fixture, apply only that
scoped delta into this independent checkout, and execute the matrix above.
