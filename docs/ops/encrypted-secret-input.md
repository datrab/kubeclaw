# Encrypted secret input: private pilot

## Implemented boundary

The agent creates an authorized input request, privately delivers its capability
link, and polls status. The browser encrypts directly for the destination
namespace. The central Ops MCP has public recipient keys only. It stores request
metadata, a SHA-256 hash of the random link token, and ciphertext. Neither the
input value nor a plaintext-bearing `secrets.read` tool is added to Ops MCP.

A separate receiver verifies mutual TLS and a pinned broker certificate before
accepting an envelope. RSA-OAEP/SHA-256 wraps a random 256-bit AES key; AES-GCM
uses a fresh 96-bit nonce and 128-bit tag. Both algorithms authenticate the same
versioned tuple: request ID, tenant, namespace, target, secret name, recipient
key ID and expiry. Input is bounded to 16 KiB. Targets and names are deployment
allowlists, not arbitrary URLs or environment names supplied by an agent.

Receiver state contains the original ciphertext and an atomic idempotent receipt.
A lost response can be recovered with the same request and envelope digest.
Another ciphertext cannot replace a submitted request. A stored receipt is not
provider validation, task completion, or a successful infrastructure bootstrap.

The namespace consumer decrypts in memory through `receiver.use(reference,
consume)`. Its callback is trusted backend code, not an agent-selected command or
MCP tool. Buffers are cleared after use, including rejected callbacks. JavaScript
strings and TLS-library internals cannot be reliably zeroized; heap/core dumps
and unrestricted process inspection remain outside that buffer-clearing claim.

## Agent journey

1. `secure_secret_targets` lists only explicitly delegated recipients.
2. `secure_secret_request({target,name})` returns a ten-minute link. Deliver it
   only to the requesting human in a private channel. Its fragment is a bearer
   capability; no token is placed in a query string or server access-log URL.
3. The form displays the exact namespace, target and secret name. No third-party
   scripts, analytics or JavaScript storage are used. The form requests disabled
   autocomplete; browser extensions and password-manager policy remain user-owned.
4. The form encrypts before POST and clears its password field. If the namespace
   acknowledgement is lost, it retries the same encrypted envelope, not a new
   value. If the browser closes, `secure_secret_reconcile` uses the broker-retained
   envelope and original identity; the human does not need to re-enter it. Reloading discards the browser-held capability; request a new link if
   the original request has not committed.
5. `secure_secret_status` returns metadata, state and an opaque reference only.
   The owning backend can consume that reference for the next setup step.
6. `secure_secret_probe` optionally performs the fixed, read-only Hetzner Storage
   Box access check inside the namespace. Only `{verified,kind}` comes back.
7. `secure_secret_cancel` cancels a pending input, not a possibly delivered one.
   `secure_secret_revoke` revokes an accepted or unconfirmed version at the receiver.
   For an unreceived request the receiver persists a tombstone, fencing delayed
   delivery. This disables internal use, not the external provider API token itself. During an
   unknown revocation outcome, the broker withholds its reference and reports
   `revoking`; retry with the same identity.
8. Credential rotation creates a new request/reference. Verify the new version,
   switch the consumer's reference, then revoke the old version. This is distinct
   from rotating a recipient master key, which needs deliberate key retention
   and ciphertext migration; it is not silently performed by this implementation.

## Provisioning and deployment

The existing Ops image workflow builds both roles from `tools/ops-mcp/src`.
Broker integration is off by default in `charts/ops-pod`. Enable
`mcp.secretInput` only after configuring the following:

- `publicOrigin`: trusted HTTPS origin, initially behind Tailscale ACLs. An
  external SaaS deployment additionally needs authenticated per-user ownership,
  authorization and tenant-specific agent identities. A shared `nova` service
  identity and a publicly exposed bearer link alone are not that SaaS boundary.
- `existingClaim`: broker request-state PVC; no private recipient keys are mounted
  into it. SQLite limits pending requests per client and total retained rows.
  Expired pending requests and revoked tombstones are pruned only after their
  original input expiry plus 24 hours. Sealed/unconfirmed and active stored
  references are never silently removed. Receiver replay after tombstone pruning
  still fails the original envelope expiry check; an active-version capacity
  limit remains an explicit admission refusal, not automatic deletion.
- `brokerTlsSecret`: dedicated client identity and CA for receiver mTLS. Keys are
  infrastructure credentials and require their own protected PKI lifecycle.
- `targets`: registry entries as below. Delegate the seven `secure_secret_*` tools
  explicitly in `mcp.clients`; legacy shared-bearer/read-only observers do not
  inherit them. Every real target namespace is authorized again by Ops policy.
