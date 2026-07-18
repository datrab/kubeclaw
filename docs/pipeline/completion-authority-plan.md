# Pipeline Completion Authority

Status: current
Audience: maintainers, pipeline developers

## Canonical Boundary

Phase and gate completion follows one path:

`validated evidence -> Completion -> lifecycle reducer -> canonical lifecycle event -> read models -> telemetry, artifacts, and operator sinks`

Runners collect evidence and submit completion records. They do not independently persist terminal lifecycle state or make Discord, Redis, session metadata, or local status snapshots authoritative.

## Completion Contract

The shared contract in `skills/common/pipeline/completion.ts` carries:

- target kind and identifier
- phase
- positive attempt
- terminal status
- evidence authority
- optional typed reason and summary
- optional runtime observations

Session keys and gateway labels are observations used for live-session control and correlation. They are not required to accept otherwise valid terminal evidence.

## Application

Nova applies module and gate completions through lifecycle appenders exported by `skills/nova/pipeline/services/status-store.ts`. The reducer validates legality and idempotency before appending canonical events and rebuilding read models.

Forge, Buster, validators, review gates, approvals, and future workers all converge at this boundary. Redis completions and output files remain evidence inputs; lifecycle state remains the scheduler authority.

## Agent Artifact Envelope

Agent-authored semantic results use the separate shared publisher in `skills/common/pipeline/agent-artifact.ts`. The pipeline owns immutable envelope fields such as run, module/gate, attempt, dispatch, schema, timestamp, and output path. Agents cannot override those fields.

This keeps nondeterministic agents responsible for conclusions and evidence while deterministic pipeline code owns identity and publication.

## Verification

```bash
node tests/verification/contracts/check-pipeline-completion-authority.mjs --source-root "$PWD"
node --test tests/skills/common/pipeline/agent-artifact.test.mjs
node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"
```
