# kubeclaw.telemetry-observer

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/telemetry-observer/plugin.json; skills/common/plugins/telemetry-observer/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 5b6e1b97415ffefa4bb42bf2ae331f27597170b5

## Authored Guidance

Deliver committed lifecycle telemetry through the configured telemetry path.

## When To Use It

Use it when pipeline events need an asynchronous telemetry projection.

## When Not To Use It

Do not use it to store canonical pipeline state or gate execution.

## Most Important Limit

Telemetry delivery can fail without changing the committed source event.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.telemetry-observer@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/telemetry-observer/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| observer | `telemetry` | `telemetry` | `src/observer.ts` | `observe` |

## observer: telemetry

Public identifier: `telemetry`.
Global registration ID: `kubeclaw.telemetry-observer:telemetry`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `telemetry.emit`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

The schema declares no top-level fields.

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Checkpoint schema: [schemas/checkpoint.schema.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/schemas/checkpoint.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `telemetry` |
| `module` | `src/observer.ts` |
| `export` | `observe` |
| `subscriptions` | `["run.created","run.started","run.succeeded","run.failed","run.blocked","run.cancelled","stage.started","stage.waiting","stage.retrying","stage.skipped","stage.succeeded","stage.failed","stage.blocked","stage.cancelled","attempt.created","attempt.dispatched","attempt.completed","attempt.timed_out","attempt.cancelled","effect.requested","effect.accepted","effect.completed","effect.failed","artifact.created","wait.created","wait.resolved","orchestrator.required"]` |
| `delivery` | `at_least_once` |
| `ordering` | `per_run` |
| `failurePolicy` | `{"mode":"best_effort","maxAttempts":5,"backoffMs":1000,"timeoutMs":10000}` |
| `requiredCapabilities` | `["telemetry.emit"]` |
| `configSchema` | `schemas/config.schema.json` |
| `checkpointSchema` | `schemas/checkpoint.schema.json` |

## Failure Behavior

The observer appends selected telemetry through telemetry.emit. It does not own the telemetry storage implementation or canonical lifecycle state.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Catalogue status: `locally-verified`.
Recorded local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/common/plugins/telemetry-observer
```

Package test files found: 3. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/parity.test.ts && node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/telemetry-observer/plugin.json](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/plugin.json)
- Authored package guide: [skills/common/plugins/telemetry-observer/README.md](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/README.md)
- Module for `telemetry`: [src/observer.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/src/observer.ts)
- Test: [skills/common/plugins/telemetry-observer/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/tests/live-function.test.ts)
- Test: [skills/common/plugins/telemetry-observer/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/telemetry-observer/tests/parity.test.ts](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/telemetry-observer/tests/parity.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
