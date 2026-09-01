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
        proxyPort: 28892
      test.plan.execute:
        adapter: buster-plan-v1
        scheme: http
        port: 18891
        proxyPort: 28891
```

Helm resolves the role to the canonical in-namespace `agent-<role>` Service and
renders `KUBECLAW_CAPABILITY_PROVIDERS`. No endpoint, namespace, port, agent
framework, or Buster-specific routing rule is embedded in pipeline core.

Production worker routes use local Envoy listeners. SPIRE supplies automatically
rotated X.509-SVIDs, and Envoy requires the expected peer SPIFFE ID over mTLS.
Worker Core accepts forwarded identity only from the loopback proxy. See the
[Worker Trust implementation reference](../security/worker-trust.md) and the
[operator runbook](../operations/worker-trust-runbook.md).

For Buster plan execution, the traffic path is:

```text
Nova application
  -> Nova Envoy 127.0.0.1:28891
  -> SPIFFE mTLS
  -> Buster Envoy agent-buster:18891
  -> Buster runtime 127.0.0.1:28891
```

The legacy route has the same shape with ports `28892` and `18892`.
Envoy does not proxy the OpenClaw gateway route on port `18789`.

Nova also signs each committed source snapshot with the local Ed25519
private key in `pipeline-test-gate-source-attestation`; Buster verifies it with
the corresponding public key before accepting the archive. This does not depend
on GitHub artifact attestations or any external signing service.

## Verification

Confirm Nova has its gateway and `worker-trust-proxy` containers. Confirm Buster
has its gateway, `buster-v2-runtime`, and `worker-trust-proxy`. Confirm Envoy
exposes plan port `18891` and legacy suite port `18892`. The Service must target
the Envoy port names `buster-plan` and `buster-legacy`. The runtime port names
must remain distinct as `buster-plan-local` and `buster-legacy-local` on ports
`28891` and `28892`. No Service may target the runtime ports. Neither deployment
contains `buster-pipeline`.

Run the complete live proof after Nova, Buster, and Prism are ready:

```bash
npm run verify:worker-core:trust:live
```

The command uses real SPIRE identities, real Envoy proxies, and real worker
processes. It does not accept a test-double boundary.

## Common Failures

Registry activation failures indicate invalid package, provider, trust, or
grant configuration.
