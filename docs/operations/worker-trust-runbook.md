# Worker Trust Operator Runbook

Status: implemented; live cluster execution pending
Audience: Kubernetes operator, security operator, incident responder
Owner: platform operations
Evidence: `scripts/deploy.sh`; `tests/verification/live/worker-trust-cluster-e2e.sh`
Applies to: the current KubeClaw production values
Last verified: source checks on 2026-08-29

## Objective

Deploy and verify Worker Trust without bypassing its security controls.

Use this runbook for normal deployment, acceptance, diagnosis, recovery, and key
rotation. Read the [implementation reference](../security/worker-trust.md) before
you change an identity or route.

## Safety Rules

- Do not print Secret data.
- Do not copy SVID private keys from process memory.
- Do not change a protected endpoint to remote plain HTTP.
- Do not grant a wildcard SPIFFE identity.
- Do not disable NetworkPolicy to diagnose mTLS.
- Do not run the live command in an unrelated cluster context.
- Do not rotate the Ed25519 key while jobs are active.

## Required Tools

The operator environment needs these commands:

```text
git
helm
kubectl
node
npm
openssl
```

The live proof also needs an authenticated Kubernetes context.

## Required Kubernetes Authority

The operator needs authority for these actions:

- Read the `csi.spiffe.io` CSIDriver.
- Read Deployments, Pods, ConfigMaps, Services, and NetworkPolicies.
- Read pod logs.
- Execute commands in Nova, Buster, and Prism pods.
- Create and delete temporary Jobs and ServiceAccounts.
- Read rollout status.
- Deploy or upgrade Helm releases during installation.

The live test does not need permission to read Secret values.

## Expected Names

These are the default production names:

| Item | Default |
| --- | --- |
| Base namespace | `kubeclaw` |
| Nova Deployment | `agent-nova` |
| Buster Deployment | `agent-buster` |
| Prism control Deployment | `prism-control` |
| Prism worker Deployment | `prism-worker` |
| SPIFFE CSI driver | `csi.spiffe.io` |
| Trust domain | `kubeclaw.internal` |
| Source key Secret | `pipeline-test-gate-source-attestation` |

Set `NAMESPACE` and `PRISM_NAMESPACE` when the cluster uses different names.

## Preflight

1. Enter the repository root.

```bash
cd /path/to/KubeClaw
```

2. Confirm the source revision.

```bash
git status --short --branch
git rev-parse HEAD
```

3. Select the Kubernetes context.

```bash
kubectl config use-context <expected-context>
```

4. Confirm the selected context.

```bash
kubectl config current-context
```

5. Confirm the base namespace.

```bash
kubectl get namespace "${NAMESPACE:-kubeclaw}"
```

6. Confirm Helm can contact the cluster.

```bash
helm list --all-namespaces
```

Expected result: each command succeeds and shows the intended cluster.

## Offline Source Verification

Run this verification before deployment:

```bash
npm run verify:worker-core:trust
npm run verify:prism:deploy-script
npm run verify:prism:contracts
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
npm run docs:check:generated
npm run docs:check:refs
git diff --check
```

Expected result: each command exits with status `0`.

These checks do not prove the live cluster.

## Helm Render Verification

1. Create a temporary directory.

```bash
render_dir="$(mktemp -d)"
```

2. Render Nova.

```bash
helm template agent-nova charts/kubeclaw \
  -n "${NAMESPACE:-kubeclaw}" \
  -f my-values/nova-values.yaml \
  >"$render_dir/nova.yaml"
```

3. Render Buster.

```bash
helm template agent-buster charts/kubeclaw \
  -n "${NAMESPACE:-kubeclaw}" \
  -f my-values/buster-values.yaml \
  >"$render_dir/buster.yaml"
```

4. Render Prism.

```bash
helm template prism charts/prism \
  -n "${PRISM_NAMESPACE:-${NAMESPACE:-kubeclaw}}" \
  -f my-values/prism-values.yaml \
  --set-string "workerTrust.spiffe.novaNamespace=${NAMESPACE:-kubeclaw}" \
  --set-string "workerTrust.spiffe.novaServiceAccount=agent-nova" \
  >"$render_dir/prism.yaml"
```

5. Inspect protected resources.

```bash
rg -n "worker-trust-proxy|csi.spiffe.io|spiffe://|18891|18892|8443" "$render_dir"
```

Expected result: each protected workload has an Envoy sidecar and CSI socket.

Delete the temporary directory after review.

## Deployment Order

Use this order for a new environment:

1. Prepare namespaces and Secrets.

