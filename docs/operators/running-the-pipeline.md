# Running The Pipeline

Status: current
Audience: operator

## When To Use This

Use this page when you need to start, inspect, resume, or escalate a Nova/Buster pipeline run for a project that already has a `Projects/<project>/src/.swarm/progress.json` file.

## Before You Begin

Confirm:

- Nova agent can access the repository.
- Buster agent is deployed and healthy when the project uses Buster suites.
- Redis is reachable from Nova and Buster.
- OpenClaw provider/model configuration is valid for the selected model IDs.
- You know the Discord channel ID used for operator escalation.
- Project config exists at `Projects/<project>/src/.swarm/progress.json`.

Check pods:

```bash
kubectl -n kubeclaw get pods
kubectl -n kubeclaw get deploy agent-nova agent-buster
```

Check project config:

```bash
test -f Projects/my-project/src/.swarm/progress.json
jq '.project, .execution_order' Projects/my-project/src/.swarm/progress.json
```

## What Happens

Nova loads platform config from `/home/node/.openclaw/swarm.config.json`, loads the project `progress.json`, creates a run ID, writes pipeline artifacts, acquires a run lock, starts observability helpers, reconciles stale state, and walks `execution_order`.

Forge work runs through the configured OpenClaw runtime. Buster work is sent to Redis as typed tasks and completed by the Buster pod. Gates can run reviews, require approval, or dispatch Buster gate tasks.

## Start A Run

From the Nova environment:

```bash
node /app/skills/pipeline.ts \
  --project my-project \
  --nova-channel 1513577188899946506
```

Use `--repo` if the repository is not auto-detected:

```bash
node /app/skills/pipeline.ts \
  --repo /home/node/.openclaw/workspace/git-repo \
  --project my-project \
  --nova-channel 1513577188899946506
```

`--nova-channel` is required for real runs because Nova uses it for `action_required` and timeout escalation. It is not required for status, dry-run, or blueprint commands.

## Check Status

```bash
node /app/skills/pipeline.ts --project my-project --status
```

Expected shape:

```json
{
  "project": "my-project",
  "modules": {
    "02-api": {
      "status": "TESTING",
      "current_phase": "buster"
    }
  },
  "gates": {}
}
```

Interpretation:

- `PENDING`: not reached yet or reset to phase start.
- `IN_PROGRESS`: Forge is active.
- `READY_FOR_TESTING`: Forge completed and Buster has not finished.
- `TESTING`: Buster is active.
- `PASS`: module/gate completed.
- `FAIL`: required work failed.
- `BLOCKED`: automatic progress stopped.
- `RATE_LIMITED`: provider/model cooldown handling is active.

## Inspect Artifacts

Find the active run:

```bash
jq . Projects/my-project/src/.swarm/logs/pipeline/latest.json
```

Read the terminal summary:

```bash
RUN_ID="$(jq -r '.run_id' Projects/my-project/src/.swarm/logs/pipeline/latest.json)"
jq . "Projects/my-project/src/.swarm/logs/pipeline/runs/${RUN_ID}/summary.json"
```

Follow recent events:

```bash
tail -n 80 "Projects/my-project/src/.swarm/logs/pipeline/runs/${RUN_ID}/pipeline.jsonl"
```

Find Buster outputs:

```bash
find Projects/my-project/src/.swarm -name 'buster-output.json' -o -name '*BUSTER*RESULT*.json'
```

## Resume A Run

Resume when the failure cause has been addressed and durable state should be kept:

```bash
node /app/skills/pipeline.ts \
  --project my-project \
  --nova-channel 1513577188899946506 \
  --resume \
  --prompt "Fixed the missing app secret and verified the Buster pod can read Redis."
```

Good resume prompts are short and factual. Include what changed and what Nova should assume now. Do not use resume to hide uncertainty; if the cause is unknown, inspect artifacts first.

## Dry-Run The Plan

```bash
node /app/skills/pipeline.ts --project my-project --dry-run
```

Dry-run should load config and print the planned order without dispatching agents or Buster tasks. Use it after editing `progress.json`.

## Expected Terminal States

Success:

- status has all required modules/gates complete
- `summary.json` exists under the run directory
- terminal artifacts say `terminal_status: "succeeded"`
- CLI process exits `0`

Non-success:

- terminal artifacts include `terminal_status`, `terminal_decision`, and `reason_code`
- CLI process exits `1`
- `action_required` and `timed_out` should escalate to the configured Nova channel
- `blocked` should have run evidence explaining the blocker

## Common Failures

Missing project config:

```text
Symptom: command fails before run artifacts are created.
Check: test -f Projects/<project>/src/.swarm/progress.json
Recovery: fix --project/--repo or create the project progress file.
```

Missing Nova channel:

```text
Symptom: real run refuses to start, but --status works.
Check: confirm --nova-channel or NOVA_CHANNEL is set.
Recovery: rerun with the Discord channel ID.
```

Buster not consuming tasks:

```text
Symptom: module remains TESTING.
Check: kubectl -n kubeclaw logs deploy/agent-buster -c buster-pipeline --tail=200
Recovery: fix Buster pod/Redis/gateway health, then resume.
```

Dead-lettered Buster task:

```text
Symptom: Buster logs mention dead-letter or invalid payload.
Check: Redis dead-letter stream and task validation error.
Recovery: fix progress.json, Nova dispatch, or unsafe path; then resume or rerun.
```

Validator blocked:

```text
Symptom: pre-check/full-lint blocks before Buster.
Check: .swarm/logs/**/lint artifacts.
Recovery: fix code findings or tool configuration according to the control result.
```

## Escalation

Escalate to a maintainer when:

- `latest.json` and status output disagree
- a valid-looking Buster task dead-letters repeatedly
- the run lock cannot recover after pod restart
- observability is degraded and fallback artifacts are absent
- terminal status is `blocked` and the reason is not actionable

## Related Reference

- [Pipeline runtime flow](../pipeline/runtime-flow.md)
- [Failure and recovery](../pipeline/failure-and-recovery.md)
- [Telemetry and artifacts](../pipeline/telemetry-and-artifacts.md)
- [CLI reference](../reference/cli.md)
- [Progress JSON reference](../reference/progress-json.md)
- [Status and artifacts reference](../reference/status-and-artifacts.md)

## Sources

- `skills/nova/pipeline/cli.ts`
- `skills/nova/pipeline/runners/pipeline-runner.ts`
- `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
- `skills/buster/buster-pipeline.ts`
