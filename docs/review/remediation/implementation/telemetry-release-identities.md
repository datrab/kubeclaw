# PCR-TELEM-001: intended release observer identities

The existing phase12 release and import-safety gates both failed before the
change with `5 !== 6`. The historical audit observer was intentionally removed:
audit reads the durable journal directly. No production registration was added.

The two original gates now share explicit expected observer identities, module
paths, export names and observer provenance. Their role-manifest checks require
all five observers in Nova and the two agent-observability observers in Buster
and Prism. Expectations are fixed literals, not generated from the registry
under test. An equal-count replacement or a changed role selection therefore
fails. Import safety still activates the real registrations and checks the
activated identities. Existing 17-stage and 18-adapter assertions, namespace,
legacy-removal, import, entrypoint and nonrecursive-delivery checks remain.

Owned files:

- `tests/verification/contracts/check-plugin-system-v2-phase12.mts`
- `tests/verification/contracts/check-plugin-system-v2-import-safety.mjs`
- `tests/verification/contracts/plugin-system-v2-observer-expectations.mjs`
- This implementation note.

Validation on the shared current checkout: both original gates pass (46
packages; 17 stages, 5 observers, 18 adapters; 40 activated registrations).
The original `audit-projection.test.mts` passes using real journal bytes with
unavailable projection storage, repeat reads and corrupt-history rejection;
it requires no observer delivery. The original runtime-role manifest checker
passes all three roles. Canonical ESLint on all three verification files and
`git diff --check` pass. Before logs are
`/tmp/telem001-phase12-before.log` and `/tmp/telem001-import-before.log`.

This changes verification only. It does not claim deployment, live observer
delivery or closure of unrelated telemetry durability findings.
