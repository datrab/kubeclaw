# Worker Trust Implementation Reference

Status: implemented; live cluster proof pending
Audience: security reviewer, platform maintainer, operator
Owner: Worker Core and platform operations
Evidence: `skills/worker/core/worker/trust.ts`; `charts/kubeclaw/templates/configmap-worker-trust.yaml`; `charts/prism/templates/configmap-worker-trust.yaml`
Applies to: Nova, Buster, Prism control, Prism worker, and Prism test runner
Last verified: source checks on 2026-09-01

## Purpose

Worker Trust protects service-to-service worker traffic.

It gives each worker a Kubernetes-derived SPIFFE identity. It encrypts selected
worker routes with mutual TLS. It also limits each route to named peer identities.

This document uses an ASD-STE100-inspired style. It does not claim formal
ASD-STE100 compliance. The official standard contains writing rules and a
controlled dictionary. See the [official ASD-STE100 site](https://www.asd-ste100.org/).

## Scope

Worker Trust controls these security properties:

- **Workload identity** identifies the calling Kubernetes workload.
- **Transport authentication** verifies both endpoints of an mTLS connection.
- **Transport confidentiality** encrypts data between Envoy sidecars.
- **Route authorization** permits only the configured SPIFFE identity.
- **Application identity** gives the verified identity to Worker Core.
- **Artifact provenance** binds selected artifact bytes to an Ed25519 signer.
- **Network segmentation** limits the pods and ports that can carry worker traffic.

Worker Trust does not control these surfaces:

- Human sign-in and human role management.
- Tailscale identity exchange for Prism Studio.
- OpenClaw gateway tokens for agent sessions.
- Provider credentials for LiteLLM or external model services.
- Image signing or public supply-chain provenance.
- GitHub artifact attestations.

Envoy is not the OpenClaw gateway and is not a general cluster ingress. The
OpenClaw agent-session route on port `18789` remains separate. The KubeClaw
Envoy sidecars protect only the worker routes listed in this document.

Keycloak can control human and external-client identity. Keycloak does not replace
SPIFFE workload identity or artifact provenance.

## Terms

| Term | Exact meaning in KubeClaw |
| --- | --- |
| SPIFFE ID | A URI that identifies one workload identity. |
| SPIRE | The software that attests workloads and issues X.509-SVIDs. |
| X.509-SVID | A short-lived certificate that contains one SPIFFE ID. |
| Workload API | The SPIRE Unix socket that supplies certificates and trust bundles. |
| SDS | The Envoy protocol that receives updated certificates from SPIRE. |
| mTLS | TLS where both endpoints present and verify certificates. |
| Worker Trust proxy | The Envoy sidecar in a protected worker pod. |
| Peer identity | The SPIFFE ID from the verified client certificate. |
| Artifact attestation | A durable signature over canonical artifact metadata. |
| Trust domain | The SPIFFE authority. Production uses `kubeclaw.internal`. |

## Security Components

| Component | Responsibility | Does not own |
| --- | --- | --- |
| SPIRE server | Maintains the trust domain and signs X.509-SVIDs. | Application authorization. |
| SPIRE agent | Attests a pod and serves its Workload API socket. | Durable artifact signatures. |
| SPIFFE CSI driver | Mounts the Workload API socket in selected pods. | Certificate contents. |
| Envoy sidecar | Gets SVIDs, applies mTLS, verifies peer URI SANs, and sanitizes identity headers. | Pipeline policy. |
| Worker Core | Parses the verified identity and checks the application allowlist. | Certificate issuance. |
| NetworkPolicy | Limits network sources, destinations, and ports. | Cryptographic identity. |
| Ed25519 source signer | Signs Nova source-snapshot metadata. | Transport encryption. |
| Buster source verifier | Verifies the source signature before archive acceptance. | Nova scheduling. |

No component is sufficient by itself. The production boundary uses all applicable
components.

## Identity Issuance

Production identities have this format:

```text
spiffe://<trust-domain>/ns/<namespace>/sa/<service-account>
```

Production uses this trust domain:

```text
kubeclaw.internal
```

The SPIRE controller selects pods with this label:

```yaml
kubeclaw.dev/worker-trust: "true"
```

The controller derives the namespace and ServiceAccount from the pod. The pod
cannot select an arbitrary SPIFFE ID through an environment variable.

The identity template is defined in
[`my-values/infra/spire-values.yaml`](../../my-values/infra/spire-values.yaml).

## Production Identities

The base namespace is `kubeclaw` unless `NAMESPACE` selects another namespace.

| Workload | ServiceAccount | SPIFFE ID |
| --- | --- | --- |
| Nova | `agent-nova` | `spiffe://kubeclaw.internal/ns/<nova-namespace>/sa/agent-nova` |
| Buster | `agent-buster` | `spiffe://kubeclaw.internal/ns/<buster-namespace>/sa/agent-buster` |
| Prism control | `prism-control` | `spiffe://kubeclaw.internal/ns/<prism-namespace>/sa/prism-control` |
| Prism worker | `prism-worker` | `spiffe://kubeclaw.internal/ns/<prism-namespace>/sa/prism-worker` |
| Prism live runner | `prism-test-runner` | `spiffe://kubeclaw.internal/ns/<prism-namespace>/sa/prism-test-runner` |

The live negative test creates temporary ServiceAccounts. SPIRE issues real SVIDs
to those test pods. The destination proxies must reject those identities.

## Authorized Connections

| Caller | Destination | Required caller identity | Transport |
| --- | --- | --- | --- |
| Nova | Buster plan route | Nova SPIFFE ID | mTLS |
| Nova | Buster legacy route | Nova SPIFFE ID | mTLS |
| Nova | Prism control dispatch | Nova SPIFFE ID | mTLS |
| Prism control | Prism worker | Prism control SPIFFE ID | mTLS |
| Prism worker | Prism control internal route | Prism worker SPIFFE ID | mTLS |
| Prism control | Prism control internal route | Prism control SPIFFE ID | mTLS |
| Prism live runner | Prism control dispatch | Prism test-runner SPIFFE ID | mTLS |

Prism Studio does not use the worker mTLS route. Studio uses the Prism control
application Service on port `8080`.

## Ports and Listeners

### Nova listeners

| Local address | Remote destination | Purpose |
| --- | --- | --- |
| `127.0.0.1:28891` | `agent-buster:18891` | Buster plan execution. |
| `127.0.0.1:28892` | `agent-buster:18892` | Buster legacy suite execution. |
| `127.0.0.1:28080` | `prism-control-internal:8443` | Prism dispatch. |

Nova sends plain HTTP only to its loopback Envoy listener. Envoy sends mTLS to
the destination proxy.

### Buster listeners

| Pod address | Local destination | Purpose |
| --- | --- | --- |
| `0.0.0.0:18891` | `127.0.0.1:28891` | Buster plan execution. |
| `0.0.0.0:18892` | `127.0.0.1:28892` | Buster legacy suite execution. |

The Buster Service targets only the Envoy listeners on `18891` and `18892`.
Its named target ports are `buster-plan` and `buster-legacy`. The runtime ports
use the distinct names `plan-runtime` and `legacy-runtime`; each Service target
name must occur only once in the pod. Kubernetes limits container port names to
15 characters.

The Buster runtimes listen on the pod network at `28891` and `28892` so kubelet
HTTP probes can reach them. No Service targets these ports, and the production
NetworkPolicy does not permit ingress to them. Envoy forwards accepted traffic
to `127.0.0.1:28891` or `127.0.0.1:28892`. Worker Core accepts the forwarded
SPIFFE identity only when the immediate TCP peer is loopback.

### Prism listeners

| Local or Service address | Destination | Purpose |
| --- | --- | --- |
| `prism-control-internal:8443` | Control on `127.0.0.1:8080` | Protected control ingress. |
| `prism-worker-internal:8443` | Worker on `127.0.0.1:8080` | Protected worker ingress. |
| Control `127.0.0.1:18081` | Worker internal Service | Control-to-worker traffic. |
| Control `127.0.0.1:18080` | Control internal Service | Protected control self-call. |
| Worker `127.0.0.1:18080` | Control internal Service | Worker-to-control traffic. |
| Test runner `127.0.0.1:18443` | Control internal Service | Live acceptance traffic. |

The public Prism control and worker Services still use port `8080`. NetworkPolicy
limits those application Services to their declared callers.

## Nova-to-Buster Flow

1. Nova creates a committed source archive.
2. Nova calculates the archive SHA-256 digest.
3. Nova creates the source-snapshot metadata.
4. Nova signs the canonical metadata with Ed25519.
5. Nova sends the job to `127.0.0.1:28891`.
6. Nova Envoy gets Nova's SVID through SDS.
7. Nova Envoy starts mTLS with Buster Envoy.
8. Both proxies verify the peer trust domain.
9. Buster Envoy verifies Nova's exact URI SAN.
10. Buster Envoy replaces the forwarded certificate header.
11. Buster Worker Core accepts the header only from loopback.
12. Buster verifies the Ed25519 source signature.
13. Buster verifies the archive digest and request digests.
14. Buster accepts the job only after all checks pass.

The TLS identity and source signature protect different properties. The TLS
identity protects the live connection. The signature protects the source metadata.

## Nova-to-Prism Flow

1. Nova sends the request to `127.0.0.1:28080`.
2. Nova Envoy starts mTLS with Prism control Envoy.
3. Prism control Envoy verifies Nova's exact URI SAN.
4. Prism control Envoy replaces the forwarded certificate header.
5. Prism control accepts the header only from loopback.
6. Prism control checks the configured Nova SPIFFE ID.
7. Prism control validates the request contract and idempotency key.

This connection does not use durable Ed25519 artifact attestation today. The
current control is SPIFFE-authenticated mTLS plus application contract validation.

## Prism Control-to-Worker Flow

1. Prism control sends the attempt to `127.0.0.1:18081`.
2. Control Envoy starts mTLS with worker Envoy.
3. Worker Envoy verifies the Prism control URI SAN.
4. Worker Envoy replaces the forwarded certificate header.
5. Worker Core accepts the header only from loopback.
6. Worker Core validates the attempt envelope.
7. The worker executes the validated attempt.

When SPIFFE is disabled, Prism uses body-bound HMAC and PostgreSQL nonce storage.
Production values enable SPIFFE. Production does not use that fallback path.

## Forwarded Identity Rules

Envoy uses `SANITIZE_SET` for the forwarded client certificate header. This mode
removes caller input and writes certificate data from the verified TLS session.

Worker Core applies these checks:

1. The TCP peer must use a loopback address.
2. The header must contain one certificate entry.
3. The entry must contain exactly one `URI=` field.
4. The URI must use valid SPIFFE syntax.
5. The configured allowlist must contain valid SPIFFE IDs.
6. The verified SPIFFE ID must be in the allowlist.

Worker Core returns a frozen principal after all checks pass.

## Leased Prism Namespaces

Nova stays in the operator namespace. Prism can run in a Buster-managed lease
namespace. These namespaces are not the same.

The Prism chart therefore has these values:

```yaml
workerTrust:
  spiffe:
    novaNamespace: kubeclaw
    novaServiceAccount: agent-nova
```

`scripts/deploy.sh` sets `novaNamespace` from `NAMESPACE`. Prism uses
`PRISM_NAMESPACE` only for Prism identities.

The Prism ingress NetworkPolicy uses the configured Nova namespace. The shared
Nova egress policy also permits managed lease namespaces on port `8443`.

Do not derive Nova's identity from the Prism release namespace. That rule would
reject the real Nova SVID in each leased namespace.

## NetworkPolicy Controls

NetworkPolicy provides a second authorization layer. It does not replace mTLS.

The shared policies permit these routes:

- Nova to Buster on TCP ports `18891` and `18892`.
- Nova to Prism control on TCP port `8443`.
- Nova to managed Prism lease namespaces on TCP port `8443`.

The Prism policies permit these routes:

- Nova to Prism control on the selected control port.
- Prism control to Prism worker on the selected worker port.
- Prism worker to Prism control on the selected control port.
- Prism test runner to Prism control on the selected control port.
- Prism Studio to Prism control on TCP port `8080`.

When SPIFFE is enabled, the selected worker port is `8443`. When SPIFFE is
disabled, the selected application port is `8080`.

## X.509-SVID Storage and Rotation

The CSI driver mounts the SPIRE Workload API socket. It does not mount a private
key file.

Envoy requests its SVID through SDS. SPIRE sends certificate updates before the
current SVID expires. Envoy can use the new SVID without a worker restart.

SVID private keys remain in SPIRE and Envoy memory. They do not enter Helm values,
Kubernetes Secrets, application logs, or test output.

The live test confirms that each deployed Envoy has the expected SVID. A long
duration rotation observation is not part of the current live command.

## Durable Source Attestation

Nova uses the `pipeline-test-gate-source-attestation` Secret. Nova reads only the
`privateKey` key. Buster reads only the `publicKey` key.

The source signature covers canonical JSON for all unsigned source-snapshot fields:

- Schema version.
- Source type.
- Pipeline stage ID.
- Repository ID.
- Git revision.
- Git tree ID.
- Archive content digest.
- Archive size.
- Creator authority.

The signature input starts with this domain separator:

```text
kubeclaw-source-snapshot-v1\0
```

Buster rejects these conditions before execution:

- The public key is missing or is not Ed25519.
- The creator authority does not match policy.
- The signature is invalid.
- The archive size exceeds policy.
- The archive bytes do not match the archive digest.
- The source snapshot does not match the archive.
- The plan, job, or request digest does not match.
- The contract is invalid.

This attestation proves that the configured Nova key signed the source metadata.
It does not prove a GitHub build, a public transparency record, or a human approval.

## Worker Trust Envelope Status

Worker Core defines `worker-trust-envelope.v1`. The envelope supports Ed25519
signatures for request or artifact digests.

The verifier checks these fields:

- Schema version and algorithm.
- Issuer, audience, and purpose.
- Subject and context digests through the signature.
- Issue and expiry times.
- Ed25519 key type and signature.

The neutral envelope is not the active Prism provenance format. Nova-to-Buster
source attestation still uses `source-snapshot-attestation.v1`.

No Prism-to-Nova durable signature exists today. Do not describe the current
Prism return path as artifact attestation.

## Human Identity and Keycloak

Keycloak is suitable for human sign-in, groups, roles, and external API clients.
It can issue OAuth or OpenID Connect tokens.

Keycloak does not issue the current Kubernetes workload identities. It also does
not sign the current source snapshots.

Use Keycloak and Worker Trust as separate layers:

- Keycloak identifies a human or external client.
- SPIFFE identifies a Kubernetes workload.
- Ed25519 attestation identifies the signer of selected artifact metadata.

## Fail-Closed Behavior

The protected route fails when any required trust component is unavailable.

| Failure | Expected effect |
| --- | --- |
| SPIRE server unavailable | New or renewed SVID delivery can fail. |
| SPIRE agent unavailable | The Workload API socket cannot supply an SVID. |
| CSI driver unavailable | A protected pod cannot mount the Workload API socket. |
| Envoy SDS not ready | The protected listener remains unavailable. |
| Wrong caller SVID | The TLS handshake fails. |
| Missing client certificate | The TLS handshake fails. |
| Wrong server SVID | The client Envoy rejects the server. |
| Forged forwarded header | Envoy replaces the header. |
| Direct application access | NetworkPolicy or loopback checks reject the path. |
| Missing source key | Nova or Buster startup fails. |
| Invalid source signature | Buster rejects the job before execution. |

Do not change protected provider endpoints to remote plain HTTP addresses. The
Nova runtime accepts `spiffe-proxy` endpoints only on loopback.

## Configuration Reference

| Setting | Default or production value | Owner |
| --- | --- | --- |
| `KUBECLAW_DEPLOY_SPIRE` | `true` | `scripts/deploy.sh` |
| `SPIFFE_HELM_REPO` | Hardened SPIFFE Helm repository | `scripts/deploy.sh` |
| `SPIRE_CRDS_CHART_VERSION` | `0.6.0` | `scripts/deploy.sh` |
| `SPIRE_CHART_VERSION` | `0.30.0` | `scripts/deploy.sh` |
| `workerTrust.spiffe.enabled` | `true` in production values | Agent and Prism values |
| `workerTrust.spiffe.trustDomain` | `kubeclaw.internal` | Agent and Prism values |
| `workerTrust.spiffe.socketPath` | `/run/spire/sockets/spire-agent.sock` | Chart defaults |
| `workerTrust.spiffe.csiDriver` | `csi.spiffe.io` | Chart defaults |
| `workerTrust.spiffe.novaNamespace` | `kubeclaw` by default | Prism chart |
| `workerTrust.spiffe.novaServiceAccount` | `agent-nova` | Prism chart |
| `BUSTER_TRUSTED_PEER_SPIFFE_ID` | Nova production SPIFFE ID | Buster values |
| `BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY` | Secret key reference | Nova values |
| `BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY` | Secret key reference | Buster values |

## Proof Levels

Worker Trust has three proof levels.

1. **Contract proof** checks parsers, signatures, schemas, and negative cases.
2. **Render proof** checks final Helm resources, ports, identities, and policies.
3. **Live proof** checks real SPIRE, SVIDs, proxies, workloads, and denials.

One proof level does not replace another level. Source checks cannot prove the
cluster. A successful cluster call cannot prove every negative contract case.

## Test Coverage

| Property | Contract proof | Live proof |
| --- | --- | --- |
| Valid SPIFFE header | `check-worker-trust-spiffe.mts` | Real proxy calls. |
| Missing or ambiguous identity | `check-worker-trust-spiffe.mts` | Wrong-SVID jobs. |
| Non-loopback forwarded identity | `check-worker-trust-spiffe.mts` | Direct-route denial. |
| Exact peer allowlist | Runtime contract tests. | Wrong-SVID jobs. |
| SVID issuance | Source and chart checks. | Envoy certificate endpoint. |
| Nova-to-Buster mTLS | Deployment truth. | Buster health through Nova proxy. |
| Nova-to-Prism mTLS | Deployment truth. | Prism health and dispatch through Nova proxy. |
| Prism internal mTLS | Deployment truth. | Both control and worker calls. |
| Plaintext denial | Source configuration checks. | Direct TLS calls without a client SVID. |
| Header spoof resistance | Envoy configuration checks. | Spoof header through real Envoy. |
| Source signature | Contract negative tests. | Real Nova unit preflight. |
| Test-double absence | Live coverage guard. | Live script uses cluster workloads. |

The live suite does not use a fake server, fake certificate, or fabricated
completion result.

## Known Limits

- This workspace has not run the live command against the Hetzner cluster.
- Helm rendering is pending in this workspace because Helm is unavailable.
- The live command confirms loaded SVIDs. It does not wait for a timed rotation.
- The current durable artifact signature covers Nova-to-Buster source snapshots.
- Prism does not return a durable signed provenance envelope today.
- The source-attestation Secret supports one active keypair.
- Zero-downtime Ed25519 key rotation is not implemented.
- NetworkPolicy behavior depends on the cluster CNI implementation.
- A service mesh does not replace the application allowlist or source signature.

## Change Rules

Apply these rules when you add a protected worker route:

1. Assign a dedicated Kubernetes ServiceAccount.
2. Add the Worker Trust pod label.
3. Mount the SPIFFE CSI socket.
4. Add an Envoy egress listener on loopback.
5. Add an Envoy ingress listener on the destination port.
6. Verify the exact peer URI SAN at both endpoints.
7. Use `SANITIZE_SET` on HTTP ingress.
8. Accept forwarded identity only from loopback.
9. Add matching ingress and egress NetworkPolicies.
10. Add positive and negative contract tests.
11. Add real wrong-SVID and plaintext live tests.
12. Add artifact attestation when durable provenance is required.
13. Update the route and identity tables in this document.

Do not add a shared wildcard SPIFFE allowlist. Do not put SVID private keys in a
Kubernetes Secret.

## Source Map

| Concern | Source |
| --- | --- |
| SPIRE deployment | [`scripts/deploy.sh`](../../scripts/deploy.sh) |
| SPIRE identity template | [`my-values/infra/spire-values.yaml`](../../my-values/infra/spire-values.yaml) |
| Agent Envoy configuration | [`charts/kubeclaw/templates/configmap-worker-trust.yaml`](../../charts/kubeclaw/templates/configmap-worker-trust.yaml) |
| Prism Envoy configuration | [`charts/prism/templates/configmap-worker-trust.yaml`](../../charts/prism/templates/configmap-worker-trust.yaml) |
| Agent sidecar and CSI mount | [`charts/kubeclaw/templates/deployment.yaml`](../../charts/kubeclaw/templates/deployment.yaml) |
| Prism sidecars and identities | [`charts/prism/templates/workloads.yaml`](../../charts/prism/templates/workloads.yaml) |
| Shared NetworkPolicies | [`my-values/infra/network-policies.yaml`](../../my-values/infra/network-policies.yaml) |
| Prism NetworkPolicies | [`charts/prism/templates/networkpolicy.yaml`](../../charts/prism/templates/networkpolicy.yaml) |
| Worker Core identity checks | [`skills/worker/core/worker/trust.ts`](../../skills/worker/core/worker/trust.ts) |
| Neutral signed envelope | [`contracts/pipeline-worker-core/v1/src/trust.ts`](../../contracts/pipeline-worker-core/v1/src/trust.ts) |
| Source signature | [`contracts/pipeline-test-gate/v1/src/remote.ts`](../../contracts/pipeline-test-gate/v1/src/remote.ts) |
| Buster source verification | [`skills/buster/engine/test-gates/remote-plan-service.ts`](../../skills/buster/engine/test-gates/remote-plan-service.ts) |
| Live cluster proof | [`tests/verification/live/worker-trust-cluster-e2e.sh`](../../tests/verification/live/worker-trust-cluster-e2e.sh) |
| Contract coverage guard | [`tests/verification/contracts/check-worker-trust-live-coverage.mts`](../../tests/verification/contracts/check-worker-trust-live-coverage.mts) |

## Operator Procedure

Use the [Worker Trust runbook](../operations/worker-trust-runbook.md) for deployment,
verification, troubleshooting, and recovery.
