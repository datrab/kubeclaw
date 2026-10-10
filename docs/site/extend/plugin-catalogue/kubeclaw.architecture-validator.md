# kubeclaw.architecture-validator

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/architecture-validator/plugin.json; skills/nova/plugins/architecture-validator/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: source facts revision 6fa4830a48244d29655104a5be58957d5fa87d2f; package behavior sources revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb. Local command results and their limits appear under Package Checks.

## Purpose

Validate architecture deliverables before later pipeline work uses them.

## When To Use It

Use it when a graph needs an explicit architecture acceptance step.

## When Not To Use It

Do not use it to create the architecture or replace human approval.

## Most Important Limit

It evaluates declared architecture input and does not inspect undeclared repository context.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Package Reference

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.architecture-validator@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/architecture-validator/plugin.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `architecture` | `kubeclaw.validate.architecture` | `src/stage.ts` | `execute` |

## stage: architecture

Public identifier: `kubeclaw.validate.architecture`.
Global registration ID: `kubeclaw.architecture-validator:architecture`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `runtime.dispatch`, `artifacts.write`, `git.repository.read`, `artifacts.read`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `agent` (string; required; minLength `1`)
- `agentRole` (string; optional; minLength `1`)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `architecture` |
| `type` | `kubeclaw.validate.architecture` |
| `module` | `src/stage.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["runtime.dispatch","artifacts.write","git.repository.read","artifacts.read"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## Failure Behavior

The stage dispatches a validation task, checks that the response covers the required files, and stores an architecture-validation artifact. Invalid or incomplete responses block the stage.

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
npm test --prefix skills/nova/plugins/architecture-validator
```

Package test files found: 3. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/protocol.unit.test.ts && node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

Local package checks do not prove live host or cluster readiness.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/architecture-validator/plugin.json](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/plugin.json)
- Package implementation guide: [skills/nova/plugins/architecture-validator/README.md](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/README.md)
- Module for `architecture`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/src/stage.ts)
- Test: [skills/nova/plugins/architecture-validator/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/tests/live-function.test.ts)
- Test: [skills/nova/plugins/architecture-validator/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/tests/package-boundary.test.mjs)
- Test: [skills/nova/plugins/architecture-validator/tests/protocol.unit.test.ts](https://github.com/datrab/kubeclaw/blob/6fa4830a48244d29655104a5be58957d5fa87d2f/skills/nova/plugins/architecture-validator/tests/protocol.unit.test.ts)
