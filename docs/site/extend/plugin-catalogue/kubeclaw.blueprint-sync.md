# kubeclaw.blueprint-sync

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.blueprint-sync
Evidence: skills/nova/plugins/blueprint-sync/plugin.json
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
| stage | `sync` | `kubeclaw.generate.blueprint-sync` | `src/stage.ts` | `execute` |

## stage: sync

Public identifier: `kubeclaw.generate.blueprint-sync`.

Required capabilities: `git.sync`, `git.commit`, `state.append`, `artifacts.write`

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
npm test --prefix skills/nova/plugins/blueprint-sync
```

Package tests found: 2.

## Source Evidence

- Manifest: `skills/nova/plugins/blueprint-sync/plugin.json`
- Package root: `skills/nova/plugins/blueprint-sync`
- Authored package guide: `skills/nova/plugins/blueprint-sync/README.md`
- Test: `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts`
- Test: `skills/nova/plugins/blueprint-sync/tests/package-boundary.test.mjs`
