# API test suite security model

Project configuration is untrusted. The operator owns network authority. A project can request a method or header, but the capability sends it only when policy allows it. Mutating methods, credential-bearing headers, and WebSocket connections require an exact approved origin. Exact scope comes from operator configuration or from a typed deployment fixture that the runner resolved for the current node. A provider cannot declare its own fixture scope. A DNS suffix grants only read-only `GET` or `HEAD` requests with `accept`. The capability also verifies the origin, port, request size, response size, timeout, and redirect behavior.

Repository file access uses canonical paths below the assigned repository root. Absolute paths, traversal, symbolic-link escape, oversized files, unknown fields, and unsupported versions are rejected. OpenAPI external references are rejected. JSON selectors read own properties only and cannot traverse prototypes.

The provider process has no direct network permission. It asks the Buster capability to perform each request. The capability returns bounded data. Results include assertion messages, counts, status, duration, and evidence references. They do not include complete response bodies, extracted tokens, or request authorization values.

The main residual risk is an approved API test that mutates an approved service. Operators must use dedicated test identities and disposable targets. Header and method allowlists must remain narrow. Cleanup is best effort after a request failure, but a failed cleanup request still fails the result and remains visible in evidence.
