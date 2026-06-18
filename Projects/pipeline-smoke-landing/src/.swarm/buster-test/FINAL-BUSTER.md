# Final Buster Validation

## Test Scope

Run the complete deterministic validation set for the smoke-test app after all
modules have landed.

## Required Suites

- `build`
- `health`
- `unit`
- `manifest`
- `k8s`

## Required Outcomes

- The Dockerfile builds successfully.
- The app starts and answers `/health`.
- The root page `/` loads.
- `npm test` passes with real tests.
- `k8s/pipeline-smoke-landing.yaml` is parseable and includes Deployment and
  Service resources.
- The Kubernetes suite can build, push, deploy, wait for readiness, and clean up
  the test namespace.
- No Tailscale preview is requested.

## Failure Policy

Treat any build, health, unit, manifest, or Kubernetes failure as blocking.
Use the configured fix-and-retest loop for app or manifest issues.

