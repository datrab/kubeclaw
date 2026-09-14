# kubeclaw.architecture-validator

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.architecture-validator
Evidence: skills/nova/plugins/architecture-validator/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 1 registered extension through the canonical plugin runtime.

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
| stage | `architecture` | `kubeclaw.validate.architecture` | `src/stage.ts` | `execute` |

## stage: architecture

Public identifier: `kubeclaw.validate.architecture`.

Required capabilities: `runtime.dispatch`, `artifacts.write`, `git.repository.read`, `artifacts.read`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/input.schema.json`

Result schema: `schemas/result.schema.json`

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/nova/plugins/architecture-validator
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/architecture-validator/plugin.json`
- Package root: `skills/nova/plugins/architecture-validator`
- Authored package guide: `skills/nova/plugins/architecture-validator/README.md`
