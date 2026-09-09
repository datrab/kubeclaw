# Visual Regression Operator Guide

## Ownership

Projects own selected routes, reviewed baseline images, target masks, and named profile selection. Operators own installed browser builds, allowed browser engines, origin authority, concurrency, deadlines, byte limits, and process resources.

## Runtime

Buster must package `kubeclaw.visual`, Playwright, Pixelmatch, PNGJS, and the pinned Chromium, Firefox, and WebKit builds. `browser.visual` must be the only browser-capture capability granted to the node. It blocks service workers, cross-origin HTTP, WebSockets, and WebRTC.

## Limits and monitoring

Monitor capture duration, compressed screenshot bytes, decoded pixel memory, result bytes, browser crashes, blocked-origin errors, digest mismatches, and difference rates. Keep combination and concurrency limits small. Treat repeated browser crashes or unexpected egress attempts as operator incidents.

## Upgrade

A browser or rendering-library upgrade changes capture identity. Produce candidates with the new worker, review all differences, and update the profile/baseline manifest in a separate approved change. Do not silently reuse baselines across browser versions.

Baselines now use `kubeclaw.visual-baselines.v2`. Every entry requires
`browserVersion` from the actual capturing browser's `version()` response. The
provider rejects missing versions and v1 manifests, then compares the captured
version with the baseline before invoking pixel comparison. A mismatch reports
the target and both versions even when the image bytes would be identical.
Recapture and explicitly review an upgraded baseline; do not populate old
manifests with the currently installed version or merely relabel them as v2.
The example version is illustrative, not an approved installed browser version.

## Recovery and rollback

The provider is retry-safe because it writes only attempt-local evidence. Cancellation closes browser processes. To roll back a bad baseline change, revert the reviewed baseline commit. To roll back runtime code, deploy the last accepted image; never re-enable the deleted legacy suite.

## Production verification

After all 13 source cutovers, run the combined production preflight. The visual receipt must bind Nova revision, Buster worker revision, workload digest, real browser version, imported evidence, runner cleanup, and observed Kubernetes cleanup. Production acceptance stays pending until that signed receipt passes.

The checked-in nginx preflight fixture still has its historical v1 baseline: its
original browser version cannot be reconstructed from the PNG. The production
preflight reports `VISUAL_BASELINE_MIGRATION_REQUIRED` locally before dispatch.
With the intended real browser available, generate a candidate using
`node scripts/generate-real-e2e-visual-baseline.mjs [browser-executable]`, review
the actual image and manifest changes, and commit that approval separately.
Omitting the executable selects the installed Playwright browser; it does not
download or substitute one. A candidate generated here is not automatically
approved for a different worker browser.
