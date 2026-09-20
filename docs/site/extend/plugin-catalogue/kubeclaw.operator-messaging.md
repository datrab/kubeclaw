# kubeclaw.operator-messaging

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/operator-messaging/plugin.json; skills/common/plugins/operator-messaging/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb

## Authored Guidance

Provide controlled messages from pipeline work to an operator channel.

## When To Use It

Use it when a stage must request or report operator-visible information.

## When Not To Use It

Do not use it as canonical approval state or general transport.

## Most Important Limit

Delivery authority and destination remain operator-controlled.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.operator-messaging@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/operator-messaging/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `operator` | `operator` | `src/adapter.ts` | `activate` |

## capability adapter: operator

Public identifier: `operator`.
Global registration ID: `kubeclaw.operator-messaging:operator`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `network.http`, `secrets.read`

Provided capabilities: `operator.request`, `operator.receipt`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `deliveryRoot` (string; required; minLength `1`)
- `maximumDeliveryRecords` (integer; optional; default `100000`; minimum `1`)
- `maximumDeliveryBytes` (integer; optional; default `268435456`; minimum `1`)
- `targets` (object; required)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `operator` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["operator.request","operator.receipt"]` |
| `requiredCapabilities` | `["network.http","secrets.read"]` |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

Publication uses an approved target; receipt lookup has its own operation and target constraints. Unknown targets and malformed receipt queries fail. A lost response must be reconciled before publication repeats.

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
npm test --prefix skills/common/plugins/operator-messaging
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/operator-messaging/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/plugin.json)
- Authored package guide: [skills/common/plugins/operator-messaging/README.md](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/README.md)
- Module for `operator`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/src/adapter.ts)
- Test: [skills/common/plugins/operator-messaging/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/tests/live-function.test.ts)
- Test: [skills/common/plugins/operator-messaging/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/operator-messaging/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
