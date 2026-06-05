---
name: pipeline
description: KubeClaw autonomous pipeline — orchestrates Forge, Buster, and Echo agents to build software module by module with automated testing and review gates.
---

# Pipeline

Autonomous software pipeline. Runs modules sequentially: blueprint release → Forge (code) → Buster (test) → gates (review/test). Handles failures, retries, escalation.

## CLI

```bash
node /app/skills/pipeline.ts --project <name> --nova-channel <id> --resume
node /app/skills/pipeline.ts --project <name> --status
node /app/skills/pipeline.ts --project <name> --dry-run
node /app/skills/pipeline.ts --project <name> --blueprint-list
```

## Tools

### Redis (Nova → Buster)
```bash
node /app/skills/pipeline/tools/redis.ts --action send --type <TYPE> --payload '<JSON>'
node /app/skills/pipeline/tools/redis.ts --action read-completion --stream <key> --module <ID>
```

### Lint Report
```bash
node /app/skills/pipeline/tools/lint-report.ts --repo <path> --tier <full|pre-check>
```

### Project Summary
```bash
node /app/skills/pipeline/tools/project-summary.ts --project <name>
```

## Configuration

Project config lives in `Projects/<name>/src/.swarm/progress.json`. See the project-setup skill for setup instructions.
