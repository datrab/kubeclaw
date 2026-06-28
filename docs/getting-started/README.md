# Getting Started

Status: current
Audience: new operator, new maintainer

## Purpose

Use this section to orient yourself before changing or deploying KubeClaw. It gives a safe order for reading the repo, running local checks, and preparing for a live deployment.

## Recommended Path

1. Read [repository tour](repository-tour.md) to understand the tree, source owners, generated artifacts, and verification directories.
2. Read [concepts](../concepts/README.md) for the platform, operator, pipeline, and extensibility model.
3. Run the local checks in [local development](local-development.md).
4. Review [first deployment](first-deployment.md) before touching a cluster.
5. Use [deployment setup flow](../deployment/setup-flow.md) and [operator guides](../operators/README.md) for live operations.

## First Commands

From the repository root:

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
```

If you are changing pipeline E2E behavior, add:

```bash
node --test tests/verification/e2e/*.test.mjs
```

## Source-Backed Orientation

| Need | Start with | Source of truth |
| --- | --- | --- |
| Understand files and owners | `repository-tour.md`; `../developers/codebase-tour.md` | repo tree, `scripts/docs-check.mjs`, runtime source paths |
| Run local checks | `local-development.md`; `../developers/testing-and-ci.md` | `package.json`, `tests/verification/**` |
| Prepare a cluster | `first-deployment.md`; `../deployment/setup-flow.md` | `scripts/deploy.sh`, `my-values/setup-secrets.sh`, Helm templates/values |
| Operate a deployed platform | `../operators/README.md` | deploy script, Kubernetes state, Nova/Buster status and artifacts |
| Diagnose limitations | `../open-issues.md`; `../future-implementation-ideas.md` | source scans, verification output, audit artifacts |

## Failure Signals

- `npm run docs:check` failure means the docs surface, generated reference output, local links, or diagrams need attention before a reader can trust the docs.
- Deployment truth failure means rendered Kubernetes behavior no longer matches docs or source-backed expectations.
- Helm render failure means chart templates or values cannot be applied as documented.
- Missing provider credentials, live CNI behavior, and backup/restore behavior are not proven by these local checks.

## Important Limitation

The repository does not yet contain a fully source-verified five-minute live deployment quickstart with a fixed cluster profile, live external-provider validation, and rollback guarantees. The verified path in this section is local render and deployment-truth validation, plus the source-checked deployment helper surfaces. The missing live quickstart is tracked in `../open-issues.md`.
