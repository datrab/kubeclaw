# API suite Phase 10 cutover plan

## Objective

Phase 10 removes the old Buster API authority after implementation and parity are green. The replacement authority is the declared `kubeclaw.api-suite@1` plan. It contains HTTP, API flow, and OpenAPI nodes. Projects can exclude or override nodes explicitly.

## Ordered cutover

1. Confirm the implementation and parity gates.
2. Convert project scaffolding so `test_suites: ["api"]` produces an API flow node.
3. Reject legacy specification files that do not declare `kubeclaw.api-flow.v1`.
4. Remove `api` from the legacy protocol, runner order, dependency graph, and production legacy suite list.
5. Delete the five legacy API source files.
6. Mark the bridge migrated and update D-044 through D-047.
7. Run absence, dual-authority, scaffold, runtime packaging, documentation, and vertical tests.

## Rollback rule

Rollback restores the last complete source commit. It must not restore both authorities at once. A project conversion error must stop scaffolding with a stable code and preserve the original project file for operator correction.

## Exit criteria

Source cutover closes only when the inventory finds every replacement, finds no legacy source, and confirms provider-plan execution in the real workspace path. Production acceptance remains a separate final cycle after Suites 8 through 13 finish. No documentation-only change can close source cutover.
