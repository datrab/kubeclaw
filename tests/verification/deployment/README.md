Deployment-surface verification lives here.

Canonical entrypoint:
- `tests/verification/deployment/check-deployment-truth.mjs`

Current local scope:
- rendered Helm manifest truth for Nova values, including structured Service exposure checks that reject unexpected NodePorts
- rendered Helm manifest truth for Buster values, including structured lease-only agent RBAC checks, sandbox image, privileged Podman-in-Pod surface on both split Buster containers, shared runtime/sandbox mounts, bounded `ephemeral-storage`, Redis/gateway/Anthropic secret wiring, registry-local Podman config, and removal of the legacy stream-processor sidecar
- kubeconform validation of the rendered Nova and Buster manifests
- kubeconform validation of local Kubernetes infra manifests where schemas are available: Buster namespace fence, LiteLLM, registry-local, registry-mirror, and NetworkPolicies
- structured NetworkPolicy checks for default-deny, agent egress, Redis ingress, Clawdeck Redis egress, LiteLLM egress, and registry-mirror egress selectors/ports
- writable swarm-config and Semgrep-config provenance in the rendered ConfigMap
- tracked executable operator surface through `scripts/deploy.sh`
- pinned CI-owned real image-build path through `.github/workflows/build-images.yaml`
- pinned local live-verification image-build path through `scripts/deploy.sh build-local-images [tag]`
- pinned canonical live deployment verification path through `scripts/deploy.sh verify-live [tag]`
- pinned pod-level smoke path through `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>`
- pinned destructive operator teardown path through `scripts/deploy.sh teardown`, `scripts/deploy.sh teardown-agents`, and `scripts/deploy.sh teardown-all`

Canonical operator evidence split:
- live deployment/build/smoke commands live under `scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>`
- destructive teardown commands live under `scripts/deploy.sh teardown`, `scripts/deploy.sh teardown-agents`, and `scripts/deploy.sh teardown-all`
- `scripts/deploy.sh` remains tracked executable so that canonical live deployment commands are directly runnable from the repo checkout
- `teardown` and `teardown-all` share one destructive implementation surface and differ only on whether the namespace is preserved or deleted
- replay/audit artifacts live under `.swarm/logs/pipeline/latest.json` and the run-scoped `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` bundle
- Redis audit artifacts remain under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus the run-scoped `.swarm/logs/pipeline/runs/<run_id>/redis/` mirror

Live scope:
- `scripts/deploy.sh smoke` checks rollout, pod readiness, in-pod OpenClaw gateway status, packaged skills, and runtime swarm config on a real cluster
- `scripts/deploy.sh verify-live [tag]` builds local images, pushes to registry-local, proves the cluster-visible pull path with a temporary pod, redeploys Nova/Buster against those images, and runs smoke

Current limitation:
- this guard pins the real image-build path, registry-local live verification path, teardown surface, canonical pod-level smoke path, and local manifest safety invariants, but actual build/push/redeploy/smoke/teardown execution still depends on a live cluster plus local Docker access and is not executed inside this repo-only verifier
