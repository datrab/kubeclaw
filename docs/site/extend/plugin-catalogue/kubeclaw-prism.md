# kubeclaw-prism

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw-prism
Evidence: skills/prism/openclaw-plugin/openclaw.plugin.json
Applies to: openclaw-plugin; package 0.1.0
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
| OpenClaw extension | `kubeclaw-prism` | `kubeclaw-prism` | `./index.mjs` | Runtime registration |

## OpenClaw extension: kubeclaw-prism

Public identifier: `kubeclaw-prism`.

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
npm run verify:plugin-system-v2
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/prism/openclaw-plugin/openclaw.plugin.json`
- Package root: `skills/prism/openclaw-plugin`
- Authored package guide: `skills/prism/openclaw-plugin/README.md`
