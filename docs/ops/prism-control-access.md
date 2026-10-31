# Nova → Prism Control access

The opt-in `prismControlAccess` production setting registers the network-only
`kubeclaw-prism-control-access` Argo Application under the existing automatic
KubeClaw root. Its sole resource is a Kubernetes NetworkPolicy allowing only
agent-nova to same-namespace `app: prism-control` backends over TCP8443.
It does not change images, runtime receipts, ingress rules, RBAC, or SPIFFE checks.
It uses Kubernetes NetworkPolicy because this live cluster does not expose the
Cilium CRD (Argo's existing nova-argocd-access reports missing cilium.io/v2).

Diagnosis: Control's local listener and self-mTLS health both succeed; the Prism
agent also reaches Control over mTLS. Nova receives immediate connection refusal
before any TLS handshake, for both the Service and the current Control pod.
Existing source rules grant Nova agent access but omit Control egress. The new
policy supplies that missing specific path without a namespace-wide grant.
A successful source test or Argo sync alone is not live acceptance: verify Nova's
loopback28081 health and inspect the original job before any fenced reconciliation.
