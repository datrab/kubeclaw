# Recovery Runbook

Status: current
Audience: operator

## Symptoms

Use this runbook when one of these symptoms appears:

- `./scripts/deploy.sh smoke` fails for Nova or Buster.
- `kubectl rollout status` times out for `agent-nova`, `agent-buster`, or `litellm`.
- Nova pipeline exits with `action_required`, `blocked`, `failed`, `timed_out`, or `rate_limited`.
- Buster is running but does not settle task completion or shows worker/gateway health failures.
- Required artifacts, summaries, or status files are missing after a pipeline run.

## Impact

Deployment failures can leave agents unavailable or unable to reach Redis, Qdrant, LiteLLM, provider credentials, Git, Discord, or the OpenClaw gateway.

Pipeline failures can leave work stopped at a module or gate until an operator inspects evidence and resumes, reruns, or escalates.

## Fast checks

Start with namespace state:

```bash
./scripts/deploy.sh status
kubectl -n "$NAMESPACE" get pods,svc,pvc
kubectl -n "$NAMESPACE" get events --sort-by=.lastTimestamp | tail -40
```

Check agent rollouts:

```bash
kubectl -n "$NAMESPACE" rollout status deployment/agent-nova --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/agent-buster --timeout=180s
```

Check logs:

```bash
kubectl -n "$NAMESPACE" logs deployment/agent-nova -c kubeclaw --tail=200
kubectl -n "$NAMESPACE" logs deployment/agent-buster -c kubeclaw --tail=200
kubectl -n "$NAMESPACE" logs deployment/agent-buster -c buster-pipeline --tail=200
```

Check gateway status:

```bash
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- openclaw gateway status
kubectl -n "$NAMESPACE" exec deployment/agent-buster -c kubeclaw -- openclaw gateway status
```

Check source-backed deployment truth:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Likely causes

- Missing or incomplete Secrets.
- Optional infrastructure flag disabled while probes still expect the component.
- LiteLLM enabled but PostgreSQL, `litellm-secrets`, `google-sa-key`, or provider credentials are incomplete.
- Tailscale operator enabled but `operator-oauth` is missing or invalid.
- Image pull failure from GHCR or local registry.
- Buster sandbox or namespace broker resources are unavailable.
- Pipeline run needs operator guidance after retries or rate-limit handling.

## Recovery procedure

### Missing or incomplete Secrets

Check:

```bash
kubectl -n "$NAMESPACE" get secrets
kubectl -n tailscale get secret operator-oauth
```

Recover:

```bash
KUBECLAW_SECRET_SETUP_MODE=interactive ./scripts/deploy.sh secrets
./scripts/deploy.sh agents
```

### Agent rollout failure

Check:

```bash
kubectl -n "$NAMESPACE" describe pod -l app.kubernetes.io/instance=agent-nova
kubectl -n "$NAMESPACE" describe pod -l app.kubernetes.io/instance=agent-buster
```

Recover after fixing the cause:

```bash
./scripts/deploy.sh agents
./scripts/deploy.sh smoke
```

### LiteLLM failure

Check:

```bash
kubectl -n "$NAMESPACE" get secret litellm-secrets google-sa-key
kubectl -n "$NAMESPACE" logs deployment/litellm --tail=200
```

Recover:

```bash
./scripts/deploy.sh secrets
./scripts/deploy.sh infra
```

### Tailscale operator failure

Check:

```bash
kubectl -n tailscale get secret operator-oauth
kubectl -n tailscale get pods
kubectl get ingressclass tailscale
```

Recover:

```bash
./scripts/deploy.sh tailscale
```

### Pipeline needs guidance

Inspect status, summaries, logs, and artifacts before resuming:

```bash
node /app/skills/pipeline.ts --project <name> --status
cat .swarm/logs/pipeline/latest.json
find .swarm/logs/pipeline -maxdepth 3 -type f | sort | tail -40
```

Then inspect the run-scoped lifecycle authority before deciding to resume:

