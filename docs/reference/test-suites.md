# Buster Test Suites

Status: current
Audience: reference reader, developer

## Summary

Buster suites are deterministic checks requested by module or gate `test_suites` in `progress.json`. Suite config lives under `test_config`.

## Suite Statuses

- `PASS`: checks passed or evidence-only findings did not violate thresholds.
- `FAIL`: enforced thresholds failed.
- `ERROR`: suite could not execute correctly.
- `SKIP`: suite intentionally skipped because an optional precondition or capability was absent.

## Suites

### `build`

Purpose: compile and serve static/server apps.

Inputs: `test_config.serve`; optional Dockerfile, build context, deployment/secret YAML.

Artifacts: build output, server metadata, findings.

Failure behavior: canonical image, Dockerfile, command, secret-env, or early-crash issues can fail.

### `health`

Purpose: HTTP readiness and optional smoke-path checks.

Inputs: `serve.port`, `serve.health_path`, retry/timeout settings, optional smoke paths.

Artifacts: response status, response time, smoke path failures.

Failure behavior: unavailable URL or non-2xx response fails.

### `unit`

Purpose: run unit tests and parse common framework output.

Inputs: `unit.test_cmd`, thresholds.

Artifacts: parsed totals and failure details.

Failure behavior: enforced failures above `thresholds.max_failures` fail.

### `api`

Purpose: run HTTP and optional WebSocket checks from a JSON spec.

Inputs: `api.spec_file`, auth setup, defaults, thresholds.

Artifacts: request results and findings.

Failure behavior: requested API suite requires an existing non-empty spec; auth/template/config failures are typed failures.

### `e2e`

Purpose: run end-to-end/browser tests.

Inputs: e2e command/test directory/timeout and thresholds.

Artifacts: parsed test output and findings.

Failure behavior: enforced failures above threshold fail.

### `a11y`

Purpose: run Playwright plus axe-core accessibility checks.

Inputs: `a11y.path`, `a11y.tags`, `a11y.exclude`, `a11y.thresholds`.

Artifacts: violations, findings, tested URL.

Failure behavior: without thresholds it is evidence-only; with thresholds violations can fail.

### `visual-reg`

Purpose: compare screenshots against reviewed baselines.

Inputs: `visual-reg` config, baseline metadata under module baselines, optional Discord media settings.

Artifacts: actual screenshots, diff images, page results, optional Discord delivery metadata.

Failure behavior: missing required baseline metadata is an error; thresholds decide enforced failure.

### `bundle`

Purpose: inspect build output size/file count.

Inputs: `bundle.thresholds`.

Artifacts: bundle metrics and findings.

Failure behavior: enforced size/count threshold failure.

### `perf`

Purpose: performance-oriented checks.

Inputs: `perf.thresholds`.

Artifacts: score/metric findings.

Failure behavior: enforced threshold failure.

### `security`

Purpose: HTTP security checks.

Inputs: paths/header expectations/CORS settings/thresholds.

Artifacts: security findings.

Failure behavior: enforced missing header or CORS findings fail.

### `manifest`

Purpose: validate Kubernetes deployment/secret manifest references.

Inputs: `manifest.deployment_yaml`, `manifest.secret_yaml`, `required_env`, `private_registries`, thresholds.

Artifacts: manifest findings.

Failure behavior: missing required env, missing pull secret expectations, or malformed manifests fail when thresholds enforce them.

### `k8s`

Purpose: build, push, deploy into broker namespace, wait for readiness, and optionally keep final previews.

Inputs: Dockerfile/build context, image name, service name, manifest paths, health path, preview config, secrets to copy.

Artifacts: namespace lease, manifest apply result, pod readiness, service URL, preview URL, credential retrieval command metadata.

Failure behavior: namespace lease failure, build/push failure, manifest apply failure, readiness timeout, health failure, or preview setup failure can fail.

## Capabilities

Known Buster capabilities:

- `static_web_server`
- `container_runtime`
- `kubernetes_api`
- `browser_automation`
- `lighthouse`
- `discord_media`
- `image_prepull`

Unknown capabilities reject the task before suite execution.

## Generated From

This page is manually maintained from `skills/buster/pipeline/suites/*.ts`, `skills/buster/pipeline/runners/suite-runner.ts`, and `skills/buster/pipeline/services/capabilities.ts`.
