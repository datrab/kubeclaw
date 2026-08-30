# Operate Worker Trust

Status: implemented; live cluster execution pending
Audience: Kubernetes operator, security operator
Owner: platform operations
Evidence: scripts/deploy.sh; tests/verification/live/worker-trust-cluster-e2e.sh
Applies to: current supported release
Last verified: source checks on 2026-08-29

## Objective

Deploy Worker Trust and prove its security properties on a real cluster.

## Prerequisites

- Use the intended Kubernetes context.
- Install `helm`, `kubectl`, `node`, and `npm`.
- Deploy Nova, Buster, and Prism.
- Keep SPIRE and the CSI driver ready.
- Use authority to create temporary Jobs and ServiceAccounts.
- Use authority to execute commands in protected pods.

## Source Verification

1. Run the Worker Trust contract checks.

```bash
npm run verify:worker-core:trust
```

2. Run the Prism deployment checks.

```bash
npm run verify:prism:deploy-script
```

3. Run the deployment truth check.

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Expected result: each command exits with status `0`.

## Deployment

1. Prepare namespaces and Secrets.

```bash
./scripts/deploy.sh setup
```

2. Deploy SPIRE and shared infrastructure.

```bash
./scripts/deploy.sh infra
```

3. Deploy Nova and Buster.

```bash
./scripts/deploy.sh agents
```

4. Deploy Prism.

```bash
./scripts/deploy.sh prism
```

Expected result: all protected Deployments become ready.

## Live Proof

1. Set the base namespace.

```bash
export NAMESPACE="kubeclaw"
```

2. Set the active Prism namespace.

```bash
export PRISM_NAMESPACE="kubeclaw"
```

3. Confirm the current context.

```bash
kubectl config current-context
```

4. Run the complete live proof.

```bash
npm run verify:worker-core:trust:live
```

Expected result: the command exits with status `0` and prints final JSON evidence.

## Proven Positive Paths

The command checks these real paths:

- Nova to Buster.
- Nova to Prism control.
- Prism control to Prism worker.
- Prism worker to Prism control.
- Nova source signing and Buster execution.

## Proven Negative Paths

The command requires these attempts to fail:

- Direct Buster access without a client SVID.
- Direct Prism access without a client SVID.
- Buster access with a wrong SVID.
- Prism access with a wrong SVID.
- Access with a forged forwarded-certificate header.

The live proof uses real SPIRE identities and real deployed proxies. It does not
use a test-double server or fabricated completion result.

## Failure Order

Check these layers in order:

1. Kubernetes context.
2. Namespace names.
3. SPIFFE CSI driver.
4. SPIRE server and agents.
5. CSI socket mount.
6. Envoy readiness.
7. Loaded SVID.
8. Service target port.
9. NetworkPolicy in both directions.
10. Application identity allowlist.
11. Ed25519 source key configuration.

## Important Limits

- The live command does not wait for a timed SVID rotation.
- Prism results do not have durable Ed25519 provenance today.
- The source-attestation Secret supports one active keypair.
- Ed25519 rotation needs a maintenance window.

## Detailed Runbook

Use `docs/operations/worker-trust-runbook.md` for exact commands, error codes,
rotation steps, cleanup, and recovery.
