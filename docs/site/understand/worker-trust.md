# Worker Trust

Status: implemented; live cluster proof pending
Audience: architecture reader, maintainer, security reviewer
Owner: Worker Core and platform operations
Evidence: skills/worker/core/worker/trust.ts; charts/kubeclaw/templates/configmap-worker-trust.yaml; charts/prism/templates/configmap-worker-trust.yaml
Evidence revision: `8da6157b77247dcbdf209ef12f491f0b92ca858a`
Applies to: current supported release
Last verified: source checks on 2026-09-01

## Purpose

Worker Trust protects traffic between KubeClaw workers.

SPIFFE identifies each Kubernetes workload. SPIRE issues short-lived
X.509-SVIDs. Envoy uses those certificates for mutual TLS.

Worker Core checks the verified identity after Envoy accepts the connection.

Envoy does not replace the OpenClaw gateway. It protects selected internal
worker routes; agent-session traffic on port `18789` uses a separate route.

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

The SPIRE registration selector also requires the pod label
`kubeclaw.dev/worker-trust: "true"`. The label makes a pod eligible for the
default KubeClaw registration rule. It does not grant access by itself. The
ServiceAccount-derived SPIFFE ID and each destination allowlist still decide
which route the workload can use.

## Protected Routes

| Caller | Destination | Security |
| --- | --- | --- |
| Nova | Buster plan and legacy routes | SPIFFE mTLS and exact Nova identity. |
| Nova | Prism OpenClaw agent | SPIFFE mTLS and exact Nova identity. |
| Prism control | Prism OpenClaw agent | SPIFFE mTLS and exact control identity. |
| Prism OpenClaw agent | Prism control | SPIFFE mTLS and exact agent identity. |
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

For a Buster plan request, the concrete path is:

```text
Nova -> 127.0.0.1:28891 -> Nova Envoy -> SPIFFE mTLS
     -> agent-buster:18891 -> Buster Envoy -> 127.0.0.1:28891 -> Buster runtime
```

The Buster Service targets the Envoy port. It does not target the runtime port.
The runtime remains reachable on the pod network for kubelet health probes;
NetworkPolicy denies workload ingress to that port.

### Exact listener and Service boundaries

The following addresses have different owners. A client must not substitute a
runtime address for a proxy address.

| Address | Owner and use | Exposure rule |
| --- | --- | --- |
| `127.0.0.1:28891` in Nova | Nova Envoy egress for Buster plan requests. | Nova processes can call this loopback address. Envoy sends the request to Buster with mTLS. |
| `0.0.0.0:18891` in Buster | Buster Envoy mTLS ingress. | The Buster Service targets the named Envoy port `buster-plan`. |
| `127.0.0.1:28891` in Buster | Buster plan runtime, named `plan-runtime`. | Kubelet probes and the colocated Envoy can reach it. No Service may target the runtime ports. |
| `127.0.0.1:28080` in Nova | Nova Envoy egress for the Prism agent. | Nova dispatch enters the protected Prism path here. |
| `127.0.0.1:28080` in a Prism agent or worker | Envoy egress to Prism Control. | The colocated process calls this address; Envoy verifies the Control identity. |
| `0.0.0.0:18082` in the Prism agent | Envoy mTLS ingress for Nova, Prism Control, and the isolated test runner. | Envoy forwards an admitted request to the local agent bridge on `127.0.0.1:18080`. |
| `127.0.0.1:18081` in Prism Control | Envoy egress to a Prism worker. | Control uses it for authenticated worker calls. |
| `127.0.0.1:18080` in Prism Control and workers | Envoy egress back to Prism Control. | The local role determines the destination cluster; the port is not a public listener. |
| `127.0.0.1:18443` in the live test runner | Envoy egress to Prism Control. | The runner uses this isolated path for positive and negative trust checks. |
| `127.0.0.1:18444` in the live test runner | Envoy egress to the Prism agent. | The runner uses this address to test the protected agent route without opening a public listener. |

Kubernetes limits container port names to 15 characters. The names
`buster-plan` and `plan-runtime` fit that limit and also show the security
boundary: one port belongs to Envoy, and one belongs to the application. The
Service selects `buster-plan`, never the numeric runtime listener.

Envoy does not proxy the OpenClaw gateway route on port `18789`. That route
continues to use the OpenClaw gateway contract and its separate network rules.

