# kubeclaw.size-budget

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/size-budget/plugin.json; skills/buster/plugins/size-budget/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Compare artifact size facts with a declared Buster budget.

## When To Use It

Use it when release quality depends on a bounded artifact size.

## When Not To Use It

Do not use it to measure runtime memory or container resource use.

## Most Important Limit

It evaluates only the supplied artifact and configured size threshold.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.size-budget@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/size-budget/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `artifact` | `kubeclaw.size-budget@1` | `src/provider.js` | `provider` |

## test provider: artifact

Public identifier: `kubeclaw.size-budget@1`.
Global registration ID: `kubeclaw.size-budget:artifact`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `format` (enumeration; optional; allowed `["auto","file","tar","tar-gzip"]`)
- `maximumTotalBytes` (integer; optional; minimum `0`; maximum `9007199254740991`)
- `maximumFileCount` (integer; optional; minimum `0`; maximum `100000`)
- `matchingFiles` (array; optional; maxItems `32`)
- `maximumGrowthBytes` (integer; optional; minimum `0`; maximum `9007199254740991`)
- `maximumGrowthPercent` (number; optional; minimum `0`; maximum `1000000`)
- `largestFiles` (integer; optional; minimum `1`; maximum `100`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `artifact` |
| `contractId` | `kubeclaw.size-budget@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | `[{"name":"build-output","kind":"artifact","required":true,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar"]},{"name":"baseline","kind":"artifact","required":false,"mediaTypes":["application/vnd.kubeclaw.size-budget-baseline+json"]}]` |
| `outputs` | `[{"name":"baseline","kind":"artifact","required":true,"schemaId":"kubeclaw.size-budget-baseline@1","mediaTypes":["application/vnd.kubeclaw.size-budget-baseline+json"]}]` |
| `requiredCapabilities` | Empty list. |
| `retrySafe` | `true` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log","size-budget-baseline"]` |
| `evidenceDefaults` | `{"onPass":["log","size-budget-baseline"],"onFail":["log","size-budget-baseline"],"onError":["log"]}` |

Inputs:

- `build-output`: artifact; required.
- `baseline`: artifact; optional.

Outputs:

- `baseline`: artifact; required.

## Failure Behavior

The provider measures declared build-output files against absolute or baseline limits. It checks baseline availability, input names, evidence paths, and artifact budgets; it does not perform the build.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Earlier AP08.7–AP08.9 local command result on 2026-09-16: `unavailable`.

The command requires GNU tar --format=ustar, which BusyBox tar does not provide.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/size-budget
```

Package test files found: 1. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts
```

The audit status does not claim live host or cluster acceptance. See the AP08
[AP08.10 checkpoint](../../../blueprint/AP08.10-checkpoint.md) for the independent rerun and current boundaries. Earlier results are historical.

## Source Evidence

- Manifest: [skills/buster/plugins/size-budget/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/plugin.json)
- Authored package guide: [skills/buster/plugins/size-budget/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/README.md)
- Module for `artifact`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/src/provider.js)
- Test: [skills/buster/plugins/size-budget/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
