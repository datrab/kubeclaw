# Agent Deployments

Nova and Buster use OpenClaw gateway deployments. Pipeline execution is
provided by the shared v2 core and installed plugin packages. Buster runs the
plan runtime and the remaining legacy suite worker beside its gateway.

## Deploy

Render the chart with `my-values/nova-values.yaml` or
`my-values/buster-values.yaml`.

Nova addresses remote execution through the neutral `capabilityProviders`
catalog. Each provider declares an `agentRole` and routes every capability
independently:

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
      test.plan.execute:
        adapter: buster-plan-v1
        scheme: http
        port: 18891
```

Helm resolves the role to the canonical in-namespace `agent-<role>` Service and
renders `KUBECLAW_CAPABILITY_PROVIDERS`. No endpoint, namespace, port, agent
framework, or Buster-specific routing rule is embedded in pipeline core.

The plan route uses its existing bearer token over the internal cluster
Service. It does not require a source-attestation key or certificate Secret.

## Verification

Confirm Nova has its gateway container. Confirm Buster has its gateway and
`buster-v2-runtime`. Confirm the runtime exposes plan port 18891 and legacy
suite port 18892. Neither deployment contains `buster-pipeline`.

## Common Failures

Registry activation failures indicate invalid package, provider, trust, or
grant configuration.
