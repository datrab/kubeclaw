# Codebase Tour

Status: current
Audience: developer

## Purpose

Map the source tree to the runtime behaviors documented elsewhere.

## Nova

`skills/nova/pipeline.ts` is the public Nova entrypoint. It delegates to `skills/nova/pipeline/cli.ts` for flags and then into the pipeline runner. `core/config.ts` validates project, repository, swarm config, and progress JSON inputs. Runner modules under `skills/nova/pipeline/runners/` execute modules, gates, polling, terminal handling, and Buster dispatch paths. Service modules own lifecycle, status, telemetry, artifacts, Redis completion, Discord notifications, redaction, summaries, and validation.

## Buster

`skills/buster/buster-pipeline.ts` starts the Buster worker. It waits for OpenClaw gateway health, recovers pending work, starts a Redis consumer group, validates task payloads, runs deterministic suites or subagent tests, writes artifacts, and acknowledges only after completion or dead-letter handling.

## Shared contracts

`skills/common/pipeline/` contains shared contracts for Redis task/completion messages, lifecycle events, telemetry payloads, task transport, redaction, runtime paths, and logging. Prefer these helpers over ad hoc schemas when adding new behavior.

## Deployment and verification

The Helm chart under `charts/kubeclaw/` controls pod shape. `my-values/` provides production values and infrastructure manifests. `tests/verification/` keeps behavior and deployment surfaces from drifting.
