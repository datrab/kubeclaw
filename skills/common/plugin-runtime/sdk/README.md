# Plugin SDK

This package is the only pipeline API plugins may import. Its contract types are generated from the canonical v2 JSON Schema. It cannot import core runtime internals or concrete plugins.

`src/index.ts` is the public runtime/type entrypoint. `src/testing/index.ts` contains plugin contract-test helpers that do not require core.

`canonicalJson` accepts JSON primitives (finite numbers), dense ordinary arrays,
and plain or null-prototype records containing only enumerable own string data
properties. It rejects undefined, holes, extra array properties, symbols,
accessors, proxies, exotic objects and cycles with `CANONICAL_JSON_*` errors.
Validation reads property descriptors without invoking getters or `toJSON`.
Repeated references are allowed if they do not form a cycle. JSON number spelling
is unchanged (including normalization of negative zero).

Ordering deliberately retains the existing `localeCompare` behavior because
these bytes identify persisted artifacts and effect payloads. This is not a
portable canonical JSON protocol: changing locale or key-order rules needs a
versioned storage migration. This function adds no size/depth budget; calling
boundaries remain responsible for resource limits. Redaction is a separate API
and is not a proof that arbitrary free text is safe to log.

Run `npm run build --workspace @kubeclaw/plugin-sdk` or
`npm run plugin-system:sdk:build` from the repository root. Both emit declaration
files and declaration maps into `dist/` using the same `tsconfig.build.json`.
`npm test --workspace @kubeclaw/plugin-sdk` checks the JSON value contract;
`node tests/verification/reliability/sdk-json-contract.test.mts` additionally
checks the real artifact adapter and durable effect journal consumer.

`portableJson` implements the named `kubeclaw-json.utf16.v1` codec: ascending UTF-16
code-unit object keys, existing strict JSON value admission, JSON.stringify
string/finite-number spelling, and array order preserved. It never consults ICU,
locale or an alternate comparator. Select it only through a versioned producer
contract; `canonicalJson` still denotes the historical unversioned contract.

`verifiedArtifactJsonText` consumes `artifact-json-bytes.v1` responses from the
existing artifact capability's `get_json_bytes` / `get_latest_json_bytes`
operations. It checks original UTF-8 byte count/hash, parsed value and stored
reference, and requires exact portable bytes when the reference declares that
codec. Untagged historical blobs retain their original byte identities: readers
do not reconstruct their locale, try collators or rewrite the stored digest.
Missing original-byte proof rejects. Existing caller run/stage/namespace and
expected digest checks remain mandatory. The versioned read response includes
both original JSON text and parsed value; caller artifact-size limits still
apply, and transport/storage envelopes must budget both representations.
