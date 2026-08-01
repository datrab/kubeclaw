# Agent Deployments

Nova and Buster use OpenClaw gateway deployments. Pipeline execution is
provided by the shared v2 core and installed plugin packages. Buster also runs
the isolated v2 suite worker beside its gateway.

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
        port: 18891
```

Helm resolves the role to the canonical in-namespace `agent-<role>` Service and
renders `KUBECLAW_CAPABILITY_PROVIDERS`. No endpoint, namespace, port, agent
framework, or Buster-specific routing rule is embedded in pipeline core.

## Verification

Confirm Nova has its gateway/runtime container, Buster has its gateway plus
`buster-v2-runtime`, and neither deployment contains a `buster-pipeline`
image or container.

## Common Failures

Registry activation failures indicate invalid package, provider, trust, or
grant configuration.