```bash
./scripts/deploy.sh setup
```

2. Deploy shared infrastructure and SPIRE.

```bash
./scripts/deploy.sh infra
```

3. Deploy Nova and Buster.

```bash
./scripts/deploy.sh agents
```

4. Deploy Prism when required.

```bash
./scripts/deploy.sh prism
```

5. Inspect deployment status.

```bash
./scripts/deploy.sh status
```

Do not deploy protected workers before the CSI driver is ready.

## SPIRE Readiness

1. Confirm the CSI driver exists.

```bash
kubectl get csidriver csi.spiffe.io
```

2. Inspect SPIRE workloads.

```bash
kubectl get pods --all-namespaces \
  -l app.kubernetes.io/part-of=spire -o wide
```

3. Inspect non-ready SPIRE containers.

```bash
kubectl get pods --all-namespaces \
  -l app.kubernetes.io/part-of=spire \
  -o jsonpath='{range .items[*]}{.metadata.namespace}{"/"}{.metadata.name}{" "}{range .status.containerStatuses[*]}{.name}{"="}{.ready}{" "}{end}{"\n"}{end}'
```

Expected result: the CSI driver exists and required SPIRE containers are ready.

Chart labels can differ between chart versions. Use `kubectl get pods -A` when
the label query returns no objects.

## Protected Workload Readiness

1. Wait for Nova.

```bash
kubectl rollout status deployment/agent-nova \
  -n "${NAMESPACE:-kubeclaw}" --timeout=5m
```

2. Wait for Buster.

```bash
kubectl rollout status deployment/agent-buster \
  -n "${NAMESPACE:-kubeclaw}" --timeout=5m
```

3. Wait for Prism control.

```bash
kubectl rollout status deployment/prism-control \
  -n "${PRISM_NAMESPACE:-${NAMESPACE:-kubeclaw}}" --timeout=5m
```

4. Wait for Prism worker.

```bash
kubectl rollout status deployment/prism-worker \
  -n "${PRISM_NAMESPACE:-${NAMESPACE:-kubeclaw}}" --timeout=5m
```

Expected result: each Deployment completes its rollout.

## Live Acceptance

The live acceptance uses real infrastructure. It uses no test-double boundary.

The command creates temporary Jobs and ServiceAccounts. The command deletes them
when it exits. It also submits one real Prism dispatch and one real Buster unit job.

1. Export the namespace names.

```bash
export NAMESPACE="kubeclaw"
export PRISM_NAMESPACE="kubeclaw"
```

Use the active lease namespace for `PRISM_NAMESPACE` during a leased acceptance.

2. Confirm the context again.

```bash
kubectl config current-context
```

3. Run the complete proof.

```bash
npm run verify:worker-core:trust:live
```

Expected result: the command exits with status `0`.

The cluster test prints a final JSON object. The object uses this schema version:

```text
worker-trust-cluster-e2e.v1
```

The object lists four positive paths and five negative paths.

## Positive Live Cases

The command proves these successful connections:

1. Nova to Buster plan health through `127.0.0.1:28891`.
2. Nova to Prism control health through `127.0.0.1:28080`.
3. Prism control to Prism worker through `127.0.0.1:18081`.
4. Prism worker to Prism control through `127.0.0.1:18080`.
5. Nova to Prism authenticated dispatch through the Nova proxy.
6. Nova to Buster signed-source execution through the unit preflight.

The command also confirms each expected SVID in the deployed Envoy certificate
state.

## Negative Live Cases

The command proves these denials:

1. Nova cannot bypass Buster mTLS with a direct connection.
2. Nova cannot bypass Prism mTLS with a direct connection.
3. A temporary wrong SVID cannot access Buster.
4. A temporary wrong SVID cannot access Prism control.
5. A forged forwarded-certificate header cannot replace the verified SVID.

The wrong-SVID tests wait until SPIRE issues each wrong SVID. This rule prevents
a missing certificate from creating a false pass.

## Source-Attestation Acceptance

The live command calls the Nova unit production preflight.

The preflight performs these actions:

1. Create a temporary Git repository.
2. Commit a real unit-test script.
3. Resolve the production Buster capability provider.
4. Create a real test plan.
5. Sign the committed source snapshot with Nova's Ed25519 key.
6. Send the job through Nova's production transport.
7. Execute the real process in Buster.
8. Import the real result and evidence.
9. Require a completed state and a passed decision.

The preflight removes its local temporary files when it exits.

## Leased Prism Acceptance

Use the Prism deployment command for a leased service journey:

