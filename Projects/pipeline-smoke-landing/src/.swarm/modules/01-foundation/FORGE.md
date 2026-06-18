# Module 01 — Landing Page Foundation

## Goal

Create the smallest useful landing-page app for testing the pipeline: a Node.js
HTTP server with a first visible section, a health endpoint, unit tests, and a
production Dockerfile.

## Acceptance Criteria

- `npm start` starts an HTTP server on `process.env.PORT || 3000`.
- `GET /health` returns HTTP 200 JSON with:
  - `status: "ok"`
  - `service: "pipeline-smoke-landing"`
  - `module: "01-foundation"`
- `GET /` returns HTTP 200 HTML.
- The HTML includes:
  - `<title>Pipeline Smoke Landing</title>`
  - a `<main>` landmark
  - one section with `id="foundation"` and `data-module="01-foundation"`
  - visible copy that makes the page clearly about the OpenClaw pipeline smoke test
  - responsive CSS that works at mobile and desktop widths
- The app uses no runtime dependencies.
- `npm test` runs real `node --test` tests.
- The Dockerfile:
  - uses a fully qualified base image reference
  - sets `NODE_ENV=production`
  - exposes port `3000`
  - runs as the built-in `node` user
  - starts with `npm start`

## Architecture Constraints

- Keep the app as plain Node.js and plain HTML/CSS.
- Prefer small, testable functions over inline string assembly inside the server
  request handler.
- Export pure helpers from source files so unit tests can cover rendering and
  health payload behavior without starting a server.
- Do not add Kubernetes manifests in this module.
- Do not add the second or third landing-page sections in this module.

## Files To Produce

| File | Purpose |
|---|---|
| `package.json` | scripts for `start` and `test`; package metadata |
| `server.js` | HTTP server entrypoint |
| `src/page.js` | pure HTML rendering helpers |
| `src/health.js` | pure health payload helper |
| `test/page.test.js` | unit tests for page rendering |
| `test/health.test.js` | unit tests for health payload |
| `Dockerfile` | production container image |

## Unit Tests (node:test)

Write unit tests with the built-in `node:test` and `node:assert/strict`.

| File | What it tests |
|---|---|
| `test/page.test.js` | `renderPage()` includes the title, `<main>`, `id="foundation"`, and `data-module="01-foundation"`. |
| `test/health.test.js` | `buildHealthPayload()` returns `status: "ok"`, `service: "pipeline-smoke-landing"`, and `module: "01-foundation"`. |

## Out Of Scope

- Second landing-page section.
- Third landing-page section.
- Kubernetes Deployment and Service.
- Tailscale or Ingress resources.

