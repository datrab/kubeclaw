# Redis version and storage migration

Use a fresh release and volume. Keep the original release, PVC and credentials
until acceptance and the rollback window have ended. This avoids changing an
immutable StatefulSet claim template, overwriting the only database copy, or
requiring storage-class expansion. The normal upgrade preflight continues to
reject an incompatible upgrade or an unclaimed restored volume.

The migration prepares data offline, then performs an explicit first install of
the new release. Later `scripts/deploy.sh infra` calls manage that selected
release with the ordinary preflight. This is a maintenance procedure, not an
automatic migration during deployment. D12 leaves its Kubernetes execution and
storage/power-loss acceptance to the operator.

## Record the actual source and reserve capacity

Choose a new DNS-safe release name, such as `redis-next`, and a new PVC name.
Retain the source Helm manifest/values, image digest, native Redis version,
StatefulSet and PVC UIDs, storage class, volume placement, client configuration
and replica counts. Retain the external password authority; do not put the
password in this repository or shell arguments. Stop automatic reconciliation
that could restart the old release or writers during maintenance.

Inventory every writer and consumer, including external publishers and scheduled
jobs. Pause admission and stop them using their recorded deployment counts. A
paused publisher is not a completed pipeline effect; original file journals
remain authoritative. Redis stream retention and dedup TTL are finite. Do not
extend expiry timestamps while migrating or claim replay safety outside the
configured dedup window. Reconcile expired/ambiguous deliveries from their
original journals before resuming them.

Reserve space for the unchanged old PVC, the snapshot, conversion workspace and
the fresh 20 GiB destination at the same time. The default server allows 1 GiB
of Redis-managed memory inside a 4 GiB container; remaining memory covers process
overhead, connections and rewrite copy-on-write. `noeviction` refuses new writes
at the memory boundary rather than dropping dedup keys. MAXLEN is per stream,
and 1 MiB is the publisher's per-payload maximum, so their product is not an
admitted global memory budget. Size active streams and dedup population from
measured traffic; OOM is backpressure, not permission to evict or retry blindly.

## Capture and fence the source

Run from an independent maintenance host with authenticated connectivity to the
source, selected Redis CLI and a private backup directory. `REDISCLI_AUTH` comes
from the external secret authority. Set `SOURCE_HOST`, `SOURCE_PORT`,
`SOURCE_NAMESPACE`, `SOURCE_STATEFULSET` and `SOURCE_POD` from the recorded source.

```bash
umask 077
mkdir "$BACKUP_DIRECTORY"
redis-cli -h "$SOURCE_HOST" -p "$SOURCE_PORT" CLIENT PAUSE 600000 WRITE
timeout --signal=TERM --kill-after=5 240 \
  redis-cli -h "$SOURCE_HOST" -p "$SOURCE_PORT" --rdb "$BACKUP_DIRECTORY/source.rdb"
sha256sum "$BACKUP_DIRECTORY/source.rdb" >"$BACKUP_DIRECTORY/source.rdb.sha256"
kubectl -n "$SOURCE_NAMESPACE" scale "statefulset/$SOURCE_STATEFULSET" --replicas=0
kubectl -n "$SOURCE_NAMESPACE" wait --for=delete "pod/$SOURCE_POD" --timeout=120s
kubectl -n "$SOURCE_NAMESPACE" get "statefulset/$SOURCE_STATEFULSET" -o json
```

Require an `OK` pause reply, successful bounded snapshot, source replicas zero
and disappearance of all source Pods/endpoints before the ten-minute pause
expires. Record command results and timestamps. If the source cannot be stopped
within that window, discard this cutover candidate, keep the destination closed
to clients and repeat capture after restoring the fence. Do not use a snapshot
while the source may have accepted newer writes. Independently retain the RDB
and its checksum outside the source volume's failure domain.

The original source volume may have older persistence than the snapshot. Its
existence alone is not a zero-loss rollback checkpoint.

## Prepare the fresh AOF dataset

Use the selected version from `versions.json`; the script checks the actual
server version. Set `REDIS_SERVER`, `REDIS_CLI` and `REDIS_CHECK_RDB` to those
native binaries. Run from a checkout with the repository's Node dependencies.

```bash
bash scripts/redis-prepare-migration.sh \
  "$BACKUP_DIRECTORY/source.rdb" "$RECORDED_RDB_SHA256" "$NEW_DATA_DIRECTORY"
```

The script verifies the RDB checksum and format, creates a new private directory,
loads RDB with AOF initially disabled, enables AOF on the loaded server, waits for
rewrite, persists configuration and verifies a restart with the RDB removed.
It binds loopback with a random temporary password, bounds execution and file
growth, and leaves interrupted destination data visibly incomplete. It refuses
an existing destination. `migration-receipt.txt` and `SHA256SUMS` are emitted only
after successful AOF restart and clean shutdown. The input snapshot is unchanged.
No source credential, client switch or cluster mutation occurs in this script.

