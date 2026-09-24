# Operate Worker Trust

Status: source-backed procedure; current Prism deployment verification fails and no fresh live cluster proof is claimed
Audience: Kubernetes operator, security operator
Owner: platform operations and workload-identity owner
Evidence: scripts/deploy.sh; tests/verification/live/worker-trust-cluster-e2e.sh
Applies to: the exact selected release, SPIRE trust domain, and recorded cluster
Last verified: 2026-09-21; the Prism preflight failed and no live cluster result is available

## Purpose

Prove that intended workload identities can use protected paths and unintended
identities cannot. This page is the only canonical Worker Trust procedure.

## Canonical Worker Trust Procedure
<!-- operator-task: worker-trust -->

### Supported start state, version, location, and authority

Start after the [canonical installation](install.md#canonical-install-and-preflight-procedure)
has created the application, `spire-server`, and `spire-system` namespaces and
deployed the exact selected Nova, Buster, and Prism workloads. Run commands from
`<repository-root>` on the independent administration machine. SPIRE owns SVID
issuance, the CSI driver owns socket delivery, Envoy owns peer authentication,
application allowlists own authorization, and the selected source owns the
expected identities and test path.

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for the whole trust exercise. Every raw `kubectl`, Helm, or
`scripts/deploy.sh` command below must inherit its exported read-only
`KUBECONFIG`; every shown `<context>` must equal `EXPECTED_CONTEXT`. Run
`assert_cluster_binding` immediately before each command block. Stop on any
mismatch and follow the binding section's recovery; never fall back to the
default kubeconfig.

No broad Kubernetes/SPIRE compatibility range is established. Record actual
cluster, SPIRE chart, Envoy image, workload image, code-bundle, and trust-domain
identities.

### Preconditions

- The explicit context and namespaces match the install record.
- Independent cluster access works without the protected workloads.
- SPIRE server persistence, agents, CSI driver, workload ServiceAccounts,
  Envoy sidecars, and NetworkPolicies are present.
- The operator can inspect Pods and execute the registered live test's temporary
  Jobs and ServiceAccounts.
- A cleanup owner and deadline exist for every temporary live-test resource.

Stop if the trust domain, ServiceAccount, selected image, registration, or
allowlist differs from the recorded release. Do not disable mTLS or broaden an
allowlist to make a check pass.

### 1. Verify source before cluster execution

First complete the canonical
[Locked Dependency Installation](quickstart.md#locked-dependency-installation)
in the disposable checkout and retain its sanitized evidence.

```bash
npm run verify:worker-core:trust
npm run verify:prism:deploy-script
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Expected observation is zero from each command. At source revision
`1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`, the Prism command instead fails at
the canonical-schema prompt assertion. Stop there and retain the output; do not
claim the source preflight or Worker Trust live procedure passed. The tracked
status is [tracked as an open deployment-check issue](../status/open-issues.md#prism-deployment-source-check-is-stale-after-prompt-ownership-moved).

### 2. Observe the installed identity chain

After all source checks pass at a later source revision, capture the chain:

```bash
assert_cluster_binding
kubectl --context "<context>" -n spire-server get pods -o wide
kubectl --context "<context>" -n spire-system get pods,daemonset -o wide
kubectl --context "<context>" -n "<namespace>" get \
  deploy,pods,svc,serviceaccount,networkpolicy -o wide
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
./scripts/deploy.sh prism-smoke
```

Expected observation: SPIRE server and agents are ready, CSI-backed workloads
are ready, protected Services have endpoints, and component smoke exits zero.
These observations prove dependencies, not peer authorization.

### 3. Execute positive and negative paths

```bash
assert_cluster_binding
export NAMESPACE="<namespace>"
export PRISM_NAMESPACE="<prism-namespace>"
kubectl --context "<context>" config current-context
npm run verify:worker-core:trust:live
```

Expected final output is JSON evidence and exit zero. It must contain successful
Nova-to-Buster, Nova-to-Prism, Prism-Control-to-Worker,
Prism-Worker-to-Control, and source-signing paths. It must also contain denied
anonymous Buster and Prism requests, wrong-SVID requests, and forged
forwarded-certificate headers. A positive result without its paired denial is
incomplete.

The registered live command does not use a test-double server or fabricated
completion result. It creates cluster resources, waits for real SVID delivery,
and sends requests through the deployed Envoy and application processes.

This command creates temporary live-test resources. Inspect its final cleanup
result and verify no uniquely named test Job or ServiceAccount remains. If the
command is interrupted, list the exact resources by its retained identity and
remove only resources owned by that execution; do not use a broad label shared
with production workloads.

### Failure distinction

Check in this order:

1. context and namespace;
2. SPIRE server persistence and agents;
3. CSI socket mount;
4. Envoy bootstrap, readiness, and loaded SVID;
5. Service endpoint and target port;
6. NetworkPolicy in both directions;
7. application identity allowlist;
8. source-signing key configuration;
9. test cleanup.

A timeout before TLS is reachability. A TLS/SVID error is identity issuance or
peer verification. An authenticated denial is the application allowlist. A
successful wrong-identity request is a security incident: restrict the owning
Service, retain evidence, and stop admission.

Use the exact error code to select the first repair. Do not weaken a trust rule
to remove an error.

| Error code | Meaning | First repair |
| --- | --- | --- |
| `WORKER_TRUST_PEER_MISSING` | The verified forwarded-certificate header is absent or contains more than one certificate entry. | Inspect the destination Envoy ingress and confirm that traffic enters through it. |
| `WORKER_TRUST_PEER_INVALID` | The header does not contain exactly one valid SPIFFE URI. | Inspect the verified certificate URI SAN and Envoy `SANITIZE_SET` output. |
| `WORKER_TRUST_POLICY_INVALID` | The application allowlist is empty or contains an invalid SPIFFE ID. | Restore the exact expected identities before restarting the workload. |
| `WORKER_TRUST_PEER_FORBIDDEN` | The authenticated SPIFFE ID is not in the application allowlist. | Compare the caller namespace and ServiceAccount with the configured identity. |
| `WORKER_TRUST_PROXY_REQUIRED` | Worker Core received forwarded identity from a non-loopback address. | Route the request through the colocated Envoy listener. |
| `REMOTE_TEST_GATE_SPIFFE_PROXY_NOT_LOOPBACK` | A remote-suite provider selected SPIFFE proxy authentication with a non-loopback endpoint. | Set that provider endpoint to its Nova loopback Envoy listener. |
| `NOVA_REMOTE_PLAN_SPIFFE_PROXY_NOT_LOOPBACK` | The Nova remote-plan transport selected SPIFFE proxy authentication with a non-loopback endpoint. | Use `http://127.0.0.1:28891` for the Buster plan route. |
| `BUSTER_REMOTE_SPIFFE_POLICY_INVALID` | Buster has no valid trusted Nova SPIFFE ID. | Restore the exact Nova identity in the Buster policy. |
| `NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_MISSING` | Nova did not receive the source-attestation private key. | Inspect the `pipeline-test-gate-source-attestation` Secret reference and its `privateKey` key. |
| `NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID` | Nova cannot parse the private key or the key is not Ed25519. | Replace the complete Ed25519 keypair and restart both key consumers in the maintenance window. |
| `BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING` | Buster did not receive the source-attestation public key. | Inspect the same Secret reference and its `publicKey` key. |
| `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID` | Buster cannot parse an Ed25519 public key, or its trusted source authority is invalid. | Compare the public key and authority with Nova's active signer configuration. |
| `BUSTER_SOURCE_ATTESTATION_INVALID` | The received source snapshot does not pass signature, authority, or content verification. | Stop execution. Compare the selected revisions, authority, archive digest, and active keypair before retrying. |

The two loopback errors are separate because the plugin adapter and the Nova
transport validate different configuration boundaries. Both reject a remote
URL before any request can claim SPIFFE proxy authentication.

> **Source evidence — failures are deliberate admission stops**
>
> **Implementation:** [Worker Core identity failures](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/worker/core/worker/trust.ts#L17-L51) ·
> [remote-suite endpoint check](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/nova/plugins/remote-test-gate/src/adapter.ts#L46-L61) ·
> [Nova transport endpoint check](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/nova/core/test-gates/remote-dispatch.ts#L109-L132) ·
> [Nova private-key checks](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/nova/core/test-gates/runtime-config.ts#L51-L68).

### Recovery, rotation boundary, and evidence

Repair only the first failed layer, then rerun component readiness and both
positive and negative paths. Restore the previous exact trust configuration
before revocation when a planned change fails. Complete timed SVID/CA expiry and
independent SPIRE restore are not established, and the source-attestation
Secret supports one active keypair; its rotation requires a maintenance window.
Use the [canonical rotation procedure](maintenance.md#canonical-rotation-procedure)
and stop if an authority-specific issuance, overlap, revocation, or restore
step is absent.

Retain source and release identities, context, trust domain, ServiceAccounts and
expected SPIFFE IDs, non-secret Secret metadata, source-check output, component
readiness, positive and negative live JSON, failure-layer diagnosis, recovery,
cleanup, and any open boundary. Never retain private keys, SVID key material, or
Secret values.

## Source Authority

The live command is dispatched by
[`cmd_worker_trust_e2e`](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/scripts/deploy.sh#L2672-L2687).
The deployment health program checks the mounted code bundle, gateway, Redis,
and drain/startup state
([implementation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/kubeclaw/templates/deployment.yaml#L880-L915)),
while the workload defines separate startup, readiness, and liveness probes
([probe wiring](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/kubeclaw/templates/deployment.yaml#L1479-L1513)).
