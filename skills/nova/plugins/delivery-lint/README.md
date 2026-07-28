# Delivery lint plugin

Owns the single `kubeclaw.lint.delivery` stage. It validates Dockerfile delivery paths using only `git.repository.read` and publishes its immutable report through `artifacts.write`.

The package imports only the public plugin SDK. It contains no Nova/core imports and no host filesystem access.

## Configuration and input

The registration uses the closed schemas in `schemas/`. Configuration controls
the report namespace. Input identifies the module, repository path, declared
Dockerfile, and optional static delivery destination. Paths are read through
`git.repository.read`; the package never opens the repository directly.

## Results and artifacts

- `passed` means the declaration is absent or the Dockerfile delivery path is
  internally consistent.
- `request_fix` includes a package-owned reason code and remediation guidance
  for a missing/mismatched delivery artifact.
- `blocked` reports an unavailable repository/artifact capability or invalid
  execution input.

Every execution writes an immutable JSON report through `artifacts.write`.

## Installation, replacement, and removal

Install the complete directory beneath an operator-configured trusted plugin
root. Registry discovery validates its inert manifest, schemas, provenance,
content digest, grants, and provider selection before activation. Replacement
means installing a newly versioned/digested complete directory and using it for
a new run. Removing this directory removes the registration; core has no
delivery-lint import or fallback implementation.

Grant only `git.repository.read` and `artifacts.write`, constrained to the
intended repository and `kubeclaw.delivery-lint` artifact namespace.

## Testing

`npm test` builds the package, proves that production files do not import or
forward to the retained v1 validator, and runs the stage through the real v2
registry, repository adapter, artifact adapter, effect journal, and pipeline
runner. The live function test uses temporary files only and never spawns an
agent or invokes the E2E harness.
