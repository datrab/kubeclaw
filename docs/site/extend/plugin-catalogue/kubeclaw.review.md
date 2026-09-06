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

Package tests found: 54.

## Source Evidence

- Manifest: `skills/nova/plugins/review/plugin.json`
- Package root: `skills/nova/plugins/review`
- Authored package guide: `skills/nova/plugins/review/README.md`
- Test: `skills/nova/plugins/review/tests/echo-review-output.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/echo-review-verification.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/fixtures/review-governor.mjs`
- Test: `skills/nova/plugins/review/tests/fixtures/review-policy.mjs`
- Test: `skills/nova/plugins/review/tests/fixtures/scalable-review-quality-baseline.json`
- Test: `skills/nova/plugins/review/tests/fixtures/scalable-review-quality-corpus.json`
- Test: `skills/nova/plugins/review/tests/live-function.test.ts`
- Test: `skills/nova/plugins/review/tests/package-boundary.test.mjs`
- Test: `skills/nova/plugins/review/tests/protocol.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/repository-audit-stage.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/repository-revalidation.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/repository-review-profile.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-bundle-contract.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-bundle-snapshot.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-cluster-contract.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-cluster-identity.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-content-cache.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-context-production.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-context-selection.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-contract-parity.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-decision-matrix.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-evaluation-metadata.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-evidence-authority.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-fact-extractors.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-governor.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-graph.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-invariants.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-map-artifacts.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-policy-contract.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-policy-profiles.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-policy-resolver.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-prompt-budget.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-proposal-preflight.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-quality-corpus.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-reducer.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-report-builder.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-report-contract.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-scale-slicing.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-slicing.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-snapshot-inventory.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-stage-input.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-stage-verification.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-verdict-policy.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-verification-reconciliation.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/review-verified-findings.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/scalable-review-compiler.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/scalable-review-jobs.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/scalable-review-topology.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/scalable-review-verification.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/simplification-contract.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/simplification-fact-producer.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/simplification-manifest.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/simplification-miner.unit.test.mjs`
- Test: `skills/nova/plugins/review/tests/stage.unit.test.mjs`
