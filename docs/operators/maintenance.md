# Maintenance

Status: current
Audience: operator

## Purpose

Document routine cleanup and teardown commands.

## Current Behavior

Remove agents only:

```bash
./scripts/deploy.sh teardown-agents
```

Remove agents and infra, preserving namespace and secrets:

```bash
./scripts/deploy.sh teardown
```

Destroy namespace and all resources:

```bash
./scripts/deploy.sh teardown-all
```

`teardown` prompts for `yes`. `teardown-all` prompts for `destroy`.

Agent PVCs have Helm keep policy. The destructive infra teardown path attempts to remove leftover PVCs when preserving the namespace. Always inspect retained secrets and PVCs after teardown if credentials or workspace data should be destroyed.

Storage and secret hygiene details live in `../deployment/persistent-storage.md` and `security-operations.md`. Before destructive maintenance, collect `kubectl -n "$NAMESPACE" get pvc -o wide`, rendered Nova/Buster Helm output, and any active `.swarm/logs/pipeline` run artifacts that need to survive the teardown.

## Maintenance Checklist

| Task | Command/evidence | Boundary |
| --- | --- | --- |
| Check live state | `./scripts/deploy.sh status`; `kubectl -n "$NAMESPACE" get pods,svc,pvc,secret` | status output may be incomplete if Kubernetes access is broken |
| Preserve run evidence | copy `.swarm/logs/pipeline/latest.json`, `runs/<run_id>/pipeline.jsonl`, `read-models.json`, and module/gate artifacts | do this before teardown or PVC cleanup |
| Rotate or repair Secrets | rerun `my-values/setup-secrets.sh` with `KUBECLAW_SECRETS_OVERWRITE=true` only when intentional | existing Secrets are reused by default |
| Remove agents only | `./scripts/deploy.sh teardown-agents` | keeps infra, namespace, Secrets, and PVCs |
| Remove infra but keep namespace | `./scripts/deploy.sh teardown` | prompts for `yes`; inspect retained PVCs/Secrets afterward |
| Destroy namespace | `./scripts/deploy.sh teardown-all` | prompts for `destroy`; use only after preserving required state |

The repository does not currently provide scheduled backup, restore, or secret-rotation automation. Document any manual backup procedure used during maintenance in the operator log or incident notes.
