# kubeclaw.pipeline-review

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.pipeline-review
Evidence: skills/nova/plugins/pipeline-review/plugin.json
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
| stage | `review` | `kubeclaw.report.pipeline-review` | `src/stage.ts` | `execute` |
| capability adapter | `evidence` | `evidence` | `src/evidence-adapter.ts` | `activate` |

## stage: review

Public identifier: `kubeclaw.report.pipeline-review`.

Required capabilities: `runtime.dispatch`, `artifacts.write`, `report.evidence.read`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/input.schema.json`

Result schema: `schemas/result.schema.json`

## capability adapter: evidence

Public identifier: `evidence`.

Required capabilities: `artifacts.read`

Provided capabilities: `report.evidence.read`

Configuration schema: `schemas/evidence-config.schema.json`

Input schema: None.

Result schema: None.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/nova/plugins/pipeline-review
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/pipeline-review/plugin.json`
- Package root: `skills/nova/plugins/pipeline-review`
- Authored package guide: `skills/nova/plugins/pipeline-review/README.md`
