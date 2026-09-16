# kubeclaw.agent-observability

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/agent-observability/plugin.json; skills/common/plugins/agent-observability/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

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

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/README.md)
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
- Manifest: [skills/common/plugins/agent-observability/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/plugin.json)

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

Required capabilities: `telemetry.emit`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/schemas/config.schema.json)

Configuration fields:

The schema declares no top-level fields.

Input schema: None.

Result schema: None.

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

Required capabilities: `artifacts.write`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/schemas/config.schema.json)

Configuration fields:

The schema declares no top-level fields.

Input schema: None.

Result schema: None.

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

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

Run the package command:

```bash
npm test --prefix skills/common/plugins/agent-observability
```

Package tests found: 4.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/common/plugins/agent-observability/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/plugin.json)
- Authored package guide: [skills/common/plugins/agent-observability/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/README.md)
- Module for `ingester`: [src/observers.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/src/observers.ts)
- Module for `evidence`: [src/observers.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/src/observers.ts)
- Test: [skills/common/plugins/agent-observability/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/tests/live-function.test.ts)
- Test: [skills/common/plugins/agent-observability/tests/observers.unit.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/tests/observers.unit.test.mjs)
- Test: [skills/common/plugins/agent-observability/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/tests/package-boundary.test.mjs)
- Test: [skills/common/plugins/agent-observability/tests/parity.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/agent-observability/tests/parity.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.
