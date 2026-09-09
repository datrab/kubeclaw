# Clean observer build and role packaging

The plugin-system verification gate imported observer configuration from a clean checkout before generating its local copy of the canonical agent-observability contract. Generated source in the development checkout masked the missing prerequisite.

The gate now builds the observer first. The direct observer build synchronizes the canonical source itself, so invoking `node scripts/build.mjs` does not depend on npm lifecycle hooks. The redundant npm prebuild hook is removed. Runtime role assembly also synchronizes the observer contract before selecting and hashing extension files. The bundle checker verifies canonical contract bytes and imports the packaged observer configuration for Nova, Buster, and Prism; no checker exemption is added.

Canonical input defaults to `contracts/agent-observability/v1/src` in the existing repository-relative layout. Existing Docker stages retain this layout under `/tmp`, including their manual canonical copy. Detached builds can provide `node scripts/build.mjs --contract-source /absolute/path/to/canonical/src`. Missing canonical input fails even when generated output exists. Generated source is replaced, never used as an implicit fallback. Compilation completes before the existing dist directory is removed and copied; that replacement is not atomic.

## Verification

Verification used the isolated `kubeclaw-observer-verification` checkout at `9b4e68abba036826001b7635aefce8beddcc4e14`, with only this observer patch applied and installed dependencies. Observer generated source and dist were explicitly removed; no generated observer cache from the active development checkout was copied.

- `node skills/common/plugins/openclaw-agent-observer/tests/clean-build.test.mjs` passed with the actual TypeScript compiler. It covers fresh generation in the default repository/Docker-shaped layout, importable emitted configuration and contract, an explicit detached canonical source, removal of stale generated output, and missing-source rejection despite existing generated files.
- `npm run plugin-system:sandbox:build` and `node tests/verification/contracts/check-runtime-bundle-builder.mjs` passed. All three real role bundles passed canonical byte checks, observer imports, existing role facade imports, and package-boundary assertions. The first bundle started with no observer generated source.
- `npm test --workspace @kubeclaw/openclaw-agent-observer` passed, including typechecking, configuration/live-function/package-boundary suites, and all four remediation tests.
- After removing observer generated source and dist again, `npm run build --workspace @kubeclaw/openclaw-agent-observer` passed.
- Scoped `git diff --check` passed.

No full Docker image build or global verification gate was run in this slice. Docker source-layout compatibility was exercised with actual local compilation; gateway image/runtime integration remains outside this evidence. No CI, deployment, mock compiler, shim, or staging/commit operation was performed.
