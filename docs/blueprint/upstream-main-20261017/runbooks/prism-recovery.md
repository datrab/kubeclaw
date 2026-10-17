# Prism recovery runbook

1. Stop Prism writes.
2. Restore the dedicated PostgreSQL database.
3. Restore or reconnect the artifact volume.
4. Verify every published Baseline Bundle digest.
5. Start Prism control in recovery mode.
6. Rebuild embeddings, search indexes, thumbnails, and preference projections.
7. Run `deploy.sh prism-smoke`.
8. Enable writes.

A backup is valid only after a restore proof opens a real project, a real
Design Document revision, and its Baseline Bundle.

## Backup workload reconciliation

Finished backup, checksum-verification and SQL restore-proof Jobs expire after
one hour (`ttlSecondsAfterFinished: 3600`), including manual Jobs copied from
the CronJob template. Each CronJob also retains at most one successful and one
failed Job; this count limit can remove older Jobs sooner. Migration and backup
storage-check hooks keep their success-deletion policy with the same one-hour
TTL as a fallback. Export needed failure logs before cleanup. TTL starts only
after a Job completes or fails; it does not interrupt running work.

This policy deletes Job/Pod objects, not PVCs, snapshots or backup files.
Already-created Jobs do not inherit template updates: after preserving needed
diagnostics, an administrator must delete those terminal Jobs once or set their
`spec.ttlSecondsAfterFinished`. One-off diagnostic Jobs must also specify a TTL.

Backup and SQL restore proof first check PostgreSQL readiness for at most 30
seconds, within the existing whole-operation deadline and exclusive lock.
This handles the measured startup connectivity gap in new pods; it does not
repair the cluster's network-policy programming or prove database credentials.
Only readiness is polled. The dump, database creation and restore each execute
once; their failures remain failures. If readiness never succeeds, the script
reports `PRISM_BACKUP_DATABASE_NOT_READY` before creating a snapshot or proof
database. Checksum-only verification requires no database connection.

The scheduled backup and SQL restore-check containers retain their original
Helm names (`proof` and `restore-proof`). Kubernetes uses container names as
merge keys: changing them during GitOps adoption can leave the old container
running beside its replacement. The chart also explicitly clears legacy `args`;
the only program is now `prism-backup.sh` with the selected mode.

After reconciliation, verify each CronJob has exactly one container with the
chart's command and no legacy shell arguments. Do not run a retained legacy
container: its old program deletes aged backups or uses a fixed restore database.
Existing completed Jobs are historical evidence and do not acquire the new
template. Verify a newly created backup, checksum verification, and SQL restore
check before treating recovery as healthy. SQL restore checks alone do not prove
the full application recovery procedure above.
