# kubeclaw.lint

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/nova/plugins/lint/plugin.json; skills/nova/plugins/lint/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb

## Authored Guidance

Run pre-check and full lint stages through a controlled lint executor.

## When To Use It

Use it when Nova must apply the installed repository lint rule set.

## When Not To Use It

Do not use it for delivery-only checks or arbitrary command execution.

## Most Important Limit

Rule coverage follows the installed lint configuration and executor grant.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.lint@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/nova/plugins/lint/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| stage | `pre-check` | `kubeclaw.lint.pre-check` | `src/stage.ts` | `executePreCheck` |
| stage | `full` | `kubeclaw.lint.full` | `src/stage.ts` | `executeFull` |
| capability adapter | `executor` | `executor` | `src/adapter.ts` | `activate` |

## stage: pre-check

Public identifier: `kubeclaw.lint.pre-check`.
Global registration ID: `kubeclaw.lint:pre-check`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `lint.execute`, `artifacts.write`, `artifacts.read`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `policyPath` (string; required; minLength `1`)
- `policyProject` (string; required; minLength `1`)
- `includeDebt` (boolean; optional; default `false`)
- `includeExperimental` (boolean; optional; default `false`)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `pre-check` |
| `type` | `kubeclaw.lint.pre-check` |
| `module` | `src/stage.ts` |
| `export` | `executePreCheck` |
| `requiredCapabilities` | `["lint.execute","artifacts.write","artifacts.read"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## stage: full

Public identifier: `kubeclaw.lint.full`.
Global registration ID: `kubeclaw.lint:full`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `lint.execute`, `artifacts.write`, `artifacts.read`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `policyPath` (string; required; minLength `1`)
- `policyProject` (string; required; minLength `1`)
- `includeDebt` (boolean; optional; default `false`)
- `includeExperimental` (boolean; optional; default `false`)

Input schema: [schemas/input.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/input.schema.json)

Result schema: [schemas/result.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/result.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `full` |
| `type` | `kubeclaw.lint.full` |
| `module` | `src/stage.ts` |
| `export` | `executeFull` |
| `requiredCapabilities` | `["lint.execute","artifacts.write","artifacts.read"]` |
| `configSchema` | `schemas/config.schema.json` |
| `inputSchema` | `schemas/input.schema.json` |
| `resultSchema` | `schemas/result.schema.json` |

## capability adapter: executor

Public identifier: `executor`.
Global registration ID: `kubeclaw.lint:executor`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `lint.execute`

Configuration schema: [schemas/adapter-config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/adapter-config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `allowedRepositoryRoots` (array; required; minItems `1`)
- `allowedPolicyRoots` (array; required; minItems `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `executor` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["lint.execute"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/adapter-config.schema.json` |

## Failure Behavior

The adapter accepts lint.execute/run_report and validates any source revision. The stage stores a report and reduces its findings. Missing shellcheck or shfmt appears as a tool failure, not a clean lint result.

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
npm test --prefix skills/nova/plugins/lint
```

Package test files found: 10. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
npm run test:focused && npm run test:live
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/nova/plugins/lint/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/plugin.json)
- Authored package guide: [skills/nova/plugins/lint/README.md](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/README.md)
- Module for `pre-check`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/stage.ts)
- Module for `full`: [src/stage.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/stage.ts)
- Module for `executor`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/adapter.ts)
- Test: [skills/nova/plugins/lint/tests/adapter-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/adapter-boundary.test.mjs)
- Test: [skills/nova/plugins/lint/tests/discovery.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/discovery.test.mjs)
- Test: [skills/nova/plugins/lint/tests/eslint-discipline.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/eslint-discipline.test.mjs)
- Test: [skills/nova/plugins/lint/tests/eslint-type-evidence.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/eslint-type-evidence.test.mjs)
- Test: [skills/nova/plugins/lint/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/live-function.test.ts)
- Test: [skills/nova/plugins/lint/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/package-boundary.test.mjs)
- Test: [skills/nova/plugins/lint/tests/registry-lifecycle.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/registry-lifecycle.test.mjs)
- Test: [skills/nova/plugins/lint/tests/remediation.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/remediation.test.mjs)
- Test: [skills/nova/plugins/lint/tests/report-contract.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/report-contract.test.mjs)
- Test: [skills/nova/plugins/lint/tests/stage.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/stage.unit.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
