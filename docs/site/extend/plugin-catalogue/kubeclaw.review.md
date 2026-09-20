# kubeclaw.review

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/review/plugin.json; skills/nova/plugins/review/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 5b6e1b97415ffefa4bb42bf2ae331f27597170b5

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

- [Package guide](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/README.md)
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
- Manifest: [skills/nova/plugins/review/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/plugin.json)

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
Global registration ID: `kubeclaw.review:review`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `runtime.dispatch`, `git.repository.read`, `artifacts.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `reviewSemanticEncoding` (constant; optional; value `review-semantics.utf16-v1`)
- `reportArtifactEncoding` (constant; optional; value `kubeclaw-json.utf16.v1`)
- `agent` (string; required; minLength `1`)
- `profile` (enumeration; optional; default `"gate"`; allowed `["gate","lean","audit"]`)
- `policy` (object; optional)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/result.schema.json)

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
Global registration ID: `kubeclaw.review:repository-audit`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `runtime.dispatch`, `git.repository.read`, `artifacts.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/repository-audit-config.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/repository-audit-config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `agent` (string; required; minLength `1`)
- `reviewerModel` (string; required; minLength `1`)
- `reviewerRuntime` (enumeration; optional; default `"subagent"`; allowed `["acp","subagent"]`)
- `reviewerAgentId` (string; optional; default `"codex"`; minLength `1`)
- `reviewerThinking` (string; optional; default `"high"`; minLength `1`)
- `profile` (enumeration; optional; default `"audit"`; allowed `["gate","lean","audit"]`)
- `policy` (object; optional)

Input schema: [schemas/repository-audit-input.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/repository-audit-input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/result.schema.json)

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
Global registration ID: `kubeclaw.review:repository-revalidation`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `runtime.dispatch`, `git.repository.read`, `artifacts.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/repository-audit-config.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/repository-audit-config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `agent` (string; required; minLength `1`)
- `reviewerModel` (string; required; minLength `1`)
- `reviewerRuntime` (enumeration; optional; default `"subagent"`; allowed `["acp","subagent"]`)
- `reviewerAgentId` (string; optional; default `"codex"`; minLength `1`)
- `reviewerThinking` (string; optional; default `"high"`; minLength `1`)
- `profile` (enumeration; optional; default `"audit"`; allowed `["gate","lean","audit"]`)
- `policy` (object; optional)

Input schema: [schemas/repository-revalidation-input.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/repository-revalidation-input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/schemas/result.schema.json)

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

The stage freezes source and policy, verifies proposed findings, and stores immutable reports. Repository-audit jobs have recovery checkpoints; revalidation does not promise per-finding resume. Local tests do not prove live reviewer quality.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Catalogue status: `content-written`.
Recorded local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/review
```

