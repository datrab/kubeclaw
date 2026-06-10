# Getting Started

Status: current
Audience: new operator, new maintainer

## Purpose

Use this section to orient yourself before changing or deploying KubeClaw.

## Recommended path

1. Read [repository tour](repository-tour.md) to understand the tree.
2. Read [concepts](../concepts/README.md) for the platform and operator model.
3. Run the local checks in [local development](local-development.md).
4. Review [first deployment](first-deployment.md) before touching a cluster.
5. Use [deployment setup flow](../deployment/setup-flow.md) and [operator guides](../operators/README.md) for live operations.

## Important limitation

The repository does not yet contain a fully source-verified five-minute live deployment quickstart with a fixed cluster profile, live external-provider validation, and rollback guarantees. The verified path in this section is local render and deployment-truth validation, plus the source-checked deployment helper surfaces. The missing live quickstart is tracked in `../open-issues.md`.
