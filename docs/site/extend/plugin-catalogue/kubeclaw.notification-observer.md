# kubeclaw.notification-observer

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.notification-observer
Evidence: skills/common/plugins/notification-observer/plugin.json
Applies to: pipeline-plugin-v2; package 1.1.0
Last verified: generated during publication

## Purpose

This package provides 3 registered extensions through the canonical plugin runtime.

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
| observer | `notifications` | `notifications` | `src/observer.ts` | `observe` |
| observer | `preview-delivery` | `preview-delivery` | `src/observer.ts` | `deliverPreview` |
| observer | `audit` | `audit` | `src/observer.ts` | `recordAudit` |

## observer: notifications

Public identifier: `notifications`.

Required capabilities: `operator.request`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

## observer: preview-delivery

Public identifier: `preview-delivery`.

Required capabilities: `operator.request`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

## observer: audit

Public identifier: `audit`.

Required capabilities: `artifacts.write`

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
npm test --prefix skills/common/plugins/notification-observer
```

Package tests found: 4.

## Source Evidence

- Manifest: `skills/common/plugins/notification-observer/plugin.json`
- Package root: `skills/common/plugins/notification-observer`
- Authored package guide: `skills/common/plugins/notification-observer/README.md`
- Test: `skills/common/plugins/notification-observer/tests/live-function.test.ts`
- Test: `skills/common/plugins/notification-observer/tests/observer.unit.test.mjs`
- Test: `skills/common/plugins/notification-observer/tests/package-boundary.test.mjs`
- Test: `skills/common/plugins/notification-observer/tests/parity.test.ts`
