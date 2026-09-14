# kubeclaw.remote-test-gate

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.remote-test-gate
Evidence: skills/nova/plugins/remote-test-gate/plugin.json
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
| capability adapter | `plan` | `plan` | `src/adapter.ts` | `activate` |
| capability adapter | `evidence` | `evidence` | `src/evidence-adapter.ts` | `activate` |

## capability adapter: plan

Public identifier: `plan`.

Required capabilities: `secrets.read`

Provided capabilities: `test.plan.execute`

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

## capability adapter: evidence

Public identifier: `evidence`.

Required capabilities: `artifacts.read`

Provided capabilities: `test.plan.evidence`

Configuration schema: `schemas/evidence-config.schema.json`

Input schema: None.

Result schema: None.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/nova/plugins/remote-test-gate
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/remote-test-gate/plugin.json`
- Package root: `skills/nova/plugins/remote-test-gate`
- Authored package guide: `skills/nova/plugins/remote-test-gate/README.md`
