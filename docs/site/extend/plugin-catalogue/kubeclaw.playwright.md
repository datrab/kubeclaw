# kubeclaw.playwright

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.playwright
Evidence: skills/buster/plugins/playwright/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 1 registered extension through the canonical plugin runtime.

## When To Use It

Use this package when a test plan needs one of its declared provider contracts.

## Boundaries

- The manifest declares extension identity and requested authority.
- Platform policy grants authority separately.
- Core validates lifecycle effects and owns canonical pipeline state.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `playwright` | `kubeclaw.playwright@1` | `src/provider.js` | `provider` |

## test provider: playwright

Public identifier: `kubeclaw.playwright@1`.

Required capabilities: `browser.playwright`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

Inputs:

- `deployment`: value; optional.
- `endpoint`: value; optional.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/playwright
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/buster/plugins/playwright/plugin.json`
- Package root: `skills/buster/plugins/playwright`
- Authored package guide: `skills/buster/plugins/playwright/README.md`
