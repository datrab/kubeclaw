# Suite 12 E2E Phase 8 implementation plan

## Purpose

Replace the legacy E2E runtime with an editable provider-plan suite. Implement decisions D-048 through D-050 without changing project-owned Playwright behavior.

## Required work

1. Register `kubeclaw.playwright@1` and `kubeclaw.e2e-suite@1`.
2. Accept one repository-relative project directory and Playwright config.
3. Supply the typed deployment origin through `PLAYWRIGHT_TEST_BASE_URL` and `BASE_URL`.
4. Force only the canonical JSON reporter and an operator-bounded worker maximum.
5. Use real Playwright and real browser processes.
6. Store the structured report and every bounded attachment.
7. Prove signed Nova dispatch, isolated Buster execution, evidence import, and deterministic gate policy.

## Authority split

- The repository owns test files, Playwright config, projects, retries, authentication setup, assertions, screenshots, video, traces, and per-test timeouts.
- Nova owns plan resolution, node mode, typed links, signing, dispatch, evidence import, and the gate decision.
- Buster owns the pinned Playwright binary, browser bundle, private attempt workspace, capability grants, effective limits, cancellation, cleanup, and evidence admission.
- The deployment fixture owns the target endpoint. A free-form URL is valid only when operator policy approves its exact origin.

## Implementation sequence

1. Define the strict project configuration schema and editable suite template.
2. Add the common `kubeclaw.e2e-result.v1` contract before the first provider uses it.
3. Implement the Playwright provider without a shell and without console-result parsing.
4. Implement the browser capability with canonical report/output paths and process-tree control.
5. Register only `browser.playwright` for the provider node.
6. Add the production runtime configuration and pinned browser paths.
7. Add a real local HTTP server, real Chromium, multiple tests, retry, skip, zero-test, limit, cancellation, and cleanup scenarios.
8. Add a signed Nova-to-Buster run and verify stored evidence and Nova decision.

## Failure rules

Invalid configuration, an unauthorized origin, zero tests, malformed JSON, a malformed common result, exceeded limits, cancellation cleanup failure, or browser startup failure is an execution error. A test that remains failed after project retries is a failed test result. Skips stay explicit. No numeric failure allowance exists.

## Exit criteria

The provider test, registry resolution, common-result validation, runtime packaging, documentation checks, and authenticated vertical proof pass. No console-text parser, fake browser, synthetic Playwright report, emulator, compatibility wrapper, or runtime package download is present.
