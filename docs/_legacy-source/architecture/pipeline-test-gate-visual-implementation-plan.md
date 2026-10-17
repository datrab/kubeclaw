# Visual Regression Phase 8 Implementation Plan

## Objective

Replace `visual-reg` with `kubeclaw.visual@1`. The provider uses the brokered `browser.visual` capability. The capability runs pinned Playwright browsers. The provider owns deterministic PNG comparison and evidence declarations.

## Authority and data flow

Nova resolves the node and exact capability grant. Nova signs the repository archive. Buster verifies the request, restores the job, creates an isolated attempt workspace, and loads the provider. The provider reads only the reviewed manifest, profiles, and PNG files. The capability receives one authorized origin and explicit route/profile combinations. Buster stores evidence. Nova imports the result and makes the gate decision.

## Required implementation

1. Add strict schemas for the node, shared browser profiles, and baseline manifest.
2. Verify repository containment, symlinks, file digests, bundle digest, and capture identity.
3. Run real Chromium, Firefox, or WebKit under operator limits.
4. Block service workers, cross-origin requests, WebSockets, and WebRTC.
5. Disable motion and record all masks.
6. Store baseline, current, difference, and JSON report evidence.
7. Keep baseline mutation, agent review, and Discord delivery outside deterministic verdict authority.
8. Add a contained authenticated Nova-to-Buster proof and a deployed production preflight.

## Phase exit

The phase passes only when real-browser provider tests, strict contract tests, the isolated runner, authenticated dispatch, evidence import, documentation checks, and package-boundary checks pass with zero mock results.
