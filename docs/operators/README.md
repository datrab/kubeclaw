# Operator Guides

Status: current
Audience: platform operator

## Purpose

Use these guides to install, run, debug, recover, maintain, and secure KubeClaw.

## Guides

- [Install and upgrade](install-and-upgrade.md)
- [Running the platform](running-the-platform.md)
- [Observability](observability.md)
- [Final preview Tailscale](final-preview-tailscale.md)
- [Running the pipeline](running-the-pipeline.md)
- [Recovery runbook](recovery-runbook.md)
- [Debugging](debugging.md)
- [Common failures](common-failures.md)
- [Failure drills](failure-drills.md)
- [Maintenance](maintenance.md)
- [Security operations](security-operations.md)

## Common Paths

- Deploy and verify: `../deployment/setup-flow.md` -> `running-the-platform.md`
- Run work: `running-the-pipeline.md`
- Investigate failures: `observability.md` -> `debugging.md` -> `recovery-runbook.md`
- Validate recovery docs: `failure-drills.md`
- Operate preview URLs: `final-preview-tailscale.md`

## Operator Job Map

| Job | Start here | Source owners | Commands and evidence |
| --- | --- | --- | --- |
| Install or upgrade | `install-and-upgrade.md`; `../deployment/setup-flow.md` | `scripts/deploy.sh`; `my-values/setup-secrets.sh`; Helm chart templates | `./scripts/deploy.sh setup`; `./scripts/deploy.sh infra`; `./scripts/deploy.sh agents`; rendered Helm output |
| Verify live platform | `running-the-platform.md`; `../deployment/deployment-verification.md` | `scripts/deploy.sh`; `tests/verification/deployment/check-deployment-truth.mjs` | `./scripts/deploy.sh status`; `./scripts/deploy.sh smoke`; `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Run or resume pipeline | `running-the-pipeline.md`; `../pipeline/runtime-flow.md` | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/runners/pipeline-runner.ts` | `node /app/skills/pipeline.ts --project "$CURRENT_PROJECT" --resume --nova-channel "$NOVA_CHANNEL"`; `.swarm/logs/pipeline/latest.json` |
| Inspect evidence | `observability.md`; `debugging.md`; `../pipeline/telemetry-and-artifacts.md` | `skills/nova/pipeline/services/status-store.ts`; `artifact-bundle.ts`; telemetry services | `canonical-events.jsonl`, `read-models.json`, run-scoped `pipeline.jsonl`, Redis telemetry streams |
| Recover failures | `recovery-runbook.md`; `common-failures.md`; `failure-drills.md` | recovery runner, session authority, Buster task completion/dead-letter services | restart-recovery verifier, Buster completion streams, dead-letter streams, active session files |
| Maintain storage/security | `maintenance.md`; `security-operations.md`; `../deployment/persistent-storage.md` | PVC templates, NetworkPolicy source, RBAC templates, secret setup helper | PVC checks, `kubectl auth can-i`, `kubectl get networkpolicy`, deployment truth |

## Verification Set

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area deployment-surface
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area runtime-monitor
git diff --check
```

## Limits

Operator guides describe current repository-backed behavior. They do not prove provider account readiness, CNI enforcement in a live cluster, or volume backup/restore safety unless the specific page names a source or command for that behavior.
