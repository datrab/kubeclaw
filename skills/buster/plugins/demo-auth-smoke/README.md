# Demo authentication smoke test

`kubeclaw.demo-auth-smoke@1` is a blocking test provider for the explicitly
configured `json-session.v1` protocol. It consumes three native linked outputs:
`deployment`, generated `credentials`, and pending `exposure`. Missing, legacy,
foreign or expired input bindings fail; there is no generic HTTP-200 fallback.

The project must declare loginPath, usernameKey, passwordKey, cookieName,
protectedPath, usernamePointer and at least one independent business assertion
(JSON pointer plus scalar equals). Paths stay on the exact exposure origin.
The provider first requires unauthenticated denial (401/403), then performs real
JSON login, then requires an authenticated JSON response matching the generated
username and every business assertion. All redirects are denied by the original
network runtime. Only one host-only, HttpOnly session cookie with an explicit
covering Path is supported. HTTPS requires Secure. Domain cookies, expired
Max-Age, unsupported attributes/protocols and multiple cookies fail explicitly.

The operator network policy must grant POST and the content-type/cookie headers;
exact-origin fixture authority remains required. The original Buster entrypoint
now includes cookie in its existing header policy. The ordinary HTTP provider is
unchanged. The provider is not retry-safe: a lost login response can have created
an application session, and this package does not claim logout/reconciliation.

`demo-auth-evidence.v1` binds the observed URL, lease UID, image/manifest,
credential digest, native invocation identity, protocol digest, observation time
and three response status/digest pairs. Session cookies and response bodies are
not emitted or logged. This output alone is not readiness or source authority;
Nova must validate the original imported native links and final source evidence.

Tests use the original Go controller's actual random credential generation and
status-before-Secret HTTP path, and a real local session application through the
original network runtime. Lease/image/attempt metadata are labeled contract
vectors, not a deployed cluster or native-worker success. Native deployment,
compiled graph integration, Ready transition and operator acceptance remain open.
