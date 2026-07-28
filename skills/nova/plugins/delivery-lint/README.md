# Delivery lint plugin

Owns the single `kubeclaw.lint.delivery` stage. It validates Dockerfile delivery paths using only `git.repository.read` and publishes its immutable report through `artifacts.write`.

The package imports only the public plugin SDK. It contains no Nova/core imports and no host filesystem access.

`npm test` builds the package, proves that production files do not import or
forward to the retained v1 validator, and runs the stage through the real v2
registry, repository adapter, artifact adapter, effect journal, and pipeline
runner. The live function test uses temporary files only and never spawns an
agent or invokes the E2E harness.