On HTTP ingress, Envoy uses `SANITIZE_SET`. It removes any caller-supplied
forwarded-certificate value and writes identity data from the verified TLS
certificate. Worker Core then requires a loopback source, exactly one SPIFFE URI,
and an exact allowlist match. This sequence prevents a remote caller from
asserting its own trusted identity in a header.

Admission occurs three times for a reason. First, the SPIRE selector and
ServiceAccount decide whether a pod can receive an identity. Second, the
destination Envoy accepts only the URI SANs configured for that listener.
Third, Worker Core compares the verified URI with the application allowlist.
The first check limits identity issuance, the second limits entry to a route,
and the third limits the operation after TLS termination. A configuration error
in one layer does not turn either of the other layers into an allow rule.

> **Source evidence — listeners cannot bypass trust**
>
> **Claim:** The selected production route exposes Buster Envoy through the
> Service and keeps the plan runtime behind the sidecar. Prism uses distinct
> loopback egress listeners for Control, worker, agent, and test-runner calls.
>
> **Implementation:** [KubeClaw Envoy listener and identity rules](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/charts/kubeclaw/templates/configmap-worker-trust.yaml#L20-L130) ·
> [Buster Service and runtime port selection](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/my-values/buster-values.yaml#L74-L131) ·
> [Prism Control and worker listeners](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/charts/prism/templates/configmap-worker-trust.yaml#L40-L203) ·
> [isolated test-runner listeners](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/charts/prism/templates/configmap-worker-trust.yaml#L204-L261) ·
> [Worker Core header and loopback checks](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/worker/core/worker/trust.ts#L17-L51).
>
> **Limit:** A rendered manifest proves the intended wiring. Only the live
> positive and negative checks prove the wiring of a running cluster.

## Nova-to-Buster Provenance

Nova signs canonical source-snapshot metadata. The signature covers the Git
revision, tree, archive digest, archive size, repository, stage, and authority.

Buster verifies the signature and archive digest before it accepts the job.

The `pipeline-test-gate-source-attestation` Secret holds the Ed25519 keypair.
Nova receives the private key and Buster receives the public key. The private
key must not enter Buster, logs, evidence, or generated configuration.

Nova removes the `attestation` field, serializes the remaining snapshot with
canonical JSON, and prefixes the bytes with the domain separator
`kubeclaw-source-snapshot-v1\0`. The separator prevents the same signature from
being interpreted as a signature for another message format. Buster verifies
the authority, revision, tree, archive digest, archive size, repository, stage,
and signature before it extracts or executes source.

> **Source evidence — source bytes and key direction**
>
> **Implementation:** [The source-snapshot contract constructs the exact signed bytes](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/contracts/pipeline-test-gate/v1/src/remote.ts#L61-L75) ·
> [the deployment gives Buster only the public key](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/my-values/buster-values.yaml#L90-L104).

This signature does not depend on GitHub artifact attestations. It does not
create public supply-chain provenance.

## Current Provenance Limit

Nova-to-Prism uses SPIFFE-authenticated mTLS. Prism-to-Nova also uses the current
application contracts.

No Prism-to-Nova durable signature exists today. These Prism paths do not have
a durable Ed25519 artifact signature. Do not describe the Prism result as
signed artifact provenance.

Worker Core defines the neutral `worker-trust-envelope.v1` format for signed
request or artifact digests. It binds the kind, issuer, audience, purpose,
subject digest, context digest, issue time, expiry, nonce, key ID, algorithm,
and signature. Verification requires the expected issuer, audience, and purpose;
valid time bounds; an Ed25519 key; and a valid signature. The current Prism path
does not create or verify this envelope.

> **Source evidence — the neutral envelope is a contract, not a Prism claim**
>
> **Contract:** [Envelope fields](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/contracts/pipeline-worker-core/v1/src/types.ts#L10-L25) ·
> [signature and verification rules](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/contracts/pipeline-worker-core/v1/src/trust.ts#L7-L43).
>
> **Limit:** A reusable contract does not prove that a product path uses it.

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

- [Deployment and Trust](deployment-and-trust.md) explains the complete workload, network, storage, and failure-domain model.
- [Operate Worker Trust](../use/worker-trust.md) gives the deployment and proof procedure.
- [Worker Core](worker-core.md) explains how the worker uses the authenticated
  channel after admission.
