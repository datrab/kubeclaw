# Independent Adapter dependency identity review

Status: independently approved for the bounded Adapter dependency package at
source fca25ae66dc360560b44f40f2f4444e259a4d301. This is not an integration or
overall finding completion claim. PCR-SDK-001 remains open: this package cannot
close all remaining persistent JSON domains.

## Fresh source and exact scope

Reviewer restored a separate checkout at local143b0cf9d73572f61687f85c6c3c886bad8e7278
and freshly read remote4627f01fe532d3dd890b7c8f93df40ae59547071. All3354 remote
blobs, modes and types match exactly. Mandatory resume documents, current
register, original SDK finding and baseline register were read remotely; exactly
47 original `implementiert` IDs match partial-47-scope.json. The two archived
original dependency producer files were recomputed and matched fresh remote
Git blob hashes. Historical probes use checkout-contained sources/dependencies,
not old local Git objects.

## Source review

The implementation preserves the shared Core, original registered adapters,
EffectCoordinator, FileEffectJournal, resource locks and native HTTP transport.
New child keys explicitly select portable UTF16 identity and bind the complete
subject, actual parent invocation/attempt or activation owner, and delivery ID.
Legacy replay selects original persisted keys by exact causal owner and request
facts; it does not guess collators or infer this version from an unrelated
portable parent ID. The registry's parent-invocation.v1 boundary stays unchanged.

The original canonical contract now owns real resource identities and the exact
bounded historical adapter-key grammar. Scoped activation and delivery fields
preserve the original producers without broadening global opaqueId, normal stage
attempts or observer delivery IDs. Generated types remain derived from that
contract. No shadow manual request validator remains. Original capability URL,
path and grant checks remain authoritative. Owned clones preserve HTTP body
insertion order; identity serialization does not rewrite actual wire payloads.

Independent review found and rejected a causal-index defect in author789c42f:
moving parent acceptance after its actual child completed was incorrectly
accepted. The correction records acceptance position and requires it before
child request. The failing genuine HTTP/SIGKILL/rehashed-journal evidence remains
in run5-adapter-independent-causal-before.txt; the same assertion passes after
the correction. Foreign attempts cannot hide behind a different subject index,
foreign adapter receipts reject, and unknown portable key versions cannot cause
a fresh key allocation. Corrupt/ambiguous/orphan histories fail closed.

## Evidence completed before final receipt-write check

- Combined independent/original suites:20/20, zero skips, exit0 on53640e0.
  This includes18 genuine receipt-corruption vectors,8 causal/owner history
  mutations, actual failed503 and POST-before-response SIGKILL recovery,
  historical two-locale ambiguity, and competing native producer processes.
- Historical producer countercheck makes2 identical POSTs across locales;
  legacy-to-current and current-to-current recovery keep exactly1 POST, original
  journal prefix and wire bytes. Actual long delivery and maximum activation
  producers also retain1 POST over cross-locale restart (registered2 tests,
  four historical/current combinations). Activation deliberately crashes again
  after ready; this proves dependency replay, not completion of an active run.
- Unknown portable key version with a separately valid changed subject rejects
  without HTTP or journal mutation; its additional3-test suite passes.
- Original ArtifactStore/FileEffectJournal JSON negatives and source/snapshot
  versions pass. Canonical generator check, complete Nova/Foundation typechecks
  and focused original-config ESLint pass.
- Original archived project producer executes source-preflight and blueprint;
  original unfixed CLI still rejects graph mismatch, while current CLI recognizes
  the original terminal run without journal mutation. The separate test-fixture
  hook correction and before/after proof are documented in
  run5-legacy-cli-fixture-order.md. This does not claim external provider execution.

## Final approval

The final canonical receipt gate validates the accepted JSON domain before Ajv
and before persistence/acknowledgement. Synchronous receipt construction throws
known malformed-result failures into the original adapter failure path. Actual
journal/audit persistence remains asynchronous and is returned unchanged; it is
not awaited into that catch and cannot be reinterpreted as a known failed effect.
Review rejected the intermediate broad/conditional return-await variants for
precisely this uncertainty risk. The final fca25ae split preserves that boundary.

The entire combined suite was independently rerun on this exact final source:
**28/28 passed, zero skips, exit 0**. It includes the prior replay/causal/owner/
version cases, both registered boundary tests, and five real registered adapters
which perform HTTP then return array/null/sparse/nonfinite/getter results. None
is acknowledged or stored as malformed completed JSON. Each has one valid failed
receipt, no getter execution and no repeated HTTP after reconstruction. The
standard canonical generator, complete Nova/Foundation typechecks and focused
original-config ESLint all completed again with exit 0. The original archived
project producer/current CLI probe also completed again with all unchanged
assertions and exit 0 on fca25ae.

Final raw evidence: run5-adapter-independent-complete.txt (full command and
28-test output), run5-adapter-independent-types-lint.txt, and
run5-adapter-independent-cli-complete.txt under docs/review/evidence. Earlier
before failures and incremental proof outputs remain preserved. No mocks,
native gate substitutions, deployment, CI or production changes were used.

Next action: Root integrates reviewed source and additive independent tests/
evidence against a freshly read remote head, then repeats affected checks after
any overlap, especially the canonical schema. Do not alter the global finding
status to verified solely from this package. The exact frozen 47 remain the
overall scope; other SDK consumers and their original gates remain separate.
