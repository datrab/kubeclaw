# LiteLLM PostgreSQL recovery

LiteLLM uses `STORE_MODEL_IN_DB=True`. Its database contains authoritative keys,
permissions, budgets and model configuration, not a disposable cache. This
recovery path is separate from Prism's database and artifact recovery.

## Configuration and installation

The policy is `my-values/infra/postgresql-recovery.yaml`. The initial settings
request a backup every 15 minutes, check every 5 minutes, allow 30 minutes for a
dump and set a **two-hour maximum backup age**. Age starts before the dump, not
when it finishes. The renderer rejects scheduling/duration combinations that
cannot fit that objective. The objective is configurable; it is not a promise
that failures or exhausted storage cannot violate it.

The policy requests a 100 GiB backup PVC, a 64 GiB per-dump ceiling and a 90 GiB
retained-data ceiling. Incomplete dumps count toward capacity. There is no
automatic deletion. Size these limits against actual data growth and compression;
volume availability/expansion and cross-node attachment need the final live
capacity acceptance. A capacity failure preserves existing backups and fails the
job. Monitor failed/missed jobs and backup age; do not treat a running database
or a successful earlier backup as a current recovery guarantee.

`deploy.sh infra` renders and checks the backup resources before infrastructure
mutations, then installs them after the selected managed PostgreSQL release.
It refuses incompatible existing backup PVCs. The real locked PostgreSQL Helm
render supplies the database Service name, including fullname overrides. The
job image is the same centrally selected PostgreSQL digest. To review locally:

```sh
node scripts/render-postgresql-recovery.mjs kubeclaw \
  my-values/infra/postgresql-recovery.yaml \
  my-values/infra/postgresql-values.yaml \
  my-values/infra/litellm-deployment.yaml
```

One `litellm-postgresql-backup` CronJob performs both checking and due backups.
`concurrencyPolicy: Forbid` plus a real filesystem `flock` prevents competing
writers. It has no Kubernetes API token, a read-only root filesystem and a
bounded writable temporary directory. Explicit Cilium rules allow DNS and the
managed PostgreSQL endpoint. If managed PostgreSQL is disabled, this command
does not install a replacement external-database backup system or remove an
already installed job; the external owner must provide the recovery contract.

The managed credential shape is the one currently used by LiteLLM:
`general_settings.master_key: os.environ/LITELLM_MASTER_KEY`, supplied by its
single unprefixed Secret `envFrom` reference, with optional `LITELLM_SALT_KEY`
in the same Secret. Explicit environment overrides or another master-key
authority are rejected before deployment rather than bound incorrectly.
The job uses the configured PostgreSQL administrator Secret for complete owner/
ACL-preserving dumps and the server's actual cluster identifier. It receives
only the required LiteLLM master/salt keys, not all provider credentials.

## What constitutes a completed backup

`scripts/postgresql-recovery.sh` writes a full custom-format `pg_dump`, its
original archive table of contents and metadata into a private incomplete
directory. It checks the real selected PostgreSQL version and cluster identity,
lists the archive, records checksums and synchronizes the filesystem before
atomic publication as `backup-*`. A killed/failed dump stays incomplete; it
cannot replace the previous completed backup.

Metadata binds the declared recovery application image, source cluster,
database/version, conservative timestamps and the required external credential
authority. The credential fingerprint is domain-separated. It never exports
the actual master/salt key or `SHA256(key)`, which LiteLLM uses directly as its
encryption key. Verification and restore reject a different credential set.
If the salt variable is absent, the fingerprint follows LiteLLM's master-key
fallback; an explicitly empty salt is distinct from an absent variable.

The archive includes schema, table contents, object owners and ACLs. Login-role
passwords, external Secrets, provider accounts and external artifact storage are
not supplied by a logical database dump. Retain the exact master/salt key
versions and required database-role configuration independently. Never rotate
an encryption key merely to make a restore start; old encrypted model values
still require their original key material.

The archive is sensitive data. Private directory/file modes are not encryption,
and SHA-256 checks detect corruption rather than authenticate an untrusted
replacement package. Protect the original backup source and encrypt/protect
off-node copies. The local PVC is not disaster recovery for loss of that storage.
Coordinated cross-store/off-node replication, retention and restore remain
separately tracked in IFR-26-001.

## Restore and rollback boundary

1. Select a checksum-valid backup whose age meets the configured recovery
   objective. Retain its metadata, table of contents and credential authority.
   Explicitly assess any recovery from an older package; changing the configured
   maximum age does not make the original objective true retroactively.
2. Provision a separate PostgreSQL server at the recorded compatible version and
   an empty target database with the same name. Recreate required login roles
   from the retained credential authority, including the original object-owner
   role names. Provide the matching master/salt keys. Keep application traffic
   and writers fenced.
3. In the recovery environment, set the normal `PGHOST`, `PGPORT`, `PGDATABASE`,
   `PGUSER` and private password/SSL inputs for the **destination**. Supply the
   matching `BACKUP_*` settings and retained LiteLLM key environment securely.
   Run `bash scripts/postgresql-recovery.sh restore "$BACKUP_DIRECTORY"`.
   The script refuses the source cluster even if another database name is used,
   a nonempty destination, corruption, mismatched versions/images/keys and an
   over-age package. It never uses `--clean` or drops a database. Restore runs in
   one transaction with errors treated as failures.
4. Validate the actual LiteLLM application before switching clients: known valid
   and invalid API keys, model allowlists, stored model configuration, both
   encrypted credential formats, budgets and required external credentials.
   Reconcile key revocations and other security changes made after the backup;
   the recovery-point boundary also applies to authorization data.
5. Record the cutover and permit new writes only on the accepted destination.
   Keep the original server/volumes protected until an explicit retirement.
   Reverting clients to an old copy does not bring new destination writes back.

`bash scripts/postgresql-recovery.sh verify` checks the latest published package
and may run against a read-only backup mount. `backup` requests an immediate
backup; `scheduled` implements the policy interval. Neither command performs
operational cleanup or off-node upload.

## Local and live acceptance

The native gate uses two real PostgreSQL18.6 servers, the full declarative
LiteLLM schema from source commit `7d5b6456baaf8be6ac1a60db2b710566b5344adf`,
real login authentication and the unchanged original LiteLLM crypto module:

```sh
POSTGRES_NATIVE_SOURCE_URL="$DISPOSABLE_SOURCE_ADMIN_URL" \
POSTGRES_NATIVE_DESTINATION_URL="$DISPOSABLE_DESTINATION_ADMIN_URL" \
POSTGRES_NATIVE_CLIENT_BIN="$POSTGRES_CLIENT_BIN_DIRECTORY" \
LITELLM_NATIVE_PYTHON="$PINNED_LITELLM_PYTHON" \
PYTHONPATH="$PINNED_LITELLM_SOURCE" \
node --test tests/verification/deployment/postgresql-recovery-native.mts
```

It creates uniquely named disposable databases and roles, never drops existing
databases and checks schema columns/indexes, original key/model JSON, password
authentication, legacy XSalsa20 and AES-GCM credential decryption, bad keys,
corruption, age/capacity limits, incomplete dumps and nonempty/same-server
restore rejection. It is not a full LiteLLM image or Kubernetes execution.

For the final live gate, run the rendered job in an isolated acceptance namespace
with actual Secrets, the selected image, Cilium and real backup storage. Confirm
the required tools execute as the configured UID, the backup/check interval,
failed/missed-job visibility, PVC behavior and denied unwanted network access.
Restore an independently copied package into a second isolated server and run
the real LiteLLM API checks above. This live gate is prepared for the operator;
it has not been recorded as passed locally.
