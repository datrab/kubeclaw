# Manifest-to-Lint Cutover Plan

Status: complete

## Objective

Make Nova lint the only authority for static Kubernetes validation. Delete the
old Buster `manifest` suite after all 28 parity items are proved.

## Ordered cutover

1. Require the 28-item parity ledger to remain fully proved.
2. Remove `kubernetes-schema` and `kubernetes-policy` from experimental mode.
3. Mark `manifest` migrated in the legacy bridge.
4. Reject `manifest` in the legacy job protocol.
5. Remove its registry, order, and dependency-graph entries.
6. Delete the legacy runner and parser.
7. Remove old project-setup fields and real-pipeline examples.
8. Replace live legacy fixtures with a remaining unmigrated suite.
9. Retain old comparison results only as immutable evidence.
10. Add executable absence checks and a sole-path Nova lint proof.
11. Update guides, ledgers, inventories, and the program plan.
12. Run focused checks, all regressions, and Terra review before promotion.

## Authority boundary

Nova owns the lint stage and its gate result. Buster no longer has a static
manifest suite. Kubernetes apply, readiness, health, and live-cluster behavior
remain separate runtime checks.

## Roll-forward rule

There is no legacy fallback. A bad Kubernetes lint declaration or tool failure
must be corrected in the Nova lint configuration or operator image. Restoring
the deleted Buster suite would create dual authority and is rejected by the
cutover checks.
