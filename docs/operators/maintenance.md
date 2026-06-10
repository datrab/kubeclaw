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
