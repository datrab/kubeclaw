# kubeclaw.review

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.review
Evidence: skills/nova/plugins/review/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 3 registered extensions through the canonical plugin runtime.

## When To Use It

Use this package when a pipeline graph needs one of its declared stage types.

## Boundaries

- The manifest declares extension identity and requested authority.
- Platform policy grants authority separately.
- Core validates lifecycle effects and owns canonical pipeline state.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `review` | `kubeclaw.decision.review` | `src/stage.ts` | `execute` |
| stage | `repository-audit` | `kubeclaw.audit.repository-review` | `src/repository-audit-stage.ts` | `executeRepositoryAudit` |
| stage | `repository-revalidation` | `kubeclaw.audit.repository-review-revalidation` | `src/repository-revalidation-stage.ts` | `executeRepositoryRevalidation` |

## stage: review

Public identifier: `kubeclaw.decision.review`.

Required capabilities: `runtime.dispatch`, `git.repository.read`, `artifacts.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/config.schema.json`

Input schema: `schemas/input.schema.json`

Result schema: `schemas/result.schema.json`

## stage: repository-audit

Public identifier: `kubeclaw.audit.repository-review`.

Required capabilities: `runtime.dispatch`, `git.repository.read`, `artifacts.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/repository-audit-config.schema.json`

Input schema: `schemas/repository-audit-input.schema.json`

Result schema: `schemas/result.schema.json`

## stage: repository-revalidation

Public identifier: `kubeclaw.audit.repository-review-revalidation`.

Required capabilities: `runtime.dispatch`, `git.repository.read`, `artifacts.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: `schemas/repository-audit-config.schema.json`

Input schema: `schemas/repository-revalidation-input.schema.json`

Result schema: `schemas/result.schema.json`

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/nova/plugins/review
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/nova/plugins/review/plugin.json`
- Package root: `skills/nova/plugins/review`
- Authored package guide: `skills/nova/plugins/review/README.md`
