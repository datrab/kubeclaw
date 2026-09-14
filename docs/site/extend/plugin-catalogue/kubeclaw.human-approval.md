# kubeclaw.human-approval

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.human-approval
Evidence: skills/nova/plugins/human-approval/plugin.json
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
| stage | `approval` | `kubeclaw.decision.human-approval` | `src/stage.ts` | `execute` |
| stage | `architecture-approval` | `kubeclaw.decision.architecture-approval` | `src/architecture-approval.ts` | `execute` |

## stage: approval

Public identifier: `kubeclaw.decision.human-approval`.

Required capabilities: `operator.request`, `signal.wait`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/input.schema.json`

Result schema: `schemas/result.schema.json`

## stage: architecture-approval

Public identifier: `kubeclaw.decision.architecture-approval`.

Required capabilities: `artifacts.read`, `operator.request`, `signal.wait`, `git.repository.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/architecture-input.schema.json`

Result schema: `schemas/result.schema.json`

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/nova/plugins/human-approval
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/human-approval/plugin.json`
- Package root: `skills/nova/plugins/human-approval`
- Authored package guide: `skills/nova/plugins/human-approval/README.md`
