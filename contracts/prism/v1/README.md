# Prism v1 contracts

The schemas and generated standalone Ajv validators remain the wire source of
truth. Public validation also checks document semantics. Regenerate with
`npm run generate:validators --prefix contracts/prism/v1`; generated code must
remain browser/CSP compatible.

Every public validation entrypoint admits input before recursive validation:
maximum JSON depth 256 (root at zero), 1,000,000 value occurrences and own enumerable
property occurrences, and 32 MiB encoded JSON. The byte ceiling matches archive admission
and accommodates the existing 16M-character asset-source field. These are upper
library limits; Control and worker transport limits can be lower. Shared
acyclic references count once per serialized occurrence. Complexity failures
throw `PrismContractError` with a stable `code` and the existing `PRISM_*_INVALID`
prefix. No payload truncation or catch-and-accept fallback occurs. Preflight runs
on already parsed values; it does not bound an upstream parser's allocation.

Semantic validation separately caps component and nested override depth at 256
and reference/patch work at 1,000,000 visits. View-state and responsive patches
follow the existing component-patch rule: `component` and `itemComponent` cannot
be changed there. Change the canonical node with a typed operation instead.
Variant and override targets are checked against the same unchanged component;
state and viewport combinations therefore retain that target identity. This
library does not replace renderer expansion or output budgets.

`npm test --prefix contracts/prism/v1` runs existing fixtures and regression
checks using the actual renderer and worker binding. `npm run typecheck --prefix
contracts/prism/v1` checks the package; Studio's production build checks the
browser consumer. Schema IDs, schema digests and generated validator bytes are
unchanged by the admission/semantic corrections.
