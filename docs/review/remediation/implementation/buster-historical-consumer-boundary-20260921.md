# Historical import: consumer footprint and proposed verified source

Design inventory only, not migration acceptance. Nonempty V1 startup remains fail-closed. The unused chmod/chown-only seal routine was removed: it could neither revoke existing descriptors nor prevent an old root entrypoint from reopening authority.

## Actual result dependencies

| Consumer | Current authority | Required change for an immutable legacy tree |
| --- | --- | --- |
| `prepared-plan-store.ts` constructor and `complete()` | Writes new blobs beneath `stateRoot/results`; V2 records and admission locks also derive from the state root | Put all writable V2 state in a fixed sibling, proposed `/var/lib/buster-v2/plan-jobs-v2`. Do not create V2 children in immutable `plan-jobs`. |
| `prepared-plan-store.ts:result()` | Validates completed status, exact content digest, size and result identity; then calls `FileDurableBlobStore.get` | Preserve these checks. Permit a fixed legacy read-only blob source for imported completed records. Never call legacy `put`, retirement or compaction. |
| Foundation `FileDurableBlobStore.get` / `durable-blob-read.ts` | Only bounded reads, path/identity checks and content hashing; no mkdir, lock or write | Compatible with immutable results if read/traverse permissions are established before sealing. |
| `remote-plan-service.ts:evidence()` and `remote-plan-compaction.ts:readJobArtifact()` | Reads result references then original `file:` artifact URLs under `runtimeRoot/sha256(jobId)` | Retain those original paths and bytes. Sealing `plan-jobs` alone does not protect or migrate the separate runtime tree. Copying results does not copy referenced artifacts. |
| Historical store | `complete()` writes results; compaction mutates records; all transitions use original locks | Never instantiate it in the new service. It remains an owned import decoder/test producer only. |

Imported completed full records have historical input references; imported compacted records have explicit historical provenance and no input. The agreed V2 schema adds mandatory `resultOrigin`: `null` for non-completed records, `{kind:'v2'}` for new completions, or `{kind:'historical',importId,originalStoreDigest,originalPayloadDigest}` for already-completed imports. The reader selects exactly that provenance-bound source, with no ENOENT fallback. A missing, corrupt or unreadable blob fails closed. The legacy reader additionally requires the verified durable import receipt; provenance fields alone do not grant filesystem authority.

Original runtime artifacts remain at their existing storage URLs. Their retained bytes/entries must stay accounted under the existing runtime/evidence retention authority; importing the job record does not reclaim those files or reset their budget. No copy or new artifact catalogue is needed for unchanged paths. The actual stop/seal inventory must state whether it covers this separate tree; the plan-jobs seal alone does not.

Result quota must include retained legacy bytes when applying the existing aggregate result budget. A sibling namespace must not silently reset the quota. The external inventory supplies verified aggregate bytes/entries; no per-job full-tree scan. Existing metadata admission must likewise retain all original bytes in accounting.

## Initial descriptor alternatives (superseded by the fixed choice below)

The importer should accept a verifier-created value, not deserialize request data as this authority:

```ts
interface VerifiedHistoricalSource {
  schemaVersion: 'buster-verified-historical-source.v1';
  transactionId: string;
  receiptDigest: string;
  sourceKind: 'sealed-copy' | 'immutable-original';
  originalStore: HistoricalImportDescriptor;
  retainedStore: { device: number; inode: number; bytes: number; digest: string };
  retainedTree: { device: number; inode: number; inventoryDigest: string;
    bytes: number; entries: number; resultBytes: number; resultEntries: number };
}
```

No path, `ok` or caller-supplied stop boolean. Fixed source selection is implementation-owned: an immutable original at `/var/lib/buster-v2/plan-jobs`, or a sealed copy at `/var/lib/buster-v2/historical/<transactionId>`. Validate the transaction ID as a fixed-format identifier before deriving any path. The complete external receipt separately binds workload/container/cgroup/boot/mount and enduring restart-exclusion authority. The verifier checks receipt ownership, full inventory and the selected kernel fence before returning this value; a TypeScript interface alone is not verification.

`originalStore` names the original inode/bytes. A copied `retainedStore` has its own inode but must have identical byte count and digest. Owned-host per-job JSON wires are explicitly reserialized derivatives with independent wire digests. The new V2 snapshot has its own real payload and snapshot digests. None may inherit the original inode or digest label.

A sealed copy alone does not prevent the old workload executing again. Until the external producer establishes an enduring cutover fence, neither descriptor variant authorizes import. The immutable-original option therefore has the smaller importer data footprint if the host proves whole-tree flags, trusted ancestors, actual quiescence and exclusion of capabilities capable of clearing/replacing the seal. It still requires sibling V2 writable state and preserved read access to legacy results and runtime artifacts. No producer or kernel proof is implemented by this proposal.

## Chosen integration contract

The parent selected **immutable-original only**. The copied-snapshot alternative above is retained as design history and is not a supported authorization mode. `preparation-historical-source.ts` now defines the exact read-only kernel observation separately from `VerifiedHistoricalSource`. The latter includes transaction ID, stop-receipt digest, original store identity, complete immutable-tree observation, and retained runtime-artifact inventory digest/bytes/entries. It has no path or boolean authority. No constructor currently produces it: the maintained host stop producer and consuming verifier remain necessary.

The actual writable target is derived by `preparedPlanStateRoot(legacyRoot)`; fixed production configuration yields `/var/lib/buster-v2/plan-jobs-v2`. Historical publication uses this sibling. Existing completed results have mandatory historical result origin; later completions have V2 origin. Legacy result access remains explicitly unavailable until the verified receipt is integrated. The current clean-store startup gate returns only when no legacy records directory exists; otherwise it refuses startup without bulk parsing V1.
