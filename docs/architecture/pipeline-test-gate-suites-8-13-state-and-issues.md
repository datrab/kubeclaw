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

## Suite 12: End-to-end

Phase 8 adds the editable `kubeclaw.e2e-suite@1` suite, the `kubeclaw.playwright@1` provider, and the operator-owned `browser.playwright` capability. The contained proof uses a real HTTP server, the real Playwright runner, and real Chromium. A signed Nova-to-Buster vertical proof runs the provider in an isolated attempt and imports the structured report into Nova.

Phase 9 maps 30 baseline items to executable evidence and a controlled legacy comparison. The project Playwright configuration owns selection, browser projects, retries, authentication setup, screenshots, video, traces, and test timeouts. The KubeClaw overlay supplies the typed endpoint, canonical JSON reporter, total execution controls, and operator ceilings. Numeric failure allowances and console-text parsing are removed.

Phase 10 deletes the legacy `e2e.ts` authority and removes E2E from the legacy protocol, suite runner, examples, and production bridge. Project setup rejects all retired E2E configuration. The real workspace selects the replacement provider. The production preflight deploys a digest-bound fixture, sends a signed plan through Nova and Buster, imports the Playwright report, observes Kubernetes cleanup, and stores a suite-specific signed receipt.

The source proof uses no mock browser, fake Playwright result, emulator, or compatibility wrapper. Production acceptance remains pending until all 13 source cutovers complete.

The fresh-context architecture audit found ten material issue groups. The accepted corrections add the common `kubeclaw.e2e-result.v1` contract, a second-provider conformance record, strict count and identity validation in Buster, `--max-failures=0`, multiple-test continuation proof, explicit skip and zero-test proof, process/memory/CPU enforcement, complete serialized-result limits, attempt-owned output cleanup, generated-directory bundle exclusions, duplicate-delivery proof, independent Buster revision observation for receipts, stale legacy-consumer removal, and field/error/recovery documentation.

The audit proposed deletion of the project-setup rejection path as a compatibility adapter. This point was rejected. Project setup does not translate or run legacy E2E behavior. It fails with `LEGACY_E2E_CONFIGURATION_RETIRED`, which is the required cutover guard.

The Phase 8 workflow now requires a common provider result and explicit authority split. The Phase 9 workflow now requires named scenario evidence instead of source-file presence. The Phase 10 workflow now inventories generated runtime directories, stale live consumers, rollback rules, and the full production route. Final Terra/high review is required before commit and its result is recorded after it completes.

Terra/high then found two concurrent-network defects. Additive Kubernetes policies could let one untrusted attempt use another active lease route, and browser mode still permitted UDP. The capability now creates one attempt-local exact-origin proxy and injects it into every Playwright browser project. Native Landlock permits only the proxy's temporary TCP port. Seccomp denies Internet datagram and raw sockets. Real Chromium proves that a second origin receives no request, and the native isolation gate proves that UDP fails with `EPERM` or `EACCES`. The namespace controller still limits the trusted proxy's cluster route by immutable lease identity, target pod label, and service port.

The next reviews tightened this boundary further. Seccomp now denies packet, netlink, and every other socket family except Unix sockets and Internet stream sockets. The lease policy preserves Kubernetes DNS, while the installed namespace baseline retains the shared worker's Redis, Qdrant, registry, and agent routes. Cleanup starts before any temporary link, directory, proxy, or overlay is created. A real cancellation test starts a detached `setsid` descendant, sends `SIGTERM` to the attempt, and proves that the native subreaper kills and waits for the detached process.

The final resource audit found that `/proc` sampling could miss CPU used by a short-lived descendant. Production now requires a dedicated delegated cgroup v2 subtree. Each attempt gets a child cgroup with kernel PID, memory, swap, and CPU controls. Cumulative `cpu.stat` accounting includes processes after they exit. The signed production receipt must report `cgroup-v2`; the deployment command rejects sampled evidence. Contained tests use sampled accounting only because this development host exposes cgroups read-only. This does not satisfy production acceptance.

The next review found that Chromium's required `/proc` access could expose the trusted worker when both processes used one UID. Production now uses a capability-bearing launcher outside all project read roots. The launcher joins the attempt cgroup and changes the complete browser tree to UID `1001` before it applies Landlock and seccomp. The trusted worker stays at UID `1000`. The production image gives only this inaccessible launcher the required identity-change capability.

The final controller review found two Kubernetes edge cases. Lease names can exceed the label-value limit, so ownership labels and selectors now use one canonical 63-character value. Kubernetes policies can also observe the backend pod port after Service translation. The fixture capability now resolves the checked Service to one numeric backend container port and records it in the lease. The lease policy permits only the declared Service port and that resolved backend port. Tests cover long lease names, named target ports, and the `18080` to `80` production fixture mapping. One later portability finding was rejected because `_GNU_SOURCE` and `<limits.h>` were already present and the native sandbox rebuilt successfully. The final Terra/high review reported no accepted or actionable finding and confidence 0.62.

## Suite 13: Security

