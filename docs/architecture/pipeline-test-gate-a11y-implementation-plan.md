# Accessibility suite Phase 8 implementation plan

Status: implemented source design  
Audience: provider developers and reviewers  
Owner: Pipeline architecture  
Evidence: `skills/buster/plugins/axe` and `tests/verification/contracts/check-pipeline-a11y-implementation.mts`  
Applicable version: `kubeclaw.axe@1`  
Verification revision: pending Suite 9 commit

## Goal

Phase 8 replaces the legacy `a11y` runner with one isolated Axe provider. The provider delegates browser work to the `browser.axe` capability.

## Work sequence

1. Record each legacy behavior and architecture decision in the baseline.
2. Add a strict provider schema and a versioned suite template.
3. Add an operator-controlled real-browser capability to Buster.
4. Run Axe in a clean browser context for each route and profile.
5. Store full Axe results and bounded failed-element screenshots.
6. Add the provider to the Buster runtime package.
7. Convert legacy project declarations during project setup.
8. Prove the provider with a real HTTP server and a real browser.

## Authority

The operator controls allowed origins, browsers, execution limits, concurrency, result bytes, and screenshot bytes. A typed fixture can authorize its exact origin.

The project controls routes, Axe tags, excluded selectors, profiles, and exact acceptances. It cannot add a browser or network origin.

## Failure rules

Any unaccepted violation fails a blocking node. An acceptance must match the rule, route, and selector. It also needs a reason and expiry date.

Expired acceptances do not apply. Incomplete Axe results remain visible. Capability, browser, navigation, and evidence errors produce an error outcome.

## Exit criteria

The phase closes after real-browser tests pass. It also requires strict limits, clean contexts, exact versions, evidence, and project setup conversion.
