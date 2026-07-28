# Preflight contract plugin

Owns Forge blueprint preflight validation. It loads either one module-level
`FORGE.md` or the configured substep blueprints through
`git.repository.read`, verifies that owned Dockerfile and API-spec deliverables
are declared, and writes an immutable report through `artifacts.write`.

`npm test` covers the pure declaration rules and runs real module and substep
files through the v2 registry, repository adapter, artifact adapter, effect
journal, and runner. It does not spawn an agent or invoke the E2E harness.
