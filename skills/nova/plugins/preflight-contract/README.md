# Preflight contract plugin

Owns Forge blueprint preflight validation. It loads either one module-level
`FORGE.md` or the configured substep blueprints through
`git.repository.read`, verifies that owned Dockerfile and API-spec deliverables
are declared, and writes an immutable report through `artifacts.write`.

The package also owns `kubeclaw.validate.buildkit-preflight`. That stage sends
a committed repository snapshot through `test.suite.execute`, requires Buster's
real rootless-BuildKit build/deploy/health evidence, and then reads the OCI
manifest from the configured registry through `network.http`. It passes only
when the registry's `Docker-Content-Digest` matches the digest returned by the
Buster suite worker.

`npm test` covers the pure declaration and BuildKit-proof rules and runs real module and substep
files through the v2 registry, repository adapter, artifact adapter, effect
journal, and runner. It does not spawn an agent or invoke the E2E harness.