```bash
RUN_ID="$(jq -r '.run_id' .swarm/logs/pipeline/latest.json)"
jq . ".swarm/logs/pipeline/runs/${RUN_ID}/lifecycle/read-models.json"
tail -40 ".swarm/logs/pipeline/runs/${RUN_ID}/lifecycle/canonical-events.jsonl"
rg '"recovery.stale_blocked|recovery.stale_reset|terminal_status|reason_code"' ".swarm/logs/pipeline/runs/${RUN_ID}"
```

Do not resume from Discord text alone. If lifecycle read models show `recovery.stale_blocked` or an active session with missing `run_id`, `attempt`, `dispatch_id`, or `session_key`, collect evidence and escalate instead of forcing a reset.

Resume with a focused prompt:

```bash
node /app/skills/pipeline.ts --project <name> --nova-channel <id> --resume --prompt "specific recovery guidance"
```

For longer recovery guidance:

```bash
node /app/skills/pipeline.ts --project <name> --nova-channel <id> --resume --prompt-file <repo-relative-file>
```

### Buster task does not settle

Buster owns the Redis task consumer and must write a terminal completion or dead-letter before ACK. Check both the worker logs and Redis streams:

```bash
kubectl -n "$NAMESPACE" logs deployment/agent-buster -c buster-pipeline --tail=300
redis-cli -h redis-master.kubeclaw.svc.cluster.local XPENDING swarm:buster:tasks buster-workers
redis-cli -h redis-master.kubeclaw.svc.cluster.local XREVRANGE swarm:buster:tasks:dead-letter + - COUNT 20
redis-cli -h redis-master.kubeclaw.svc.cluster.local XREVRANGE "swarm:pipeline:<project>:completions" + - COUNT 20
```

If logs show `BUSTER_TASK_MALFORMED`, inspect task identity fields before retrying: `task_type`, `module_id`, `project`, `run_id`, `attempt`, `dispatch_id`, `commit_hash`, `output_file`, `stage_id`, `timeout_seconds`, `session.runtime`, `session.model`, `session.agentId`, `session.cwd`, `session.label`, `suites`, and `test_config.suite_timeout_ms`. If logs show `BUSTER_TASK_TERMINAL_GUARANTEE_FAILED`, treat it as a Redis/task reliability incident because ACK was blocked by missing completion/dead-letter evidence.

## Verification

Deployment recovery is successful when:

```bash
./scripts/deploy.sh smoke
kubectl -n "$NAMESPACE" get pods
```

Pipeline recovery is successful when the resumed run reaches a terminal success state or produces a new, clearer terminal failure with updated evidence.

## Escalation

Escalate with this evidence:

- command that failed
- `kubectl get pods,svc,pvc -n "$NAMESPACE" -o wide`
- relevant `kubectl describe pod` output
- last 200 lines of affected container logs
- pipeline status JSON
- relevant summary, artifact, or failure files
- exact recovery command already attempted

For storage or security incidents, also include the checks from `../deployment/persistent-storage.md` and `security-operations.md`: retained PVC list, service exposure, NetworkPolicy list, Buster privilege/mount evidence, and persisted-config placeholder scan. Do not include decoded Secret values.

## Prevention

- Run `npm run docs:inventory:check` before editing source-backed docs.
- Run `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` after chart, values, image, or infrastructure changes.
- Keep secret setup and generated inventory current after deployment behavior changes.
- Use failure drills once `operators/failure-drills.md` is populated.

## Related reference

- `../deployment/setup-flow.md`
- `../deployment/secrets.md`
- `../deployment/deployment-verification.md`
- `debugging.md`
- `common-failures.md`
- `observability.md`
- `../reference/status-and-artifacts.md`
- `../reference/verification-commands.md`

## Sources

- `scripts/deploy.sh`
- `my-values/setup-secrets.sh`
- `skills/nova/pipeline/cli.ts`
- `skills/buster/buster-pipeline.ts`
- `skills/buster/pipeline/services/gateway-health.ts`
- `docs/generated/inventory/deploy-script.json`
- `docs/generated/inventory/secret-setup.json`
