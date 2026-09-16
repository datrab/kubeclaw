# kubeclaw.openclaw-agent-events

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/openclaw-agent-events/plugin.json; skills/common/plugins/openclaw-agent-events/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Bridge live OpenClaw hooks into namespaced plugin events.

## When To Use It

Use it when an OpenClaw SDK host must feed hook events to the pipeline event boundary.

## When Not To Use It

Do not use it to read historical agent records or as a standalone Redis ingestion service.

## Most Important Limit

Its exposed capability reports bridge status. Queued events are volatile until accepted by the event journal; the host must provide OpenClaw hooks.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-events/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.openclaw-agent-events@1.0.0`.
- Runtime-role manifest inclusion: `nova`
- Manifest: [skills/common/plugins/openclaw-agent-events/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-events/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `source` | `source` | `src/adapter.ts` | `activate` |

## capability adapter: source

Public identifier: `source`.
Global registration ID: `kubeclaw.openclaw-agent-events:source`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `agent.events.subscribe`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-events/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `hooks` (array; required; minItems `1`)
- `maxQueueEvents` (integer; optional; default `256`; minimum `1`; maximum `10000`)
- `maxQueueBytes` (integer; optional; default `1048576`; minimum `1`; maximum `16777216`)
- `drainTimeoutMs` (integer; optional; default `5000`; minimum `1`; maximum `60000`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `source` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["agent.events.subscribe"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

Activation requires the OpenClaw on-hook API. The capability exposes status, not arbitrary event-history reads. Cancellation or an unsupported operation is an error.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Earlier AP08.7–AP08.9 local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/common/plugins/openclaw-agent-events
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node tests/package-boundary.test.mjs
```

The audit status does not claim live host or cluster acceptance. See the AP08
[AP08.10 checkpoint](../../../blueprint/AP08.10-checkpoint.md) for the independent rerun and current boundaries. Earlier results are historical.

## Source Evidence

- Manifest: [skills/common/plugins/openclaw-agent-events/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-events/plugin.json)
- Authored package guide: [skills/common/plugins/openclaw-agent-events/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-events/README.md)
- Module for `source`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-events/src/adapter.ts)
- Test: [skills/common/plugins/openclaw-agent-events/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-events/tests/live-function.test.ts)
- Test: [skills/common/plugins/openclaw-agent-events/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/openclaw-agent-events/tests/package-boundary.test.mjs)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
