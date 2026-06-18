# Module 01 — BUSTER Test Instructions

## Test Scope

Validate that the foundation app can build, start, answer health checks, serve
the landing page, and run real unit tests.

## Test Requirements

- Run the configured deterministic `build`, `health`, and `unit` suites.
- Confirm `npm test` executes real tests rather than a placeholder script.
- Confirm the Dockerfile builds and the resulting container starts.
- Confirm `/health` returns a successful HTTP response.
- Confirm `/` loads without server-side errors.

## Setup / Fixtures

- No credentials are required.
- No external services are required.
- The app defaults to port `3000`; the deterministic harness may set `PORT`
  to the configured smoke-test port.

## Conventions

- Treat missing tests as a failure.
- Treat Docker build failures as blocking.
- Treat health endpoint failures as blocking.
