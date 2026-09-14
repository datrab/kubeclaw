# Redis, LiteLLM PostgreSQL and Qdrant upgrades

`versions.json` selects both database images by immutable digest and their
Bitnami Helm charts by version, OCI manifest digest and archive SHA-256. The
display tag `latest` is not the selection authority. Generated values and the
infrastructure post-renderer require the selected image digest in every emitted
container, including init containers and hooks.

`deploy.sh infra` verifies the archives and actual install/upgrade renders before
infrastructure mutations. It then reads the existing StatefulSets, PVCs and
native database versions. An incompatible immutable claim template, orphaned
PVC, different database version or unbound/mismatched claim stops deployment.
Redis also requires the existing server to already use the selected AOF and
no-eviction policy. A restart is not a safe RDB-to-AOF conversion procedure.

PostgreSQL's upstream chart invokes a password helper during offline upgrade
rendering even when `auth.existingSecret` is selected. The renderer supplies an
offline marker and rejects any emitted Secret or marker bytes. This marker is
never passed to `helm upgrade` or used for authentication. The existing external
Secret remains the credential authority.

## Existing data and storage

The selected Redis volume is 20 GiB with a 4 GiB container limit and 1 GiB
`maxmemory`; the difference leaves room for Redis overhead and AOF rewrite.
LiteLLM PostgreSQL now requests 20 GiB storage and has a 4 GiB memory limit.
These are requested budgets, not evidence of available node or storage capacity.
Existing 1 GiB claims are not silently enlarged or replaced by an upgrade.

If the preflight reports `STATEFUL_*_MIGRATION_REQUIRED`, retain the original
workload, data volumes, image selection and credentials. Do not delete the
StatefulSet/PVC, remove the preflight, or force Helm replacement to get past it.
Prepare a separate migration with these reviewable inputs:

1. The exact source database version, storage class, requested and actual
   capacity, credential references and selected destination versions.
2. A complete, independently retained backup and its checksums. LiteLLM's
   database contains authoritative authentication and model configuration when
   database-backed configuration is enabled; it is not a disposable cache.
3. An isolated destination with fresh compatible storage. Restore and validate
   the actual application schema, authentication, model configuration and data
   before any client switches.
4. A write-fencing/cutover boundary and an explicit rollback boundary. Restarting
   the old server after new writes does not restore those writes to the old copy.
5. Required node/storage capacity for both source and destination during the
   transition, plus a measured backup age and recovery duration.

Redis now has a tested [offline data migration and explicit cutover procedure](redis-migration.md).
It uses a fresh release/PVC and preserves the original source, avoiding a
provider-specific in-place expansion. `REDIS_RELEASE` and `REDIS_VALUES_FILE`
select the new release for subsequent normal deployment and teardown. Role
endpoint values must select the same destination before clients resume.
The complete [PostgreSQL logical migration](postgresql-migration.md) and
[Qdrant full-storage migration](qdrant-migration.md) use independent releases
and preserve their source stores. The actual chart service selectors and ports
bind scheduled recovery and database network edges to all selected releases.
`POSTGRESQL_RELEASE`/`POSTGRESQL_VALUES_FILE` and
`QDRANT_RELEASE`/`QDRANT_VALUES_FILE` retain those selections on subsequent deploys.
Common off-node backup and provider capacity remain separately open in
IFR-26-001 and IFR-16-001. Local migration evidence does not claim CSI or live
application acceptance.

## Local verification

Run the actual archived Helm render and manifest-contract regression with:

```sh
HELM_BIN=/absolute/path/to/helm node --test tests/verification/reliability/stateful-release-pins.test.mjs
node scripts/versions.mjs --check
bash -n scripts/deploy.sh
```

The Redis crash/durability gate uses a real Redis server and the application's
actual Lua transport. It tests acknowledged and lost-acknowledgement writes,
SIGKILL/restart, retry deduplication and no-eviction behavior. Helm rendering and
native upstream binaries do not establish that the selected Bitnami container
entrypoints or a deployed cluster passed acceptance.
