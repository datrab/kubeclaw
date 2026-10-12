# kubeclaw.junit-report

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.junit-report
Evidence: skills/buster/plugins/junit-report-adapter/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 1 registered extension through the canonical plugin runtime.

## When To Use It

Use this package when a test plan must normalize one of its declared report formats.

## Boundaries

- The manifest declares extension identity and requested authority.
- Platform policy grants authority separately.
- Core validates lifecycle effects and owns canonical pipeline state.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| report adapter | `junit` | `junit` | `src/adapter.js` | `adapt` |

## report adapter: junit

Public identifier: `junit`.

Required capabilities: None.

Provided capabilities: None.

Configuration schema: None.

Input schema: None.

Result schema: None.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/junit-report-adapter
```

Package tests found: 2.

## Source Evidence

- Manifest: `skills/buster/plugins/junit-report-adapter/plugin.json`
- Package root: `skills/buster/plugins/junit-report-adapter`
- Authored package guide: `skills/buster/plugins/junit-report-adapter/README.md`
- Test: `skills/buster/plugins/junit-report-adapter/tests/adapter.test.mjs`
- Test: `skills/buster/plugins/junit-report-adapter/tests/live-function.test.ts`