```bash
PRISM_E2E_USE_LEASE=true \
PRISM_E2E_USER="<operator-login>" \
bash scripts/deploy.sh prism-e2e
```

Do not put credentials in shell history. Supply sensitive values through the
approved CI Secret or a protected environment.

The deploy script sets the trusted Nova namespace from `NAMESPACE`. It sets the
Prism identity namespace from the lease status.

## Evidence Collection

Collect metadata only. Do not collect Secret data.

```bash
kubectl get deployment agent-nova agent-buster \
  -n "${NAMESPACE:-kubeclaw}" -o wide

kubectl get deployment prism-control prism-worker \
  -n "${PRISM_NAMESPACE:-${NAMESPACE:-kubeclaw}}" -o wide

kubectl get networkpolicy \
  -n "${NAMESPACE:-kubeclaw}"

kubectl get networkpolicy \
  -n "${PRISM_NAMESPACE:-${NAMESPACE:-kubeclaw}}"
```

Save the live test JSON and command exit status with the deployment revision.

## Troubleshooting Order

Use this order. Stop when you find the first failed layer.

1. Confirm the Kubernetes context.
2. Confirm the namespace names.
3. Confirm the SPIFFE CSI driver.
4. Confirm SPIRE server and agent readiness.
5. Confirm the protected pod has the CSI socket.
6. Confirm the Envoy sidecar is ready.
7. Confirm the expected SVID is loaded.
8. Confirm the Service targets the Envoy port.
9. Confirm both NetworkPolicy directions.
10. Confirm the application allowlist identity.
11. Confirm the source-attestation key type.
12. Run the negative live cases.

Do not skip an earlier layer because a later error looks familiar.

## Symptom Reference

### Pod does not start

Possible causes:

- The `csi.spiffe.io` driver is missing.
- The Workload API socket cannot mount.
- SPIRE did not select the pod label.
- The Envoy configuration is invalid.

Check these resources:

```bash
kubectl describe pod <pod> -n <namespace>
kubectl get events -n <namespace> --sort-by=.lastTimestamp
```

### Envoy remains unready

Possible causes:

- SDS cannot reach the SPIRE agent socket.
- SPIRE has not issued an SVID.
- The trust bundle is unavailable.
- A listener references an invalid cluster.

Inspect the sidecar logs:

```bash
kubectl logs <pod> -n <namespace> -c worker-trust-proxy
```

### TLS handshake fails for an expected caller

Possible causes:

- The caller has the wrong ServiceAccount.
- The caller and destination use different trust domains.
- Prism derived Nova's identity from the Prism namespace.
- The destination URI SAN allowlist is stale.
- The client validates the wrong destination URI SAN.

Compare the expected identity with the pod ServiceAccount:

```bash
kubectl get pod <pod> -n <namespace> \
  -o jsonpath='{.spec.serviceAccountName}{"\n"}'
```

### Request reaches the proxy but returns unauthorized

Possible causes:

- Worker Core did not receive one URI identity.
- The proxy connection did not use loopback.
- The application allowlist differs from the Envoy allowlist.
- The caller used an application Service instead of the internal Service.

Inspect configuration names only. Do not print environment values from Secrets.

### Prism test runner cannot connect

Confirm these conditions:

- The test-runner pod has `kubeclaw.dev/worker-trust=true`.
- The pod uses `prism-test-runner` ServiceAccount.
- The runner Envoy connects to port `8443`.
- The Prism test-runner egress policy permits port `8443`.
- Prism control permits the test-runner SPIFFE ID.

### Prism Studio cannot connect

Prism Studio uses application HTTP on port `8080`. It does not use the Worker
Trust sidecar.

Confirm that `prism-studio-control` permits TCP port `8080`.

### Buster rejects source attestation

Relevant error codes include:

- `NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_MISSING`
- `NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID`
- `BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING`
- `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID`
- `BUSTER_SOURCE_ATTESTATION_INVALID`

Confirm that both workloads reference the same Secret. Do not compare key data
in terminal output.

## Error-Code Reference

