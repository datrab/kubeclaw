# Failure Drills

Status: current
Audience: operator, maintainer

## Purpose

Use these drills to validate that the operator docs and runbooks are complete enough to recover important deployment and pipeline failures. The drills are written as safe dry-runs or controlled checks first; only run destructive variants in a disposable namespace or test cluster.

## How To Use These Drills

1. Pick one drill.
2. Confirm it is safe for the current cluster.
3. Run the setup or dry-run check.
4. Confirm the expected failure appears.
5. Follow the documented recovery.
6. Record any missing instruction in `../open-issues.md`.

## Drill: Missing Required Secrets

Symptom:

Agent rollout, setup, or infrastructure install fails because a required Secret or required key is missing.

Setup:

```bash
export NAMESPACE=kubeclaw-drill
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NAMESPACE" delete secret openclaw-shared-secrets --ignore-not-found
```

Expected failure:

`./scripts/deploy.sh agents` or agent pod startup cannot satisfy required secret-backed runtime config.

Checks:

```bash
kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets
kubectl -n "$NAMESPACE" describe pod -l app.kubernetes.io/instance=agent-nova
```

Recovery:

```bash
./scripts/deploy.sh secrets
kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets
./scripts/deploy.sh agents
```

Verification:

```bash
kubectl -n "$NAMESPACE" rollout status deploy/agent-nova
kubectl -n "$NAMESPACE" rollout status deploy/agent-buster
```

Related docs: `../deployment/secrets.md`, `../deployment/setup-flow.md`.

## Drill: LiteLLM Connectivity Failure

Symptom:

Agents are configured to use LiteLLM, but model calls fail or readiness marks LiteLLM dependency unavailable.

Setup:

Use a test namespace with LiteLLM enabled and temporarily scale LiteLLM down:

```bash
kubectl -n "$NAMESPACE" scale deploy/litellm --replicas=0
```

Expected failure:

Agent dependency probes or model-provider checks fail; LiteLLM rollout status is unavailable.

Checks:

```bash
kubectl -n "$NAMESPACE" get svc litellm
kubectl -n "$NAMESPACE" rollout status deploy/litellm --timeout=30s
kubectl -n "$NAMESPACE" logs deploy/litellm --tail=100
```

Recovery:

```bash
kubectl -n "$NAMESPACE" scale deploy/litellm --replicas=1
kubectl -n "$NAMESPACE" rollout status deploy/litellm --timeout=120s
./scripts/deploy.sh smoke-agent nova
```

Verification:

LiteLLM deployment is ready, service exists, and Nova smoke checks pass.

Related docs: `../deployment/litellm.md`, `../deployment/model-provider-prerequisites.md`.

## Drill: Tailscale Operator Setup Failure

Symptom:

Final-preview ingress cannot be created or has no tailnet URL because the Tailscale operator is not installed or lacks OAuth credentials.

Setup:

In a disposable cluster, remove the OAuth Secret before installing the operator:

```bash
kubectl -n tailscale delete secret operator-oauth --ignore-not-found
./scripts/deploy.sh tailscale
```

Expected failure:

The installer fails closed before final-preview behavior is treated as available.

Checks:

```bash
kubectl -n tailscale get secret operator-oauth
kubectl -n tailscale get pods
kubectl get ingressclass tailscale
```

Recovery:

```bash
export TAILSCALE_OAUTH_CLIENT_ID="<oauth-client-id>"
export TAILSCALE_OAUTH_CLIENT_SECRET="<oauth-client-secret>"
./scripts/deploy.sh secrets
./scripts/deploy.sh tailscale
```

Verification:

```bash
kubectl -n tailscale get secret operator-oauth
kubectl -n tailscale get pods
kubectl get ingressclass tailscale
```

Related docs: `final-preview-tailscale.md`, `../deployment/tailscale-operator.md`.

## Drill: Stuck Pipeline Status

Symptom:

Pipeline appears idle in chat, but status shows an active module or gate.

Setup:

Use an existing test project run or inspect example state in `../examples/progress-json/in-progress.json`.

Expected failure:

Status remains `IN_PROGRESS`, `READY_FOR_TESTING`, or `TESTING` longer than the configured timeout or normal suite duration.

Checks:

```bash
node /app/skills/pipeline.ts --project my-project --status
jq . Projects/my-project/src/.swarm/logs/pipeline/latest.json
RUN_ID="$(jq -r '.run_id' Projects/my-project/src/.swarm/logs/pipeline/latest.json)"
tail -n 80 "Projects/my-project/src/.swarm/logs/pipeline/runs/${RUN_ID}/pipeline.jsonl"
```

Recovery:

- `IN_PROGRESS`: inspect Forge/OpenClaw session state and provider reachability.
- `READY_FOR_TESTING`: inspect Nova dispatch and Redis task stream.
- `TESTING`: inspect Buster pod logs and task output/dead-letter evidence.

Resume only after the owning evidence surface is healthy:

```bash
node /app/skills/pipeline.ts --project my-project --nova-channel "$NOVA_CHANNEL" --resume --prompt "Recovered the stuck TESTING phase after Buster worker restart."
```

