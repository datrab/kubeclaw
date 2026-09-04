# Visual Regression Operator Guide

## Ownership

Projects own selected routes, reviewed baseline images, target masks, and named profile selection. Operators own installed browser builds, allowed browser engines, origin authority, concurrency, deadlines, byte limits, and process resources.

## Runtime

Buster must package `kubeclaw.visual`, Playwright, Pixelmatch, PNGJS, and the pinned Chromium, Firefox, and WebKit builds. `browser.visual` must be the only browser-capture capability granted to the node. It blocks service workers, cross-origin HTTP, WebSockets, and WebRTC.

## Limits and monitoring

Monitor capture duration, compressed screenshot bytes, decoded pixel memory, result bytes, browser crashes, blocked-origin errors, digest mismatches, and difference rates. Keep combination and concurrency limits small. Treat repeated browser crashes or unexpected egress attempts as operator incidents.

## Upgrade

A browser or rendering-library upgrade changes capture identity. Produce candidates with the new worker, review all differences, and update the profile/baseline manifest in a separate approved change. Do not silently reuse baselines across browser versions.

## Recovery and rollback

The provider is retry-safe because it writes only attempt-local evidence. Cancellation closes browser processes. To roll back a bad baseline change, revert the reviewed baseline commit. To roll back runtime code, deploy the last accepted image; never re-enable the deleted legacy suite.

## Production verification

After all 13 source cutovers, run the combined production preflight. The visual receipt must bind Nova revision, Buster worker revision, workload digest, real browser version, imported evidence, runner cleanup, and observed Kubernetes cleanup. Production acceptance stays pending until that signed receipt passes.
