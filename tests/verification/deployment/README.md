Deployment-surface verification lives here.

Canonical entrypoint:
- `tests/verification/deployment/check-deployment-truth.mjs`

Current local scope:
- rendered Helm manifest truth for Nova values, including structured Service exposure checks that reject unexpected NodePorts
- rendered Helm manifest truth for Buster values, including lease-only agent RBAC, dedicated pipeline image, non-privileged split containers, pipeline-only BuildKit/result storage, worker probes, Redis/gateway secret wiring, and removal of retired processor/container-runtime paths
- kubeconform validation of the rendered Nova and Buster manifests
- kubeconform validation of local Kubernetes infra manifests where schemas are available: Buster namespace fence, LiteLLM, registry-local, registry-mirror, and NetworkPolicies
- structured NetworkPolicy checks for default-deny, agent egress, Redis ingress, Clawdeck Redis egress, LiteLLM egress, and registry-mirror egress selectors/ports
- writable swarm-config and Semgrep-config provenance in the rendered ConfigMap
- tracked executable operator surface through `scripts/deploy.sh`
- pinned CI-owned real image-build path through `.github/workflows/build-images.yaml`
- pinned CI-owned runtime image and skills-bundle publication path through `.github/workflows/build-images.yaml`
- pinned canonical live deployment surfaces through `scripts/deploy.sh image [nova|buster|both]` and `scripts/deploy.sh code [nova|buster|both]`
- pinned pod-level smoke path through `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>`
- pinned destructive operator teardown path through `scripts/deploy.sh teardown`, `scripts/deploy.sh teardown-agents`, and `scripts/deploy.sh teardown-all`

Canonical operator evidence split:
- live deployment/build/smoke commands live under `.github/workflows/build-images.yaml`, `scripts/deploy.sh image [nova|buster|both]`, `scripts/deploy.sh code [nova|buster|both]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>`
- destructive teardown commands live under `scripts/deploy.sh teardown`, `scripts/deploy.sh teardown-agents`, and `scripts/deploy.sh teardown-all`
- `scripts/deploy.sh` remains tracked executable so that canonical live deployment commands are directly runnable from the repo checkout
- `teardown` and `teardown-all` share one destructive implementation surface and differ only on whether the namespace is preserved or deleted
- replay/audit artifacts live under `.swarm/logs/pipeline/latest.json` and the run-scoped `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,quarantine.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` bundle
- Redis audit artifacts remain under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus the run-scoped `.swarm/logs/pipeline/runs/<run_id>/redis/` mirror

Live scope:
- `scripts/deploy.sh smoke` checks rollout, pod readiness, in-pod OpenClaw gateway status, runtime skills mount, and runtime swarm config on a real cluster
- `scripts/deploy.sh image [target]` refreshes the selected mutable runtime image tags already published by CI and then relies on smoke
- `scripts/deploy.sh code [target]` deploys GitHub-published `/app/skills` bundles addressed by expected commit, then relies on smoke

Current limitation:
- this guard pins the real CI publication path, live image/code deploy surfaces, teardown surface, canonical pod-level smoke path, and local manifest safety invariants, but actual rollout/smoke/teardown execution still depends on a live cluster and is not executed inside this repo-only verifier
