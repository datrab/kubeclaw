# Plugin SDK

This package is the only pipeline API plugins may import. Its contract types are generated from the canonical v2 JSON Schema. It cannot import core runtime internals or concrete plugins.

`src/index.ts` is the public runtime/type entrypoint. `src/testing/index.ts` contains plugin contract-test helpers that do not require core.
