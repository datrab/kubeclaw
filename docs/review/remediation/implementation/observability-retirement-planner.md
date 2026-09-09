# Read-only observability retirement planner

PCR-OBS-002 remains partial/open. The new operator script inventories an explicit
run/store scope and explains why retirement cannot execute. Every result has
`executable: false`, `releaseBytes: 0`, and retains every file/reference. There is
no delete, archive, compaction, quota change, writer lock, store initialization or
Clawdeck acknowledgement operation. Final project material remains under D07.

## Invocation and scope

With repository dependencies and the provisioned Node toolchain available:

```bash
node scripts/observability-retirement-plan.mjs /absolute/operator-scope.json
```

The scope file is operator-supplied JSON, limited to 1 MiB. Its shape is:

```json
{
  "schemaVersion": "observability-retirement-scope.v1",
  "runId": "run:actual-run-id",
  "novaStorageRoot": "/absolute/configured/nova-storage",
  "artifactRoots": ["/absolute/configured/artifact-store"],
  "telemetryRoots": [],
  "busterStores": [
    {
      "root": "/absolute/configured/buster-job-store",
      "runtimeRoot": "/absolute/configured/buster-runtime"
    }
  ]
}
```

These are placeholders for actual configured roots, not discovered installation
paths. Empty arrays are explicit scope declarations; they do not prove that no
other relevant store exists. Unknown top-level scope fields are rejected,
including invented consumer acknowledgements or project-deletion flags. Optional
`inventoryLimits` sets positive integer `maximumFiles`, `maximumTotalBytes`, and
`maximumSnapshotBytes`; defaults are 10,000 inventoried paths, 256 MiB hashed bytes,
and 32 MiB per parsed snapshot. Traversal depth is bounded at 64. A limit produces
an explicit incomplete-inventory blocker, not truncation presented as a complete
plan. These are inspection bounds, not the deployment's runtime storage quotas.

Exit zero means that a metadata report was generated, never permission to retire.
CLI input failures exit one with structured `code`, `operation`, `file` and
`noDataChanged` diagnostics. Known scope/identity/limit and filesystem codes stay
explicit. Malformed scope JSON reports `SCOPE_JSON_SYNTAX_INVALID` with the scope
file context, without the parser's source excerpt. Unknown failures retain a safe
fallback code. Store JSON failures similarly identify the affected store through
the blocker subject, and legacy scan limits retain `LEGACY_SCAN_BYTE_LIMIT`.
The report contains canonical roots, file byte sizes and SHA-256 values, journal
heads/counts, the pinned run snapshot digest, shared durable record sequences and
payload digests, hashed idempotency keys, artifact/evidence references and concrete
blocker identities. Diagnostic payloads, result bodies, credentials and exception
excerpts are excluded. File paths and run/job/artifact IDs remain operator metadata.

## Existing boundaries used

The actual Nova `runRoot()` resolves the v2 run-ID hash and verified legacy
identity. Root components are checked before legacy identity reads. The original
resolver now accepts an optional positive `maximumLegacyBytes`; only this planner
supplies the smaller of its total-byte and snapshot-byte limits. The original
legacy parser checks the opened regular file with `O_NOFOLLOW`, limits actual
reads, and rejects growth beyond that budget. Existing callers retain their
original behavior. Root and traversed directory device/inode identities are
pinned and checked again before reads and the final rescan. Promoting a root from
identity-only registration to full scanning also enables its final rescan. The planner
inventories the selected run, declared shared stores, and Buster job directories
derived from stored job IDs. It does not scan all sibling Nova runs or Buster
runtime directories. Buster selection binds `job.plan.runId`, request digest,
`jobId`, and the original `remotePlanJobId(idempotencyKey)` function to the shared
job record. It inspects persisted metadata; it does not re-attest or execute a
Buster job.

The existing pure durable-record validator is exported as
`assertDurableRecordReplay`; all three existing callers retain identical
validation behavior. The planner also uses the original admission and attempt
replay validators. Those validate stored identity, digest, sequence and reference
invariants; planner allocation is separately bounded by its inventory limits.
No runtime quota is inferred or certified from the inspection scope.