Package test files found: 57. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
npm run test:cluster && npm run schema:check && node tests/repository-review-profile.unit.test.mjs && node tests/review-prompt-budget.unit.test.mjs && node tests/review-quality-corpus.unit.test.mjs && node tests/review-snapshot-inventory.unit.test.mjs && node tests/review-map-artifacts.unit.test.mjs && node tests/review-fact-extractors.unit.test.mjs && node tests/review-graph.unit.test.mjs && node tests/review-scale-slicing.unit.test.mjs && node tests/scalable-review-topology.unit.test.mjs && node tests/scalable-review-jobs.unit.test.mjs && node tests/scalable-review-verification.unit.test.mjs && node tests/review-content-cache.unit.test.mjs && node tests/scalable-review-compiler.unit.test.mjs && node tests/review-governor.unit.test.mjs && node tests/review-report-contract.unit.test.mjs && node tests/review-report-builder.unit.test.mjs && node tests/simplification-contract.unit.test.mjs && node tests/simplification-miner.unit.test.mjs && node tests/simplification-manifest.unit.test.mjs && node tests/review-bundle-contract.unit.test.mjs && node tests/review-bundle-snapshot.unit.test.mjs && node tests/review-context-selection.unit.test.mjs && node tests/review-context-production.unit.test.mjs && node tests/review-slicing.unit.test.mjs && node tests/echo-review-output.unit.test.mjs && node tests/echo-review-verification.unit.test.mjs && node tests/review-proposal-preflight.unit.test.mjs && node tests/review-verification-reconciliation.unit.test.mjs && node tests/review-verdict-policy.unit.test.mjs && node tests/review-verified-findings.unit.test.mjs && node tests/review-policy-contract.unit.test.mjs && node tests/review-invariants.unit.test.mjs && node tests/review-policy-resolver.unit.test.mjs && node tests/review-policy-profiles.unit.test.mjs && node tests/review-reducer.unit.test.mjs && node tests/review-decision-matrix.unit.test.mjs && node tests/review-contract-parity.unit.test.mjs && node tests/review-evaluation-metadata.unit.test.mjs && node tests/review-stage-input.unit.test.mjs && node tests/review-stage-verification.unit.test.mjs && node tests/protocol.unit.test.mjs && node tests/stage.unit.test.mjs && node tests/live-function.test.ts && node --test tests/review-evidence-encoding-independent.test.mjs tests/review-evidence-live-locales.test.mjs tests/review-evidence-schema-independent.test.mjs && node tests/package-boundary.test.mjs && node tests/remediation.test.mjs && node tests/repository-review-io.test.ts && npm run test:coverage
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/review/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/plugin.json)
- Authored package guide: [skills/nova/plugins/review/README.md](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/README.md)
- Module for `review`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/src/stage.ts)
- Module for `repository-audit`: [src/repository-audit-stage.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/src/repository-audit-stage.ts)
- Module for `repository-revalidation`: [src/repository-revalidation-stage.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/src/repository-revalidation-stage.ts)
- Test: [skills/nova/plugins/review/tests/echo-review-output.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/echo-review-output.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/echo-review-verification.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/echo-review-verification.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/live-function.test.ts)
- Test: [skills/nova/plugins/review/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/package-boundary.test.mjs)
- Test: [skills/nova/plugins/review/tests/protocol.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/protocol.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/remediation.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/remediation.test.mjs)
- Test: [skills/nova/plugins/review/tests/repository-audit-stage.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/repository-audit-stage.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/repository-revalidation.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/repository-revalidation.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/repository-review-io.test.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/repository-review-io.test.ts)
- Test: [skills/nova/plugins/review/tests/repository-review-profile.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/repository-review-profile.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-bundle-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-bundle-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-bundle-snapshot.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-bundle-snapshot.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-cluster-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-cluster-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-cluster-identity.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-cluster-identity.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-content-cache.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-content-cache.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-context-production.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-context-production.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-context-selection.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-context-selection.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-contract-parity.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-contract-parity.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-coverage.test.mts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-coverage.test.mts)
- Test: [skills/nova/plugins/review/tests/review-decision-matrix.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-decision-matrix.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evaluation-metadata.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-evaluation-metadata.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evidence-authority.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-evidence-authority.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evidence-encoding-independent.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-evidence-encoding-independent.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evidence-live-locales.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-evidence-live-locales.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-evidence-schema-independent.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-evidence-schema-independent.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-fact-extractors.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-fact-extractors.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-governor.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-governor.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-graph.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-graph.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-invariants.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-invariants.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-map-artifacts.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-map-artifacts.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-policy-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-policy-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-policy-profiles.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-policy-profiles.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-policy-resolver.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-policy-resolver.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-prompt-budget.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-prompt-budget.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-proposal-preflight.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-proposal-preflight.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-quality-corpus.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-quality-corpus.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-reducer.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-reducer.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-report-builder.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-report-builder.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-report-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-report-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-report-encoding.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-report-encoding.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-scale-slicing.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-scale-slicing.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-slicing.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-slicing.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-snapshot-inventory.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-snapshot-inventory.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-stage-input.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-stage-input.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-stage-verification.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-stage-verification.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-verdict-policy.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-verdict-policy.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-verification-reconciliation.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-verification-reconciliation.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/review-verified-findings.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/review-verified-findings.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/scalable-review-compiler.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/scalable-review-compiler.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/scalable-review-jobs.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/scalable-review-jobs.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/scalable-review-topology.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/scalable-review-topology.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/scalable-review-verification.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/scalable-review-verification.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/simplification-contract.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/simplification-contract.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/simplification-fact-producer.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/simplification-fact-producer.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/simplification-manifest.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/simplification-manifest.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/simplification-miner.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/simplification-miner.unit.test.mjs)
- Test: [skills/nova/plugins/review/tests/stage.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/review/tests/stage.unit.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
