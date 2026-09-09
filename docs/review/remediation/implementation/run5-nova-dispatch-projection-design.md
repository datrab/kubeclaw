# Nova dispatch archive projection: design checkpoint, not implemented

Fresh source: remote `4627f01fe532d3dd890b7c8f93df40ae59547071`, local
`143b0cf9d73572f61687f85c6c3c886bad8e7278`; every remote tree blob, mode and type
was compared with the new isolated checkout. Current remote resume README,
work items, package checkpoints, root checkpoint and register were read anew.
The original 47 IDs from `c38779c71bb92bc15c3fcb89930348e5417aa475` match
`partial-47-scope.json` exactly. PCR-OBS-002 remains incomplete.

## Existing authority and duplicate

`FileNovaRemotePlanStore.persistBeforeDispatch` writes the complete v1 job,
including base64 archive, before writing identical bytes to its immutable
BlobStore. `load` currently reconstructs a missing blob from that full record.
Production composes sibling `dispatch` and `imports` stores under its configured
`stateRoot`, which need not be inside the canonical Core run directory.

`FileNovaGateImportStore.record` stores the complete original request digest,
source plan/stage/revision, result, decision and evidence digest set. Completion
is a CAS after all evidence blobs are written. Its public production composition
can operate without Core's run mutation fence. Therefore that fence alone is
not sufficient authority for a concurrent manual dispatch transition.

`readVerifiedResult` is not sufficient for this transition: it selects the passed
subset and does not load every evidence byte. The importer already contains
the original result, node, attempt, receipt, coverage and decision verification.
Retained-import verification must reuse those checks, bind the complete original
job/request/source, and read all result-referenced evidence through the original
bounded BlobStore reader. Do not fabricate a missing stored status envelope.

## Proposed narrow operation (awaiting final fence approval)

1. Explicit operator scope binds canonical Nova storage/run root, configured
   dispatch/import roots, original store and inventory limits, exact original
   job/request, dispatch payload CAS digest, import payload digest, current run
   journal head and snapshot digest, operation ID and actor.
2. Acquire original run mutation fence. Inventory the actual run and require a
   terminal lifecycle, no waiting continuation, no uncertain external effect,
   intact original snapshot/journals and unchanged explicit head/digest.
3. Hold the import RecordStore's original writer fence while verifying its
   actual complete payload and retained evidence. Proposed minimal original
   Store API: a read callback under its existing writer lock; normal reads use
   the same implementation. The owning import API invokes only the scoped
   dispatch operation while that import fence remains held.
4. Dispatch reads its exact current original job and existing immutable archive.
   Missing/corrupt blobs reject here even for a legacy full record: this manual
   operation is not the v1 metadata-before-blob crash-repair path.
5. Under the actual dispatch Store CAS/writer fence, a synchronous final
   authorization callback checks unchanged bounded inventory/source/import
   authority. Lock order is run → import → dispatch. No async-held synchronous
   journal lock, no reentrant read of a locked Store.
6. CAS to an explicitly versioned projected dispatch payload retaining the
   entire original job header, archive reference, and manual receipt. Charge
   the complete receipt/reference against the unchanged existing quota. Reject
   a transition whose actual net metadata saving is not positive.

Projected load reconstructs the exact original full request from the existing
blob and reruns canonical contract/digest/source binding. It must never repair
or invent a missing projected authority. Existing full-v1 load still repairs
the original metadata-before-blob interruption. Duplicate persistence recognizes
the projected original request; it must not append a new request or restore the
deleted redundant data into metadata. No archive blob or log is deleted.

## Required tests and limits

Before claiming the package reviewed: original Store/Core/HTTP consumers,
mixed active/terminal runs under small actual metadata quotas, exact replay after
restart without another external action, unchanged record counts and unique
archive bytes, old-v1 interrupted blob write, missing/corrupt/foreign blobs,
job/request/source mismatch, incomplete/missing evidence and import mismatch,
active/waiting/uncertain owner rejection, stale CAS, competing writers and actual
process death. Independent review and root rerun are still required.

This design is not implementation or a passing test. Only duplicate metadata
bytes may be released; job-record count and unique source/result/evidence bytes
remain retained. Broader PCR-OBS-002 connected retention remains open. No native
Kubernetes/provider execution is invented as a gate for this narrow transition.

Next action: root approve or revise the import-fence primitive; then implement
the coupled persisted variant, original replay/import consumers, operator and
genuine regression tests as a small checkpoint on the isolated repair branch.
