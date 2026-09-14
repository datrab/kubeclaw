# kubeclaw.redis-transport

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.redis-transport
Evidence: skills/common/plugins/redis-transport/plugin.json
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
| capability adapter | `publisher` | `publisher` | `src/adapter.ts` | `activatePublisher` |
| capability adapter | `telemetry` | `telemetry` | `src/adapter.ts` | `activateTelemetry` |

## capability adapter: publisher

Public identifier: `publisher`.

Required capabilities: `secrets.read`

Provided capabilities: `transport.publish`

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

## capability adapter: telemetry

Public identifier: `telemetry`.

Required capabilities: `secrets.read`

Provided capabilities: `telemetry.emit`

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
npm test --prefix skills/common/plugins/redis-transport
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/common/plugins/redis-transport/plugin.json`
- Package root: `skills/common/plugins/redis-transport`
- Authored package guide: `skills/common/plugins/redis-transport/README.md`
