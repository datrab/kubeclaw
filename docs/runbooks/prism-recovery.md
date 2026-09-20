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
