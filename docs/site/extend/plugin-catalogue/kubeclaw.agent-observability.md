# kubeclaw.agent-observability

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/agent-observability/plugin.json; skills/common/plugins/agent-observability/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb

## Authored Guidance

Project agent-observability records into ingestion and evidence observer flows.

## When To Use It

Use it when committed agent records must enter the pipeline observability boundary.

## When Not To Use It

Do not use it to collect OpenClaw hooks directly.

## Most Important Limit

It observes committed records and cannot change canonical lifecycle state.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.agent-observability@1.0.0`.
- Runtime-role manifest inclusion: `buster`, `nova`, `prism`
- Manifest: [skills/common/plugins/agent-observability/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| observer | `ingester` | `ingester` | `src/observers.ts` | `ingest` |
| observer | `evidence` | `evidence` | `src/observers.ts` | `recordEvidence` |

## observer: ingester

Public identifier: `ingester`.
Global registration ID: `kubeclaw.agent-observability:ingester`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `telemetry.emit`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

The schema declares no top-level fields.

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Checkpoint schema: [schemas/checkpoint.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/schemas/checkpoint.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `ingester` |
| `module` | `src/observers.ts` |
| `export` | `ingest` |
| `subscriptions` | `["plugin.kubeclaw.openclaw-agent-events.agent-end","plugin.kubeclaw.openclaw-agent-events.llm-input","plugin.kubeclaw.openclaw-agent-events.llm-output","plugin.kubeclaw.openclaw-agent-events.subagent-spawned","plugin.kubeclaw.openclaw-agent-events.subagent-delivery-target","plugin.kubeclaw.openclaw-agent-events.subagent-ended","plugin.kubeclaw.openclaw-agent-events.before-tool-call","plugin.kubeclaw.openclaw-agent-events.after-tool-call","plugin.kubeclaw.openclaw-agent-events.model-call-started","plugin.kubeclaw.openclaw-agent-events.model-call-ended","plugin.kubeclaw.openclaw-agent-events.session-start","plugin.kubeclaw.openclaw-agent-events.session-end"]` |
| `delivery` | `at_least_once` |
| `ordering` | `per_run` |
| `failurePolicy` | `{"mode":"best_effort","maxAttempts":5,"backoffMs":1000,"timeoutMs":10000}` |
| `requiredCapabilities` | `["telemetry.emit"]` |
| `configSchema` | `schemas/config.schema.json` |
| `checkpointSchema` | `schemas/checkpoint.schema.json` |

## observer: evidence

Public identifier: `evidence`.
Global registration ID: `kubeclaw.agent-observability:evidence`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

The schema declares no top-level fields.

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Checkpoint schema: [schemas/checkpoint.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/schemas/checkpoint.schema.json)

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `evidence` |
| `module` | `src/observers.ts` |
| `export` | `recordEvidence` |
| `subscriptions` | `["plugin.kubeclaw.openclaw-agent-events.agent-end","plugin.kubeclaw.openclaw-agent-events.subagent-delivery-target","plugin.kubeclaw.openclaw-agent-events.subagent-ended","plugin.kubeclaw.openclaw-agent-events.model-call-ended","plugin.kubeclaw.openclaw-agent-events.session-end"]` |
| `delivery` | `at_least_once` |
| `ordering` | `per_run` |
| `failurePolicy` | `{"mode":"best_effort","maxAttempts":5,"backoffMs":1000,"timeoutMs":10000}` |
| `requiredCapabilities` | `["artifacts.write"]` |
| `configSchema` | `schemas/config.schema.json` |
| `checkpointSchema` | `schemas/checkpoint.schema.json` |

## Failure Behavior

The ingester appends records and the evidence observer writes JSON artifacts. Both consume event data; neither can turn an observed record into a lifecycle decision.

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
npm test --prefix skills/common/plugins/agent-observability
```

Package test files found: 4. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/observers.unit.test.mjs && node tests/parity.test.ts && node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/agent-observability/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/plugin.json)
- Authored package guide: [skills/common/plugins/agent-observability/README.md](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/README.md)
- Module for `ingester`: [src/observers.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/src/observers.ts)
- Module for `evidence`: [src/observers.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/src/observers.ts)
- Test: [skills/common/plugins/agent-observability/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/tests/live-function.test.ts)
- Test: [skills/common/plugins/agent-observability/tests/observers.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/tests/observers.unit.test.mjs)
- Test: [skills/common/plugins/agent-observability/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/agent-observability/tests/parity.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/tests/parity.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
