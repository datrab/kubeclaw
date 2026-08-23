# kubeclaw.transport-publisher

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.transport-publisher
Evidence: skills/common/plugins/transport-publisher/plugin.json
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
| capability adapter | `publisher` | `publisher` | `src/adapter.ts` | `activate` |

## capability adapter: publisher

Public identifier: `publisher`.

Required capabilities: `network.http`, `secrets.read`

Provided capabilities: `transport.publish`

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
npm test --prefix skills/common/plugins/transport-publisher
```

Package tests found: 3.

## Source Evidence

- Manifest: `skills/common/plugins/transport-publisher/plugin.json`
- Package root: `skills/common/plugins/transport-publisher`
- Authored package guide: `skills/common/plugins/transport-publisher/README.md`
- Test: `skills/common/plugins/transport-publisher/tests/config-validation.test.mjs`
- Test: `skills/common/plugins/transport-publisher/tests/live-function.test.ts`
- Test: `skills/common/plugins/transport-publisher/tests/package-boundary.test.mjs`