The load-then-enable sequence follows the [Redis persistence procedure](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
The snapshot fence uses [CLIENT PAUSE WRITE](https://redis.io/docs/latest/commands/client-pause/).

## Populate a fresh PVC and install the target

Create a new 20 GiB PVC in the destination namespace using the actual compatible
storage class and placement policy. Mount it in a temporary copy Pod only. Its
image must be pinned, with `tar`, `sha256sum` and the selected Redis UID/GID
available. Set an active deadline and resource limits on that Pod. The selected
chart's target is not installed yet; no Redis process may use the destination
while files are copied.

Copy the prepared directory into the PVC's Redis data directory, including
`appendonlydir`, `migration-receipt.txt` and `SHA256SUMS`. Preserve all AOF manifest
filenames and set file ownership to the UID/GID in the actual rendered chart.
Run `sha256sum --check SHA256SUMS` inside the mounted volume. Retain its output,
then delete the copy Pod and wait for its actual termination/volume release.
Do not merely annotate a PVC as restored without checking its mounted contents.

Create a private complete values file from `my-values/infra/redis-values.yaml`,
setting `master.persistence.existingClaim` to the new PVC. Keep the pinned image,
durability policy and original external `auth.existingSecret`. In a different
namespace, provision that Secret from the same authority before installation.
Check the actual install and upgrade manifests:

```bash
export REDIS_RELEASE=redis-next
export REDIS_VALUES_FILE=/absolute/private/redis-next-values.yaml
chart=$(node scripts/infrastructure-release.mjs redis "$REDIS_RELEASE" "$NAMESPACE" "$REDIS_VALUES_FILE")
helm template "$REDIS_RELEASE" "$chart" --namespace "$NAMESPACE" \
  --values "$REDIS_VALUES_FILE" --post-renderer scripts/infrastructure-image-renderer.mjs \
  --post-renderer-args redis >"$BACKUP_DIRECTORY/destination.yaml"
```

Verify that every data mount refers to the new PVC, every image matches the
selected digest, and the data path/ownership match the copied directory. Apply
NetworkPolicies permitting only the maintenance verifier until acceptance.
Perform the explicit first install of this previously absent release:

```bash
helm install "$REDIS_RELEASE" "$chart" --namespace "$NAMESPACE" \
  --values "$REDIS_VALUES_FILE" --post-renderer scripts/infrastructure-image-renderer.mjs \
  --post-renderer-args redis --wait --timeout 10m
```

An error leaves the target isolated. Do not use `--force`, reinstall over the
source, or delete either PVC to make this pass. Check actual CONFIG values, the
selected server version, expected streams/groups/pending deliveries, and the
remaining absolute dedup expiries. Repeat one known lost-ACK publication through
the actual adapter and require its original entry ID with no extra stream entry.
Restart the target Pod and repeat reads before opening client access.

## Cutover and rollback boundary

Persist `REDIS_RELEASE` and `REDIS_VALUES_FILE` in the operator's deployment
configuration. Set `redis.host` in every affected role's private values to the
new rendered Service DNS name; update any external Redis adapter URL as well.
Check rendered client endpoints before restarting writers. The original source
must remain at zero replicas with reconciliation disabled. Open target policy,
resume a controlled canary, then resume the recorded clients. Verify stream
progress, pending consumer recovery and retained application receipts.

After installation, the normal deployment preflight checks the selected release
and requires its explicitly mounted restored PVC to stay Bound. Teardown targets
the selected release, not the retained old one.

Before new writes, rollback can return to the source version using the captured
RDB and its original credentials in separately prepared compatible storage;
never assume the old PVC contains the latest captured state. After new writes,
the old snapshot is stale: fence clients, capture the new authoritative dataset
and perform a verified compatible restore or fix forward. Do not downgrade the
new AOF in place. Retain old storage and independent backups according to the
operator's acceptance/retention policy; this procedure does not delete them.

## Local acceptance

`redis-migration.test.mts` runs real Redis 7.2.7 and 8.10.1, uses the actual
snapshot transport and migration script, then compares stream records, consumer
pending state and exact dedup expiry after AOF restart. Retry uses the original
publisher Lua. Existing-destination and wrong-checksum attempts are rejected.
The separate durability test covers lost ACK, SIGKILL/restart and noeviction OOM.
These are native data-path tests, not a Kubernetes/CSI or hardware power-loss
claim. The live acceptance is the install, restart, endpoint and workload sequence
above with the actual deployment's credentials and storage provider.

## Network policy after a release-name change

`deploy.sh infra` now derives stateful ingress and consumer egress from the
actual selected Redis and PostgreSQL charts. Before resuming clients in
a manual cutover, render/apply `scripts/render-stateful-network-policies.mjs`
with the policy file, namespace and all three release/value-file pairs, as shown
in the [PostgreSQL migration procedure](postgresql-migration.md). Preserve the
other databases' selections. Changing only a client URL leaves the old network
selectors behind and is not a completed cutover.
