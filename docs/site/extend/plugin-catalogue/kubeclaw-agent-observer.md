# kubeclaw-agent-observer

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw-agent-observer
Evidence: skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json
Applies to: openclaw-plugin; package 0.0.0
Last verified: generated during publication

## Purpose

This package provides 1 registered extension through the canonical plugin runtime.

## When To Use It

Use this package when OpenClaw agent hooks must enter the KubeClaw observability boundary.

## Boundaries

- OpenClaw owns hook registration and plugin activation.
- The plugin writes only the configured observability streams.
- The plugin does not own pipeline scheduling or lifecycle state.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| OpenClaw extension | `kubeclaw-agent-observer` | `kubeclaw-agent-observer` | `./src/index.ts` | Runtime registration |

## OpenClaw extension: kubeclaw-agent-observer

Public identifier: `kubeclaw-agent-observer`.

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
npm test --prefix skills/common/plugins/openclaw-agent-observer
```

Package tests found: 3.

## Source Evidence

- Manifest: `skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json`
- Package root: `skills/common/plugins/openclaw-agent-observer`
- Authored package guide: `skills/common/plugins/openclaw-agent-observer/README.md`
- Test: `skills/common/plugins/openclaw-agent-observer/tests/config.test.mjs`
- Test: `skills/common/plugins/openclaw-agent-observer/tests/live-function.test.ts`
- Test: `skills/common/plugins/openclaw-agent-observer/tests/package-boundary.test.mjs`
