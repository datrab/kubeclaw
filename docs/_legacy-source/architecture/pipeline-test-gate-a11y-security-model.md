# Accessibility provider security model

Status: implemented  
Audience: security reviewers  
Owner: Pipeline architecture  
Evidence: `skills/buster/engine/test-gates/browser-axe-runtime.ts`  
Applicable version: `browser.axe`  
Verification revision: pending Suite 9 commit

## Trusted components

Nova resolution, the Buster capability policy, Playwright browser builds, and the isolated runner are trusted. The provider process cannot launch browsers directly.

## Untrusted project input

Routes, selectors, profile files, acceptances, and tested page content are untrusted. Strict schemas and runtime checks reject unsupported values.

## Credential ownership

The capability accepts no project credential field. Nova and Buster own transport authentication outside the provider configuration.

## File containment

The provider reads only a regular profile file inside the checked repository. It rejects traversal and an external symlink.

## Network access

The capability accepts operator origins and exact typed fixture origins. It blocks credentials, unauthorized origins, redirects to other origins, and cross-origin subresources.

The browser context blocks service workers. Context routing covers every page. WebSocket routing rejects a cross-origin connection. An initialization script removes WebRTC peer-connection constructors before project scripts run. Firefox also disables peer connections with an operator-owned browser preference.

## Installed provider identity

The runtime registry loads `kubeclaw.axe@1` from the trusted built-in plugin root. The resolved plan pins its provider digest.

## External-service identity

An operator origin or typed fixture identifies the target. Project input cannot authorize another origin.

## Input and output limits

Each route and profile uses a new browser context. Context state does not pass to another combination.

The runtime bounds combinations, concurrency, time, result bytes, screenshot count, and screenshot bytes. Cancellation closes all browsers.

## Integrity verification

Nova signs the committed source snapshot. Buster records result and evidence digests before Nova imports the decision.

## Cancellation and cleanup

Cancellation closes every launched browser. Each completed combination closes its isolated browser context.

## Known unavailable facilities

The local worker image contains only Chromium. Firefox and WebKit verification requires the new production Buster image.

## Final external proof

The final controlled cycle must use authenticated Nova dispatch and all three browser engines. Production acceptance stays pending until that receipt passes.

Project configuration cannot add an executable path or allowed browser. The operator owns both values.
