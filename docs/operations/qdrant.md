# Qdrant: credentials, collection ownership and recovery

## Scope and ownership

Qdrant is optional. The checked repository has a concrete client in the agent
dependency health probe; it now reads `/collections` over verified HTTPS with a
read-only key. No business-stage Qdrant SDK call or authoritative collection
writer was found in `skills/` or the shipped worker configuration. This does not
prove that an existing cluster contains no externally created collections.

Until a collection has an explicit owner and reproducible input provenance,
treat its vectors, IDs and payloads as retained original data. Never infer that
an unknown collection is a disposable index. Before adding a writer, record the
collection name, owner, source repository/artifact versions, embedding model and
dimension, distance metric, index configuration and whether the source alone can
reproduce the payloads. Give that writer its own deliberately scoped credential;
the health reader must not become the application writer.

There is no automatic deletion of collections, server snapshots or exported
backups. Their retention ends only through an explicit owner-approved operation.
The supplied export is a single-collection backup; it is not a transaction with
Prism PostgreSQL, Redis, object storage, aliases or other collections. The wider
coordinated-backup finding IFR-26-001 remains separate.

## Installation and credentials

`versions.json` owns the Qdrant chart archive version/hash and image digest.
`scripts/infrastructure-release.mjs` verifies the archive, renders install and
upgrade, and checks every workload/hook image. The chart requires a semver image
tag while rendering; the mandatory post-renderer binds the actual workload to
the exact digest. Run through `scripts/deploy.sh`; an ad hoc Helm invocation
without this renderer is not the supported release path.

Provision `Secret/qdrant-tls` in the application namespace before secret setup:

- `tls.crt`: PEM server certificate, followed by any intermediates.
- `tls.key`: its private key.
- `ca.crt`: the issuing trust bundle.
- The certificate must cover `qdrant.<namespace>.svc.cluster.local` in its SAN.

Use the deployment's certificate authority or secret-management workflow. No
production CA is generated or private key committed by this implementation.
`node scripts/qdrant-secrets.mjs ensure-auth <namespace>` verifies TLS and creates
`Secret/qdrant-auth` only when absent, with separate cryptographically generated
`api-key` and `read-only-api-key` fields. Existing credentials are reused and
validated, never silently rotated. The same read-only preflight runs before
infrastructure deployment; failed Kubernetes access is not treated as absence.

The Qdrant container requires both distinct keys before starting. Agent health
gets only the read key and CA as selected Secret items, mounted as directories
so replacement is observable. It receives neither the admin key nor TLS private
key. The default URL uses the agent release namespace. Custom URLs must be HTTPS
and use a certificate trusted by the configured CA.

The server keeps its key values in its process environment. Rotate a key by
updating the Secret through the normal secret workflow, then restarting Qdrant
and validating the new key and rejection of the old key. The single replica can
be briefly unavailable during rotation. Renew TLS in the same controlled way,
verify the chain/hostname before restart, and update client CA bundles when the
issuer changes. No promise of live credential reload or zero downtime is made.

## Storage and rollout boundary

The configured data claim is 15 GiB and the durable snapshot claim is 30 GiB;
memory is 4 GiB and CPU 2 cores. These are generous initial budgets, not capacity
or free-space evidence. Check data, snapshot, temporary export and off-node backup
capacity before snapshot creation. Export limits each snapshot to 64 GiB and
each API request to ten minutes; oversized/failed transfers retain an incomplete
local directory without a usable manifest. They do not delete the server copy.

An existing StatefulSet's `volumeClaimTemplates` cannot be changed by ordinary
Helm upgrade. Before enabling the additional snapshot claim on an old release,
retain a verified export and perform the documented stateful-storage migration
under IFR-24-001/IFR-16-001. Never delete the data PVC to make Helm succeed. The
deployment preflight compares existing and desired immutable claim templates
before any infrastructure mutation and rejects an incompatible transition with
`QDRANT_STORAGE_MIGRATION_REQUIRED`. It does not silently recreate a StatefulSet.
The stateful migration implementation remains part of the open infrastructure
upgrade package; this security/recovery change does not close that package. The
existing cluster's version, PVC layout and free space have not been inspected in
this local session. This document is not authorization to deploy or migrate it.

