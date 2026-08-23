# kubeclaw.project-summary

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.project-summary
Evidence: skills/nova/plugins/project-summary/plugin.json
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
| stage | `summary` | `kubeclaw.report.project-summary` | `src/stage.ts` | `execute` |

## stage: summary

Public identifier: `kubeclaw.report.project-summary`.

Required capabilities: `artifacts.write`

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
npm test --prefix skills/nova/plugins/project-summary
```

Package tests found: 4.

## Source Evidence

- Manifest: `skills/nova/plugins/project-summary/plugin.json`
- Package root: `skills/nova/plugins/project-summary`
- Authored package guide: `skills/nova/plugins/project-summary/README.md`
- Test: `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- Test: `skills/nova/plugins/project-summary/tests/package-boundary.test.mjs`
- Test: `skills/nova/plugins/project-summary/tests/parity.test.ts`
- Test: `skills/nova/plugins/project-summary/tests/summary.test.mjs`
