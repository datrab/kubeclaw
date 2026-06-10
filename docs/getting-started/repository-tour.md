# Repository Tour

Status: current
Audience: new contributor

## Top-level directories

- `charts/kubeclaw/` contains the shared Helm chart. One release is rendered for Nova and another for Buster.
- `my-values/` contains production values and infrastructure manifests. Nova, Buster, Redis, Qdrant, LiteLLM, PostgreSQL, and registry resources are configured here.
- `docker/` contains the general and sandbox image definitions.
- `skills/nova/` contains the pipeline orchestrator entrypoint, CLI, config loading, runners, gates, telemetry, status store, and helpers.
- `skills/buster/` contains Buster's Redis worker, task execution, deterministic suites, browser tooling, and runtime support.
- `skills/common/` contains shared pipeline contracts, transports, lifecycle, redaction, telemetry, and service helpers.
- `tests/verification/` contains local behavior, contract, runtime, and deployment checks.
- `docs/` contains current docs and archived historical material.

## Source of truth order

For documentation and review work, prefer current source files and rendered manifests over archived plans. If a behavior is unclear, inspect the owning code and verification script before writing a doc claim.
