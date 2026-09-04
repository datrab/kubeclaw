# Visual Regression Phase 10 Cutover Plan

## Objective

Make `kubeclaw.visual@1` the sole visual-regression execution authority.

## Deletion boundary

Delete the legacy visual suite, image comparison, screenshot tool, Discord delivery, protocol mapping, runner registration, capability mapping, visual-specific artifact exception, stale project examples, and stale Prism callers. Retain shared browser-profile contracts and the canonical evidence/notification systems. The canonical cutover inventory must name executable sole-path, dual-authority, and absence tests.

Project setup must reject legacy `test_suites: [visual-reg]` and `test_config.visual-reg`. It must not infer a baseline or translate old thresholds. A project must declare reviewed baseline and profile files in `.swarm/pipeline.json`.

## Production boundary

The source cutover can complete before the final cluster cycle. Production acceptance stays `pending` until the combined preflight runs real deployed Nova and Buster images, a real Kubernetes workload, real Chromium, a signed receipt, imported evidence, and observed cleanup. The signed receipt must bind the exact immutable workload image and its SHA-256 digest.

## Phase exit

The absence gate must prove deletion and no dual authority. The production workspace must select the provider. Documentation and migration status must agree. The final Terra/high review must have no accepted finding.
