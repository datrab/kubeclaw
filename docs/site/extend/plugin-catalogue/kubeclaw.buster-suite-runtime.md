# kubeclaw.buster-suite-runtime

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.buster-suite-runtime
Evidence: skills/buster/plugins/buster-suite-runtime/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 1 registered extension through the canonical plugin runtime.

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
| capability adapter | `suite` | `suite` | `src/adapter.ts` | `activate` |

## capability adapter: suite

Public identifier: `suite`.

Required capabilities: `network.http`, `secrets.read`

Provided capabilities: `test.suite.execute`

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/buster-suite-runtime
```

Package tests found: 4.

## Source Evidence

- Manifest: `skills/buster/plugins/buster-suite-runtime/plugin.json`
- Package root: `skills/buster/plugins/buster-suite-runtime`
- Authored package guide: `skills/buster/plugins/buster-suite-runtime/README.md`
- Test: `skills/buster/plugins/buster-suite-runtime/tests/live-function.test.ts`
- Test: `skills/buster/plugins/buster-suite-runtime/tests/package-boundary.test.mjs`
- Test: `skills/buster/plugins/buster-suite-runtime/tests/protocol.test.ts`
- Test: `skills/buster/plugins/buster-suite-runtime/tests/security-boundaries.test.ts`
