# Preflight contract plugin

Owns Forge blueprint preflight validation. It loads either one module-level
`FORGE.md` or the configured substep blueprints through
`git.repository.read`, verifies that owned Dockerfile and API-spec deliverables
are declared, and writes an immutable report through `artifacts.write`.

Container-build preflight uses the production test-plan route. Nova sends a
committed source snapshot to `kubeclaw.container-build@1`. Buster verifies the
pushed manifest digest before Nova accepts the result.

`npm test` covers the declaration rules and runs real module and substep
files through the v2 registry, repository adapter, artifact adapter, effect
journal, and runner. It does not spawn an agent or invoke the E2E harness.

## Explicit delivery declaration and migration

Each consumed `FORGE.md` must contain exactly one complete fenced block tagged
`kubeclaw-deliverables`. This is authored project intent; neither the scaffold nor
preflight derives it from filenames, ownership, or prose. Example:

```kubeclaw-deliverables
{"schemaVersion":"forge-deliverables.v1","moduleId":"web","substep":null,"deliverables":["docker/Dockerfile","api/openapi.yaml"]}
```

The object is closed: all four fields are required and additional fields reject.
Paths are exact canonical repository-relative file paths: no absolute paths,
backslashes, traversal, empty segments or `.` segments. For configured substeps,
each separate blueprint names its exact `substep` instead of `null`. All selected
blueprints must validate before their declarations are combined; a path assigned
to multiple substeps is rejected. An explicit empty array is valid when that
blueprint has no deliverables. A nested fenced documentation example is not a declaration.

`ownedPaths` describes repository-relative ownership prefixes (exact path or
slash-boundary descendants, with an optional trailing slash). It determines
whether this module must declare `serveDockerfile`; suffix matches do not count.
The configured `apiSpecFile` remains an explicit required declaration regardless
of ownership. Ownership never creates a delivery declaration.

Missing/malformed declarations block with `preflight_contract.declaration_invalid`;
a valid declaration missing a required exact path returns `request_fix`.
Existing prose-only blueprints require an authored declaration before retrying.
Keep these same `FORGE.md` files in the existing reviewed/synced control paths;
this plugin checks current repository bytes and does not independently create
an immutable source approval or prove implementation/build success.

The `nova-project.v2` compiler emits the companion `kubeclaw.validate.source-preflight`
stage before the one Blueprint sync and module lane. That stage captures these
same declarations from the existing immutable ReviewSubject and publishes typed
source evidence including its exact project contract. Sync/implementation require
its selected producer and input digest; the optional architecture agent consumes
the same subject and actual contract bytes. The standalone mutable-read stage
retains its narrower declaration-check semantics. Existing project-setup discovery
reads FORGE files; it does not author their delivery intent.
