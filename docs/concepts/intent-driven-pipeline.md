# Intent-Driven Pipeline

Status: planned direction
Audience: maintainers, developers

## Overview

The current pipeline is centered on application delivery work. The roadmap includes applying the same intent-driven structure to other domains, including infrastructure-oriented workflows.

## Current Behavior Boundary

Current docs should describe the implemented Nova/Buster pipeline. Broader intent-driven use cases remain future direction until source, tests, config, and operator docs prove them.

## Future Direction

Potential future use cases include:

- infrastructure change planning and verification
- security and pentest workflows
- design-aware delivery flows
- parallel intent execution with multiple agents or pipelines

## Related Pages

- `../ROADMAP.md`
- `../future-implementation-ideas.md`
- `pipeline-model.md`

## Implemented Loop

The current implemented loop is source-backed by `skills/nova/pipeline/cli.ts`, `skills/nova/pipeline/core/config.ts`, `skills/nova/pipeline/runners/pipeline-runner*.ts`, and `skills/buster/pipeline/**`.

| Intent concept | Current implementation | Evidence |
| --- | --- | --- |
| Declare work | `.swarm/progress.json` modules, gates, execution order, defaults, and test config | `loadConfig` requires `CURRENT_PROJECT` or `--project`, resolves `REPO_ROOT`, and reads `Projects/<project>/src/.swarm/progress.json` |
| Resolve execution | Nova runner projects module/gate state from lifecycle read models and control-result contracts | `canonical-events.jsonl`, `read-models.json`, `latest.json`, module and gate artifacts |
| Verify intent | Buster receives typed Redis tasks for module or gate testing, validates identity/path/capabilities, then emits completion | `swarm:<agent>:tasks`, completion stream, dead-letter stream, Buster output JSON |
| Decide terminal outcome | Pipeline step results map outcomes to terminal decisions such as `succeeded`, `failed`, `blocked`, `timed_out`, or `rate_limited` | `skills/nova/pipeline/services/contracts/pipeline-step-result.ts` and `terminal-decision.ts` |

## Failure Signals And Checks

- Missing or unsafe project/config paths: run `node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs tests/skills/nova/pipeline/core/path-segments.test.mjs`.
- Lifecycle drift or illegal status mutation: run `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"`.
- Buster task identity, completion, or dead-letter issues: run `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"`.
- Broad pipeline regression: run `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline`.

Do not document future intent categories as current runtime behavior until they have source owners, config, commands, artifacts, failure handling, and verification.
