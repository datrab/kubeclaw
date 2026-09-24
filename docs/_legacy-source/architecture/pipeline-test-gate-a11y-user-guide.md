# Accessibility test suite user guide

Status: implemented  
Audience: project authors  
Owner: Pipeline architecture  
Evidence: `skills/buster/plugins/axe/schemas/config.schema.json`  
Applicable version: `kubeclaw.axe@1`  
Verification revision: pending Suite 9 commit

## Purpose

Use the accessibility suite for browser-rendered pages. Declare each route that needs a WCAG check.

## Scope exclusions

This suite does not replace manual assistive-technology review. It does not test native mobile applications.

## Terms

A profile names one browser and page context. A combination is one route and one profile. An acceptance is one temporary exception.

## Smallest working declaration

Use `contracts/pipeline-test-gate/v1/examples/a11y-config.json` as a complete source example. The smallest configuration contains `routes` with one path.

## Complete field reference

See `docs/architecture/pipeline-test-gate-a11y-configuration-reference.md`.

## Common project layouts

Use a deployment input for an in-cluster service. Use an endpoint input for an approved public preview. Use `url` only for an operator-approved fixed origin.

## Blocking and advisory behavior

Use `desktop` and `mobile` for the standard Chromium profiles. Use a reviewed profile file when the project needs another browser or viewport.

An unaccepted violation fails a blocking node. Do not use a total violation threshold.

Set node mode to `advisory` when findings must not block the gate. The provider still returns the same result.

## Inputs and outputs

The optional `deployment` and `endpoint` inputs authorize one exact origin. The provider returns findings, metrics, evidence, and provider details.

## Evidence

An acceptance must contain the Axe rule, route, selector, reason, and expiry date. Keep the expiry short and remove fixed acceptances.

The result lists each tested route, profile, browser, and exact browser version. Failed elements can have screenshot evidence.

## Retry, timeout, cancellation, and restart

The provider is retry-safe because each combination uses a clean context. Timeout or cancellation closes browser resources. Durable plan recovery reruns an incomplete attempt.

## Disable or remove the test

Remove the Axe node from the project test declaration. Do not keep an empty node.

## Local and continuous-integration verification

Run `npm test --prefix skills/buster/plugins/axe` for the real local browser proof. Run the Suite 9 cutover gate before commit.

## Common errors and corrections

Use the error reference for stable codes. Origin failures require operator policy or a typed fixture. Profile failures require a valid shared profile document.

## Migration notes

Project setup converts safe legacy route, tag, exclusion, and timeout fields once. It rejects retired numeric thresholds.

Do not put credentials in routes or configuration. The provider rejects URL credentials and cross-origin subresources.
