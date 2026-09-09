# Registry health caller/provider integration

The earlier registry slice left two actual E2E consumers pinned to anonymous
`registry-local:5001`. Their real HTTP runtime also lacked registry credentials,
required exact origin authorization, and normally allowed only ports 80/443.
This correction closes that specific caller/runtime gap without changing HTTP
or API-flow provider status assertions.

The original shared registry generator now exports a non-secret origin
projection. It validates the same closed contract and credential environment
names without resolving their values. The E2E workspace generator requires the
operator's `KUBECLAW_REGISTRY_CONFIG` before creating a workspace and embeds only
that origin. Health still expects 200; intentional failure still expects 599.

The actual entrypoint enables `networkHttp.registryHealth: true`. Production
configuration takes the existing container-build origin/reference and already
resolved credentials, validates their binding, and supplies private runtime
options. No second credential source exists. Node uses the existing supplied
CA through `NODE_EXTRA_CA_CERTS`. The network invoker authorizes this exact origin
and its actual port only for GET/HEAD `/v2/`. It rejects other paths, query/body,
caller headers except Accept, WebSockets, and redirects before following them.
Only content-type may be selected from response headers. Private credentials
are inserted after the original provider request boundary, never into authored
project configuration or provider logs. Known raw/base64 credential echoes in
the body or exported content-type fail before response delivery. Other allowed
origins receive no registry credentials. Explicit HTTP lab access is anonymous.

## Local evidence and limits

- `node --test tests/verification/deployment/registry-health.test.mts`: 3/3.
  Original HTTP and API-flow providers contact a real local HTTPS server through
  the original network invoker. Trusted CA and correct auth produce actual 200;
  intentional expected-599 flow fails on that 200. Untrusted CA, wrong password,
  foreign scope, method/path/query/body/header, redirect and credential-echo
  negatives pass. A second real HTTP server confirms foreign and lab requests
  contain no auth. The actual workspace generator requires the contract and
  exports no platform credential fields.
- Original HTTP and API-flow live/remediation suites pass.
- Original real-run-workspace suite passes 61/61 with its own explicit non-secret
  HTTPS registry fixture; the ordinary test command needs no external env.
  Focused generator tests retain production absence rejection.
- Original registry generator/real Helm/HTTPS-manifest tests pass 5/5.
- Original production runtime config consumer passes with additional actual
  loader checks: missing source/credential fails, configured server starts/stops,
  mismatched origin/reference fails. This does not execute BuildKit.
- Engine and strict focused-test TypeScript checks pass. New helper/test/shared
  generator/E2E generator pass canonical lint. Existing network runtime retains
  two baseline findings and production retains four; raw HEAD/current comparisons
  are preserved, with no suppressions. Complexity changes within those existing
  findings are visible in the logs.

Four other offline generator consumers received only explicit non-secret test
contract setup/restoration. Their original gates retain unrelated failures:
production-graph requires missing explicit coverage; v2-contract scanning rejects
generic `.v1` strings throughout existing harness files; Kubernetes cutover expects
an obsolete consumer `schemaId` on the producer reference; Tailscale cutover
reaches its nested implementation gate and cannot locate native kubectl. Raw
failures are preserved. No assertion, coverage, native execution or response was
substituted to close these gates. Actual opt-in HTTP/Kubernetes live scripts must
supply the real operator registry contract; their other old standalone registry
assumptions are not remediated by this health slice.

All raw `registry-health-*` evidence is retained. No deployment, CI or external
model execution occurred. This supersedes only the old anonymous E2E health
limitation in the initial registry implementation note. Native BuildKit push,
CRI pulls/real test Pods and mirror cache/offline acceptance remain open. HTTP
lab image security scanning remains explicitly unsupported.

## Owned paths

The exact committed scope is in the adjacent `registry-health-scope.json`. This slice owns
only origin-projection changes in the shared generator; registry-health helper,
network runtime and production helper/networkHttp wiring; the entrypoint boolean;
E2E origin selection; focused tests, operations text and this note. Earlier
registry, Ready, Redis and report changes remain separate. Root alone commits.

Independent counterreview passed the original HTTPS/provider tests (3/3), production-loader configuration gate and ordinary workspace suite (61/61), with zero skips. No demonstrated scoped blocker remains. The loader test validates configuration and server start/stop; a request through the complete loaded-runtime-to-registry chain remains a separate unverified integration gate.
