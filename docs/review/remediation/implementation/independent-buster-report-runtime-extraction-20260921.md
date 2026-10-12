# Independent review: Buster report runtime extraction

Accepted for RR1–RR5 and RR-DOC at the captured source state. The reviewer did
not implement this extraction. No introduced defect or weakened assertion was
found. This is approval of the bounded responsibility split and its canonical
lint cleanup, not complete Buster execution or native ownership acceptance.

## Source and behavior review

The package module preserves sorted traversal, registry-compatible hashing,
2,048-file / 64 MiB / 30-second bounds, no-follow/nonblocking opens, the extra-byte
change check and descriptor closure. The single-file helper returns only after
closing its descriptor. Accounting now happens after that successful return;
a failed read or close still rejects the entire operation and cannot expose a
partial package result. Snapshot creation flags, modes and cancellation checks
are unchanged.

The artifact-reader module preserves root admission, URL/digest/limit validation,
opened descriptor versus path identity, size checks, bounded reading and digest
verification in the same order. Its helper retains the extra-byte growth check
and cancellation reason identity. The original runtime module re-exports both
public reader names, so callers do not need a second API migration.

The runtime's source-reading method still revalidates a storage driver's bytes.
The local result-binding helper applies authoritative registration and artifact
identity before schema/detail validation and clone/freeze, exactly as the former
inline block. It is not another public API. The old inline package/reader/result
bodies are removed; the new module interfaces are small and cohesive.

Manual comparison and the rerun preservation checker confirm that `adapt`,
`#run`, root identity checks, limits, runtime paths and the cleanup catch/finally
remain unchanged. Own-deadline identity classification remains distinct from
caller cancellation, including identical error text. An unconfirmed process
cleanup still retains its snapshot and preserves `ProcessInputCleanupError`.
This review does not claim transactionally cancellable filesystem I/O.

## Independent execution

Evidence: [buster-report-runtime-independent-20260921](../../evidence/buster-report-runtime-independent-20260921/).

| Check | Result |
| --- | --- |
| Original actual runtime and JUnit adapter tests plus four real-filesystem package tests | 6/6 pass, zero skips; actual isolated JUnit adapter parses two cases. |
| Canonical lint for entire changed runtime, both new modules and new test | Exit 0; no lint exceptions added. |
| Buster engine TypeScript | Exit 0. |
| Prior independent deadline harness rerun on current production code | Three probes pass: both abort orderings and cleanup-failure snapshot retention. |
| Independent reader differential probe | Ten cases match pre-extraction results, error identity, open flags, read calls and descriptor closure; package digest/order also match. |
| Descriptor-closure negative control | Private mutant removing close is detected on digest rejection. |
| Author source-substitution mutation rerun independently | Unchanged original actual adapter test detects the child-supplied `artifact:fake`. |
| Frozen source verification | All six author source/document hashes still match after execution. |

The differential probe exercises real files, including successful reads, invalid
limits, digest/size mismatch, forbidden paths, symlinks, caller abort, and file
growth/shrinkage injected at descriptor read. Its observation wrapper delegates
to real file handles; growth/shrinkage and the descriptor mutant are declared
controls, not claims about naturally occurring races. The deadline harness runs
real child cleanup before injecting a settlement delay or cleanup error. Its
error injection is not proof of an actual failed kernel drain.

Raw outputs are `tests.txt`, `lint.txt`, `typecheck.txt`, `probe.txt`,
`reader-probe.txt`, `preserved.txt`, `mutant.txt` and `mutant-status.txt` in the
evidence directory. `reader-probe.mjs` and `run-source-mutant.py` retain replayable
controls. `source-identities.json` and `additional-source-identities.json` bind
reviewed code, original test bytes and the preserved baseline/probe sources.
These selected snapshots are not a complete dependency archive or reproducible
build claim. Silent successful commands have their exit status in `run-status.json`.

## Documentation and scope

The architecture note names the new production modules and the retained runtime
responsibilities. The implementation record explains descriptor accounting,
cleanup/deadline preservation, test scope and native limitations. Neither claims
that this extraction closes broader runner failures, fixture lifetime, capability
accounting or native whole-attempt ownership. Original tests were not edited by
this change; no production source or test was edited by this reviewer.
