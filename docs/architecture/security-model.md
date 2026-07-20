# Security Model

Status: current
Audience: operator, maintainer

## Purpose

Describe the current protection boundaries and the gaps that must not be treated as solved.

## Current Behavior

Kubernetes Secrets provide gateway token, LiteLLM API key, Anthropic credentials, Stitch key, Discord token, Redis password, Discord webhook, Git deploy key, and Tailscale OAuth inputs. Chart helper logic can either reference existing secrets or create a chart-managed secret only when direct values are supplied. The Tailscale operator consumes `operator-oauth` in the `tailscale` namespace with `client_id` and `client_secret` keys.

The init container keeps retained OpenClaw config free of literal LiteLLM and Discord secrets. It normalizes persisted `openclaw.json` token fields to env SecretRefs, removes `discord_webhook_url` from persisted `swarm.config.json`, leaves `openclaw.json` as a writable file at `/home/node/.openclaw/openclaw.json`, and renders only the webhook-expanded `swarm.config.json` into a pod-local `emptyDir` overlay.

Nova normally runs root because `runAsRoot` defaults true, but its main container has `allowPrivilegeEscalation: false` and drops all Linux capabilities when sandbox mode is disabled.

Buster runs a non-privileged gateway beside a dedicated non-root rootless-BuildKit pipeline worker. The gateway drops all Linux capabilities. The pipeline worker is also non-privileged, but retains the runtime's default capability bounding set and permits the setuid transition required by `newuidmap`/`newgidmap`; it also uses the rootless worker's unconfined AppArmor/seccomp posture. The pipeline owns deterministic suite work and image publication, while the gateway owns gateway-side agent execution. Buster receives only namespace-lease client RBAC in the release namespace. The separate namespace controller receives cluster-level authority to create/delete broker-owned namespaces, create namespace-local RBAC, copy selected secrets, and create final-preview ingress resources.

The Buster namespace fence is a ValidatingAdmissionPolicy for namespace CREATE/DELETE requests by `system:serviceaccount:kubeclaw:agent-buster` and `system:serviceaccount:kubeclaw:agent-buster-namespace-controller`. Direct namespace lifecycle calls by `agent-buster` are denied; the controller may only create/delete labeled KubeClaw-managed namespaces beginning with `test-`.

The deployment applies a namespace NetworkPolicy baseline from `my-values/infra/network-policies.yaml`. It uses default-deny ingress and egress, then allows DNS, agent access to required internal services, Clawdeck access to Redis, LiteLLM access to PostgreSQL and model/provider HTTPS, registry-mirror upstream pulls, and temporary public ingress for the currently exposed agent/LiteLLM ports. Redis, PostgreSQL, Qdrant, and registry-local remain internal-only from the repository policy perspective.

Final-preview credential delivery is an intentional bootstrap exception for human testability. If `preview.reveal_credentials` is true, the controller verifies that the configured app-owned Secret is readable in the leased namespace and marks credentials available without writing decoded values into `BusterNamespaceLease` status. Nova sends the preview URL and a copy-paste `kubectl` command for an authorized operator to read the Secret.

Runtime code provides path-scoping helpers, denied subprocess secret env keys, shell-tokenization checks, egress, Buster task identity validation, and Buster default-deny capabilities for suite/tool surfaces.

## Security Ownership And Verification

| Security surface | Runtime owner | Inputs and artifacts | Verification or operator signal |
| --- | --- | --- | --- |
| Kubernetes Secret wiring | `charts/kubeclaw/templates/secret.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `my-values/setup-secrets.sh` | `openclaw-shared-secrets`, `redis-secrets`, `postgresql-secrets`, `litellm-secrets`, `google-sa-key`, `ghcr-secret`, `git-deploy-key-nova`, `git-deploy-key-buster`, `operator-oauth` | `npm run docs:generate:check`; `kubectl -n "$NAMESPACE" get secret ...`; `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Runtime config secret materialization | `charts/kubeclaw/templates/configmap-gateway.yaml`; init block in `charts/kubeclaw/templates/deployment.yaml` | persistent source `/config/openclaw.json`; env SecretRefs for `LITELLM_API_KEY` and `DISCORD_TOKEN`; runtime overlay for webhook-expanded `swarm.config.json` | inspect rendered deployment; `kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- test -f /home/node/.openclaw/openclaw.json` |
| Network isolation | `my-values/infra/network-policies.yaml`; `scripts/deploy.sh` infra/teardown functions | default-deny ingress/egress plus DNS, internal service, registry, LiteLLM, PostgreSQL, and temporary public port allowances | deployment truth validates 13 NetworkPolicies; `kubectl -n "$NAMESPACE" get networkpolicy` |
| Buster rootless builder | `docker/Dockerfile.buster-pipeline`; `charts/kubeclaw/templates/deployment.yaml`; `my-values/buster-values.yaml` | local rootless BuildKit worker, immutable registry digests, pipeline-only state/results volumes | `./scripts/deploy.sh buildkit-preflight`; deployment truth checks non-privileged security contexts and BuildKit probes |
| Buster Kubernetes authority | `charts/kubeclaw/templates/rbac.yaml`; `my-values/infra/buster-namespace-fence.yaml`; `cmd/buster-namespace-controller/main.go` | lease-client Role in the release namespace, namespace controller authority for labeled `test-*` namespaces | `kubectl auth can-i create namespaces --as system:serviceaccount:kubeclaw:agent-buster -n "$NAMESPACE"` should be denied in broker mode; deployment truth checks lease-only authority |
| Pipeline path and task validation | `skills/nova/pipeline/core/paths.ts`; `skills/buster/pipeline/services/task-validation.ts`; `skills/common/pipeline/security.ts`; `skills/common/pipeline/egress.ts` | safe project path segments, repo-relative payload paths, denied secret env keys, bounded logs | `node --test tests/skills/nova/pipeline/core/path-segments.test.mjs tests/skills/buster/pipeline/services/task-validation.test.mjs tests/skills/common/pipeline/security.test.mjs tests/skills/common/pipeline/egress.test.mjs` |

## Troubleshooting Signals

- Missing or stale credentials usually surface as failed pod readiness, failed `openclaw gateway status`, or missing Secret keys reported by `my-values/setup-secrets.sh`.
- NetworkPolicy regressions should first be checked with `kubectl -n "$NAMESPACE" get networkpolicy` and the deployment truth verifier, then with pod-level connectivity checks from `../deployment/networking.md`.
- Buster builder security changes should be checked against rendered container `securityContext`, pipeline-only BuildKit mounts, `./scripts/deploy.sh buildkit-preflight`, and `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"`.
- If a runtime config change appears lost after rollout, inspect `/home/node/.openclaw-persisted/openclaw.json`; existing PVC state is intentionally preserved unless the operator migrates it.

## Open Issues

- LiteLLM and Prism preview still use temporary NodePorts.
- NetworkPolicy egress remains port-based and broader than the target Cilium/FQDN policy.
- A public security contact and license decision are not yet selected.
