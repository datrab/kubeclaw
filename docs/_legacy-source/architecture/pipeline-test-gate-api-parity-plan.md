# API suite Phase 9 parity plan

## Purpose

Phase 9 proves that the replacement preserves useful behavior, improves weak behavior, and removes unsafe behavior. The baseline contains 32 reviewable requirements. Every identifier must have one disposition, one proved status, a short reason, and a machine-readable proof path.

## Comparison method

The review compares the deleted runner with the replacement at five boundaries: configuration, HTTP and WebSocket execution, assertion results, evidence, and authority. Real local servers prove request behavior. Schema and negative tests prove invalid configuration. The cutover test proves that no legacy execution path remains.

The replacement intentionally removes `max_failures` and informational success. One failed strict assertion now fails a blocking node. Retries belong to the shared runner. Request targets and mutation rights belong to operator policy. OpenAPI adds explicit operation selection and runtime request and response validation.

## No-mock rule

Tests may use temporary files and loopback servers. They may not replace the network capability, return invented HTTP responses, emulate WebSockets, or bypass the isolated provider runner in the vertical proof. Package-local tests can call a provider directly only while using the real capability and real servers.

## Exit criteria

Parity closes when all 32 identifiers are proved, no item is deferred, and `check-suite-parity-ledger.mjs` accepts the baseline and ledger. Any behavior that is not preserved must be named as an improvement or removed defect. A missing proof keeps the phase open.
