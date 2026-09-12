# Private architecture and Ops access

Addresses IFR-03-002 and IFR-27-001. This package is independent of the unfinished
native worker integration. No live deployment has been executed.

Ops MCP now requires a 32–512 character URL-safe bearer token for every `/mcp`
request, including requests through Secure Tunnel. Provision Secret `ops-mcp-auth`
with key `token` outside Git. Configure the calling client to forward this bearer
token; a connected tunnel alone is not backend authorization. The Secret is a
directory mount, not a subPath mount: atomic Secret rotation is reread per request.
Missing/invalid credentials deny requests and make readiness return 503. File and
environment token sources are mutually exclusive. Local host mode remains bound
to loopback and requires the same authentication.

The backend SA can read its own namespace's pods/logs, services/events and selected
workloads/ingresses. Its separate Argo Role reads only Applications in `argocd`.
There is no cluster-wide reader. Tool schemas also restrict namespace arguments,
including Hubble requests, to `OPS_ALLOWED_NAMESPACES` (default `kubeclaw`). Expand
that list only together with reviewed, namespaced Roles. Paperless is not included.
`deploy-ops-mcp.sh apply` revokes the exact obsolete ClusterRoleBinding and
ClusterRole after applying the replacement Roles, before declaring rollout ready.
For GitOps adoption, delete those same two obsolete resources in the migration;
adding a Role never revokes an existing cluster-wide binding.

Nova's architecture sidecar now has a dedicated ClusterIP Service and Tailscale
Ingress. Port 30456 and the world-to-3456 policy are removed. A carried-over
`service.extraPorts` architecture entry fails Helm rendering. Supply
`archviewer.existingSecret` (Nova defaults to `nova-archviewer-auth`) with an
`htpasswd` key. The sidecar mounts it read-only; HTTP basic authentication covers
documents and directory paths. No directory listing is available. `/healthz`
contains only a constant probe response and requires no credentials. Document
URLs must be known or linked from an authored index. Tailnet TLS protects the
credentials in transit. The Cilium rule selects only this Ingress's managed
Tailscale proxies, including their namespace and parent-resource identity.

Before upgrade, provision both Secrets and set the authorized Tailnet identities
and tag ownership in the external ACL/grants configuration. Use the selected,
digest-pinned image release. Do not carry old NodePort Services forward manually.
Existing Helm-managed architecture NodePort Services are removed by the upgrade;
verify this before declaring the access migration complete.

Local acceptance executes the actual Ops HTTP server, authenticates requests,
rotates/removes/restores the real credential file, and rejects a Paperless tool
request before Kubernetes I/O. Actual Helm rendering checks the service, proxy
selector, Secret wiring, legacy-overlay rejection and narrow RBAC. The native
nginx test executes the production server locations with only isolated paths and
listeners substituted. It verifies denied/allowed document reads, missing auth
files, no listing and the health response. This is not an image or Tailnet proof.

Operator live gate: provision a short-lived token for
`system:serviceaccount:kubeclaw:kubeclaw-ops-mcp` into a private local file, and
provide `KUBERNETES_API_URL`, `KUBERNETES_TOKEN_FILE`, `KUBERNETES_CA_FILE`,
`OPS_MCP_LIVE_URL` (HTTPS `/mcp`) and `OPS_MCP_LIVE_TOKEN_FILE` to
`node scripts/verify-ops-mcp-live.mjs`. It performs real API reads and requires
403 for forbidden resources; transport failure cannot satisfy that assertion.
Run from an authorized Tailnet client. Then rotate the Kubernetes Secret and
repeat with the new token; the old token must return 401 after projection updates.
Finally, from an explicitly denied Tailnet identity, verify neither private
endpoint is reachable even with correct backend credentials. From a non-Tailnet
client, verify direct node port 30456 is closed. Record these separate network
proofs; the local suite does not claim them.
