# kubeclaw.telemetry-observer

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.telemetry-observer
Evidence: skills/common/plugins/telemetry-observer/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 1 registered extension through the canonical plugin runtime.

## When To Use It

Use this package when an immutable lifecycle record must reach one of its declared observer targets.

## Boundaries

- The manifest declares extension identity and requested authority.
- Platform policy grants authority separately.
- Core validates lifecycle effects and owns canonical pipeline state.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| observer | `telemetry` | `telemetry` | `src/observer.ts` | `observe` |

## observer: telemetry

Public identifier: `telemetry`.

Required capabilities: `telemetry.emit`

Provided capabilities: None.

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
npm test --prefix skills/common/plugins/telemetry-observer
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/common/plugins/telemetry-observer/plugin.json`
- Package root: `skills/common/plugins/telemetry-observer`
- Authored package guide: `skills/common/plugins/telemetry-observer/README.md`
