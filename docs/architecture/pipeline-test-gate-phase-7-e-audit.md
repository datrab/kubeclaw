# Pipeline Test Gate Phase 7-E Audit

Date: 2026-08-10

## Purpose

Phase 7-E keeps the old suite worker only for suite migrations. It prevents the
old and new paths from becoming authoritative for the same test.

## Bridge boundary

The old runtime remains the only code that contains the 13 old suite names.
The new remote job contract, Nova importer, and Buster plan service contain no
suite-name list.

The old adapter configuration now uses `unmigratedSuites`. The old name
`allowedSuites` is not accepted in the adapter configuration. The capability
grant still uses `allowedSuites`; that is the general operator grant contract,
not the migration status.

## Deletion ledger

`legacy-suite-bridge.json` lists every old suite and its successor. Each entry
has one state:

- `unmigrated`: The old bridge can run it.
- `migrated`: The old bridge must reject it.

The verification test requires the runtime list to contain exactly the ledger
entries still marked `unmigrated`. A later suite migration changes the entry
to `migrated` and removes its old runtime mapping. The migrated entry remains
in the ledger as deletion history.

## Dual-authority check

`NovaTestGateAuthorityRouter` is the production entry point for mixed migration
runs. Nova compares requested old suites with provider contracts in the
resolved plan before it starts either path. It rejects a request when the
successor provider is already active in that plan. It also rejects unknown,
repeated, or migrated old suite names.

## Proof

`npm run verify:test-gate:legacy-bridge` proves:

- Exact runtime and ledger parity.
- Rejection of migrated suites.
- Rejection of unknown and repeated names.
- Rejection of new-provider and old-suite dual authority.
- Absence of the 13 suite names from the resolved-plan runtime.
- Explicit `unmigratedSuites` adapter configuration.

## Decision audit

- D-012 and D-054: New providers do not become a second special runtime class.
- D-091: The old adapter remains a temporary bridge.
- D-110: Resolved-plan work uses only the new remote protocol.
- D-112: The bridge is explicit, bounded, and deletion-ledger controlled.

## Phase result

Phase 7-E is complete. Phase 7-F can run the complete connection and retained-
capability proof.
