# kubeclaw.lint

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.lint
Evidence: skills/nova/plugins/lint/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 3 registered extensions through the canonical plugin runtime.

## When To Use It

Use this package when a pipeline graph needs one of its declared stage types.

## Boundaries

- The manifest declares extension identity and requested authority.
- Platform policy grants authority separately.
- Core validates lifecycle effects and owns canonical pipeline state.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `pre-check` | `kubeclaw.lint.pre-check` | `src/stage.ts` | `executePreCheck` |
| stage | `full` | `kubeclaw.lint.full` | `src/stage.ts` | `executeFull` |
| capability adapter | `executor` | `executor` | `src/adapter.ts` | `activate` |

## stage: pre-check

Public identifier: `kubeclaw.lint.pre-check`.

Required capabilities: `lint.execute`, `artifacts.write`, `artifacts.read`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/input.schema.json`

Result schema: `schemas/result.schema.json`

## stage: full

Public identifier: `kubeclaw.lint.full`.

Required capabilities: `lint.execute`, `artifacts.write`, `artifacts.read`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/input.schema.json`

Result schema: `schemas/result.schema.json`

## capability adapter: executor

Public identifier: `executor`.

Required capabilities: None.

Provided capabilities: `lint.execute`

Configuration schema: `schemas/adapter-config.schema.json`

Input schema: None.

Result schema: None.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/nova/plugins/lint
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/lint/plugin.json`
- Package root: `skills/nova/plugins/lint`
- Authored package guide: `skills/nova/plugins/lint/README.md`
