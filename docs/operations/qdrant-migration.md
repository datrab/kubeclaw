# Qdrant version and PVC migration

Use a complete storage snapshot and a new release with fresh claims. The old
release and its PVCs remain the rollback authority until the new destination
accepts writes. This procedure supports the selected single-peer deployment,
including the chart's enabled cluster mode; it refuses remote shards, transfers
or resharding. A multi-peer cluster requires its own distributed migration.

The selected destination is Qdrant1.19.1 from the locked chart and image.
`qdrant-restore.mjs` requires an explicit `migrateToVersion` for a version change,
and permits only a forward patch or one consecutive minor within the same major.
Older sources need separately verified intermediate upgrades. A same-version
storage move omits that option. Do not reuse an old binary data directory with
an unverified new version.

## Rehearse and fence the source

1. Record the actual version, release, StatefulSet, both PVCs, storage class,
   available capacity, collections, aliases, embedding/source authorities,
   client endpoints and credential/certificate references. Retain the old image,
   manifests and an independently stored backup. Reserve space for both old/new
   stores, snapshots and restore workspace. Requested claim sizes do not prove
   provider capacity. Preserve the existing admin/read-key authority.
2. Rehearse with the actual source version and a copied snapshot. Compare all
   collection definitions/indexes, point counts, IDs, payloads, vectors, aliases
   and representative searches. Include sparse/named vectors or custom shards
   if the source uses them; the native fixture covers two dense collections.
3. Fence every writer and metadata/alias administrator, stop scheduled writes
   and drain requests. A snapshot API request alone does not establish the
   maintenance boundary. Keep only the scoped operator read/snapshot connection.
   With TLS and private key/CA files, export the final complete package:

   ```sh
   node scripts/qdrant-snapshot.mjs export-storage "$SOURCE_QDRANT_URL" \
     "$SOURCE_CA_FILE" "$ADMIN_KEY_FILE" "$NEW_BACKUP_DIRECTORY"
   node scripts/qdrant-snapshot.mjs verify "$NEW_BACKUP_DIRECTORY"
   ```

   Copy and verify the complete package independently. Stop the old StatefulSet,
   wait for its Pod to terminate, and prevent reconciliation from restarting it.
   Do not uninstall it or delete its claims. Retain the source endpoint/peer URI
   for rollback; changing an existing Raft peer URI can prevent its restart.

## Restore into an isolated new store

Use the options format from [Qdrant recovery](qdrant.md), selecting the verified
native destination binary, a nonexistent private directory, distinct loopback
ports, a recovery certificate for localhost and the preserved two API keys.
For the tested1.18.2→1.19.1 transition add `"migrateToVersion": "1.19.1"`.

```sh
node scripts/qdrant-restore.mjs /absolute/private/restore-options.json
```

The process verifies the full snapshot twice, including its private copied
bytes, and starts with `--storage-snapshot`. Existing destination directories,
wrong versions, skipped minor/major upgrades and corrupt packages are refused.
No force overwrite or source-cluster join occurs. The full snapshot restores
all collections and aliases together; the older one-collection recovery command
is still a separate exact-version operation.

Run the comparisons above against this isolated store. Stop it cleanly with
SIGTERM and wait for successful process exit before copying any files. Transfer
only its resulting `storage/` and `snapshots/` directories; never copy the old
source Raft state, live data files, recovery credentials or restore launch flags.

## Fresh PVC transfer and first installation

1. Select a new release and a private copy of the selected values. Keep one
   replica and both claim templates. Select the required fresh size/storage
   class. Existing PVC reuse and Helm force replacement are not this procedure.

   ```sh
   export QDRANT_RELEASE=qdrant-migrated
   export QDRANT_VALUES_FILE=/absolute/private/qdrant-migrated.yaml
   CHART=$(node scripts/infrastructure-release.mjs qdrant "$QDRANT_RELEASE" "$NAMESPACE" "$QDRANT_VALUES_FILE")
   node scripts/qdrant-storage-preflight.mjs "$NAMESPACE" "$CHART" "$QDRANT_VALUES_FILE" "$QDRANT_RELEASE"
   node scripts/render-qdrant-migration-storage.mjs "$NAMESPACE" "$QDRANT_RELEASE" "$QDRANT_VALUES_FILE" > /absolute/private/qdrant-transfer.yaml
   ```

   Review the generated exact destination claim names against the retained
   source inventory. Require destination release/StatefulSet/claims all absent.
   The renderer derives both claims and mounts from the actual locked chart.
   It emits a bounded transfer Pod using the selected image, no service token,
   no database process/credentials, and a deny-all network policy.
