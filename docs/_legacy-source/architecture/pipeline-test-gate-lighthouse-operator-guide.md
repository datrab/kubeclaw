# Lighthouse test operator guide

The Buster worker runs real Lighthouse and real Chrome. Install the pinned Lighthouse dependency and an executable headless Chrome binary in the image.

Configure `browserLighthouse` with:

- `allowedOrigins`: exact operator-approved origins;
- `chromeExecutable`: an absolute executable path;
- `maximumRuns`: the total number of route samples in one capability call;
- `maximumExecutionMs`: the largest provider deadline;
- `maximumResultBytes`: the largest returned Lighthouse result.

The production default permits typed deployment fixture origins. It does not permit a provider to add an origin. The browser uses an exact-origin proxy. Cross-origin HTTP, HTTPS tunnels, and WebSocket upgrades fail the run.

Run `./scripts/deploy.sh nova-lighthouse-preflight IMAGE@sha256:DIGEST` after all source cutovers are complete. The image must listen on port 8080. The command deploys a real fixture, sends a signed plan from Nova to Buster, runs real Lighthouse, imports evidence, observes Kubernetes cleanup, signs a suite-specific receipt, and stops on any failed condition.

Do not mark production acceptance complete without the signed receipt in `dist/verification/lighthouse-production-receipt.json`.

## Install and upgrade

Build Buster with the lockfile-pinned Lighthouse version and the Playwright-pinned headless Chrome binary. Verify that `chromeExecutable` is executable by the non-root worker user. After an upgrade, run the contained cutover gate and the deployed preflight. Compare the recorded Lighthouse version, browser version, benchmark index, and scores before accepting the upgrade.

## Monitoring

Monitor attempt duration, Chrome exit errors, denied-origin errors, result-byte errors, and worker memory. A large benchmark-index change can invalidate comparisons even when the profile name is unchanged. Keep all reports for the configured evidence retention period.

## Restart and retry

Each attempt starts a new Chrome process and local exact-origin proxy. Cancellation and completion close both. The remote job store preserves the result and supports normal Buster recovery. Retry only a transient browser or worker failure. Do not retry a deterministic budget failure as a substitute for investigation.

## Rollback

Roll back the complete Nova and Buster image pair to the prior signed revision. Do not restore the old `perf` suite alone. After rollback, run the production preflight again and store a new receipt for that revision.

## Security checks

Confirm that the worker runs as non-root, the Chrome path is image-owned, and `allowedOrigins` contains only exact operator origins. Typed fixture origins are scoped to one resolved node. A cross-origin request must produce `BROWSER_LIGHTHOUSE_SUBRESOURCE_ORIGIN_DENIED`.
