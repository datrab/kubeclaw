# Module 03 — Kubernetes Manifest And Final Section

## Goal

Add the Kubernetes deployment artifacts and a final landing-page section that
shows the smoke test is ready for final validation.

## Acceptance Criteria

- Keep all previous page and health behavior working.
- Add a third section with `id="deployment"` and `data-module="03-kubernetes"`.
- The third section mentions Docker image validation and Kubernetes deployment validation.
- Add `k8s/pipeline-smoke-landing.yaml` containing:
  - one `Deployment`
  - one `Service`
  - app label `app: pipeline-smoke-landing`
  - container image `pipeline-smoke-landing:latest`
  - container port `3000`
  - env var `NODE_ENV=production`
  - readiness probe on `/health`
  - liveness probe on `/health`
  - resource requests and limits
  - Service port `3000` targeting container port `3000`
- Do not include `metadata.namespace`; Buster's k8s suite owns the test namespace.
- Do not add an Ingress or Tailscale resource.
- Update unit tests so `npm test` proves the third section and manifest exist.

## Architecture Constraints

- The manifest must be valid multi-document YAML.
- Keep the image name easy for Buster to override: `pipeline-smoke-landing:latest`.
- Keep the app dependency-light and framework-free.
- Do not introduce cluster-specific configuration.

## Files To Produce

| File | Purpose |
|---|---|
| `src/page.js` | add final deployment section |
| `k8s/pipeline-smoke-landing.yaml` | Deployment and Service manifest |
| `test/page.test.js` | extend page assertions for the third section |
| `test/k8s-manifest.test.js` | simple manifest shape assertions using built-in Node APIs |
| `README.md` | mention Docker and Kubernetes files |

## Unit Tests (node:test)

Extend or add tests with these cases:

| File | What it tests |
|---|---|
| `test/page.test.js` | `renderPage()` includes `id="deployment"` and `data-module="03-kubernetes"`. |
| `test/k8s-manifest.test.js` | Manifest contains `kind: Deployment`, `kind: Service`, `pipeline-smoke-landing:latest`, `/health`, and `NODE_ENV`. |

