# Kubernetes Fixture Implementation Plan

Status: complete; superseded by parity and cutover

## Objective

Replace the old `k8s` test with `kubeclaw.kubernetes-fixture@1`.
The replacement remained shadow-only during implementation and parity.

## Contracts

- Consume one checked-manifest artifact.
- Consume one immutable local-registry image reference.
- Request one isolated namespace lease.
- Apply the exact checked manifest bytes.
- Wait for workload pod readiness.
- Return one typed deployment value.
- Run fixture cleanup after dependent work.

## Scope

The fixture prepares Kubernetes resources. It does not build, expose, or test
the application. It does not read Secret values.

## Real Proof

The live verifier uses the real provider process, command sandbox, typed
artifact link, Kubernetes API, namespace controller, local registry image,
Deployment, Service, pod readiness, and lease cleanup.

The first real run found an obsolete Role rule in the deployed namespace
controller. The source and chart remove the rule. The project owner accepted the
controller rollout as a deferred deployment action before cutover.

## Stop Conditions

- The 48-item baseline passes.
- Provider, resolver, capability, and lifecycle checks pass.
- User, operator, configuration, error, and security documents pass.
- The deployment deferral is recorded for the next controller rollout.
