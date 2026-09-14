# kubeclaw.repository-adapter

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.repository-adapter
Evidence: skills/nova/plugins/repository-adapter/plugin.json
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
| capability adapter | `repository` | `repository` | `src/adapter.ts` | `activate` |

## capability adapter: repository

Public identifier: `repository`.

Required capabilities: None.

Provided capabilities: `git.repository.read`

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
npm test --prefix skills/nova/plugins/repository-adapter
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/repository-adapter/plugin.json`
- Package root: `skills/nova/plugins/repository-adapter`
- Authored package guide: `skills/nova/plugins/repository-adapter/README.md`
