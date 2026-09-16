# kubeclaw.notification-observer

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/notification-observer/plugin.json; skills/common/plugins/notification-observer/README.md
Applies to: pipeline-plugin-v2; package 1.1.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

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

Required capabilities: `operator.request`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/schemas/config.schema.json)

Configuration fields:

- `target` (string; optional)
- `pipelineLabel` (string; optional)
- `modelLabel` (string; optional)
- `stageLabels` (object; optional)
- `maxMessageChars` (integer; optional)
- `suppressEventTypes` (array; optional)

Input schema: None.

Result schema: None.

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

Required capabilities: `operator.request`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/schemas/config.schema.json)

Configuration fields:

- `target` (string; optional)
- `pipelineLabel` (string; optional)
- `modelLabel` (string; optional)
- `stageLabels` (object; optional)
- `maxMessageChars` (integer; optional)
- `suppressEventTypes` (array; optional)

Input schema: None.

Result schema: None.

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

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/common/plugins/notification-observer
```

Package tests found: 4.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

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
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