- A trusted private HTTPS ingress/proxy forwarding `/secret-input/*` to the Ops
  service. Configure its backend CA verification; do not disable TLS verification.
  This change does not publish an Internet ingress or widen an existing ACL.

Example public registry entry (the key is public, never a private PEM):

```json
{
  "id": "hetzner-storage",
  "tenant": "family",
  "namespace": "familyclaw",
  "clients": ["nova"],
  "names": ["HETZNER_STORAGE_TOKEN"],
  "endpoint": "https://family-secret-receiver.familyclaw.svc:8443/v1/secret-input",
  "probe": "hetzner-storage",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
}
```

Install `charts/secret-receiver` inside the destination namespace with an
immutable Ops image digest, an existing state claim, tenant/target/name bindings,
its mTLS server identity and the broker client certificate SHA-256 fingerprint.
Set `brokerNamespace` and `brokerPodName` to the actual authorized Ops workload.
For the optional Hetzner probe set `provider: hetzner-storage`; the sole secret
name must be `HETZNER_STORAGE_TOKEN`.

The receiver requires a **namespace-scoped external key provider** through a
Secrets Store CSI `SecretProviderClass`. It must supply a `passphrase` file of at
least 32 random bytes in an ephemeral mount, with workload-identity restrictions.
Do not sync that master key into a Kubernetes Secret, ConfigMap, environment
variable, Git file or agent-readable volume. The chart has no plaintext fallback.
The external provider and CSI driver are deployment prerequisites, not installed
or certified by the chart. Hosting/KMS region and operator access must be verified
for the chosen provider before any production confidentiality claim.

The init container creates an RSA-3072 recipient identity in memory and persists
only encrypted PKCS#8 and public PEM on the namespace PVC. Its logs expose public
key metadata only, which the bootstrap controller/authorized agent can copy into
the broker registry. Restarts reuse the original identity; a missing public PEM
is reconstructed. A wrong master key or changed public key fails closed instead
of silently rotating the recipient. The private key is never written unencrypted.

The receiver and all consumer workloads with access to its key provider/state
must retain `security.kubeclaw.io/secret-custody: "true"`. Ops MCP refuses pod exec
into those workloads even for otherwise broad exec grants. This is one enforcement
point, not protection against a Kubernetes administrator, another exec channel,
an unrestricted GitOps writer, a compromised consumer or a compromised node.
Workload-creation permissions, CSI/KMS policy and privileged runtime access must
be constrained independently. Do not describe the current pilot as operator-blind.

No receiver service account token is mounted and no Secret-write RBAC is created.
The NetworkPolicies scope delivery to the authorized workload and receiver port.
The optional portable Hetzner egress rule allows public HTTPS, not an FQDN firewall;
the consumer fixes and verifies the HTTPS hostname and refuses redirects. Existing
allow policies are additive and must be audited before live isolation acceptance.

## Hetzner and application setup scope

The first provider consumer is a **read-only access probe**, not an automatic
purchase, Storage Box creation or mount. It calls the documented endpoint
`https://api.hetzner.com/v1/storage_boxes?per_page=1`. No real API token is requested
until the private input route and namespace root-key custody are deployed and
verified. Paperless/Firefly can use the same internal consumer-reference contract;
their existing environment-based credentials have not been migrated by this patch.
Never infer completion of their full bootstrap from this secret-intake receipt.

## Acceptance and limits

Run:

```bash
npm ci --prefix tools/ops-mcp --ignore-scripts
npm test --prefix tools/ops-mcp
node --test tests/verification/deployment/secret-input-chart.test.mjs
```

Synthetic tests exercise the real WebCrypto sealing function, actual MCP tools,
SQLite restart/idempotency, ciphertext mutation, scope denial, expiry, cancellation,
credential rotation/revocation, actual namespace mTLS and CA/hostname/client checks,
and scans for a synthetic plaintext canary in persisted files and results.
The Hetzner response is a test double; no real account access is claimed.

Buster receipts bind the selected source, test case counts, exit status and cleanup.
Local/source/Helm tests, Buster execution, image publication, installed deployment,
real-browser interaction and real-provider access are separate acceptance levels.
No global “secrets can never leak” certification follows from these tests.

References: [WebCrypto wrapping](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/wrapKey),
[Node crypto](https://nodejs.org/api/crypto.html),
[Hetzner API](https://docs.hetzner.cloud/reference/hetzner).
UI reference: the existing approved Familyclaw dark briefing palette and single-task
form hierarchy; no new visual language, external asset or analytics dependency.
