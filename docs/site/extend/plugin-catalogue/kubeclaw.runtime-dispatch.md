# kubeclaw.runtime-dispatch

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.runtime-dispatch
Evidence: skills/common/plugins/runtime-dispatch/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 2 registered extensions through the canonical plugin runtime.

## When To Use It

Use this package when a granted capability needs one of its declared adapters.

## Boundaries

- The manifest declares extension identity and requested authority.
- Platform policy grants authority separately.
- Core validates lifecycle effects and owns canonical pipeline state.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `runtime` | `runtime` | `src/adapter.ts` | `activate` |
| capability adapter | `openclaw` | `openclaw` | `src/openclaw-adapter.ts` | `activate` |

## capability adapter: runtime

Public identifier: `runtime`.

Required capabilities: `network.http`, `secrets.read`

Provided capabilities: `runtime.dispatch`

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

## capability adapter: openclaw

Public identifier: `openclaw`.

Required capabilities: `git.repository.read`, `network.http`, `secrets.read`

Provided capabilities: `runtime.dispatch`

Configuration schema: `schemas/openclaw-config.schema.json`

Input schema: None.

Result schema: None.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/common/plugins/runtime-dispatch
```

Package tests found: 2.

## Source Evidence

- Manifest: `skills/common/plugins/runtime-dispatch/plugin.json`
- Package root: `skills/common/plugins/runtime-dispatch`
- Authored package guide: `skills/common/plugins/runtime-dispatch/README.md`
- Test: `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts`
- Test: `skills/common/plugins/runtime-dispatch/tests/package-boundary.test.mjs`
