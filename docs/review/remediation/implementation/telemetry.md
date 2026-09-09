# WP01 — Retained telemetry v1 contract

Scope: PCR-TELEMETRY-CONTRACT-001/002, worktree 2026-09-09. This contract remains
an asset delivered to Nova/Buster. Searches of runtime source, commands,
packaging and generator references found no active flat-v1 producer/consumer.
The active v2 telemetry path is unchanged. No production consumer, conversion
adapter, service, deployment or external-client migration was introduced.

## Source correction

`correlation_identity.schema.json` remains the unchanged authoritative source
for shared identity properties. The envelope now references it, and all 53
payload source schemas explicitly reference envelope properties. Existing
stricter facets remain as intersections: non-null tool attempt/required gate
identities are not relaxed. The generator rejects an unmarked collision before
it can override envelope identity. It resolves approved references when emitting
flat event schemas, so generated event validation needs no new reference loader.
Standalone source-payload compilation registers identity and envelope schemas.

Type generation is source-driven, including cursor nullability, mandatory
extensions/evidence_provenance, identity enums and discriminated event/payload
associations. The shared generator helper supports the actual type/oneOf/allOf
forms and fails on unsupported conditional/anyOf/tuple/pattern-property forms.
Go heterogeneous unions use json.RawMessage rather than choosing a branch.
Optional nullable fields also use RawMessage to distinguish absent from explicit
null; ordinary optional scalar/array/struct fields use pointers to retain zero,
false and empty values. Required nullable fields retain their null branch.
Open records preserve their additional properties. Schema numbers (including unbounded integers and exact decimals)
use json.Number instead of imposing an undocumented signed/unsigned 64-bit cap.

Go models do not implement schema admission: missing required data still needs
schema rejection, and constructing a zero Go struct does not create a valid
record. The required JSON tags ensure required fields are not silently omitted.
No new downstream validation adapter is claimed.

## Before/after evidence

The original checkout's unchanged historical telemetry-contract-check.mjs ran:
132 manifest entries verified, 122 schemas compiled, golden accepted, missing
identity rejected, and gate.verdict with null run accepted despite envelope
rejection. Original TypeScript was compiled with real tsc: a missing-extensions
envelope compiled; a valid nullable cursor failed TS2322.

Go 1.24.13 was provisioned outside the repository from the official Go download,
archive SHA256 `1fc94b57134d51669c72173ad5d49fd62afb0f1db9bf3f798fd98ee423f8d730`.
Copies of the original generated Go files were compiled and executed with real
encoding/json: object reviewers and string lifecycle_version failed decoding;
null cursor roundtripped as an empty string. This closes the former toolchain
blocker; no replacement Go implementation was used.

Final command, with that toolchain's bin directory on PATH:

```sh
node contracts/telemetry/v1/tests/contracts.test.mjs
```

Result: all 53 event schemas preserve required envelope fields, reject null/
empty/non-string run identity and negative/fractional attempt, and retain each
permitted null/zero/one attempt according to event-specific restrictions. All
122 payload/event/bundle schemas compile with original Ajv and formats. Golden
wire data remains valid. The test constructs 4848 schema-valid union/presence
vectors, typechecks their generated TypeScript forms, and roundtrips them through
actual generated Go structs using encoding/json. Cases include every encountered
union branch, absent/null, zero/false/empty, open-record properties and integers
above int64 range. Required extensions and provenance have actual TypeScript
negative fixtures. This is library/schema conformance, not runtime ingestion.

The same test executes the original generator --check, verifies all 132 manifest
hashes/lengths, then runs the actual generator against a copied source tree with
an injected run_id collision and confirms TELEMETRY_ENVELOPE_COLLISION rejection.
No production sources are mutated by the regression. Canonical ESLint on the
changed generator/helper/test and git diff --check pass. Actual standalone Go
package compilation and TypeScript generated-file compilation also passed.

## Exact generated-asset and compatibility effect

Relative to the unchanged original manifest, **112 of 132 referenced files have
new bytes/hashes**: 53 payload sources, 53 generated event schemas, envelope
source, README and four generated Go/TS files. The manifest itself consequently
changes. The remaining 20 entries are byte-identical: correlation identity,
catalog, all 16 bundle schemas and both fixtures. No catalog version, schema ID,
package ownership or global lockfile changed. New test/helper/implementation-note
files are outside the manifest's existing asset inventory.

Identity-invalid events previously admitted through a payload override now
fail; schema-permitted heterogeneous/null forms now survive typed consumption.
These are explicit changes to delivered dormant assets, not a claim that their
old hashes or generated client APIs remain identical. External consumers, if
present, must regenerate/revalidate before adopting the corrected asset set.
No private records or credentials were needed for the tests.

Owned files: scripts/generate-telemetry-contracts.mjs;
scripts/lib/telemetry-type-generation.mjs; contracts/telemetry/v1/README.md,
envelope.schema.json, payloads/*.schema.json, events/*.schema.json,
telemetry-types.ts, telemetry_types.go, bundle-types.ts, bundle_types.go,
contract-manifest.json, tests/contracts.test.mjs; this note. The canonical
correlation source is read but byte-unchanged. Prior agent/Prism/test-gate and SDK
paths remained frozen throughout this task. Independent review is a separate
integrator gate; no commit/staging/register action was performed here.

Independent review identified a valid decimal that float64 rounded despite the
JS-generated vectors passing. All schema numbers now use json.Number. Additional
actual Go exact-wire decimal and numeric-field regressions pass. The reviewer
reran all 4848 vectors and schema/manifest tests after this correction; the
integrator repeated the same full command successfully. No scoped blocker remains.
