# Prism database migration and credential boundaries

An ordinary application upgrade preserves existing database passwords. Bootstrap
first checks all existing roles using actual password authentication, including
a deliberately incorrect password as a negative control. It creates missing
roles and applies grants in one transaction. A password mismatch stops the
upgrade before those changes; it never implicitly rotates a working role.

The schema migrator commits its migration set in one transaction under the
database advisory lock. That transaction ends before Kubernetes rolls the new
application out. A later application failure therefore leaves the committed
schema in place. Migration 016 preserves the pre-011 preference-event INSERT
contract while retaining the new wire-event uniqueness constraint. Previously
applied migration files are not rewritten.

## Application rollback

Keep the old application image selection and its current runtime Secret until
the new application has passed acceptance. Future migrations must add compatible
columns/tables/defaults or transitional readers/writers first. Remove old schema
contracts only in a separate release after the previous application's rollback
window has explicitly ended. A failed rollout must not automatically run reverse
DDL or restore a database over ongoing writes.

Restore is a separate recovery operation. A database dump does not contain the
cluster's login passwords, external Secrets, artifact bytes or every external
effect. Retain the required credential/key versions and artifact references
alongside the independently protected backup. Restore into a fresh, isolated
database server with the required pgvector version; create the login roles from
the retained credential authority before restoring object owners and ACLs.
Verify migrations, authoritative records, authentication and artifact references
before switching clients. Fence writes and record a cutover point; a pre-upgrade
dump cannot recover writes made after that dump. Cross-store/off-node recovery
remains separately tracked by IFR-26-001.

## Explicit password transition

This implementation deliberately offers no automatic rotation during rollout.
For the existing fixed role names, use a planned maintenance transition:

1. Retain the old credential versions in the approved secret authority and
   verify the database recovery package. Stop and fence every reader/writer,
   including workers, ingestion, migrators and scheduled jobs that use the roles.
2. With the database administrator, change the three application role passwords
   in one database transaction. Do not pass passwords in command-line arguments,
   shell tracing, logs or an unprotected SQL file.
3. Update the database Secret's password keys and corresponding connection URLs
   together. Validate all three new logins using password authentication and
   verify runtime/readonly grants before restarting clients.
4. If the transition fails, keep clients fenced. Restore the old role passwords
   from the retained secret authority and restore the matching Secret version;
   prove all old logins before restarting the previous application. A Helm
   rollback alone performs neither operation.

The administrator login has its own transition and recovery requirements. A
lost Secret must be recovered; creating unrelated replacement passwords does
not repair an existing PostgreSQL volume. The ordinary `prism-secrets` command
preserves an existing Secret.

## Native local gate

Provide two disposable, initially empty PostgreSQL servers using the selected
Prism pgvector image, plus compatible native `pg_dump`/`pg_restore` clients:

```sh
PRISM_NATIVE_TEST_DATABASE_URL="$DISPOSABLE_SOURCE_ADMIN_URL" \
PRISM_NATIVE_RESTORE_DATABASE_URL="$DISPOSABLE_DESTINATION_ADMIN_URL" \
PRISM_NATIVE_POSTGRES_BIN="$POSTGRES_CLIENT_BIN_DIRECTORY" \
node --test skills/prism/tests/native/database-upgrade.mts
```

The gate refuses pre-existing user databases/roles, creates `prism` on each
server and never drops a database. It verifies unchanged SCRAM verifiers after
a rejected password change, the actual migrator/runtime/readonly roles, legacy
preference writes and duplicate rejection, application-process failure after
migration, and a real custom-format dump/restore onto the second server. It
compares original migration/event/nonce records and checks restored role grants
and the pgvector extension. This is not a simulated PostgreSQL client and is
not proof of a Kubernetes rollout.

## Deferred cluster acceptance

Run only in a disposable Prism acceptance namespace with its own Secrets/PVCs:

1. Deploy the previous reviewed Prism release, write representative original
   data and retain the old release selection and credential versions.
2. Upgrade to the candidate control/migration image while selecting a deliberately
   unavailable **worker** image digest in the isolated test values. Keep the
   control image valid so the migration hook succeeds before the worker rollout
   fails. Capture the real hook logs, applied migration names and failed Pod
   events. Wait for Helm's atomic Kubernetes rollback.
3. Prove the previous application and old role logins still work against the
   migrated database. Exercise the legacy preference INSERT and verify existing
   application data and artifact references. Separately attempt a changed role
   password and prove bootstrap rejects it without altering working logins.
4. Export and restore to a second isolated server with fresh storage and retained
   credentials. Validate actual application reads/writes and artifact retrieval
   there. Do not run the existing same-server restore CronJob as a substitute.

The operator runs this live acceptance at the end; it has not been executed by
the local gate.
