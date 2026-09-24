# Accessibility test suite operator guide

Status: implemented  
Audience: runtime operators  
Owner: Pipeline architecture  
Evidence: `skills/buster/engine/test-gates/browser-axe-runtime.ts`  
Applicable version: `browser.axe`  
Verification revision: pending Suite 9 commit

## Responsibilities

The operator owns browser builds, executable paths, origins, and resource limits. Project authors own reviewed routes and profiles.

## Terms

The Buster runtime hosts the isolated provider and the `browser.axe` capability. The final production cycle uses authenticated Nova dispatch.

## Supported host requirements

The image needs Linux libraries supported by Playwright 1.62.1. It needs sufficient memory for the configured browser concurrency.

## Installation

Install the Playwright Chromium, Firefox, and WebKit builds in the Buster image. Do not use a system browser with an unknown revision.

Build and deploy `docker/Dockerfile.buster-runtime`. The Docker build installs all three Playwright browser engines.

## Complete configuration example

The production entrypoint declares the complete `browserAxe` policy object. Use those bounded values as the default production policy.

## Field reference

See `docs/architecture/pipeline-test-gate-a11y-configuration-reference.md`.

## Credentials and transport security

The browser capability does not accept credentials. Nova signs source and uses the authenticated Buster plan route.

## File and network permissions

Set exact allowed origins for fixed services with operator-owned Helm `extraEnv` value `BUSTER_BROWSER_AXE_EXACT_ORIGINS`. Use a comma-separated list of HTTP or HTTPS origins without paths. A node can also receive one typed deployment or public endpoint fixture without a global grant.

Profile files must stay inside the repository. Browser pages cannot load a cross-origin HTTP or WebSocket resource.

## Capacity and concurrency

Keep the combination, concurrency, execution, result, screenshot count, and screenshot byte limits finite. The runtime rejects invalid limits at startup.

## Preflight checks

1. Confirm that all three browser directories exist in the image.
2. Confirm that the Buster runtime reports healthy.
3. Confirm that Nova and Buster use the intended revisions.
4. Confirm that the target has a typed fixture or approved exact origin.

Expected result: Every preflight condition is true before the scan starts.

## Start and stop procedure

Start Buster with `docker/buster-runtime-entrypoint.sh`. Stop the workload through the deployment controller. The runtime closes active browsers during cancellation.

## Verification and expected output

Run the Suite 9 cutover gate. A passing local proof reports `realBrowser`, `realAxe`, and zero mocks.

## Monitoring and evidence locations

Check `axe-results.json` for the full Axe result. Check separate PNG evidence for failed elements. Confirm the browser version in provider details.

## Troubleshooting

Use the stable error reference. Check capability errors before changing project configuration. Never increase a limit without reviewing the target page count.

## Upgrade

Update the pinned Playwright package and image browser builds together. Rerun Chromium, Firefox, and WebKit production acceptance.

## Rollback

Roll back the complete Buster image and source revision together. Do not restore the legacy A11y runner beside the provider.

## Production acceptance

Run the final remote Nova-to-Buster cycle after all 13 source cutovers. That cycle must exercise all three installed browser engines.

Use one digest-pinned HTTP workload image that listens on port `8080`:

```bash
./scripts/deploy.sh nova-a11y-preflight \
  registry.example.invalid/kubeclaw/a11y-fixture@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

The command creates a temporary Kubernetes fixture, sends the signed plan from Nova to Buster, runs real Chromium, Firefox, WebKit, and Axe, imports the evidence, waits for fixture deletion, and stores `dist/verification/a11y-production-receipt.json`. The operator signs the receipt only after cluster cleanup is visible.

If browser installation is incomplete, keep production acceptance pending. Do not substitute a browser emulator.

## Operator checklist

- All browser versions are recorded.
- Every origin is exact and reviewed.
- Resource limits are finite.
- Evidence contains no embedded credentials.
- Cleanup and cancellation completed.
