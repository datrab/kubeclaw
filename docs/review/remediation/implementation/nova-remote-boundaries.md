# WP03 — Nova remote gate loopback and durable store quotas

PCR-NOVA-GATE-003/004 implemented and independently reviewed. Source baseline
85ddfcbf; this note does not close the separate end-to-end deadline findings.

The SPIFFE transport and adapter now share one explicit loopback classification.
Node URL canonicalization emits bracketed IPv6, so `[::1]` is accepted. The
previous allowed IPv4 host remains exactly `127.0.0.1`, alongside `localhost`;
other 127/8 addresses, IPv4-mapped IPv6 and remote hosts are still rejected.
Bearer authentication and the separate HTTPS/plaintext policy are unchanged.

The dispatch blob store receives `maximumArchiveBytes` as its individual-object
bound and `maximumArchiveStoreBytes` as its total bound. The evidence blob store
receives the total quota as its third argument as well as its maximum possible
single-object size. The importer already imposes the separate, potentially
smaller per-job evidence budget. This uses Foundation's original serialized
quota check and digest deduplication, with no new quota counter or cleanup policy.
Over-quota writes leave earlier blobs readable. A pending import is not exposed
as a completed execution graph and can resume after sufficient capacity exists.
No logs/history are deleted to make space; D07 remains in force.

## Actual verification

Before product changes, the original archive probe measured **458 bytes** of
unique blobs despite a **230-byte** store quota. All three new tests failed
against unchanged product sources: bracketed IPv6 rejected, second Git archive
accepted and second HTTP evidence import incorrectly completed.

After changes:

- `node --test tests/verification/reliability/nova-store-boundaries.test.mts`:
  all three pass. Actual committed Git archives, original dispatch/import stores,
  original HTTP transport, result digests and artifact identity checks are used.
  HTTP serves contract-valid result fixtures and evidence; it does not simulate
  or claim execution by Buster. The fixture builds contract data, not replacement
  store, importer, transport or engine implementations.
- `node tests/verification/contracts/check-pipeline-remote-result-import.mts`:
  original seven decision cases pass, including canonical graph replay.
- `npm run typecheck --prefix skills/nova`: passed.
- Canonical ESLint passed new fixture/regression, secure-endpoint and adapter.
- Independent reviewer repeated all three tests and additionally verified two
  concurrent peer blob stores: only one distinct 6-byte write fits a 10-byte
  total quota; duplicate writes and reads remain valid. Expanded IPv6 normalizes
  correctly, while remote/lookalike hosts remain denied. The original HTTP import
  resumes the pending second job after reopening with a larger test quota,
  producing two graphs and the correct retained bytes.

No filesystem-full injection, process power-loss, production SPIFFE proxy or
complete Buster process test was performed. Constructors validate configuration;
this is not a network IPv6 listener test. Raw lint of remote-dispatch, remote-result-import and the Core index reports
18 existing complexity/depth/length diagnostics in the first two files. These
small wiring changes do not alter those functions; this is not a complete lint
pass. The forthcoming deadline work will touch these implementations separately. Whole-pipeline acceptance,
remote deadlines and the process-restart test update remain separate work.
