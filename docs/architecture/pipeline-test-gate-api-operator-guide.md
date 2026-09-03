# API test suite operator guide

## Runtime policy

The Buster operator configures `network.http`. A target produced by an approved Kubernetes fixture is exact-scoped to the provider node that receives that typed deployment input. This lets the generated API suite test its disposable target without a global origin grant. Set exact `allowedOrigins` for other fixed services that can receive credentials, mutations, or WebSocket connections. The deployed runtime reads these fixed origins from the comma-separated `BUSTER_NETWORK_HTTP_EXACT_ORIGINS` environment variable. Supply it through operator-owned Helm `extraEnv`; do not put credentials in this value. A narrow `allowedHostSuffixes` entry permits only unauthenticated `GET` and `HEAD` requests with the `accept` header. It never authorizes mutation, credential headers, or WebSocket connections. Set `allowedPorts`, `allowedMethods`, and `allowedRequestHeaders`. Set `maximumRequestBytes`, `maximumResponseBytes`, and `maximumExecutionMs` to bounded positive values.

The production policy permits the methods needed by API tests and only four request headers: accept, authorization, content type, and x-api-key. These wider permissions apply only to an exact approved origin. Add another header only after reviewing the target and credential risk. WebSocket is disabled by default. Set operator-owned Helm `extraEnv` value `BUSTER_NETWORK_HTTP_ALLOW_WEBSOCKET` to the exact string `true` only when an exact approved origin needs WebSocket testing. The provider cannot widen these lists. Redirects remain denied, so the approved origin is the origin that receives the request.

## Triage

An errored node indicates invalid configuration, denied authority, a malformed contract, or an evidence failure. A failed node indicates a completed request with failed assertions, an unreachable target, or a timeout. Check the stable error code before changing policy. Do not widen an origin or header allowlist merely to make a test pass.

Use `npm run verify:test-gate:api-cutover` for the complete source gate. It runs real loopback HTTP and WebSocket services. It also runs the three-node suite in isolated provider processes. No Kubernetes deployment is required for this contained gate.

The final production cycle uses the shared Nova-to-Buster preflight after all 13 source cutovers. Until that cycle passes, record infrastructure faults in the shared suite state document. Do not change a source result to hide a missing cluster, image, DNS, or credential dependency.
