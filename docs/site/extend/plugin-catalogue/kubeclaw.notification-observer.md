# kubeclaw.notification-observer

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/notification-observer/plugin.json; skills/common/plugins/notification-observer/README.md
Applies to: pipeline-plugin-v2; package 1.1.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Deliver selected committed events to notification and preview targets.

## When To Use It

Use it when operators need asynchronous lifecycle notifications.

## When Not To Use It

Do not use it to block or alter the source pipeline event.

## Most Important Limit

Delivery failure affects the observer attempt, not canonical pipeline history.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.notification-observer@1.1.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/notification-observer/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| observer | `notifications` | `notifications` | `src/observer.ts` | `observe` |
| observer | `preview-delivery` | `preview-delivery` | `src/observer.ts` | `deliverPreview` |

## observer: notifications

Public identifier: `notifications`.
Global registration ID: `kubeclaw.notification-observer:notifications`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `operator.request`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `target` (string; optional; minLength `1`)
- `pipelineLabel` (string; optional; minLength `1`; maxLength `256`)
- `modelLabel` (string; optional; minLength `1`; maxLength `256`)
- `stageLabels` (object; optional)
- `maxMessageChars` (integer; optional; minimum `256`; maximum `8192`)
- `suppressEventTypes` (array; optional; maxItems `64`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Checkpoint schema: [schemas/checkpoint.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/schemas/checkpoint.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `notifications` |
| `module` | `src/observer.ts` |
| `export` | `observe` |
| `subscriptions` | `["run.started","run.succeeded","run.failed","run.blocked","run.cancelled","stage.started","stage.skipped","stage.succeeded","stage.failed","stage.blocked","stage.cancelled","stage.retrying","stage.waiting","orchestrator.required"]` |
| `delivery` | `at_least_once` |
| `ordering` | `per_run` |
| `failurePolicy` | `{"mode":"best_effort","maxAttempts":5,"backoffMs":1000,"timeoutMs":10000}` |
| `requiredCapabilities` | `["operator.request"]` |
| `configSchema` | `schemas/config.schema.json` |
| `checkpointSchema` | `schemas/checkpoint.schema.json` |

## observer: preview-delivery

Public identifier: `preview-delivery`.
Global registration ID: `kubeclaw.notification-observer:preview-delivery`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `operator.request`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `target` (string; optional; minLength `1`)
- `pipelineLabel` (string; optional; minLength `1`; maxLength `256`)
- `modelLabel` (string; optional; minLength `1`; maxLength `256`)
- `stageLabels` (object; optional)
- `maxMessageChars` (integer; optional; minimum `256`; maximum `8192`)
- `suppressEventTypes` (array; optional; maxItems `64`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Checkpoint schema: [schemas/checkpoint.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/schemas/checkpoint.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `preview-delivery` |
| `module` | `src/observer.ts` |
| `export` | `deliverPreview` |
| `subscriptions` | `["artifact.created"]` |
| `delivery` | `at_least_once` |
| `ordering` | `per_run` |
| `failurePolicy` | `{"mode":"best_effort","maxAttempts":5,"backoffMs":1000,"timeoutMs":10000}` |
| `requiredCapabilities` | `["operator.request"]` |
| `configSchema` | `schemas/config.schema.json` |
| `checkpointSchema` | `schemas/checkpoint.schema.json` |

## Failure Behavior

The two observers publish notifications through an operator target. Delivery failure belongs to observer processing and cannot rewrite the event that triggered it.

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
npm test --prefix skills/common/plugins/notification-observer
```

Package test files found: 4. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/observer.unit.test.mjs && node tests/parity.test.ts && node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/notification-observer/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/plugin.json)
- Authored package guide: [skills/common/plugins/notification-observer/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/README.md)
- Module for `notifications`: [src/observer.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/src/observer.ts)
- Module for `preview-delivery`: [src/observer.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/src/observer.ts)
- Test: [skills/common/plugins/notification-observer/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/tests/live-function.test.ts)
- Test: [skills/common/plugins/notification-observer/tests/observer.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/tests/observer.unit.test.mjs)
- Test: [skills/common/plugins/notification-observer/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/notification-observer/tests/parity.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/tests/parity.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
