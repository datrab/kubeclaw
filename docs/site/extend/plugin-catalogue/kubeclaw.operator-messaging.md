# kubeclaw.operator-messaging

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.operator-messaging
Evidence: skills/common/plugins/operator-messaging/plugin.json
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
| capability adapter | `operator` | `operator` | `src/adapter.ts` | `activate` |

## capability adapter: operator

Public identifier: `operator`.

Required capabilities: `network.http`, `secrets.read`

Provided capabilities: `operator.request`, `operator.receipt`

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
npm test --prefix skills/common/plugins/operator-messaging
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/common/plugins/operator-messaging/plugin.json`
- Package root: `skills/common/plugins/operator-messaging`
- Authored package guide: `skills/common/plugins/operator-messaging/README.md`
