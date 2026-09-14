# kubeclaw.preflight-contract

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.preflight-contract
Evidence: skills/nova/plugins/preflight-contract/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 2 registered extensions through the canonical plugin runtime.

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
| stage | `validate` | `kubeclaw.validate.preflight-contract` | `src/stage.ts` | `execute` |
| stage | `source` | `kubeclaw.validate.source-preflight` | `src/source-stage.ts` | `execute` |

## stage: validate

Public identifier: `kubeclaw.validate.preflight-contract`.

Required capabilities: `git.repository.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/input.schema.json`

Result schema: `schemas/result.schema.json`

## stage: source

Public identifier: `kubeclaw.validate.source-preflight`.

Required capabilities: `git.repository.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/source-input.schema.json`

Result schema: `schemas/result.schema.json`

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/nova/plugins/preflight-contract
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/preflight-contract/plugin.json`
- Package root: `skills/nova/plugins/preflight-contract`
- Authored package guide: `skills/nova/plugins/preflight-contract/README.md`
