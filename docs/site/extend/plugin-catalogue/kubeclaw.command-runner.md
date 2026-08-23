# kubeclaw.command-runner

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.command-runner
Evidence: skills/common/plugins/command-runner/plugin.json
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
| capability adapter | `command` | `command` | `src/adapter.ts` | `activate` |

## capability adapter: command

Public identifier: `command`.

Required capabilities: None.

Provided capabilities: `command.execute`

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
npm test --prefix skills/common/plugins/command-runner
```

Package tests found: 2.

## Source Evidence

- Manifest: `skills/common/plugins/command-runner/plugin.json`
- Package root: `skills/common/plugins/command-runner`
- Authored package guide: `skills/common/plugins/command-runner/README.md`
- Test: `skills/common/plugins/command-runner/tests/live-function.test.ts`
- Test: `skills/common/plugins/command-runner/tests/package-boundary.test.mjs`
