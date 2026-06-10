# Security Model

Status: current
Audience: operator, maintainer

## Purpose

Describe the current protection boundaries and the gaps that must not be treated as solved.

## Current Behavior

Kubernetes Secrets provide gateway token, LiteLLM API key, Anthropic credentials, Stitch key, Discord token, Redis password, Discord webhook, Git deploy key, and Tailscale OAuth inputs. Chart helper logic can either reference existing secrets or create a chart-managed secret only when direct values are supplied. The Tailscale operator consumes `operator-oauth` in the `tailscale` namespace with `client_id` and `client_secret` keys.

The init container keeps the retained config PVC as secret-free source config. It normalizes persisted `openclaw.json` token fields back to placeholders, removes `discord_webhook_url` from persisted `swarm.config.json`, and renders the current secret values only into pod-local `emptyDir` files overlaid at `/home/node/.openclaw/openclaw.json` and `/home/node/.openclaw/swarm.config.json`.

Nova normally runs root because `runAsRoot` defaults true, but its main container has `allowPrivilegeEscalation: false` and drops all Linux capabilities when sandbox mode is disabled.

Buster runs sandbox mode with privileged Podman-in-Pod on both its gateway and pipeline containers, unconfined AppArmor/seccomp, `allowPrivilegeEscalation: true`, and added capabilities such as `SYS_ADMIN`, `NET_ADMIN`, and `MKNOD`. The pipeline container owns deterministic suite work and environment preparation; the gateway container owns gateway-side agent test execution. In broker mode, Buster receives only namespace-lease client RBAC in the release namespace. The separate namespace controller receives cluster-level authority to create/delete broker-owned namespaces, create namespace-local RBAC, copy selected secrets, and create final-preview ingress resources.

The Buster namespace fence is a ValidatingAdmissionPolicy for namespace CREATE/DELETE requests by `system:serviceaccount:kubeclaw:agent-buster` and `system:serviceaccount:kubeclaw:agent-buster-namespace-controller`. Direct namespace lifecycle calls by `agent-buster` are denied; the controller may only create/delete labeled KubeClaw-managed namespaces beginning with `test-`.

The deployment applies a namespace NetworkPolicy baseline from `my-values/infra/network-policies.yaml`. It uses default-deny ingress and egress, then allows DNS, agent access to required internal services, Clawdeck access to Redis, LiteLLM access to PostgreSQL and model/provider HTTPS, registry-mirror upstream pulls, and temporary public ingress for the currently exposed agent/LiteLLM ports. Redis, PostgreSQL, Qdrant, and registry-local remain internal-only from the repository policy perspective.

Final-preview credential delivery is an intentional bootstrap exception for human testability. If `preview.reveal_credentials` is true, the controller verifies that the configured Secret is readable and marks credentials available without writing decoded values into `BusterNamespaceLease` status. Nova sends the preview URL and a copy-paste `kubectl` command for an authorized operator to read the Secret.

Runtime code provides path-scoping helpers, denied subprocess secret env keys, shell-tokenization checks, redaction, Buster task identity validation, and Buster default-deny capabilities for suite/tool surfaces.

## Open Issues

- LiteLLM and Prism preview still use temporary NodePorts.
- NetworkPolicy egress remains port-based and broader than the target Cilium/FQDN policy.
- A public security contact and license decision are not yet selected.
