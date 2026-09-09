# Explicit Prism product decision authority

The optional Product decision interface uses the existing authenticated Prism
portal. It is disabled by default. A valid editor session alone is insufficient:
the session user must exactly match the configured product operator allowlist.
CSRF and exact HTTPS origin checks are additionally required for mutation.

Configure `control.productDecisions` only alongside the paired controller
`busterNamespaceBroker.controller.productDecisions` configuration. No operator,
issuer, key or endpoint is inferred from a service account or from the values
examples. The configuration fields are:

| Field | Meaning |
| --- | --- |
| `enabled` | Explicit opt-in; false renders no authority, key mount, projected token or additional egress. |
| `issuer` | Exact dedicated Product decision issuer accepted by the controller. |
| `operators` | Exact authenticated Prism session user IDs; a nonempty, duplicate-free allowlist. Not caller-provided actor labels. |
| `origin` | Actual HTTPS Studio origin used for same-origin mutation checks. |
| `authorityRevision` | Explicit rollout revision; change when rotating the signing key or controller CA in externally managed Secrets. |
| `signingSecretName`, `signingSecretKey` | Existing dedicated Secret/key containing the Ed25519 private PEM. Must be separate from the Prism runtime/session Secret. The chart never creates key bytes. |
| `controllerUrl` | Existing controller HTTPS origin on port8443; no credentials, query, fragment or application path. Its TLS hostname must match the provided trust root. |
| `controllerNamespace`, `controllerRelease` | Exact destination peer namespace/release for the narrow Control-only egress policy. |
| `controllerCaSecretName`, `controllerCaSecretKey` | Existing Secret/key for the controller TLS CA. |
| `tokenAudience`, `tokenExpirationSeconds` | Explicit dedicated controller TokenReview audience, with a rotating 600–3600second projected token. This authenticates transport, not human decision authority. |

The producer ServiceAccount is `prism-control` in the Prism release namespace.
The controller must explicitly accept that producer and audience, independently
verify the dedicated issuer public key and actor allowlist, and retain its
source/generation/revision checks. The existing Nova Ready producer is a separate
identity. Both controller TLS/Ready and Product decision support must be enabled
for the optional product route.

Signing and CA/token volumes are read-only and mounted only into Control. File
permissions are decimal288 (octal0440) for the existing nonroot user/group1000.
General ServiceAccount automount stays disabled; only the dedicated projected
transport token is added. Secret bytes are not rendered into values or pod
annotations. The rollout checksum covers configuration and authorityRevision;
rotating Secret contents without changing that explicit revision does not
promise a process restart.

The ingress remains the existing Tailscale L7/Serve path and Studio-specific
NetworkPolicy. Direct access to Studio outside that trusted ingress must remain
blocked; caller-supplied identity headers are not an authentication mechanism.
Helm rendering does not prove that a deployed CNI/Ingress enforces this boundary.
Native Tailscale, Kubernetes TokenReview/CAS and policy enforcement remain actual
operating acceptance requirements. Local signed-session/HTTP/SQL/controller and
render tests do not claim deployed human acceptance.
