# kubeclaw.human-approval

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/human-approval/plugin.json; skills/nova/plugins/human-approval/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb

## Authored Guidance

Pause a graph for general or architecture-specific human approval.

## When To Use It

Use it when policy requires a recorded person to approve continuation.

## When Not To Use It

Do not use it as automated validation or as a hidden default approval.

## Most Important Limit

The stage waits for an external decision and cannot manufacture approval.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.human-approval@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/human-approval/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `approval` | `kubeclaw.decision.human-approval` | `src/stage.ts` | `execute` |
| stage | `architecture-approval` | `kubeclaw.decision.architecture-approval` | `src/architecture-approval.ts` | `execute` |

## stage: approval

Public identifier: `kubeclaw.decision.human-approval`.
Global registration ID: `kubeclaw.human-approval:approval`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `operator.request`, `signal.wait`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `target` (string; required; minLength `1`; maxLength `1024`; pattern `^(?![\s\S]*[\r\n\u0000])\S(?:[\s\S]*\S)?$`)
- `issuerId` (string; required; minLength `1`; maxLength `1024`; pattern `^(?![\s\S]*[\r\n\u0000])\S(?:[\s\S]*\S)?$`)
- `timeoutMinutes` (integer; optional; default `60`; minimum `1`; maximum `525600`)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `approval` |
| `type` | `kubeclaw.decision.human-approval` |
| `module` | `src/stage.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["operator.request","signal.wait"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## stage: architecture-approval

Public identifier: `kubeclaw.decision.architecture-approval`.
Global registration ID: `kubeclaw.human-approval:architecture-approval`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `artifacts.read`, `operator.request`, `signal.wait`, `git.repository.read`, `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `target` (string; required; minLength `1`; maxLength `1024`; pattern `^(?![\s\S]*[\r\n\u0000])\S(?:[\s\S]*\S)?$`)
- `issuerId` (string; required; minLength `1`; maxLength `1024`; pattern `^(?![\s\S]*[\r\n\u0000])\S(?:[\s\S]*\S)?$`)
- `timeoutMinutes` (integer; optional; default `60`; minimum `1`; maximum `525600`)

Input schema: [schemas/architecture-input.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/schemas/architecture-input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `architecture-approval` |
| `type` | `kubeclaw.decision.architecture-approval` |
| `module` | `src/architecture-approval.ts` |
| `export` | `execute` |
| `requiredCapabilities` | `["artifacts.read","operator.request","signal.wait","git.repository.read","artifacts.write"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/architecture-input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## Failure Behavior

General and architecture approval are separate stage registrations. Architecture approval checks the passed validation report and requires a reason. Core validates the external signal and resumes the wait.

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
npm test --prefix skills/nova/plugins/human-approval
```

Package test files found: 3. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/package-boundary.test.mjs && node tests/approval.unit.test.mjs && node ../../../../tests/verification/integration/architecture-approval.test.mts && node tests/live-function.test.ts
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/human-approval/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/plugin.json)
- Authored package guide: [skills/nova/plugins/human-approval/README.md](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/README.md)
- Module for `approval`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/src/stage.ts)
- Module for `architecture-approval`: [src/architecture-approval.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/src/architecture-approval.ts)
- Test: [skills/nova/plugins/human-approval/tests/approval.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/tests/approval.unit.test.mjs)
- Test: [skills/nova/plugins/human-approval/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/tests/live-function.test.ts)
- Test: [skills/nova/plugins/human-approval/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/human-approval/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
