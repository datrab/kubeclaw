# Deployment Component Template

Status: template
Audience: documentation authors

## Purpose

Use this template for component deployment pages such as Redis, PostgreSQL, Qdrant, LiteLLM, Tailscale, registries, and agents.

```text
# Component name

## When to deploy this
## Upstream responsibility
## KubeClaw responsibility
## Required values and secrets
## Install or update
## Verify the component
## Expected state
## Common failures
## Recovery
## Related reference
## Sources
```

## Required Content

- Clear upstream-versus-KubeClaw boundary.
- Component ownership, values, Secrets, Services, pods, PVCs, and network exposure.
- Install command and update behavior.
- Verification commands and expected state.
- Common failures and recovery.
- Upstream links where another project owns behavior.
