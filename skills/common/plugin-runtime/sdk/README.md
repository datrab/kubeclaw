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
