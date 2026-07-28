# Reference

Status: current
Audience: operator, developer

## Purpose

This section collects source-backed reference material for values, environment, config, artifacts, Redis, telemetry, process-boundary exits, Buster tasks, and verification commands.

## References

- [CLI](cli.md)
- [Helm values](helm-values.md)
- [Environment variables](environment-variables.md)
- [Secrets](secrets.md)
- [OpenClaw config](openclaw-config.md)
- [Swarm config](swarm-config.md)
- [Progress JSON](progress-json.md)
- [Status and artifacts](status-and-artifacts.md)
- [Redis streams](redis-streams.md)
- [Telemetry events](telemetry-events.md)
- [Observability sinks](observability-sinks.md)
- [Process exits](exit-codes.md)
- [Test suites](test-suites.md)
- [Linting rules](linting-rules.md)
- [Buster task config](buster-task-config.md)
- [Verification commands](verification-commands.md)
- [Workflow inventory](workflows.md)

## Generated Reference Coverage

Exact CLI flags, Helm values, secrets, environment variables, verification commands, and GitHub workflow inventory are generated from repository sources. Other reference pages are source-backed manual references whose automation opportunities are tracked separately from current behavior.

Current generated reference pages:

- `cli.md`
- `helm-values.md`
- `environment-variables.md`
- `secrets.md`
- `verification-commands.md`
- `workflows.md`

Remaining generation opportunities:

- Partially generate `openclaw-config.md`, `swarm-config.md`, and `progress-json.md` from config files and runtime schema sources.
- Generate `status-and-artifacts.md`, `redis-streams.md`, `telemetry-events.md`, and `observability-sinks.md` from runtime constants, telemetry schema, tests, and plugin observer sources.
- Generate `exit-codes.md`, `test-suites.md`, `linting-rules.md`, and `buster-task-config.md` from pipeline constants, Buster suites, lint tooling, task validation, and verification tests.

## Reference Authority Map

| Reference family | Source owners | Generated? | Verification |
| --- | --- | --- | --- |
| Deployment CLI, environment, secrets, Helm values, verification commands, workflow inventory | `scripts/deploy.sh`; `my-values/setup-secrets.sh`; `charts/kubeclaw/values.yaml`; `my-values/*.yaml`; `.github/workflows/*.yaml`; `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs` | yes, first slice | `npm run docs:check:generated`; `npm run docs:check:refs`; `npm run docs:check:coverage`; `npm run docs:check` |
| OpenClaw and swarm config | `charts/kubeclaw/templates/configmap-gateway.yaml`; `charts/kubeclaw/files/config/swarm.config.json`; `charts/kubeclaw/templates/configmap-swarm-config.yaml`; `skills/nova/pipeline/core/config.ts` | manual with generation opportunity | config tests, deployment truth, docs check |
| Pipeline state and artifacts | `skills/nova/pipeline/services/status-store.ts`; `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/status-store-lifecycle/**` | manual | status-store and artifact authority contract checks |
| Redis and Buster tasks | `skills/buster/pipeline/services/task-queue.ts`; `task-validation.ts`; `task-completion.ts`; `skills/common/pipeline/services/task-transport-contract.ts` | manual | Buster pipeline and Redis contract checks |
| Telemetry and observability | `skills/nova/pipeline/services/telemetry/**`; `skills/common/pipeline/services/telemetry/payload-schema.ts`; `skills/common/plugins/openclaw-agent-observer/src/index.ts` | manual | telemetry docs behavior area and telemetry contract check |

## Maintenance Rules

- Generated references must be changed through `scripts/docs-inventory.mjs` or `scripts/docs-generate.mjs`.
- Manual references must name the owning source file and a verification surface when they describe behavior.
- If a reference describes future generation work, keep it in "Remaining generation opportunities" or `../future-implementation-ideas.md`; do not present it as current generated coverage.
- For path-heavy references, run a targeted `test -e`/`rg -q` scan before closing the docs pass.
