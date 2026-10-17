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