| Code or message | Meaning | First action |
| --- | --- | --- |
| `WORKER_TRUST_PEER_MISSING` | The forwarded certificate header is absent or contains multiple certificate entries. | Inspect the inbound Envoy configuration. |
| `WORKER_TRUST_PEER_INVALID` | The header does not contain exactly one valid SPIFFE URI. | Inspect `SANITIZE_SET` output and peer certificate SANs. |
| `WORKER_TRUST_POLICY_INVALID` | The application identity allowlist is empty or malformed. | Inspect the trusted SPIFFE ID environment variables. |
| `WORKER_TRUST_PEER_FORBIDDEN` | The verified SPIFFE ID is not in the application allowlist. | Compare the ServiceAccount with the configured identity. |
| `WORKER_TRUST_PROXY_REQUIRED` | The forwarded identity arrived from a non-loopback peer. | Route the request through the local Envoy listener. |
| `REMOTE_TEST_GATE_SPIFFE_PROXY_NOT_LOOPBACK` | Nova's remote suite endpoint is not a loopback SPIFFE proxy. | Set the provider endpoint to its configured proxy port. |
| `NOVA_REMOTE_PLAN_SPIFFE_PROXY_NOT_LOOPBACK` | Nova's remote plan endpoint is not a loopback SPIFFE proxy. | Use `127.0.0.1:28891`. |
| `BUSTER_REMOTE_SPIFFE_POLICY_INVALID` | Buster has no trusted peer SPIFFE ID. | Set the exact Nova identity. |
| `WORKER_TRUST_PRIVATE_KEY_INVALID` | A neutral envelope signer did not receive an Ed25519 key. | Replace the configured signer key. |
| `NOVA_SOURCE_ATTESTATION_ENV_INVALID` | Nova's source-key variable name is invalid or conflicts with another variable. | Inspect the runtime configuration file. |
| `NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_MISSING` | Nova did not receive its source private key. | Inspect the Secret reference name and key. |
| `NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID` | Nova's source private key is unreadable or is not Ed25519. | Replace the source keypair. |
| `BUSTER_SOURCE_ATTESTATION_ENV_INVALID` | Buster's source-key variable name is invalid or conflicts with another variable. | Inspect the runtime configuration file. |
| `BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING` | Buster did not receive its source public key. | Inspect the Secret reference name and key. |
| `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID` | Buster's source authority or public key is invalid. | Compare authority configuration and key type. |
| `BUSTER_SOURCE_ATTESTATION_INVALID` | The source snapshot signature did not verify. | Stop execution and inspect the deployment revision. |
| `Prism SPIFFE trust policy is incomplete` | Prism control lacks one required trusted identity. | Inspect rendered Prism environment variables. |
| `Prism worker SPIFFE trust policy is incomplete` | Prism worker lacks the trusted control identity. | Inspect rendered Prism environment variables. |

## SPIRE Recovery

1. Pause new deployments that require fresh SVIDs.
2. Preserve the current SPIRE server state.
3. Inspect the failed SPIRE component.
4. Restore that component through its Helm release.
5. Wait for the CSI driver and agents.
6. Wait for protected workload proxies.
7. Run the complete live acceptance.
8. Resume normal deployment activity.

Do not delete SPIRE server state as a diagnostic action.

## X.509-SVID Rotation

SPIRE rotates X.509-SVIDs automatically. Envoy receives updates through SDS.

Normal SVID rotation does not require a worker restart. Do not restart every
worker to force routine rotation.

The current live command confirms loaded SVIDs. It does not wait for a timed
certificate rotation.

## Ed25519 Source-Key Rotation

The current source-attestation design supports one active keypair. It does not
support overlapping verification keys.

Use a maintenance window:

1. Pause new Nova-to-Buster test jobs.
2. Wait for active Buster jobs to finish.
3. Replace both keys in `pipeline-test-gate-source-attestation`.
4. Restart the Buster Deployment.
5. Wait for Buster readiness.
6. Restart the Nova Deployment.
7. Wait for Nova readiness.
8. Run `npm run verify:worker-core:trust:live`.
9. Resume test jobs.

The order creates a short rejection window. Keep jobs paused during that window.

Do not use `kubectl get secret -o yaml` during rotation.

## Temporary Resource Cleanup

The live script installs an exit trap. The trap removes its Jobs and
ServiceAccounts.

If the process receives an unhandled termination, inspect these names:

```bash
kubectl get jobs,serviceaccounts -A | rg 'worker-trust-'
```

Delete only a confirmed test resource:

```bash
kubectl delete job,serviceaccount <exact-name> -n <exact-namespace>
```

## Rollback Rules

Do not roll back by disabling SPIFFE in production values.

Roll back the full application release to its last compatible chart and values.
Keep SPIRE available while old protected pods terminate.

Run the live acceptance after rollback.

## Completion Record

Record these items after a successful production proof:

- Git commit.
- Kubernetes context name.
- Base namespace.
- Prism namespace.
- Helm release revisions.
- Deployed image references.
- Live test JSON.
- Start and finish times.
- Command exit status.

Do not record tokens, private keys, Secret values, or certificate private data.
