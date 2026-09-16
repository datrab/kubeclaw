# kubeclaw.review

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/review/plugin.json; skills/nova/plugins/review/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Run review, repository audit, and repository revalidation stages.

## When To Use It

Use it when the graph needs the full installed review lifecycle.

## When Not To Use It

Do not use it for the narrower pipeline-review contract.

## Most Important Limit

Each stage has a distinct type and must appear at the correct graph point.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.review@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/review/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
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

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/config.schema.json)

Configuration fields:

- `reviewSemanticEncoding` (schema-defined; optional)
- `reportArtifactEncoding` (schema-defined; optional)
- `agent` (string; required)
- `profile` (schema-defined; optional; default `"gate"`)
- `policy` (object; optional)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `review` |
| `type` | `kubeclaw.decision.review` |
| `module` | `src/stage.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["runtime.dispatch","git.repository.read","artifacts.read","artifacts.write"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## stage: repository-audit

Public identifier: `kubeclaw.audit.repository-review`.

Required capabilities: `runtime.dispatch`, `git.repository.read`, `artifacts.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/repository-audit-config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/repository-audit-config.schema.json)

Configuration fields:

- `agent` (string; required)
- `reviewerModel` (string; required)
- `reviewerRuntime` (schema-defined; optional; default `"subagent"`)
- `reviewerAgentId` (string; optional; default `"codex"`)
- `reviewerThinking` (string; optional; default `"high"`)
- `profile` (schema-defined; optional; default `"audit"`)
- `policy` (object; optional)

Input schema: [schemas/repository-audit-input.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/repository-audit-input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `repository-audit` |
| `type` | `kubeclaw.audit.repository-review` |
| `module` | `src/repository-audit-stage.ts` |
| `export` | `executeRepositoryAudit` |
| `requiredCapabilities` | `["runtime.dispatch","git.repository.read","artifacts.read","artifacts.write"]` |
| `configSchema` | `schemas/repository-audit-config.schema.json` |
| `inputSchema` | `schemas/repository-audit-input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## stage: repository-revalidation

Public identifier: `kubeclaw.audit.repository-review-revalidation`.

Required capabilities: `runtime.dispatch`, `git.repository.read`, `artifacts.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/repository-audit-config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/repository-audit-config.schema.json)

Configuration fields:

- `agent` (string; required)
- `reviewerModel` (string; required)
- `reviewerRuntime` (schema-defined; optional; default `"subagent"`)
- `reviewerAgentId` (string; optional; default `"codex"`)
- `reviewerThinking` (string; optional; default `"high"`)
- `profile` (schema-defined; optional; default `"audit"`)
- `policy` (object; optional)

Input schema: [schemas/repository-revalidation-input.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/repository-revalidation-input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `repository-revalidation` |
| `type` | `kubeclaw.audit.repository-review-revalidation` |
| `module` | `src/repository-revalidation-stage.ts` |
| `export` | `executeRepositoryRevalidation` |
| `requiredCapabilities` | `["runtime.dispatch","git.repository.read","artifacts.read","artifacts.write"]` |
| `configSchema` | `schemas/repository-audit-config.schema.json` |
| `inputSchema` | `schemas/repository-revalidation-input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/review
```

Package tests found: 57.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/nova/plugins/review/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/plugin.json)
- Authored package guide: [skills/nova/plugins/review/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/README.md)
- Module for `review`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/src/stage.ts)
- Module for `repository-audit`: [src/repository-audit-stage.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/src/repository-audit-stage.ts)
- Module for `repository-revalidation`: [src/repository-revalidation-stage.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/src/repository-revalidation-stage.ts)
- Test: [skills/nova/plugins/review/tests/echo-review-output.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/echo-review-output.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/echo-review-verification.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/echo-review-verification.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/live-function.test.ts)
- Test: [skills/nova/plugins/review/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/package-boundary.test.mjs)
- Test: [skills/nova/plugins/review/tests/protocol.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/protocol.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/remediation.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/remediation.test.mjs)
- Test: [skills/nova/plugins/review/tests/repository-audit-stage.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/repository-audit-stage.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/repository-revalidation.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/repository-revalidation.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/repository-review-io.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/repository-review-io.test.ts)
- Test: [skills/nova/plugins/review/tests/repository-review-profile.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/repository-review-profile.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-bundle-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-bundle-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-bundle-snapshot.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-bundle-snapshot.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-cluster-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-cluster-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-cluster-identity.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-cluster-identity.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-content-cache.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-content-cache.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-context-production.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-context-production.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-context-selection.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-context-selection.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-contract-parity.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-contract-parity.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-coverage.test.mts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-coverage.test.mts)
- Test: [skills/nova/plugins/review/tests/review-decision-matrix.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-decision-matrix.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evaluation-metadata.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-evaluation-metadata.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evidence-authority.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-evidence-authority.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evidence-encoding-independent.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-evidence-encoding-independent.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evidence-live-locales.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-evidence-live-locales.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evidence-schema-independent.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-evidence-schema-independent.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-fact-extractors.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-fact-extractors.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-governor.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-governor.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-graph.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-graph.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-invariants.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-invariants.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-map-artifacts.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-map-artifacts.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-policy-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-policy-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-policy-profiles.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-policy-profiles.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-policy-resolver.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-policy-resolver.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-prompt-budget.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-prompt-budget.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-proposal-preflight.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-proposal-preflight.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-quality-corpus.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-quality-corpus.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-reducer.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-reducer.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-report-builder.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-report-builder.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-report-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-report-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-report-encoding.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-report-encoding.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-scale-slicing.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-scale-slicing.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-slicing.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-slicing.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-snapshot-inventory.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-snapshot-inventory.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-stage-input.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-stage-input.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-stage-verification.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-stage-verification.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-verdict-policy.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-verdict-policy.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-verification-reconciliation.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-verification-reconciliation.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-verified-findings.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/review-verified-findings.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/scalable-review-compiler.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/scalable-review-compiler.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/scalable-review-jobs.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/scalable-review-jobs.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/scalable-review-topology.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/scalable-review-topology.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/scalable-review-verification.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/scalable-review-verification.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/simplification-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/simplification-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/simplification-fact-producer.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/simplification-fact-producer.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/simplification-manifest.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/simplification-manifest.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/simplification-miner.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/simplification-miner.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/stage.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/review/tests/stage.unit.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
