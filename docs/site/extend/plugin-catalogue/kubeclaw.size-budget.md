# kubeclaw.size-budget

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/size-budget/plugin.json; skills/buster/plugins/size-budget/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

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

Required capabilities: None.

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/schemas/config.schema.json)

Configuration fields:

- `format` (schema-defined; optional)
- `maximumTotalBytes` (integer; optional)
- `maximumFileCount` (integer; optional)
- `matchingFiles` (array; optional)
- `maximumGrowthBytes` (integer; optional)
- `maximumGrowthPercent` (number; optional)
- `largestFiles` (integer; optional)

Input schema: None.

Result schema: None.

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

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command requires GNU tar --format=ustar, which BusyBox tar does not provide.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/size-budget
```

Package tests found: 1.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/buster/plugins/size-budget/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/plugin.json)
- Authored package guide: [skills/buster/plugins/size-budget/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/README.md)
- Module for `artifact`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/src/provider.js)
- Test: [skills/buster/plugins/size-budget/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/size-budget/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
