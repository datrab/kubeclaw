# Material correction: real SDK object codec

Fresh independent challenge02 found that the initial binding proposal accepted
the invented `json-utf16-v1` alias instead of the actual SDK constant
`kubeclaw-json.utf16.v1`. The old schema/generator/control fixtures are preserved
unchanged as failed proposal inputs; their passed shape controls did **not**
establish codec compatibility. Independent report/recheck remains pending.

This corrected schema **supersedes only** the codec enum in the initial author
schema (plus a distinct proposal `$id`). Its generator checks exact conservation
of every other property. Proposed JSON closure objects use existing SDK
`portableJson` with `PORTABLE_JSON_ENCODING`; no new alias or historical codec
rewrite. `raw-bytes-v1` is explicitly a new proposed raw payload descriptor,
not a claimed SDK JSON encoding or RuntimeDispatchProfile codec. Installed
support for these binding records still requires approved C2/C5 implementation.

UTF16 in the SDK marker describes deterministic ordering of JSON object keys;
published **bytes** are UTF8 encoding of the resulting string. `object.bytes`
means physical encoded bytes, never `string.length`. `object.digest` is SHA256
of those exact published bytes. For generated membership/foundation/binding
records that carry an internal digest, that internal digest uses the unsigned
record with its own `digest` property removed; after adding it, the enclosing
object-reference digest hashes the complete published record. These two
identities must not be confused or made into a circular self-reference. Both
are verified on load; no pretty-printer may alter bytes after materialization.
JSON schemas are themselves captured schema objects using the same declared
portable encoding; secret contents cannot be carried as generic inline objects.
Legacy run-snapshot/graph/effect codec dispatch remains unchanged.

`correct-and-check.mjs` ran six real schema shape checks and SDK serialization
controls including Unicode physical-byte separation and rejection of the wrong
alias. Raw output identifies original/corrected schemas, actual SDK source and
the checker. `portable-payload.json` stores exact payload bytes. These are
**author definition controls**, not grant/content-authentication/physical-store
or productive binding acceptance. Fresh independent material recheck is required.
