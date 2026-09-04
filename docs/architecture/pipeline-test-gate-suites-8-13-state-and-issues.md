# Suites 8 through 13 state and issues

This document is the durable source closeout record for Suites 8 through 13. Update it after each formal phase, independent audit, autoreview, commit, and infrastructure attempt. Source completion and production acceptance are separate states.

## Suite 8: API

Phase 8 implementation is complete in the working tree. Phase 9 has 32 proved parity items and no deferral. Phase 10 removes the legacy API authority. The fresh-context architecture audit found eleven issue groups. Valid findings were fixed in provider evidence paths, package ownership, strict flow validation, OpenAPI validation, suite composition, network policy, scaffolding path semantics, traceability, and vertical proof.

Autoreview then exercised the full patch repeatedly. It found and drove fixes for WebSocket method, authority, payload, and connection limits; OpenAPI references, media ranges, parameter enforcement, optional schemas, object constraints, unconstrained required bodies, cleanup ordering, OpenAPI 3.0 exclusive bounds, structural array uniqueness, cookie parameters, content-based parameter serialization, reference depth, repeated operation cases, and response content negotiation; typed headers; unsafe patterns; stable file errors; YAML aliases; legacy scoped paths and symlink boundaries; undeclared request data; suffix-based network authority; typed map values; deployment-target authorization; and the dependency edge from a generated API flow to its deployment fixture. The final network rule permits mutation, credential headers, and WebSocket only for an operator-configured exact origin or an endpoint in the current node's resolved Kubernetes deployment input. A suffix-only target stays read-only. The final Terra/high review reported no actionable finding and confidence 0.68.

The workflow documents were improved after the audit. They now distinguish fixed operator origins, runner-derived fixture scope, suffix-only reads, provider authority, and the later production cycle. The implementation, parity, and cutover plans remain separate so a source result cannot imply production acceptance.

No mock, fake HTTP service, fake WebSocket result, or capability emulator is used. Tests use real loopback servers and the real isolated provider runner. The known repository dependency audit reports 25 existing findings: 22 moderate and three high. This suite did not add a vulnerable runtime dependency. Production acceptance is deferred to the controlled cycle after all 13 source cutovers. There is no Suite 8 infrastructure blocker at source closeout.

## Suite 9: Accessibility

Phase 8 adds `kubeclaw.axe@1` and the operator-controlled `browser.axe` capability. The contained proof uses a real HTTP server, real Chromium, and real Axe. It uses no mock, emulator, or runtime compatibility wrapper. The offline project scaffolder performs one reviewed source conversion.

Phase 9 maps 24 baseline items to executable assertions or an explicit production-preflight assertion. Numeric violation thresholds are removed. Exact, temporary acceptances require a rule, route, selector, reason, and expiry.

Phase 10 removes the legacy `a11y` suite authority. Project setup creates a provider node or rejects retired threshold configuration. The Buster production image installs Chromium, Firefox, and WebKit.

The fresh-context architecture audit found gaps in accepted-violation counts, isolated-runner proof, browser egress, evidence identity, shared-profile validation, deletion inventory, documentation, and production orchestration. Valid findings were fixed. The offline scaffolder was retained because it is a one-time source migration tool and is not called by the runtime.

Terra/high autoreview found and drove fixes for parallel screenshot allocation, operator browser executable paths, legacy timeout bounds, redirect egress, same-origin WebSockets, WebRTC egress, Chromium sandbox settings, the Axe analysis deadline, fixed-origin operator policy, and hybrid legacy threshold rejection. One image-packaging finding was rejected after the Docker and runtime discovery paths proved that the full provider tree is copied. The final review reported no accepted or actionable finding with confidence 0.72.

The repository-wide plugin gate also exposed stale Phase 6, engine, and checkpoint verification paths after the Nova engine changed to digest-based run directories. The tests now use the production run-root resolver. The corrected full plugin gate passes.

Local infrastructure currently contains only the Chromium browser build. An attempted Playwright download for Firefox and WebKit did not complete in this environment and was stopped. No substitute browser was used. The production image installs all three engines. `nova-a11y-preflight` now sends a signed plan through Nova and Buster, runs all three real engines with Axe, imports evidence, verifies fixture deletion, and stores a signed receipt. Full cross-browser production acceptance remains pending for the final controlled cycle.

## Suite 10: Performance

Phase 8 adds `kubeclaw.lighthouse@1` and the operator-controlled `browser.lighthouse` capability. The contained proof uses a real HTTP server, real Chrome, and Lighthouse 13.4.1. Performance, SEO, and best-practices are separate purposes. Lighthouse accessibility is removed because Axe owns that decision.

Phase 9 maps 40 baseline items to executable proof. Performance runs three times by default and permits five runs for an important gate. Runs are sequential. The provider stores every report and marks the median-score report as representative. Named combined budgets enforce score, LCP, CLS, and TBT for each route. SEO and best-practices keep every failed audit visible and use exact temporary acceptances.

