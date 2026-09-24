# Contributing

Keep core generic and put domain behavior in a package registration. Prefer a
smaller refactor or rewrite when it preserves behavior with less complexity.

The runtime entrypoint is `skills/nova/pipeline.ts`; the generic implementation
is `skills/common/plugin-runtime/`.

Run `npm run verify:plugin-system-v2` and `npm run docs:check`.