## Export and isolated restore

Use a network path whose hostname matches the server certificate. Keep key and
CA files outside Git. Stop application writes if a wider logical checkpoint is
needed; aliases and counts in the manifest are observations around the snapshot,
not an atomic cross-collection inventory.

```sh
node scripts/qdrant-snapshot.mjs export \
  https://qdrant.example.svc.cluster.local:6333 \
  /secure/qdrant/ca.crt /secure/qdrant/admin-key \
  owned_collection /backups/qdrant/new-export
node scripts/qdrant-snapshot.mjs verify /backups/qdrant/new-export
```

Export requires a single peer with stable local shards. Distributed/shard-moving
deployments are rejected because one node's snapshot is not a complete backup.
It records the server version, collection metadata, aliases, snapshot size and
SHA-256. Copy the complete directory to an independent failure domain using the
approved encrypted backup transport, then verify that copy. A local snapshot PVC
or checksum alone is not a disaster-recovery proof.

For an isolated restore, provide an options JSON file with these fields (paths
are examples; the file contains paths, not credential values):

```json
{
  "backup": "/backups/qdrant/new-export",
  "binary": "/opt/qdrant/1.19.1/qdrant",
  "directory": "/recovery/new-qdrant-store",
  "httpPort": 16333,
  "grpcPort": 16334,
  "tls": {
    "cert": "/secure/recovery/tls.crt",
    "key": "/secure/recovery/tls.key",
    "ca_cert": "/secure/recovery/ca.crt"
  },
  "keyFile": "/secure/recovery/admin-key",
  "readOnlyKeyFile": "/secure/recovery/read-key"
}
```

```sh
node scripts/qdrant-restore.mjs /secure/recovery/options.json
```

The binary must match the manifest's exact server version. The new recovery
certificate must cover `localhost` (also `127.0.0.1` if accessing it by IP).
The command starts a loopback-only, independent single-node database, copies and
rechecks the snapshot privately, and refuses any existing destination. It never
passes a force-overwrite flag or joins an existing Raft cluster. Compare owned
point IDs, payloads, vectors and representative searches with the source proof.
Recreate aliases deliberately only after those checks; aliases are recorded but
not automatically rebound. Production cutover/rejoining is a separate operator
operation after compatibility and application ownership checks.

For a declared reproducible index, a rebuild must use the recorded source and
embedding model versions and pass the same ID/payload/search checks before its
replacement is promoted. There is no generic rebuild command because this
repository currently defines no such Qdrant collection writer or source mapping.

## Verification

`tests/verification/reliability/qdrant-native.test.mjs` runs the pinned native
Qdrant binary, actual TLS, the production startup guard, the rendered agent probe
function and the prepared live read gate. It proves missing/wrong-key denial,
wrong-CA/hostname rejection, read-key write denial, export/hash verification,
fresh-store restore after SIGKILL, identical vectors/payloads/search order,
existing-target refusal, corruption rejection and key rotation with retained
data. No database or protocol mocks are used.

The upstream chart's `helm test` hook uses a fixed `test_collection`, lacks this
Secret-based auth contract and is **not the acceptance command**. Do not supply
it with an admin key to make it run. Use the native test for local verification
and this prepared read-only command after deployment:

```sh
node scripts/verify-qdrant-live.mjs HTTPS_ORIGIN CA_FILE ADMIN_KEY_FILE READ_KEY_FILE
```

The remaining operator live checks are denial from an unapproved pod/network,
real Secret/certificate rotation and a restore using a copied production export.
None has been run here. For the upstream snapshot and security contracts see
[Qdrant snapshots](https://qdrant.tech/documentation/snapshots/) and
[Qdrant security](https://qdrant.tech/documentation/security/).

For a complete version/PVC cutover, use the separate
[full-storage migration procedure](qdrant-migration.md). It covers all collections
and aliases, explicit consecutive version changes, a fresh release/claim
transfer, the chart's single-peer cluster mode, TLS/network binding and rollback.
The exact-version one-collection recovery instructions above remain unchanged.