Phase 10 deletes the old direct Lighthouse suite and rejects unsafe flat legacy thresholds. The new provider is packaged in Buster and selected by the real production workspace. `nova-lighthouse-preflight` sends a signed plan through Nova and Buster, uses a real Kubernetes fixture, runs three real Lighthouse samples, imports evidence, verifies cleanup, and stores a signed suite receipt.

The fresh-context architecture audit found ten valid issue groups. Fixes added strict runtime settings validation, mandatory budgets for blocking performance nodes, representative-report receipt checks, a 40-item legacy baseline, an authenticated Nova-to-Buster vertical proof, one-report median selection, audit execution-error handling, suite-specific production receipt identity, a complete deletion inventory, and richer user and operator guidance. The offline project scaffolder remains a one-time migration tool; it is not a runtime compatibility path.

The workflow now requires parity proof paths to exist. It also keeps source cutover separate from the final deployed production receipt. No mock, fake browser, Lighthouse substitute, or runtime compatibility wrapper is used. Production acceptance remains pending for the controlled cycle after all 13 source cutovers. Autoreview found and drove one final HTTPS CONNECT authority fix for default ports and IPv6. The final Terra/high autoreview reported no accepted or actionable finding and confidence 0.76.

## Suite 11: Visual regression

Phase 8 adds `kubeclaw.visual@1` and operator-owned `browser.visual`. The contained proof uses a real HTTP server, real Chromium, real Playwright screenshots, PNGJS, and Pixelmatch. The provider verifies manifest, bundle, image, route, browser, viewport, page-condition, and mask identity before it compares pixels.

Phase 9 maps 30 baseline items to executable proof. The workflow now requires file-backed semantic proof and a controlled old/new comparison. It separates deterministic comparison from optional agent review, baseline approval, and Discord delivery.

Phase 10 deletes the legacy visual suite, direct screenshot tool, image helper, Discord delivery, protocol mapping, runner mapping, capability mapping, and visual-specific artifact exception. Project setup rejects all retired visual configuration. The production workspace selects the replacement and uses a digest-bound baseline generated from the exact real E2E fixture.

The fresh-context architecture audit found seven valid closeout groups. The fixes add admissible signed receipts for Axe, Lighthouse, and visual proofs; bind the exact workload image and digest; add canonical sole-path, dual-authority, and absence tests; replace source-only parity citations with real provider behavior; execute the old and new PNG comparison against the same unchanged and changed inputs; remove stale Prism, example, project-setup, and legacy runner callers; bound compressed PNG bytes and decoded pixel memory before PNGJS allocation; and reject retired visual configuration even when `test_suites` is empty.

The real behavior proof now covers more than the normal pass and changed-page cases. It also proves multiple named routes, exact masks, uncertain fail-safe results, invalid profiles, digest mismatch, identity mismatch, path escape, cross-origin subresource denial, WebSocket denial, cancellation, combination limits, malformed Base64, decoded-image limits, and baseline immutability. The authenticated Nova-to-Buster proof imports visual evidence and the blocking decision. The deployed production path remains a separate pending proof because this source closeout does not have authority to simulate Kubernetes cleanup.

The workflow documents were improved after the audit. They now make the canonical migration inventory mandatory, identify the production receipt and image binding, require an executable controlled comparison, and distinguish the narrow source-authority cutover from full production acceptance.

Terra/high autoreview found that the configured target maximum could create more evidence files and bytes than the runner budget permits. The provider now rejects an impossible target count before browser capture. It buffers the bounded evidence, checks the aggregate byte budget, and writes files only after the complete set fits. Real negative tests prove both limits.

A later Terra/high pass found that the navigation timeout was applied per target instead of to the complete capture request, and that a dimension mismatch reused the current image as the difference artifact. The capability now has one shared capture deadline, closes all browsers when that deadline expires, and passes only the remaining time to each browser operation. A dimension mismatch now creates a real padded Pixelmatch difference PNG. Real tests prove the deadline and the distinct difference evidence.

The next pass found that the capability checked its aggregate result budget only after it retained every Base64 screenshot. The capability now reserves aggregate result bytes after each capture and closes the active browsers as soon as the next result cannot fit. This prevents a many-target request from accumulating an unbounded in-memory response. A real-browser negative test proves early rejection.

The following pass found that a very tall uniform page could have a small compressed PNG but a large decoded surface. Before capture, Buster now measures the full page at the selected device scale and rejects unsafe dimensions or pixel memory. It also verifies the returned PNG dimensions before Base64 conversion. A real tall-page test proves this limit. The final Terra/high review reported no accepted or actionable finding and confidence 0.77.

No mock browser, fake screenshot, image emulator, or compatibility wrapper is used. Production acceptance remains pending for the controlled final cycle.

## Suites 12 and 13

End-to-end and security remain pending. No implementation or completion claim has been made for them in this record.
