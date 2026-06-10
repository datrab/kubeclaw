# Platform Model

Status: current
Audience: operators, maintainers

## Overview

KubeClaw deploys an OpenClaw-based agent platform into Kubernetes. The production shape uses a shared Helm chart for agent pods, separate values files for Nova and Buster, and infrastructure manifests or upstream charts for Redis, Qdrant, PostgreSQL, LiteLLM, registries, and Tailscale.

## Current Components

- Nova is the orchestration agent.
- Buster is the sandboxed test worker.
- Redis carries task, completion, and telemetry traffic.
- Qdrant supports OpenClaw memory.
- LiteLLM can provide an OpenAI-compatible model proxy backed by PostgreSQL.
- Tailscale Kubernetes Operator can expose final previews through tailnet ingress.

## Related Tasks

- `../deployment/deployment-overview.md`
- `../deployment/setup-flow.md`
- `../operators/running-the-platform.md`
