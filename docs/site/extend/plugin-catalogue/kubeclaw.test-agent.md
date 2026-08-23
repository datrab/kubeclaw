# kubeclaw.test-agent

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.test-agent
Evidence: skills/buster/plugins/test-agent/plugin.json
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
| stage | `test` | `kubeclaw.test.execution` | `src/stage.ts` | `execute` |

## stage: test

Public identifier: `kubeclaw.test.execution`.

Required capabilities: `command.execute`, `test.suite.execute`, `runtime.dispatch`, `artifacts.write`

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
npm test --prefix skills/buster/plugins/test-agent
```

Package tests found: 4.

## Source Evidence

- Manifest: `skills/buster/plugins/test-agent/plugin.json`
- Package root: `skills/buster/plugins/test-agent`
- Authored package guide: `skills/buster/plugins/test-agent/README.md`
- Test: `skills/buster/plugins/test-agent/tests/live-function.test.ts`
- Test: `skills/buster/plugins/test-agent/tests/package-boundary.test.mjs`
- Test: `skills/buster/plugins/test-agent/tests/protocol.test.ts`
- Test: `skills/buster/plugins/test-agent/tests/suite-first.test.ts`
