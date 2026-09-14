# kubeclaw.demo-handoff

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.demo-handoff
Evidence: skills/nova/plugins/demo-handoff/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 4 registered extensions through the canonical plugin runtime.

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
| stage | `candidate` | `kubeclaw.demo.candidate` | `src/candidate.ts` | `execute` |
| stage | `delivery` | `kubeclaw.demo.delivery` | `src/delivery.ts` | `execute` |
| stage | `ready` | `kubeclaw.demo.ready` | `src/ready.ts` | `execute` |
| capability adapter | `handoff` | `handoff` | `src/adapter.ts` | `activate` |

## stage: candidate

Public identifier: `kubeclaw.demo.candidate`.

Required capabilities: `test.plan.evidence`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/empty.schema.json`

Input schema: `schemas/candidate.schema.json`

Result schema: `schemas/result.schema.json`

## stage: delivery

Public identifier: `kubeclaw.demo.delivery`.

Required capabilities: `demo.handoff`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/empty.schema.json`

Input schema: `schemas/delivery.schema.json`

Result schema: `schemas/result.schema.json`

## stage: ready

Public identifier: `kubeclaw.demo.ready`.

Required capabilities: `demo.handoff`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/empty.schema.json`

Input schema: `schemas/ready.schema.json`

Result schema: `schemas/result.schema.json`

## capability adapter: handoff

Public identifier: `handoff`.

Required capabilities: `artifacts.read`, `test.plan.evidence`, `operator.request`, `operator.receipt`

Provided capabilities: `demo.handoff`

Configuration schema: `schemas/adapter.schema.json`

Input schema: None.

Result schema: None.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/nova/plugins/demo-handoff
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/demo-handoff/plugin.json`
- Package root: `skills/nova/plugins/demo-handoff`
- Authored package guide: `skills/nova/plugins/demo-handoff/README.md`
