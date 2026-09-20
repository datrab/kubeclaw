# kubeclaw.runtime-dispatch

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/runtime-dispatch/plugin.json; skills/common/plugins/runtime-dispatch/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 5b6e1b97415ffefa4bb42bf2ae331f27597170b5

## Authored Guidance

Dispatch bounded runtime and OpenClaw work through approved runtime targets.

## When To Use It

Use it when an extension must call an installed specialist runtime.

## When Not To Use It

Do not use it to let project input select arbitrary processes.

## Most Important Limit

Target identity, request, timeout, and result remain capability-bound.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.runtime-dispatch@1.0.0`.
- Runtime-role manifest inclusion: `buster`, `nova`, `prism`
- Manifest: [skills/common/plugins/runtime-dispatch/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `runtime` | `runtime` | `src/adapter.ts` | `activate` |
| capability adapter | `openclaw` | `openclaw` | `src/openclaw-adapter.ts` | `activate` |

## capability adapter: runtime

Public identifier: `runtime`.
Global registration ID: `kubeclaw.runtime-dispatch:runtime`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `network.http`, `secrets.read`

Provided capabilities: `runtime.dispatch`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `targets` (object; required)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `runtime` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["runtime.dispatch"]` |
| `requiredCapabilities` | `["network.http","secrets.read"]` |
| `configSchema` | `schemas/config.schema.json` |

## capability adapter: openclaw

Public identifier: `openclaw`.
Global registration ID: `kubeclaw.runtime-dispatch:openclaw`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `git.repository.read`, `network.http`, `secrets.read`

Provided capabilities: `runtime.dispatch`

Configuration schema: [schemas/openclaw-config.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/schemas/openclaw-config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `targets` (object; required)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `openclaw` |
| `module` | `src/openclaw-adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["runtime.dispatch"]` |
| `requiredCapabilities` | `["git.repository.read","network.http","secrets.read"]` |
| `configSchema` | `schemas/openclaw-config.schema.json` |

## Failure Behavior

Dispatch selects an operator-configured target and validates its payload limits. OpenClaw result import checks the authoritative result path. Local process tests do not establish a connected production agent.

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
npm test --prefix skills/common/plugins/runtime-dispatch
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node tests/package-boundary.test.mjs && node ../../../../tests/verification/reliability/repository-result-paths.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/runtime-dispatch/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/plugin.json)
- Authored package guide: [skills/common/plugins/runtime-dispatch/README.md](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/README.md)
- Module for `runtime`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/src/adapter.ts)
- Module for `openclaw`: [src/openclaw-adapter.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/src/openclaw-adapter.ts)
- Test: [skills/common/plugins/runtime-dispatch/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/tests/live-function.test.ts)
- Test: [skills/common/plugins/runtime-dispatch/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
