# Plugin configuration inventory: independent bounded review

The seven-plugin inventory is accepted after the correction recorded below.
This is a bounded source inventory review, not runtime or whole-CONFIG
acceptance. The initial checkpoint and its finding are retained here.

[Independent schema and source comparison](../../evidence/independent-config-plugin-inventory-20260921/result.json)
confirms all 31 field patterns cover the seven schemas' top-level properties.
All 135 preserved source snapshots match their recorded identities. The seven
inspected plugins' production sources remain unchanged; seven shared/fixture
files changed during the separately documented TTL migration. Those changes
are reported explicitly, not treated as a frozen current tree.

The reviewer inspected the actual Wait, Telemetry, Operator, HTTP and Secret
decoders, notification consumption, the registry validation/activation path
and manual retirement interpretation. Numeric and string fallback values in
the inventory match those sources. Configured HTTP defaults and request-level
HTTP method semantics remain distinct. No claim is made here about the other
18 registrations, external packages or manifest-policy migration.

## Required correction

[wait-projection-reader.ts](../../../../skills/nova/core/state/wait-projection-reader.ts)
also interprets historical `maxEntryBytes` with `Number(config.maxEntryBytes ??
1048576)`. This third interpretation path must be included alongside Wait's
factory and manual retirement. Removing only the two already named fallbacks
would leave a configurable historical default in Core. The historical-snapshot
analysis identified this path and the reviewer confirmed the actual source.
The inventory author has been asked to add this consumer and its source identity
without overwriting the original snapshots.

The review's first identity check incorrectly grouped plugin test files with
production; two TTL-edited test modules caused that check to fail. The corrected
comparison separates tests explicitly and retains the initial
[classification error](../../evidence/independent-config-plugin-inventory-20260921/initial-check-failure.json).
No source drift was hidden and no production criterion was weakened.

## Correction verified

The author added the historical Core reader to the report and the existing
`maxEntryBytes` inventory row, including its numeric coercion and original
snapshot authority. The new reader snapshot matches the inspected current
source exactly. An independent [comparison](../../evidence/independent-config-plugin-inventory-20260921/correction.json)
confirms all 31 fields remain and only that field's consumer metadata changed.
The original 135 snapshots remain intact; the source addition is separate.

The finding is resolved for this inventory. The actual Wait migration must
still replace all three interpretations correctly, preserve immutable historical
evidence and reject unknown producer semantics. No plugin configuration code
was changed or runtime-tested by this inventory acceptance; the 18 uninspected
registrations and wider Core/manifest policy remain open.
