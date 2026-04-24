Deployment-surface verification lives here.

Canonical entrypoint:
- `tests/verification/deployment/check-deployment-truth.mjs`

Current scope:
- rendered Helm manifest truth for Nova values
- kubeconform validation of the rendered manifest
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
- replay/audit artifacts live under `.swarm/logs/pipeline/latest.json` and the run-scoped `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,summary.json}` bundle
- Redis audit artifacts remain under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus the run-scoped `.swarm/logs/pipeline/runs/<run_id>/redis/` mirror

Current limitation:
- this guard now pins the existence of the real image-build path, the registry-local live verification path, the teardown surface, and the canonical pod-level smoke path, but the actual build/push/redeploy/smoke/teardown execution still depends on a live cluster plus local Docker access and is not executed inside this repo-only verifier
