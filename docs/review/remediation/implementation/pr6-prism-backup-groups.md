# PR #6 — Prism database/artifact backup checkpoint

IFR-26-001 remains **incomplete**. This checkpoint removes the scheduled job's
database-only copy and automatic expiry, but does not claim full disaster recovery.

## Implemented production path

The existing Helm release now mounts one canonical Bash program from a ConfigMap.
It creates a private incomplete group, takes a custom PostgreSQL dump first, then
copies the content-addressed immutable artifact objects. Prism publishes object
bytes durably before returning their IDs; object publication is not overwritten
by later puts. Pending object files are excluded. Administrative artifact deletion
or restoration must not overlap backup capture. This is an object superset after
the database snapshot, not an atomic snapshot of every runtime directory.

The group contains `database.dump`, `artifacts/`, an exact sorted artifact checksum
index and metadata binding the application image. It rejects symlinks, invalid
object names and digest mismatches. Missing, extra or corrupt files in a published
group fail verification. A lock serializes backup, verification and SQL smoke
work; total duration, per-group bytes and retained bytes are bounded. `syncfs`
precedes publication and follows the rename. Incomplete work remains visible and
counts against capacity; there is no automatic deletion of previous backups.

The original weekly SQL restore check remains. It creates a unique disposable
database, uses `pg_restore --exit-on-error --single-transaction`, checks the original
Prism tables and drops only a database whose creation succeeded in that invocation.
It never pre-drops the old fixed `prism_restore_proof` name. An uncertain creation
or abrupt kill can leave a uniquely named proof database for operator cleanup;
it is not permission to delete unknown databases. Cleanup failure fails the job.
The separate integrity job requires no PostgreSQL credentials.

Old flat `.dump` backups remain untouched. New jobs consume only complete new-format
groups; old dumps remain database-only recovery material. The existing backup PVC
is retained. UID 1000 can read Prism's mode-0600 objects through a read-only source
mount. Limits and schedules live in the existing chart values/schema.

## Executed local evidence

Seven tests passed, without skips, in
`tests/verification/deployment/prism-backup.test.mts`. They use actual processes,
files, locks, hashing, copying, timeout/termination and Helm rendering. Original
`ContentAddressedArtifactStore.get` reads the restored objects with their original
IDs from a fresh directory. Database commands are **explicit test fixtures**:
no real PostgreSQL capture, SQL restore or end-to-end DB-reference validation is
claimed by these tests. SQL command and cleanup ordering are exercised against
those fixtures, including failed creation, restore and drop.

Commands:

```sh
TMPDIR=/dev/shm HELM_BIN=/path/to/helm node --test tests/verification/deployment/prism-backup.test.mts
helm lint charts/prism -f charts/prism/ci-values.yaml
bash -n charts/prism/files/prism-backup.sh
node_modules/.bin/eslint -c charts/kubeclaw/files/config/eslint.config.mjs tests/verification/deployment/prism-backup.test.mts
git diff --check
```

The regular scratch filesystem returned EIO for fsync/syncfs. Tests therefore use
a real memory-backed filesystem; physical power-loss durability is not established.
Initial failures are retained in `docs/review/evidence/pr6-prism-backup-groups/`.
The SQL failure test exposed a Bash EXIT-trap local-variable lifetime bug; cleanup
ownership now survives function unwinding, and the negative test passes.

## Still required for IFR-26-001

- Execute the actual pinned PostgreSQL image and original database schema against
  this program; verify every restored DB artifact reference on a fresh target.
- Include the required external keys, worker journals and recovery identities as
  one explicitly bound recovery set. The metadata states that external credentials
  remain required; it does not pretend to contain them.
- Configure and prove an independent off-host failure domain, credential authority,
  retention and recovery-time contract. The existing PVC alone does not provide it.
- Verify Kubernetes storage placement, mounts/ownership, application restart and
  the full Prism/pipeline recovery flow. The weekly same-server SQL smoke test is
  not a host-loss/DR proof.

No deployment, merge, history rewrite or CI dispatch occurred in this checkpoint.
