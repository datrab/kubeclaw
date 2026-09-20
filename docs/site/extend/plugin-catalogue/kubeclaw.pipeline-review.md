# kubeclaw.pipeline-review

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/pipeline-review/plugin.json; skills/nova/plugins/pipeline-review/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb

## Authored Guidance

Run the pipeline review stage and retrieve its bounded review evidence.

## When To Use It

Use it when the graph needs the installed pipeline-specific review workflow.

## When Not To Use It

Do not use it for the broader repository audit stages.

## Most Important Limit

Its stage and evidence adapter share one review-specific contract.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.pipeline-review@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/pipeline-review/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `review` | `kubeclaw.report.pipeline-review` | `src/stage.ts` | `execute` |
| capability adapter | `evidence` | `evidence` | `src/evidence-adapter.ts` | `activate` |

## stage: review

Public identifier: `kubeclaw.report.pipeline-review`.
Global registration ID: `kubeclaw.pipeline-review:review`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `runtime.dispatch`, `artifacts.write`, `report.evidence.read`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `agent` (string; required; minLength `1`)
- `agentRole` (string; optional; minLength `1`)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `review` |
| `type` | `kubeclaw.report.pipeline-review` |
| `module` | `src/stage.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["runtime.dispatch","artifacts.write","report.evidence.read"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## capability adapter: evidence

Public identifier: `evidence`.
Global registration ID: `kubeclaw.pipeline-review:evidence`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `artifacts.read`

Provided capabilities: `report.evidence.read`

Configuration schema: [schemas/evidence-config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/schemas/evidence-config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `storageRoot` (string; required; minLength `1`)
- `orchestratorIssuerId` (string; required; minLength `1`)
- `maximumJournalBytes` (integer; required; minimum `1`)
- `maximumArtifactBytes` (integer; required; minimum `1`)
- `maximumBundleBytes` (integer; required; minimum `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `evidence` |
| `module` | `src/evidence-adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["report.evidence.read"]` |
| `requiredCapabilities` | `["artifacts.read"]` |
| `configSchema` | `schemas/evidence-config.schema.json` |

## Failure Behavior

The evidence reader binds snapshots to a run identity, checks for source changes, and enforces the bundle byte budget. It fails on mismatched runs or changed evidence rather than returning a partial authoritative snapshot.

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
npm test --prefix skills/nova/plugins/pipeline-review
```

Package test files found: 3. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/protocol.test.mjs && node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/pipeline-review/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/plugin.json)
- Authored package guide: [skills/nova/plugins/pipeline-review/README.md](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/README.md)
- Module for `review`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/src/stage.ts)
- Module for `evidence`: [src/evidence-adapter.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/src/evidence-adapter.ts)
- Test: [skills/nova/plugins/pipeline-review/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/tests/live-function.test.ts)
- Test: [skills/nova/plugins/pipeline-review/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/tests/package-boundary.test.mjs)
- Test: [skills/nova/plugins/pipeline-review/tests/protocol.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/pipeline-review/tests/protocol.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
