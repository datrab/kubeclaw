---
name: pipeline
description: KubeClaw autonomous pipeline — orchestrates Forge, Buster, and Echo agents to build software module by module with automated testing and review gates.
---

# Pipeline

Autonomous software pipeline. Runs modules sequentially: blueprint release → Forge (code) → Buster (test) → gates (review/test). Handles failures, retries, escalation.

## CLI

```bash
node /app/skills/pipeline.js --project <name> --resume
node /app/skills/pipeline.js --project <name> --status
node /app/skills/pipeline.js --project <name> --dry-run
node /app/skills/pipeline.js --project <name> --blueprint-list
```

## Tools

### Redis (Nova → Buster)
```bash
node /app/skills/pipeline/tools/redis.js --action send --type <TYPE> --payload '<JSON>'
node /app/skills/pipeline/tools/redis.js --action read-completion --stream <key> --module <ID>
```

### Lint Report
```bash
node /app/skills/pipeline/tools/lint-report.js --repo <path> --tier <full|pre-check>
```

### Project Summary
```bash
node /app/skills/pipeline/tools/project-summary.js --project <name>
```

## Configuration

Project config lives in `Projects/<name>/src/.swarm/progress.json`. See the project-setup skill for setup instructions.
