# kubeclaw.tailscale-exposure

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.tailscale-exposure
Evidence: skills/buster/plugins/tailscale-exposure/plugin.json
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
| test provider | `exposure` | `kubeclaw.tailscale-exposure@1` | `src/provider.js` | `provider` |

## test provider: exposure

Public identifier: `kubeclaw.tailscale-exposure@1`.

Required capabilities: `kubernetes.exposure`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: None.

Result schema: None.

Inputs:

- `deployment`: value; required.

Outputs:

- `exposure`: value; required.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/tailscale-exposure
```

Package tests found: 1.

## Source Evidence

- Manifest: `skills/buster/plugins/tailscale-exposure/plugin.json`
- Package root: `skills/buster/plugins/tailscale-exposure`
- Authored package guide: `skills/buster/plugins/tailscale-exposure/README.md`
- Test: `skills/buster/plugins/tailscale-exposure/tests/live-function.test.ts`
