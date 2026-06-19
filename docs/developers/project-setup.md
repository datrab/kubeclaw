# Project Setup Skill

Status: current
Audience: developer, maintainer

## Purpose

Use the `project-setup` skill when creating the `.swarm` project contract that Nova will execute. The skill is the hands-on authoring guide for a new project: branch setup, `progress.json`, module control files, review instructions, Buster tests, and final-preview test config.

This page documents where the skill lives, what runtime code owns the behavior it describes, and which checks keep it from drifting.

## Skill Location

| Surface | Path | Role |
| --- | --- | --- |
| Skill entrypoint | `skills/nova/project_setup/SKILL.md` | Step-by-step project setup instructions |
| Progress reference | `skills/nova/project_setup/progress-json.md` | Field-level project config reference |
| Module file guide | `skills/nova/project_setup/module-files.md` | `FORGE.md`, `BUSTER.md`, `test-spec.json`, and visual baseline guidance |
| Progress scaffold tool | `skills/nova/project_setup/tools/progress-scaffold.ts` | Generates `progress.scaffold.json`, validates gaps, and writes `progress.json` |
| Pipeline skill | `skills/nova/pipeline/SKILL.md` | Runtime CLI commands after setup exists |

Trigger the skill for work like creating a project from scratch, preparing an architecture branch, writing module files, configuring `progress.json`, or adding Buster/review gates.

## Runtime Authority

The setup skill is documentation, not a separate implementation. These source files own the behavior it describes:

| Behavior | Source owner | What setup must match |
| --- | --- | --- |
| Project config path | `skills/nova/pipeline/core/config.ts` | `Projects/<project>/src/.swarm/progress.json` |
| Platform/project config split | `skills/nova/pipeline/core/config.ts`; `charts/kubeclaw/files/config/swarm.config.json` | platform fields in `swarm.config.json`; workflow fields in `progress.json` |
| Progress scaffold generation | `skills/nova/project_setup/tools/progress-scaffold.ts` | module/gate files first, generated scaffold gaps, strict/form-check diagnostics, `progress.json` apply |
| Model and thinking policy | `skills/nova/pipeline/core/policy.ts` | `progress.defaults.models`, per-module/gate overrides, platform `fallback_model` |
| Execution order | `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` | module IDs plus `gate:<id>` and registered validator stages |
| Blueprint release | `skills/nova/pipeline/services/blueprint.ts` | architecture branch `.swarm/modules/<dir>` files released per module |
| Buster task contract | `skills/buster/pipeline/services/task-validation.ts` | required task identity, `session.runtime`, suites, and `test_config` shape |
| Deterministic suites | `skills/buster/pipeline/suites/*.ts`; `docs/reference/test-suites.md` | suite names and suite-specific `test_config` fields |
| Final preview k8s suite | `skills/buster/pipeline/suites/k8s.ts`; `docs/operators/final-preview-tailscale.md` | `test_config.k8s`, namespace lease, Tailscale Ingress preview, credential allowlist |
| Visual regression baseline authority | `skills/buster/pipeline/suites/visual-reg.ts`; `skills/prism/prism-conventions.md` | module-scoped baselines under `.swarm/modules/<module-dir>/baselines/` |

## Setup Output

A complete project setup commits the `.swarm` contract to the architecture branch:

```text
Projects/<project>/src/.swarm/
├── progress.scaffold.json
├── progress.json
├── echo-review/
│   └── <GATE>-INSTRUCTIONS.md
├── buster-test/
│   └── <GATE>.md
└── modules/<module-dir>/
    ├── FORGE.md
    ├── BUSTER.md
    ├── test-spec.json
    └── baselines/
```

Not every module needs every file. Forge-only modules need `FORGE.md`; modules with a Buster stage need `BUSTER.md`; `api` suites need `test-spec.json`; `visual-reg` suites need reviewed baseline metadata and PNGs.

Generate and apply the scaffold with:

```bash
npm run progress:scaffold -- --project <project>
npm run progress:scaffold -- --project <project> --apply
```

Validate the TypeScript scaffold tool after changing it:

```bash
npm run progress:scaffold:typecheck
```

## Current Contract

`progress.json` must provide:

- `project`
- `execution_order`
- `modules`

`gates` is required when `execution_order` references `gate:<id>`. Role-specific model defaults belong under `defaults.models`, not top-level `models` and not `swarm.config.json`. ACP monitor timing belongs in platform `swarm.config.json`, not in project config.

The runtime accepts built-in gate types through the startup plugin registry. Today the project setup docs cover:

- `review` gates
- `buster` gates
- `approval` gates
- optional architecture validation
- optional pipeline review
- optional case study generation
- optional Redis telemetry enablement

## Verification

Use these checks after changing the skill or setup docs:

```bash
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs
npm run docs:check
```

Use these checks after changing the runtime behavior the skill describes:

```bash
node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline
```

## Drift Guards

Current behavior verification already checks that:

- ACP monitor config remains platform-owned, not `progress.json` owned
- project setup docs do not mention removed visual-reg `baseline_dir`
- screenshot tooling uses `screenshot.ts --generate-baselines`
- telemetry setup documents canonical run-scoped stream ownership
- removed telemetry stream-key config stays out of project setup docs

When adding a new project-level field or suite option, update the skill, the active docs, and the smallest verifier that owns the behavior. If the field belongs to platform config instead, keep it out of `progress.json` examples and document it in `docs/reference/swarm-config.md`.

## Related Docs

- [Pipeline configuration](../pipeline/configuration.md)
- [Progress JSON interpretation](../pipeline/progress-json.md)
- [Progress JSON reference](../reference/progress-json.md)
- [Test suites](../reference/test-suites.md)
- [Final preview Tailscale](../operators/final-preview-tailscale.md)
