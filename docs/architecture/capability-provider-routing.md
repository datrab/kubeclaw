# Capability provider routing

Pipeline core coordinates capabilities. Extensions compose workflows. Adapters
integrate technologies. Receivers execute provider-specific behavior.

## Neutral boundary

Core knows only:

- capability identifiers and request contracts;
- registration grants and constraints;
- effects, idempotency, cancellation, receipts, and lifecycle;
- the selected adapter registration for each capability.

Core does not know Kubernetes Services, HTTP routes, OpenClaw, Kagent, Pi,
LangChain, ACP, Buster, or any provider response envelope.

The deployment catalog maps a named provider and capability to an adapter and
endpoint:

```yaml
capabilityProviders:
  buster:
    agentRole: buster
    capabilities:
      runtime.dispatch:
        adapter: openclaw
        port: 18789
      test.suite.execute:
        adapter: buster-suite-v2
        port: 18892
        proxyPort: 28892
      test.plan.execute:
        adapter: buster-plan-v1
        scheme: http
        port: 18891
        proxyPort: 28891
```

Helm renders the endpoint catalog from the provider role and capability routes.
Each capability has its own adapter and port; there is no implied companion
port or framework-specific default. A production route can select a local
`proxyPort`; Worker Core then sends plain HTTP only over pod loopback and Envoy
uses the service port with SPIFFE-authenticated mTLS.
Nova signs each committed source snapshot with a local Ed25519 key, and Buster
verifies that signature independently before accepting the archive. Transport
identity and artifact provenance use one Worker Core trust surface but remain
separate cryptographic proofs because their lifetimes differ.

## Receiver model

```text
pipeline core
  -> neutral capability request
  -> selected adapter
  -> provider-specific transport
  -> receiver implementation
  -> canonical capability response
```

For Buster, `test.plan.execute` reaches the provider-plan runtime.
`test.suite.execute` reaches the worker for suites that are not migrated.
`runtime.dispatch` reaches the OpenClaw gateway. The receivers share one
Kubernetes Service and use separate ports.

An alternative provider can implement `runtime.dispatch` with Kagent, Pi,
LangChain, ACP, a custom Python HTTP service, or a local process by installing
another adapter. It can implement `test.suite.execute` with an unrelated runner.
Neither change requires pipeline-core code.

## Composition and authority

Extensions own ordering between capabilities. A Buster judgment extension must
hold grants for both `test.suite.execute` and `runtime.dispatch`. It must obtain
a valid terminal suite receipt before dispatching reasoning. Missing or invalid
evidence blocks the extension; core never embeds a Buster-specific scheduling
branch.

Worker Core owns workload identity, proxy trust, and artifact-envelope
verification. Adapters select the configured trust mode and own cancellation
translation and response normalization. Receivers own provider-specific
execution. Provider credentials and native response formats never cross into
pipeline core.
