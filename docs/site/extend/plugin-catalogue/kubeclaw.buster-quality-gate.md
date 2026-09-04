# kubeclaw.buster-quality-gate

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.buster-quality-gate
Evidence: skills/nova/plugins/buster-quality-gate/plugin.json
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
| stage | `quality` | `kubeclaw.test.quality-evaluation` | `src/stage.ts` | `execute` |

## stage: quality

Public identifier: `kubeclaw.test.quality-evaluation`.

Required capabilities: `test.plan.execute`, `runtime.dispatch`, `artifacts.write`

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
npm test --prefix skills/nova/plugins/buster-quality-gate
```

Package tests found: 4.

## Source Evidence

- Manifest: `skills/nova/plugins/buster-quality-gate/plugin.json`
- Package root: `skills/nova/plugins/buster-quality-gate`
- Authored package guide: `skills/nova/plugins/buster-quality-gate/README.md`
- Test: `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts`
- Test: `skills/nova/plugins/buster-quality-gate/tests/package-boundary.test.mjs`
- Test: `skills/nova/plugins/buster-quality-gate/tests/protocol.test.ts`
- Test: `skills/nova/plugins/buster-quality-gate/tests/suite-first.test.ts`