Nova journals are read as bounded byte snapshots and checked against the original
sequence/hash-chain format. The original canonical run-snapshot encoding verifies
the pinned snapshot. `FileJournal` is never constructed, because its constructor
can repair an incomplete append tail. No original store read method that creates
locks/directories or reclaims staging data is called. The CLI and helpers contain
no file mutation operation.

Reads reject symlinks/non-regular entries, keep byte/hash/stat identities, and
recheck the inventory for modifications. Changes, missing snapshots, malformed
JSON, corrupt replay envelopes and unknown references become blockers without
printing the offending content. This is a bounded, unlocked assessment, not a
transactionally consistent snapshot or a fence against a later writer. A future
executor must reacquire the real writer fences and revalidate the entire plan.

Waiting/active run boundaries, pending observer deliveries, unresolved external
effects, accepted/running/uncertain jobs, unconfirmed staged evidence, producer
gaps and quarantine remain protected. Artifact matching includes the owner run,
namespace, artifact ID and digest. Blobs shared with another stored run and
missing/mismatched artifact, evidence or effect-result bytes are explicit blockers.
Every plan also declares missing retirement authorization, unproven global scope,
unproven durable consumer completion, absent retained-archive proof and the
unimplemented release operation. Archive and consumer proof are conservative
requirements of this proposed release design, not additional user decisions in
D07 and not a ban on explicitly authorized manual log cleanup. A future writer
must distinguish ending local replay from deleting logs and preserving final
project material; this read-only planner authorizes none of those actions.
A producer ACK is never treated as a Clawdeck
consumer checkpoint. The planner cannot close the original quota-release defect.

## Verification

[Complete test output](../../evidence/observability-retirement-planner.txt) is retained.

17/17 tests pass: fourteen new planner tests and three existing observability replay
tests. New tests execute real temporary Nova pipelines with the existing native
Git repair-budget fixture, including success and a genuine repair-budget wait.
They use original durable record/blob-backed artifacts, admission and attempt
stores. Buster shared job metadata is persisted through its original underlying
record store; no live Buster service, cluster or provider execution is claimed.

The cases cover file/record/reference hashes and bytes, shared-run artifacts,
missing blobs, uncertain effects and job state, source snapshot identity,
unreferenced staged evidence, incomplete journal tails, corrupted metadata,
symlinks, bounded inspection, concurrent snapshot changes, unsupported authority
claims and actual CLI output. A distinctive secret canary in diagnostic/artifact
payloads never appears in the report. Recursive file inventories confirm no new
files, changed bytes or changed modification times after planning; an incomplete
tail is not repaired. Existing replay corruption/expiry behavior remains intact.

```bash
node --test tests/verification/reliability/observability-retirement-plan.test.mjs tests/verification/reliability/observability-replay.test.mjs
node_modules/.bin/eslint --config charts/kubeclaw/files/config/eslint.config.mjs scripts/observability-retirement-plan.mjs scripts/observability-retirement/*.mjs tests/verification/reliability/observability-retirement-plan.test.mjs
```

The original `check-nova-run-root.mts` consumer also passes. Real filesystem
regressions cover legacy rescan promotion, root and nested directory symlink
replacement, and a 2.25 MiB legacy journal under a 16-byte scan limit. Actual CLI
negative cases cover invalid scope fields/identity/version/limits, malformed JSON,
a scope file over 1 MiB, and the explicit legacy budget blocker; canary payloads
never appear in stdout or stderr.
Canonical lint for new JavaScript passes. The original legacy scanner retains
two existing `max-depth` lint violations, independently reproduced from `HEAD`;
this slice adds no new violations. No current installation data, cluster,
Clawdeck service or CI was accessed or changed. The three separately frozen
retention-policy documents were not edited by this implementation.

Exact scope: `scripts/observability-retirement-plan.mjs`,
`scripts/observability-retirement/files.mjs`,
`scripts/observability-retirement/journals.mjs`,
`scripts/observability-retirement/stores.mjs`,
`skills/nova/core/execution/run-root.ts` (optional bounded original legacy scan),
`skills/common/plugin-runtime/foundation/observability/durable-records.ts`
(only pure-validator export/rename),
`tests/verification/reliability/observability-retirement-plan.test.mjs`, and this
note. Safe retirement, tombstone/accept/replay integration and crash-recoverable
release require a separate reviewed implementation.
