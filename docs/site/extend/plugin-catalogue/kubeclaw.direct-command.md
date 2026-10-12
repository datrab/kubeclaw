# kubeclaw.direct-command

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.direct-command
Evidence: skills/buster/plugins/direct-command/plugin.json
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
| test provider | `command` | `kubeclaw.direct-command@1` | `src/provider.js` | `provider` |

## test provider: command

Public identifier: `kubeclaw.direct-command@1`.

Required capabilities: `command.execute`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

Outputs:

- `coverage-1`: artifact; optional.
- `coverage-2`: artifact; optional.
- `coverage-3`: artifact; optional.
- `coverage-4`: artifact; optional.
- `coverage-5`: artifact; optional.
- `coverage-6`: artifact; optional.
- `coverage-7`: artifact; optional.
- `coverage-8`: artifact; optional.
- `artifact-1`: artifact; optional.
- `artifact-2`: artifact; optional.
- `artifact-3`: artifact; optional.
- `artifact-4`: artifact; optional.
- `artifact-5`: artifact; optional.
- `artifact-6`: artifact; optional.
- `artifact-7`: artifact; optional.
- `artifact-8`: artifact; optional.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/direct-command
```

Package tests found: 1.

## Source Evidence

- Manifest: `skills/buster/plugins/direct-command/plugin.json`
- Package root: `skills/buster/plugins/direct-command`
- Authored package guide: `skills/buster/plugins/direct-command/README.md`
- Test: `skills/buster/plugins/direct-command/tests/live-function.test.ts`