2. Use `kubectl create`, never `apply` over existing storage, for the reviewed
   transfer manifest. Wait for both claims to be Bound and the transfer Pod to
   run. Confirm their volume handles differ from the source. The default names
   are `qdrant-storage-qdrant-migrated-0`,
   `qdrant-snapshots-qdrant-migrated-0` and `qdrant-migrated-transfer`; overrides
   must use the actual rendered names. Inspect both mounted roots and require
   no application files (a filesystem-created `lost+found` is not data).
3. Record a SHA-256 manifest of every regular file beneath each stopped restored
   directory, preserving relative paths. Reject symlinks/special files unless
   an independently reviewed source format requires them. Transfer the complete
   directory contents through the Kubernetes exec/copy channel into the matching
   `/qdrant/storage` and `/qdrant/snapshots` mounts, preserving all filenames.
   Do not copy the parent directory as another nested `storage/storage` layer.
   Compare the complete relative file inventory, file sizes and hashes inside
   both PVC mounts against the retained manifest, then flush the target volumes
   with `sync -f` on each mounted directory. Failure stops cutover; it never
   justifies starting Qdrant on a partial copy. The helper uses UID1000/GID3000;
   confirm these files remain readable/writable by the chart's actual UID1000.
4. Delete only the temporary transfer Pod and its deny-all NetworkPolicy, and
   wait for termination/detachment. Keep both new PVCs. The normal deployment
   preflight intentionally rejects these orphaned restored claims: first install
   is an explicit reviewed restore step, not a general bypass flag.
5. Provision the destination certificate from the existing trusted authority,
   covering the actual destination Service DNS; preserve the old SAN/authority
   for rollback when sharing `qdrant-tls`. Validate the selected service:

   ```sh
   SERVICE=$(node scripts/stateful-database-service.mjs qdrant "$QDRANT_RELEASE" "$NAMESPACE" "$QDRANT_VALUES_FILE")
   node scripts/qdrant-secrets.mjs check "$NAMESPACE" "$SERVICE"
   helm install "$QDRANT_RELEASE" "$CHART" --namespace "$NAMESPACE" \
     --values "$QDRANT_VALUES_FILE" --post-renderer ./scripts/infrastructure-image-renderer.mjs \
     --post-renderer-args qdrant --wait --timeout 600s
   ```

   The new chart initializes its own single-peer Raft identity over the restored
   collection store. Verify actual version, Bound/mounted claims, TLS/auth,
   cluster health, all data/alias comparisons and application reads while
   ordinary writers remain fenced. Do not run the upstream unauthenticated
   test hook against production data.
6. Select this Service in the private client Qdrant endpoint values. Keep all
   three stateful release/value selections explicit when rebinding policies:

   ```sh
   node scripts/render-stateful-network-policies.mjs my-values/infra/network-policies.yaml "$NAMESPACE" \
     "$REDIS_RELEASE" "$REDIS_VALUES_FILE" "$POSTGRESQL_RELEASE" "$POSTGRESQL_VALUES_FILE" \
     "$QDRANT_RELEASE" "$QDRANT_VALUES_FILE" | kubectl apply --namespace "$NAMESPACE" -f -
   ```

   The renderer binds both ingress and consumer egress to the actual chart
   selectors/ports. It grants HTTP/gRPC, not Raft peer access. Resume writers
   only after acceptance. Subsequent normal deploys retain the new release and
   values, and enforce matching runtime version and immutable storage. Obtain
   and independently verify a fresh destination backup.

## Rollback and local evidence

Before new writes, stop the destination and select the retained source endpoint,
image, values, credentials and matching network-policy selection. Restart the
source with its original peer identity. Never expose both authoritative copies.
After destination writes, the old store is stale; repair forward or use a
separately reviewed reverse data transfer. Keep the old claims and backups until
explicit retirement, outside the ordinary deploy/teardown workflow.

The native migration test uses original1.18.2/1.19.1 release binaries and TLS,
real single-peer Raft, full snapshots, two collections/alias, corrupt/version
refusals, a stopped-store copy and cluster-mode restart. It also reopens the
unchanged original store. Local files are memory-backed with real fsync; this
proves logical recovery, not physical durability. Actual image entrypoints,
Kubernetes exec/copy, CSI attachment, network denial and application acceptance
remain prepared operator live gates. No deployed result is claimed.
