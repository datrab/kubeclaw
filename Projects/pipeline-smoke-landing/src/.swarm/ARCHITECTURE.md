# Pipeline Smoke Landing Architecture

## Intent

This project is a small, disposable pipeline smoke test. The implementation
should stay simple enough that pipeline behavior is the thing being tested, not
application complexity.

## Target Application

Build one Node.js HTTP server that serves a single landing page and a JSON
health endpoint.

The final application should include:

- one HTML landing page at `/`
- one JSON health endpoint at `/health`
- plain CSS embedded or served by the app
- no browser framework
- no runtime dependencies unless a module has a clear reason
- `node --test` unit tests
- a production Dockerfile
- a Kubernetes Deployment and Service manifest

## Module Boundaries

1. `01-foundation`
   - Creates the app skeleton, first page section, health endpoint, unit tests,
     and Dockerfile.
   - Runs Forge and Buster.
   - Followed by `module-01-review`.

2. `02-content-polish`
   - Adds the second page section and responsive visual polish.
   - Runs Forge only.
   - Validation is deferred to later gates.

3. `03-kubernetes`
   - Adds the third page section and Kubernetes manifest.
   - Runs Forge only.
   - Followed by `module-03-review`.

Final validation runs through `final-buster`, then `final-review`.

## Explicit Omissions

- No approval gate.
- No Tailscale preview serving.
- No external services.
- No private configuration.

