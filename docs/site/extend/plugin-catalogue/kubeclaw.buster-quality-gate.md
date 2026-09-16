# kubeclaw.buster-quality-gate

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/buster-quality-gate/plugin.json; skills/nova/plugins/buster-quality-gate/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Request and interpret a Buster quality result in the Nova graph.

## When To Use It

Use it when later Nova work must wait for an exact remote test plan result.

## When Not To Use It

Do not use it to execute provider tests inside Nova.

## Most Important Limit

Buster owns test execution; Nova imports only the bound result and evidence.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.buster-quality-gate@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/buster-quality-gate/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `quality` | `kubeclaw.test.quality-evaluation` | `src/stage.ts` | `execute` |

## stage: quality

Public identifier: `kubeclaw.test.quality-evaluation`.
Global registration ID: `kubeclaw.buster-quality-gate:quality`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `test.plan.execute`, `runtime.dispatch`, `artifacts.write`, `artifacts.read`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `agent` (string; optional; minLength `1`)
- `agentRole` (string; optional; minLength `1`)
- `testAgentEnabled` (boolean; optional; default `true`)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `quality` |
| `type` | `kubeclaw.test.quality-evaluation` |
| `module` | `src/stage.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["test.plan.execute","runtime.dispatch","artifacts.write","artifacts.read"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## Failure Behavior

The stage checks a bound Buster result and stores decision evidence; an optional evaluator uses runtime.dispatch. Missing expected coverage or a mismatched run identity is an error.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Earlier AP08.7–AP08.9 local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/buster-quality-gate
```

Package test files found: 4. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/protocol.test.ts && node tests/suite-first.test.ts && node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The audit status does not claim live host or cluster acceptance. See the AP08
[AP08.10 checkpoint](../../../blueprint/AP08.10-checkpoint.md) for the independent rerun and current boundaries. Earlier results are historical.

## Source Evidence

- Manifest: [skills/nova/plugins/buster-quality-gate/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/plugin.json)
- Authored package guide: [skills/nova/plugins/buster-quality-gate/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/README.md)
- Module for `quality`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/src/stage.ts)
- Test: [skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts)
- Test: [skills/nova/plugins/buster-quality-gate/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/tests/package-boundary.test.mjs)
- Test: [skills/nova/plugins/buster-quality-gate/tests/protocol.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/tests/protocol.test.ts)
- Test: [skills/nova/plugins/buster-quality-gate/tests/suite-first.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/buster-quality-gate/tests/suite-first.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
