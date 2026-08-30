# Worker Trust

Status: implemented; live cluster proof pending
Audience: architecture reader, maintainer, security reviewer
Owner: Worker Core and platform operations
Evidence: skills/worker/core/worker/trust.ts; charts/kubeclaw/templates/configmap-worker-trust.yaml; charts/prism/templates/configmap-worker-trust.yaml
Applies to: current supported release
Last verified: source checks on 2026-08-29

## Purpose

Worker Trust protects traffic between KubeClaw workers.

SPIFFE identifies each Kubernetes workload. SPIRE issues short-lived
X.509-SVIDs. Envoy uses those certificates for mutual TLS.

Worker Core checks the verified identity after Envoy accepts the connection.

## Security Layers

Worker Trust uses four independent layers.

1. SPIRE attests the Kubernetes workload.
2. Envoy authenticates and encrypts the connection.
3. Worker Core checks the exact allowed identity.
4. NetworkPolicy limits the permitted pods and ports.

Nova-to-Buster source transfer adds a fifth layer. Nova signs the source metadata
with Ed25519. Buster verifies that signature before execution.

## Identity Format

Each production identity has this format:

```text
spiffe://kubeclaw.internal/ns/<namespace>/sa/<service-account>
```

SPIRE reads the namespace and ServiceAccount from the pod. A workload cannot
select an unrelated identity through an environment variable.

## Protected Routes

| Caller | Destination | Security |
| --- | --- | --- |
| Nova | Buster plan and legacy routes | SPIFFE mTLS and exact Nova identity. |
| Nova | Prism control | SPIFFE mTLS and exact Nova identity. |
| Prism control | Prism worker | SPIFFE mTLS and exact control identity. |
| Prism worker | Prism control | SPIFFE mTLS and exact worker identity. |
| Prism test runner | Prism control | SPIFFE mTLS and exact runner identity. |

Prism Studio uses the application Service on port `8080`. It does not use the
worker mTLS route.

## Proxy Pattern

The application calls a local Envoy listener with HTTP. Envoy sends mTLS to the
destination Envoy listener.

The destination Envoy verifies the caller URI SAN. It replaces any supplied
forwarded-certificate header with verified certificate data.

Worker Core accepts that header only from a loopback proxy connection.

## Nova-to-Buster Provenance

Nova signs canonical source-snapshot metadata. The signature covers the Git
revision, tree, archive digest, archive size, repository, stage, and authority.

Buster verifies the signature and archive digest before it accepts the job.

This signature does not depend on GitHub artifact attestations. It does not
create public supply-chain provenance.

## Current Provenance Limit

Nova-to-Prism uses SPIFFE-authenticated mTLS. Prism-to-Nova also uses the current
application contracts.

These Prism paths do not have a durable Ed25519 artifact signature today. Do not
describe the Prism result as signed artifact provenance.

Worker Core defines a neutral signed envelope for future migrations. The current
Prism path does not use that envelope.

## Leased Prism Namespaces

Nova stays in the operator namespace. Prism can run in a leased namespace.

Prism therefore configures Nova's namespace separately. Prism uses the release
namespace only for Prism identities.

This separation prevents a leased Prism release from expecting a nonexistent
Nova identity in the lease.

## Fail-Closed Result

A protected route becomes unavailable when SPIRE, CSI, SDS, or peer validation
fails.

A missing client certificate fails the TLS handshake. A wrong SVID also fails
the TLS handshake.

A forged identity header cannot replace the verified certificate identity.

## Human Identity

Keycloak can provide human sign-in, roles, groups, and external-client tokens.

Keycloak does not replace SPIFFE workload identity. It also does not replace
artifact signatures.

## Verification Model

Worker Trust uses three proof levels:

1. Contract tests verify parsers, signatures, schemas, and negative cases.
2. Helm rendering verifies identities, ports, sidecars, and NetworkPolicies.
3. Live tests verify real SPIRE, SVIDs, mTLS, workloads, and denials.

Each level proves different properties. A source test cannot prove the running
cluster.

## Read More

- [Operate Worker Trust](../use/worker-trust.md) gives the deployment and proof procedure.
- The authored implementation reference is `docs/security/worker-trust.md`.
- The operator runbook is `docs/operations/worker-trust-runbook.md`.
