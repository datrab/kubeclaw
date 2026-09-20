# kubeclaw.telemetry-store

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/telemetry-store/plugin.json; skills/common/plugins/telemetry-store/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 5b6e1b97415ffefa4bb42bf2ae331f27597170b5

## Authored Guidance

Append telemetry records through the telemetry.emit capability.

## When To Use It

Use it when an observer must write bounded telemetry to the configured durable record store.

## When Not To Use It

Do not use it to query, delete, or rotate telemetry records.

## Most Important Limit

The adapter appends records; it supplies no query or retention-management operation.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-store/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.telemetry-store@1.0.0`.
- Runtime-role manifest inclusion: `buster`, `nova`, `prism`
- Manifest: [skills/common/plugins/telemetry-store/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-store/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `telemetry` | `telemetry` | `src/adapter.ts` | `activate` |

## capability adapter: telemetry

Public identifier: `telemetry`.
Global registration ID: `kubeclaw.telemetry-store:telemetry`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `telemetry.emit`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-store/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `root` (string; required; minLength `1`)
- `maxRecordBytes` (integer; optional; default `1048576`; minimum `1`)
- `maximumRecords` (integer; optional; default `100000`; minimum `1`)
- `maximumStoreBytes` (integer; optional; default `268435456`; minimum `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `telemetry` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["telemetry.emit"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

Only telemetry.emit/append is supported. It enforces record and store budgets and rejects cancellation. Rotation, queries, and deletion require a separate storage-management procedure.

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
npm test --prefix skills/common/plugins/telemetry-store
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node ../../../../tests/verification/integration/telemetry-store-projection.test.mts && node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/telemetry-store/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-store/plugin.json)
- Authored package guide: [skills/common/plugins/telemetry-store/README.md](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-store/README.md)
- Module for `telemetry`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-store/src/adapter.ts)
- Test: [skills/common/plugins/telemetry-store/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-store/tests/live-function.test.ts)
- Test: [skills/common/plugins/telemetry-store/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-store/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
