# kubeclaw.size-budget

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.size-budget
Evidence: skills/buster/plugins/size-budget/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 1 registered extension through the canonical plugin runtime.

## When To Use It

Use this package when a test plan needs one of its declared provider contracts.

## Boundaries

- The manifest declares extension identity and requested authority.
- Platform policy grants authority separately.
- Core validates lifecycle effects and owns canonical pipeline state.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `artifact` | `kubeclaw.size-budget@1` | `src/provider.js` | `provider` |

## test provider: artifact

Public identifier: `kubeclaw.size-budget@1`.

Required capabilities: None.

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

Inputs:

- `build-output`: artifact; required.
- `baseline`: artifact; optional.

Outputs:

- `baseline`: artifact; required.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/size-budget
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/buster/plugins/size-budget/plugin.json`
- Package root: `skills/buster/plugins/size-budget`
- Authored package guide: `skills/buster/plugins/size-budget/README.md`