Verification:

Status advances or terminal summary explains the remaining blocker.

Related docs: `running-the-pipeline.md`, `../pipeline/failure-and-recovery.md`.

## Drill: Failed Gate

Symptom:

A review, approval, or Buster gate blocks the pipeline.

Setup:

Use a test project with a `gate:<id>` entry and intentionally provide a gate output or approval state that should not pass.

Expected failure:

Gate status is failed, blocked, timed out, or action-required with gate artifacts under `.swarm/logs/gates/<gate_id>/`.

Checks:

```bash
node /app/skills/pipeline.ts --project my-project --status
find Projects/my-project/src/.swarm/logs/gates -maxdepth 3 -type f | sort
```

Recovery:

- Review gate: fix reviewer findings or rerun the fix-and-rereview cycle.
- Approval gate: provide the operator decision or handle timeout policy.
- Buster gate: inspect gate output, Buster logs, and suite artifacts.

Verification:

Gate moves to pass or the terminal summary reports a clear blocked reason.

Related docs: `../pipeline/modules-and-gates.md`, `../developers/adding-gates.md`.

## Drill: Failed Buster Suite

Symptom:

A module or Buster gate has `FAIL` or `ERROR` evidence from deterministic suites.

Setup:

In a disposable test project, configure an enforced unit suite with a command that fails:

```json
{
  "test_suites": ["unit"],
  "test_config": {
    "unit": {
      "test_cmd": "node -e \"process.exit(1)\"",
      "thresholds": { "max_failures": 0 }
    }
  }
}
```

Expected failure:

Buster output records failed unit evidence and Nova either retries, requests fix, or blocks according to policy.

Checks:

```bash
find Projects/my-project/src/.swarm -name 'buster-output.json' -print
kubectl -n kubeclaw logs deploy/agent-buster -c buster-pipeline --tail=200
```

Recovery:

Fix the app/test command or thresholds, then resume:

```bash
node /app/skills/pipeline.ts --project my-project --nova-channel "$NOVA_CHANNEL" --resume --prompt "Fixed failing unit suite."
```

Verification:

Buster output reports PASS or the next failure has a different, actionable finding.

Related docs: `../pipeline/workers-and-buster.md`, `../reference/test-suites.md`.

## Drill: Broken Lint Rules

Symptom:

Pipeline blocks before Buster with pre-check or full-lint execution failure.

Setup:

Dry-run the lint tool path check by temporarily verifying a bad path in a copied config, or inspect `../examples/progress-json/failed.json` for expected blocked evidence.

Expected failure:

The result says pre-check or full lint setup failed; it is classified as tooling/environment, not app test failure.

Checks:

```bash
node skills/nova/pipeline/tools/lint-report.ts --repo "$PWD" --tier full --output /tmp/kubeclaw-lint-report.json
jq . /tmp/kubeclaw-lint-report.json
find Projects/my-project/src/.swarm/logs -path '*lint*' -type f | sort
```

Recovery:

Restore `pre_check.lint_report_path`, required tool config, or runtime image tooling. Then resume with a note that the lint tool path/config has been fixed.

Verification:

`lint-report.ts` writes parseable JSON and pre-check/full-lint no longer blocks on setup failure.

Related docs: `../developers/linting-rules.md`, `../reference/linting-rules.md`.

## Drill: Missing Artifacts

Symptom:

Status or logs reference a run/module/gate, but expected summary or output artifacts are missing.

Setup:

Use `../examples/progress-json/partial-artifacts.json` to classify the partial state before touching a live run.

Expected failure:

The missing artifact changes recovery. For example, missing Buster output while module status is `READY_FOR_TESTING` means Buster has not completed; missing run summary after logs exist means terminal completion did not finish.

Checks:

```bash
jq . Projects/my-project/src/.swarm/logs/pipeline/latest.json
RUN_ID="$(jq -r '.run_id' Projects/my-project/src/.swarm/logs/pipeline/latest.json)"
find "Projects/my-project/src/.swarm/logs/pipeline/runs/${RUN_ID}" -maxdepth 2 -type f | sort
find Projects/my-project/src/.swarm/modules -name 'buster-output.json' -print
find Projects/my-project/src/.swarm/logs/gates -type f | sort
```

Recovery:

- Missing run summary: inspect run `pipeline.jsonl` and resume if terminal completion did not finish.
- Missing Buster output: inspect Buster task/completion/dead-letter evidence.
- Missing approval decision: recover the operator decision path.
- Missing all run artifacts: the command likely failed before run initialization; fix config and start again.

Verification:

The expected artifact exists or the terminal summary explains why it cannot be produced.

Related docs: `../pipeline/telemetry-and-artifacts.md`, `../reference/status-and-artifacts.md`.

## Validation Result

These drills were dry-run checked against the current docs and source-backed command surfaces during the documentation rebuild. Live destructive variants must be run only in disposable namespaces or clusters.

Unresolved drill gaps should be captured in `../open-issues.md`.
