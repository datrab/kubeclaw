# Operator Model

Status: current
Audience: operators

## Overview

Operators prepare prerequisites, create or verify secrets, deploy infrastructure, deploy agents, verify health, run pipeline tasks, inspect status and artifacts, recover failures, and maintain the platform.

## Operating Loop

1. Prepare cluster and upstream prerequisites.
2. Run setup and secret creation.
3. Deploy infrastructure.
4. Deploy Nova and Buster.
5. Verify pods, services, PVCs, gateway status, and smoke checks.
6. Run or resume pipeline work.
7. Inspect logs, status, telemetry, artifacts, and final previews.
8. Recover or escalate when checks fail.

## Related Tasks

- `../getting-started/first-deployment.md`
- `../deployment/setup-flow.md`
- `../operators/running-the-platform.md`
- `../operators/debugging.md`
- `../operators/recovery-runbook.md`
