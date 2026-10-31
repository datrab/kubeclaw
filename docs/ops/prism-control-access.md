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

## Verified recovery (2026-10-31)

The network application reconciled and Nova's actual loopback28081 health returned
HTTP200. Original job `ab9bdaf6-ad72-44ed-8c86-f09b967e5540` completed with three
stored directions, each containing all five requested views. No second design job,
approval, baseline or FamilyClaw application deployment was performed.

A subsequent accepted design turn exposed the agent's2GiB OOM limit. The selected
`prism-agent-memory-20261031` immutable bundle changes only agent-prism resources:
2GiB request/8GiB limit, unchanged images and all unrelated workload documents.
Actual new pod readiness and zero restarts were checked; not inferred from Argo's
Git revision alone.

Native capture additionally exposed root-only0700 traversal on the host's Prism
cgroup pool, preventing the admitted uid1000 host from observing its own scope.
`scripts/repair-prism-observation-traversal.mjs` is explicit operator maintenance,
not an admission fallback: it refuses a populated pool, existing child scopes,
wrong owner/filesystem/path/mode, or writable controls. It adds only search bits
(0711), verifies inode/limits/controller settings remain unchanged, and does not
modify Buster/browser pools, ownership, limits or validation gates. This exact
repair was applied to the drained live Prism pool. The corrected pool-preparation
source also handles systemd's0077umask when creating a *new* Prism pool. Updating
the host-installed setup helper at the next managed host maintenance remains a
separate installation step; no host service restart or NRI reconfiguration was run.

All30 actual native captures completed (3directions×5views×compact390/wide1440).
See `familyclaw-native-captures-20261031.json` for artifact bindings and findings.
The disabled sample checkbox has a small-touch-target finding in six captures;
this is not an accessibility certification. Navigation/hidden-state/language host
adapter differences are documented in the design handoff. The agent's separate
60 adapted intent PNGs are not relabelled as native production captures. Live
Tailscale/Samsung and keyboard/source-integration acceptance remain unverified.
The existing pipeline now waits normally for Raven's explicit design approval.
