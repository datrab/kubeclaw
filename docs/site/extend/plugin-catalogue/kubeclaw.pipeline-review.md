# kubeclaw.pipeline-review

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/pipeline-review/plugin.json; skills/nova/plugins/pipeline-review/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

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

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/README.md)
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
- Manifest: [skills/nova/plugins/pipeline-review/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/plugin.json)

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

Required capabilities: `runtime.dispatch`, `artifacts.write`, `report.evidence.read`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/schemas/config.schema.json)

Configuration fields:

- `agent` (string; required)
- `agentRole` (string; optional)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/schemas/result.schema.json)

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

Required capabilities: `artifacts.read`

Provided capabilities: `report.evidence.read`

Configuration schema: [schemas/evidence-config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/schemas/evidence-config.schema.json)

Configuration fields:

- `storageRoot` (string; required)
- `orchestratorIssuerId` (string; required)
- `maximumJournalBytes` (integer; required)
- `maximumArtifactBytes` (integer; required)
- `maximumBundleBytes` (integer; required)

Input schema: None.

Result schema: None.

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

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/pipeline-review
```

Package tests found: 3.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/nova/plugins/pipeline-review/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/plugin.json)
- Authored package guide: [skills/nova/plugins/pipeline-review/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/README.md)
- Module for `review`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/src/stage.ts)
- Module for `evidence`: [src/evidence-adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/src/evidence-adapter.ts)
- Test: [skills/nova/plugins/pipeline-review/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/tests/live-function.test.ts)
- Test: [skills/nova/plugins/pipeline-review/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/tests/package-boundary.test.mjs)
- Test: [skills/nova/plugins/pipeline-review/tests/protocol.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/pipeline-review/tests/protocol.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
