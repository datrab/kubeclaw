# Telemetry contract v1

This is a retained v1 contract asset, delivered with Nova and Buster. No active
producer or consumer of this flat envelope was found in repository runtime code;
the active plugin telemetry envelope is a separate v2 contract. These files do
not implement ingestion, quarantine, ordering, retention or authorization.
External readers must be assessed before removing these delivered assets.

The wire envelope is flat. Correlation fields and event payload fields remain
top-level. `correlation_identity.schema.json` owns shared correlation definitions;
`envelope.schema.json` references them and owns the envelope-only fields. Payloads
reference envelope fields explicitly and can add stricter constraints. The
generator rejects unmarked collisions, resolves references and emits standalone
flat event schemas. To compile source payload schemas directly, register both
identity and envelope source schemas under their filenames. Unknown fields are
rejected where the schema is closed; `extensions` requires `evidence_provenance`
and allows additional fields.

`cursor` is required and nullable. A non-null cursor can describe
`<project>/<run_id>/<seq>`. The intended ordering of `seq` per `(project, run_id)`
and the meanings of occurred/emitted timestamps remain obligations of a future
consumer, not properties enforced by these schemas. Run identity must be a
nonempty string, and attempt is a nonnegative integer or null unless an event
adds a stricter rule. Source and authority strings do not authenticate a sender.

Generation inputs are the catalog, identity/envelope/payload schemas, the bundle
definitions in `scripts/generate-telemetry-contracts.mjs`, and its shared type
helper. The generator emits event/bundle schemas, Go/TypeScript types and a
132-file content manifest. TypeScript models required/null and union forms from
the same schemas. Go uses `json.RawMessage` for heterogeneous unions, open JSON
records, and optional nullable fields where pointers would conflate explicit
null with absence. Other optional typed fields use pointers to retain zero,
false and empty values; required nullable typed fields retain null. Unbounded
schema numbers use `json.Number`, preserving exact decimal wire values and avoiding an undocumented int64/uint64 limit.
These Go structs are data models, not schema validators: validate wire data
against its schema before decoding and after constructing new records.

Run with Node, TypeScript, Ajv, and Go/gofmt available on PATH:

```sh
node scripts/generate-telemetry-contracts.mjs
node scripts/generate-telemetry-contracts.mjs --check
node contracts/telemetry/v1/tests/contracts.test.mjs
```

The regression suite compiles every event/payload/bundle schema, verifies shared
identity and required fields, typechecks schema-valid TypeScript vectors, and
roundtrips those vectors through the actual generated Go structs. It also checks
the manifest and generator collision rejection. No runtime service or external
transport is started. Updating these retained schemas/types changes their
manifest hashes; existing external users must regenerate and revalidate. This
correction does not introduce a v1-to-v2 adapter or a new production consumer.
