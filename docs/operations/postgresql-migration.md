# LiteLLM PostgreSQL version and storage migration

Use a logical migration into a separate release with fresh storage. Keep the
original release, PVCs, image selection and credential authority intact. The
selected destination is PostgreSQL18.6 and its locked Bitnami chart/image in
`versions.json`. A major upgrade cannot reuse the old binary data directory;
use the destination's dump/restore clients against the old server.
[PostgreSQL upgrade guidance](https://www.postgresql.org/docs/18/upgrading.html).

This procedure also moves an undersized or incompatible PVC without assuming
that the storage provider supports expansion. It does not allocate physical
capacity or execute a deployment automatically.

## Prepare and rehearse

1. Record the actual source `SHOW server_version_num`, cluster identity, release,
   StatefulSet/PVC names, storage class, database owner/roles, installed
   extensions, database encoding/locale, application image and credential
   references. Preserve existing Helm values/manifests and an independent
   backup. Confirm capacity for both databases, backup packages and rollback
   retention. A chart version alone is not this inventory.
2. Keep LiteLLM at the same selected application image and retain its master/salt
   keys. Recreate the required login roles and any additional global objects
   from the retained authority; a single-database dump does not contain cluster
   roles or tablespaces. Confirm compatible destination extensions and locale.
   [pg_dump scope](https://www.postgresql.org/docs/18/app-pgdump.html).
3. Copy the selected PostgreSQL values to a private migration file and choose a
   new release, for example `postgresql-migrated`. Select fresh storage with the
   required size/class and existing credential Secret. Do not select the old
   PVC, change its owner, use force replacement or share a data directory.
4. Resolve and verify both actual Helm render modes before the explicit first
   install. The source release and destination names must be different:

   ```sh
   export POSTGRESQL_RELEASE=postgresql-migrated
   export POSTGRESQL_VALUES_FILE=/absolute/private/postgresql-migrated.yaml
   CHART=$(node scripts/infrastructure-release.mjs postgresql "$POSTGRESQL_RELEASE" "$NAMESPACE" "$POSTGRESQL_VALUES_FILE")
   node scripts/stateful-release-preflight.mjs postgresql "$NAMESPACE" "$CHART" "$POSTGRESQL_VALUES_FILE" "$POSTGRESQL_RELEASE"
   helm install "$POSTGRESQL_RELEASE" "$CHART" --namespace "$NAMESPACE" \
     --values "$POSTGRESQL_VALUES_FILE" \
     --post-renderer ./scripts/infrastructure-image-renderer.mjs \
     --post-renderer-args postgresql --wait --timeout 600s
   ```

   Verify actual server version, empty application database, distinct system
   identifier, Bound destination PVC and intended credentials. Limit temporary
   operator/restore connectivity to the required endpoints. Rehearse the full
   restore and application checks in an isolated destination before maintenance.

## Fence, transfer and accept

1. Start the maintenance window. Stop LiteLLM and every other database writer,
   including administrative/model/key changes, schema migration jobs and
   scheduled tasks. Fence reconnects and drain existing sessions; merely
   requesting a read-only default does not stop existing transactions. Retain
   operator access for the final dump. Record the last accepted write boundary.
2. Select the PostgreSQL18.6 client binaries in PATH. Point normal PG connection
   and private authentication/SSL inputs at the **source**. Supply the bounded
   backup settings and matching application/credential bindings from the
   [recovery procedure](litellm-postgresql-recovery.md), with
   `BACKUP_EXPECTED_SERVER_VERSION` set to the actual recorded source version.

   ```sh
   BACKUP_DIRECTORY=$(bash scripts/postgresql-recovery.sh backup)
   bash scripts/postgresql-recovery.sh verify
   ```

   The package records source identity/version and the actual dump-client
   version. Retain an independently copied package and verify its SHA256SUMS.
   Stop the old PostgreSQL workload after the final dump and keep its controller
   from restarting it during cutover. Do not delete or uninstall it.
3. Copy the complete package to private destination recovery storage, retaining
   the `backup-*` directory name. Select the **destination** PG endpoint and
   matching credential/application binding. Set
   `BACKUP_EXPECTED_SERVER_VERSION=180006`, keep PostgreSQL18.6 clients in PATH
   and use the exact source version recorded above:

   ```sh
   bash scripts/postgresql-recovery.sh migrate "$BACKUP_DIRECTORY" "$SOURCE_SERVER_VERSION_NUM"
   ```

   The explicit migration command accepts only a forward version change with
   the selected destination dump/restore client version. It retains checksum,
   age, size, credential/image, distinct-cluster and empty-database checks.
   Restore preserves object owners/ACLs and runs as one transaction; a failure
   cannot turn into a partial accepted restore. Normal `restore` still refuses
   a different source version. For a same-version storage migration, use normal
   `restore` instead.
4. Compare schema, indexes, row counts, sequences, required extensions and
   representative original data. Run the actual LiteLLM canary against the new
   endpoint: valid/invalid keys, model allowlists, stored model configuration,
   both encrypted credential formats and budget behavior. Reconcile any
   authorization changes outside the fenced boundary. Run `ANALYZE` after
   restoration and verify application latency before accepting traffic.
5. Set LiteLLM's private `DATABASE_URL` to the destination Service and keep the
   selected `POSTGRESQL_RELEASE`/`POSTGRESQL_VALUES_FILE` for subsequent deploys.
   Render/apply the database network edges before restarting clients:

   ```sh
   node scripts/render-stateful-network-policies.mjs my-values/infra/network-policies.yaml "$NAMESPACE" \
     "$REDIS_RELEASE" "$REDIS_VALUES_FILE" "$POSTGRESQL_RELEASE" "$POSTGRESQL_VALUES_FILE" \
     "$QDRANT_RELEASE" "$QDRANT_VALUES_FILE" | kubectl apply --namespace "$NAMESPACE" -f -
   ```

   All three release selections must be explicit here. The renderer derives actual
   Service selectors and service/container ports from the locked charts; it
   updates the corresponding ingress/egress edges together. It also preserves
   separately migrated Redis and Qdrant selections. Other policy edges are unchanged.
   Normal `deploy.sh infra` uses the same renderer and prepares it before
   mutations. Scheduled recovery is bound to this destination Service/selector.
6. Resume clients only after acceptance. Obtain and verify a new destination
   backup and confirm its schedule/failure visibility. Retain the old server,
   PVCs, source package and credential authority until deliberate retirement.

## Rollback boundary and evidence

Before destination writes resume, rollback can select the preserved source
endpoint/image/credentials and matching policy selectors, then restart its
workload and clients. Do not restart both authoritative copies. Once the
destination accepts new writes, returning to the old copy loses those writes;
use a separately reviewed reverse data migration or repair the destination.
The forward migration command does not claim downgrade compatibility.

Native tests exercise actual PostgreSQL17→18 and same-version restore with the
full pinned LiteLLM schema and unchanged upstream crypto code. They compare
schema/indexes and original authorization/model rows, authenticate with real
passwords and decrypt both credential formats. Actual Bitnami entrypoints,
Kubernetes/CSI attachment, application HTTP acceptance and physical storage
durability remain the operator's explicit live gate. No such pass is implied
by a native database or Helm render result.
