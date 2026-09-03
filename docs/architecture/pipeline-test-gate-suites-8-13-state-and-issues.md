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

## Suites 10 through 13

Performance, visual regression, end-to-end, and security remain pending. No implementation or completion claim has been made for them in this record.
