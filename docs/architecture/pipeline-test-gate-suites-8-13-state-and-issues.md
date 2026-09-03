# Suites 8 through 13 state and issues

This document is the durable source closeout record for Suites 8 through 13. Update it after each formal phase, independent audit, autoreview, commit, and infrastructure attempt. Source completion and production acceptance are separate states.

## Suite 8: API

Phase 8 implementation is complete in the working tree. Phase 9 has 32 proved parity items and no deferral. Phase 10 removes the legacy API authority. The fresh-context architecture audit found eleven issue groups. Valid findings were fixed in provider evidence paths, package ownership, strict flow validation, OpenAPI validation, suite composition, network policy, scaffolding path semantics, traceability, and vertical proof.

Autoreview then exercised the full patch repeatedly. It found and drove fixes for WebSocket method, authority, payload, and connection limits; OpenAPI references, media ranges, parameter enforcement, optional schemas, object constraints, unconstrained required bodies, cleanup ordering, OpenAPI 3.0 exclusive bounds, structural array uniqueness, cookie parameters, content-based parameter serialization, reference depth, repeated operation cases, and response content negotiation; typed headers; unsafe patterns; stable file errors; YAML aliases; legacy scoped paths and symlink boundaries; undeclared request data; suffix-based network authority; typed map values; deployment-target authorization; and the dependency edge from a generated API flow to its deployment fixture. The final network rule permits mutation, credential headers, and WebSocket only for an operator-configured exact origin or an endpoint in the current node's resolved Kubernetes deployment input. A suffix-only target stays read-only. The final Terra/high review reported no actionable finding and confidence 0.68.

The workflow documents were improved after the audit. They now distinguish fixed operator origins, runner-derived fixture scope, suffix-only reads, provider authority, and the later production cycle. The implementation, parity, and cutover plans remain separate so a source result cannot imply production acceptance.

No mock, fake HTTP service, fake WebSocket result, or capability emulator is used. Tests use real loopback servers and the real isolated provider runner. The known repository dependency audit reports 25 existing findings: 22 moderate and three high. This suite did not add a vulnerable runtime dependency. Production acceptance is deferred to the controlled cycle after all 13 source cutovers. There is no Suite 8 infrastructure blocker at source closeout.

## Suites 9 through 13

Accessibility, performance, visual regression, end-to-end, and security remain pending. No implementation or completion claim has been made for them in this record.
