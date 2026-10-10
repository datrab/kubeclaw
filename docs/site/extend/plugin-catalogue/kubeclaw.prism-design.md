# kubeclaw.prism-design

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/prism-design/plugin.json; skills/nova/plugins/prism-design/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: source facts revision 6fa4830a48244d29655104a5be58957d5fa87d2f; package behavior sources revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb. Local command results and their limits appear under Package Checks.

## Purpose

Request and import Prism design work as an ordered Nova stage.

## When To Use It

Use it when the graph requires a Prism design result before implementation.

## When Not To Use It

Do not use it to expose Prism OpenClaw tools directly.

## Most Important Limit

The stage depends on the configured Prism service and versioned result contract.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Package Reference

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.prism-design@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/prism-design/plugin.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `design` | `kubeclaw.design.prism` | `src/stage.ts` | `execute` |

## stage: design

Public identifier: `kubeclaw.design.prism`.
Global registration ID: `kubeclaw.prism-design:design`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `runtime.dispatch`, `artifacts.read`, `artifacts.write`, `operator.request`, `signal.wait`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `agent` (constant; required; value `prism`)
- `target` (string; required; minLength `1`)
- `issuerId` (string; required; minLength `1`)
- `timeoutMinutes` (integer; required; minimum `1`; maximum `525600`)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `design` |
| `type` | `kubeclaw.design.prism` |
| `module` | `src/stage.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["runtime.dispatch","artifacts.read","artifacts.write","operator.request","signal.wait"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## Failure Behavior

The stage waits for an approved Prism baseline and stores the returned bundle under its digest. Dispatch errors block the stage; a waiting result is not an approved design.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
The selected runtime owns failure recording and lifecycle state. Package code does not gain lifecycle authority.
Adapter startup cleanup can remain pending when shutdown ignores its abort signal; follow the [startup stop rules](../../use/plugins.md#3-activate-and-prove-health).

## Package Checks

Recorded local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/nova/plugins/prism-design
```

Package test files found: 1. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node ../../../../tests/verification/integration/prism-wait.test.mts && node ../../../../tests/verification/integration/prism-archive.test.mts
```

Local package checks do not prove live host or cluster readiness.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/prism-design/plugin.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/plugin.json)
- Package implementation guide: [skills/nova/plugins/prism-design/README.md](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/README.md)
- Module for `design`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/src/stage.ts)
- Test: [skills/nova/plugins/prism-design/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/prism-design/tests/live-function.test.ts)
