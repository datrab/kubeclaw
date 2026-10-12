# kubeclaw.coverage-budget

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.coverage-budget
Evidence: skills/buster/plugins/coverage-budget/plugin.json
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
| test provider | `lcov` | `kubeclaw.coverage-budget@1` | `src/provider.js` | `provider` |

## test provider: lcov

Public identifier: `kubeclaw.coverage-budget@1`.

Required capabilities: None.

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

Inputs:

- `coverage-1`: artifact; required.
- `coverage-2`: artifact; optional.
- `coverage-3`: artifact; optional.
- `coverage-4`: artifact; optional.
- `coverage-5`: artifact; optional.
- `coverage-6`: artifact; optional.
- `coverage-7`: artifact; optional.
- `coverage-8`: artifact; optional.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/coverage-budget
```

Package tests found: 1.

## Source Evidence

- Manifest: `skills/buster/plugins/coverage-budget/plugin.json`
- Package root: `skills/buster/plugins/coverage-budget`
- Authored package guide: `skills/buster/plugins/coverage-budget/README.md`
- Test: `skills/buster/plugins/coverage-budget/tests/live-function.test.ts`
