# IFR-03-001: API Service and endpoint policy contract

The original review observed HTTPS egress on 443 without an explicit post-DNAT
API endpoint port. The current shipped policies already correct that root cause:

| Client | Selected identity | Destination | TCP ports |
|---|---|---|---|
| Nova and Buster lease clients | `kubeclaw`, component in `nova,buster` | Cilium `kube-apiserver` | 443, 6443 |
| Buster namespace controller | `kubeclaw`, component `buster-namespace-controller` | Cilium `kube-apiserver` | 443, 6443 |
| Standalone Ops MCP | `ops-mcp` | Cilium `kube-apiserver` | 443, 6443 |
| Recovery Ops Pod | its release label | discovered Service/ready endpoint IPs; additionally Cilium API entity when detected | 443, discovered HTTPS endpoint port |

The API destination is not implemented by opening all private addresses or all
node ports. The application Cilium deployment supports API Service port 443 and
endpoint port 6443. An environment using another API endpoint port must update
the explicit API policies before cutover; do not broaden the destination to
`world`/`host`/the node CIDR to bypass a failed test. The recovery Ops bootstrap
already discovers ready endpoint addresses, both Service address families and
the actual endpoint HTTPS port, failing on missing/ambiguous discovery.

`tests/verification/contracts/kubernetes-api-policy.test.mjs` checks the complete
shipped grants and renders the real Ops chart with both portable and Cilium
policies, including a nondefault endpoint port. This is local manifest/Helm
verification, not a simulated successful Kubernetes API exchange.

## Prepared operator live gate

After deployment, save the actual running source Pod JSON for each client and
the API origins from `Service/default/kubernetes` and its ready Endpoints. For
example, the origins JSON has the shape:

```json
["https://kubernetes.default.svc:443", "https://192.0.2.10:6443"]
```

Replace the documentation address with the observed ready API endpoint. Include
all ready endpoints; use bracketed addresses for IPv6. The private Service name
is used as TLS server identity for both routes. Do not disable CA or hostname
verification to make a probe pass.

```sh
node scripts/render-kubernetes-api-probe.mjs source-pod.json api-origins.json > api-proof.yaml
```

Review and apply the rendered ConfigMap/Job during the user-owned live phase.
It uses the actual source service account, all policy labels, the source node
through scheduler affinity and a centrally pinned Node image. Its readiness
probe never succeeds, so copying policy labels cannot add a ready production
Service backend. No credentials are copied into the manifest. The test reads
the automatically mounted real SA token/CA, checks the SA subject and requires
an actual Kubernetes `ServiceList` response over every API route. This also
works for the distroless controller, which cannot execute a Node script itself.

Archive the Job log and Pod UID with the source Pod UID, API discovery output,
CNI version and matching Cilium/Hubble forwarded flows. The probe has no retries
that hide initial failures, no automatic cleanup and no permission mutations.
It verifies the workload's SA/policy identity, not a controller reconciliation.

Separately confirm a controlled private target is listening from an authorized
vantage point, attempt it from the tested identity, and retain matching CNI
policy-drop evidence. A timeout, bad TLS certificate, closed port or HTTP 403
alone is **not** evidence of network-policy denial. Repeat the portable Ops
case under the old enforcing CNI and the Cilium case after migration. The
application Cilium manifests are not claimed to work under Flannel alone.

These cluster executions and negative network checks are prepared, not run.
The local acceptance follows D12; CNI migration and external environment
preparation remain separately tracked in IFR-02-001 and IFR-01-001.