Phase 8 adds five independent providers: security headers, dependency
vulnerabilities, immutable image vulnerabilities, static Kubernetes policy,
and controller-observed Kubernetes runtime security. The contained proof uses
a real HTTP server, Trivy 0.74.0 with its real advisory database, a real
digest-pinned Alpine image, a real checked Kubernetes manifest, the isolated
Buster runner, and authenticated Nova-to-Buster dispatch. It uses no mock
scanner, fake advisory database, Kubernetes emulator, or compatibility
wrapper.

Phase 9 maps 33 baseline items to executable evidence or an explicit recorded
legacy fact. Seven behaviors are preserved, 21 are improved, and five old
defects are removed. The general lint registry no longer runs `npm audit` or
`pip-audit`; the dependency provider is the sole vulnerability authority.
Temporary acceptances bind the exact finding identity and expiry. Expired and
unused acceptances remain visible. Scanner errors remain execution errors.

Phase 10 deletes the legacy security runtime and the final legacy suite
transport. Project setup rejects retired security fields. The production
workspace declares all five provider nodes and links the image and manifest
through typed provider outputs. A suite-specific preflight sends a signed plan
through Nova and Buster, imports evidence, observes Kubernetes cleanup, and
stores a signed receipt.

The fresh-context architecture audit found material defects in the first
closeout candidate. The accepted fixes add the missing CRD fields and bounded
runtime-security status, give the controller the exact collection-read verbs
used by production, move runtime evaluation into the production Go controller,
add production-rule Go tests, remove duplicate dependency-scan authority,
normalize dependency findings, remove legacy security fields from the real
workspace, require all five node identities in evidence, use only the typed
container-build image input, add negative project-setup tests, and strengthen
the semantic Phase 8 and Phase 9 gates. The audit proposal to retain a second
TypeScript runtime oracle was rejected. Production now has one controller
implementation for that decision.

The workflow documents were improved after the audit. Phase 8 now requires a
rendered CRD and RBAC proof plus the production Go rule test. Phase 9 now
requires a sole-authority check and normalized finding fields. Phase 10 now
requires the real workspace to contain all five explicit nodes and no retired
configuration.

This development environment does not provide a real Kubernetes cluster. No
emulator is used in its place. The live controller, cleanup, and signed-receipt
proof remains pending for the controlled production cycle. This is the only
Suite 13 infrastructure blocker at source closeout.

Terra/high autoreview found and drove more fail-closed corrections. Runtime
inspection now rejects privileged containers, added Linux capabilities, and
unsafe ephemeral containers. The controller refreshes observations on each
poll and Buster rejects stale observations. Runtime findings have bounded
counts, identifiers, and serialized bytes. Trivy disables telemetry and uses
its local database for contained dependency and image scans. The controller
adds one critical overflow finding when it truncates runtime evidence.

The review also found an artifact-boundary mismatch and an HTTP path escape.
The runtime-security provider accepts an absolute manifest path only after the
capability resolves it inside the authorized repository root. Security-header
paths reject backslashes, and the provider verifies that the final URL keeps
the deployment origin before it sends a request. Real negative tests cover
both boundaries. One overflow-count finding was rejected after inspection:
the controller recomputes the omitted count after each reserved-slot removal,
and its Go regression test verifies the final count.

The final authority review found that removal of the old lint-based dependency
scanners could leave a project without dependency scanning. Project setup now
adds the blocking Trivy dependency provider to every Buster scope. The normal
production pipeline rejects a resolved scope that does not contain this
provider. Thus, the replacement is mandatory while `npm audit` and `pip-audit`
remain removed as duplicate authorities.

The following integrity review found that Buster accepted only the format of
the controller result digest. The controller and Buster now use the same
canonical findings-and-counts payload. Buster recomputes the digest and rejects
the observation when the value differs. Go and TypeScript tests use the same
fixed vector to prove that both implementations agree.

The next review found that declared truncation could omit its fail-closed
marker, and that composite scanner identifiers could exceed the common result
limit. Buster now requires exact count accounting and a final critical
`runtime:findings:overflow` item whenever the controller omits findings.
Dependency and Kubernetes-policy identifiers now use a stable SHA-256 suffix
when their complete normalized identity exceeds 256 characters.

Image findings also include the Trivy result target in their bounded identity.
This prevents two occurrences of the same vulnerability and package in
different image targets from collapsing into one duplicate identifier.
Individual identity components also use a hash suffix when they exceed their
component limit. Two long paths or resource identifiers with the same prefix
therefore remain distinct.

The exact-state review found two production defects after the concurrent-main
sync. Ready leases could patch a new observation on every controller poll, and
offline Java dependency scans lacked the Trivy Java index database. The
controller now refreshes runtime observations at a bounded five-second
interval and skips an unchanged status patch. The Buster image now downloads
and verifies both Trivy databases during the image build. Runtime scans disable
both database update paths.

The final exact-state Terra/high autoreview reported no accepted or actionable
finding and confidence 0.72. The complete plugin-system, migration,
documentation-publication, runtime-packaging, deployment-truth, signed-receipt,
and 61-case real-workspace gates passed on the synchronized `main` base.
