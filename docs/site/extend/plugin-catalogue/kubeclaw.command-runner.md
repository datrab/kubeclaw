# kubeclaw.command-runner

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/command-runner/plugin.json; skills/common/plugins/command-runner/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Provide bounded command execution to granted consumers.

## When To Use It

Use it when an installed extension must run an approved local command.

## When Not To Use It

Do not use it to expose an unrestricted shell to project input.

## Most Important Limit

Command, environment, duration, and output remain inside operator grants.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.command-runner@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/common/plugins/command-runner/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `command` | `command` | `src/adapter.ts` | `activate` |

## capability adapter: command

Public identifier: `command`.
Global registration ID: `kubeclaw.command-runner:command`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `command.execute`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `allowedExecutables` (array; required; minItems `1`)
- `executableCatalog` (object; optional)
- `allowedWorkingRoots` (array; required; minItems `1`)
- `maxOutputBytes` (integer; required; minimum `1`)
- `maxExecutionMs` (integer; required; minimum `1`)
- `terminationGraceMs` (integer; required; minimum `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `command` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["command.execute"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

The adapter runs granted commands and stops owned processes under duration, output, and termination limits. New work is rejected after shutdown starts. Process-group tests do not prove isolation on every host.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `locally-verified`.
Earlier AP08.7–AP08.9 local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/common/plugins/command-runner
```

Package test files found: 4. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/package-boundary.test.mjs && node tests/live-function.test.ts && node tests/process-group.test.ts && node tests/process-group-exit.test.ts
```

The audit status does not claim live host or cluster acceptance. See the AP08
[AP08.10 checkpoint](../../../blueprint/AP08.10-checkpoint.md) for the independent rerun and current boundaries. Earlier results are historical.

## Source Evidence

- Manifest: [skills/common/plugins/command-runner/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/plugin.json)
- Authored package guide: [skills/common/plugins/command-runner/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/README.md)
- Module for `command`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/src/adapter.ts)
- Test: [skills/common/plugins/command-runner/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/tests/live-function.test.ts)
- Test: [skills/common/plugins/command-runner/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/command-runner/tests/process-group-exit.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/tests/process-group-exit.test.ts)
- Test: [skills/common/plugins/command-runner/tests/process-group.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/command-runner/tests/process-group.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
