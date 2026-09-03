# Packaging Verification

## Scope

Packaging verification covers the Nova, Buster, and Prism runtime trees under
`/app/skills`.

The authoritative rules are:

- `packaging/runtime/roles/*.json` selects packages and plugins.
- `scripts/build-runtime-role-bundle.mjs` assembles the exact package set.
- `scripts/package-agent-skill-bundle.sh` creates the release archive.
- Shared source is installed only when a role declares it.
- Project tests and internal build output do not enter runtime packages.
- Required third-party production dependencies do enter the bundle.
- The chart accepts only `pipeline-runtime-bundle.v1` package-set bundles.

There is no role-first/Common-second overlay.

## Guardrail Coverage

The checks fail for:

- Missing package dependencies.
- Unknown internal dependencies.
- A role that selects another role's package or plugin.
- Unknown external capability sources.
- Missing capability providers.
- Escaping entrypoints or targets.
- Target collisions.
- Source changes during assembly.
- Cross-role package or plugin leakage.
- A non-repeatable file tree or release archive.
- Broken Nova, Buster, or Prism entrypoints.
- A package link that escapes the bundle.
- Legacy Common overlay code in an archive.
- A custom skill that replaces a protected package-set path.

## Reproducible Checks

```bash
npm run verify:runtime-packaging:ownership
npm run verify:runtime-packaging:roles
npm run verify:runtime-packaging:builder
npm run verify:runtime-packaging:isolation
npm run verify:runtime-packaging:cutover
```

These checks build real Nova, Buster, and Prism bundles. They load all three entrypoints in
an isolated temporary directory. They also build each release archive twice
and compare the archive bytes.

The Prism proof additionally requires its canonical JSON Schema and minimal
fixture under `/app/skills/packages/prism-contract`. These contract assets are
therefore tied to the accepted bundle commit instead of the mutable project
repository checkout.
